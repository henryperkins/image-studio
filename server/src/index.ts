import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fstatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import child_process from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import type { ImageItem, VideoItem, LibraryItem, Playbook } from '@image-studio/shared';
import { PLAYBOOKS } from '@image-studio/shared';
import { ensureMaskMatchesImage, ensurePngMask } from './lib/image-utils.js';
import { AnalyticsEventSchema } from '@image-studio/shared';

const app = Fastify({ logger: true });

// CORS
// In production, set CORS_ORIGIN explicitly (comma-separated).
// In dev (when CORS_ORIGIN is unset), allow localhost and private LAN IPs on the Vite port (default 5174)
const ORIGIN_ENV = process.env.CORS_ORIGIN || '';
const DEV_PORT = String(process.env.VITE_DEV_PORT || 5174);
const ORIGIN_LIST = ORIGIN_ENV
  ? ORIGIN_ENV.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:' + DEV_PORT, 'http://127.0.0.1:' + DEV_PORT, 'http://[::1]:' + DEV_PORT];

function isPrivateIPv4(host: string) {
  // quick ipv4 check
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

await app.register(cors, {
  // Allow origins from CORS_ORIGIN env var, or localhost/LAN private IPs on dev port if not set
  origin: (origin, cb) => {
    // Allow non-browser or same-origin requests with no Origin header
    if (!origin) return cb(null, true);

    // Check if wildcard is configured
    if (ORIGIN_ENV === '*') return cb(null, true);

    // Explicit allowlist always wins
    if (ORIGIN_LIST.includes(origin)) return cb(null, true);

    // If the user configured CORS_ORIGIN, be strict
    if (ORIGIN_ENV) return cb(new Error('Not allowed by CORS'), false);

    // Otherwise (dev), accept private LAN origins on the Vite dev port
    try {
      const u = new URL(origin);
      const port = u.port || (u.protocol === 'https:' ? '443' : '80');
      const host = u.hostname;
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
      if (port === DEV_PORT && (isLocalhost || isPrivateIPv4(host))) {
        return cb(null, true);
      }
    } catch {
      // URL parsing failed - not allowed
    }
    return cb(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
});
await app.register(multipart);

// Production security headers (CSP and related). In dev, Vite sets headers.
app.addHook('onSend', async (req, reply, payload) => {
  try {
    const csp = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net",
      "img-src 'self' data: blob:",
      "media-src 'self' blob: data:",
      "connect-src 'self'",
      "object-src 'none'",
      "frame-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      'upgrade-insecure-requests'
    ].join('; ');
    reply.header('Content-Security-Policy', csp);
    reply.header('Cross-Origin-Opener-Policy', 'same-origin');
    // Consider enabling COEP if you adopt heavy WASM or SharedArrayBuffer:
    // reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
  } catch {}
  return payload;
});

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, ''),
  key: process.env.AZURE_OPENAI_API_KEY || '',
  token: process.env.AZURE_OPENAI_AUTH_TOKEN || '',
  // Sora preview
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || 'preview',
  // Images gen
  imageDeployment: process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || 'gpt-image-1',
  // Optional: explicitly declare the base image model family (gpt-image-1 | dall-e-3 | dall-e-2)
  imageBase: process.env.AZURE_OPENAI_IMAGE_BASE || '',
  // Video gen (Sora)
  videoDeployment: process.env.AZURE_OPENAI_VIDEO_DEPLOYMENT || 'sora',
  // Vision chat
  chatApiVersion: process.env.AZURE_OPENAI_CHAT_API_VERSION || '2025-04-01-preview',
  visionDeployment: process.env.AZURE_OPENAI_VISION_DEPLOYMENT || 'gpt-5'
};
// Allow the server to start even without Azure config.
// Azure-dependent endpoints below already validate required settings
// and will return 400 errors if misconfigured.
if (!AZ.endpoint) {
  console.warn('[server] AZURE_OPENAI_ENDPOINT not set. Azure-dependent endpoints will be disabled.');
}

// ----------------- library layout -----------------
const DATA_DIR = path.resolve(process.cwd(), 'data');
const IMG_DIR = path.join(DATA_DIR, 'images');
const VID_DIR = path.join(DATA_DIR, 'videos');
const MANIFEST = path.join(DATA_DIR, 'manifest.json');

/** Types moved to @image-studio/shared */

async function ensureDirs() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  await fs.mkdir(VID_DIR, { recursive: true });
  try { await fs.access(MANIFEST); } catch { await fs.writeFile(MANIFEST, '[]'); }
}
await ensureDirs();

async function readManifest(): Promise<LibraryItem[]> {
  try { return JSON.parse(await fs.readFile(MANIFEST, 'utf-8')); } catch { return []; }
}
async function writeManifest(items: LibraryItem[]) {
  await fs.writeFile(MANIFEST, JSON.stringify(items, null, 2));
}

// Static (media library)
await app.register(fstatic, { root: IMG_DIR, prefix: '/static/images/', decorateReply: false });
await app.register(fstatic, { root: VID_DIR, prefix: '/static/videos/', decorateReply: false });

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  // Prefer OAuth bearer token if provided; otherwise use API key
  if (AZ.token) {
    h['Authorization'] = `Bearer ${AZ.token}`;
  } else if (AZ.key) {
    h['api-key'] = AZ.key;
  }
  return h;
}

// Heuristic to determine the base image model family for request shaping
function detectImageBase(): 'gpt-image-1' | 'dall-e-3' | 'dall-e-2' | 'unknown' {
  if (AZ.imageBase) {
    const v = AZ.imageBase.toLowerCase();
    if (v.includes('gpt-image-1')) return 'gpt-image-1';
    if (v.includes('dall-e-3') || v.includes('dalle-3') || v.includes('dall-e3')) return 'dall-e-3';
    if (v.includes('dall-e-2') || v.includes('dalle-2') || v.includes('dall-e2')) return 'dall-e-2';
  }
  const d = AZ.imageDeployment.toLowerCase();
  if (d.includes('gpt-image-1')) return 'gpt-image-1';
  if (d.includes('dall-e-3') || d.includes('dalle-3') || d.includes('dall-e3')) return 'dall-e-3';
  if (d.includes('dall-e-2') || d.includes('dalle-2') || d.includes('dall-e2')) return 'dall-e-2';
  return 'unknown';
}

// ----------------- IMAGES: generate -----------------
const ImageReq = z.object({
  prompt: z.string().min(1),
  size: z.enum([
    'auto',
    '1024x1024',
    '1536x1024',
    '1024x1536',
    // DALL·E 3 sizes
    '1792x1024',
    '1024x1792'
  ]).default('auto'),
  // Include 'auto' to match preview docs; also allow 'standard'/'hd' for DALL·E 3
  quality: z.enum(['auto', 'low', 'medium', 'high', 'standard', 'hd']).default('auto'),
  // Only supported for gpt-image-1; we'll include conditionally at request time
  output_format: z.enum(['png', 'jpeg', 'webp']).optional(),
  n: z.number().int().min(1).max(10).default(1),
  output_compression: z.number().int().min(0).max(100).optional(),
  background: z.enum(['transparent','opaque','auto']).optional(),
  // Preview extras
  moderation: z.enum(['auto', 'low']).optional(),
  style: z.enum(['vivid', 'natural']).optional(),
  response_format: z.enum(['url', 'b64_json']).optional(),
  user: z.string().optional()
});

// Add interface for Azure OpenAI image generation request
interface AzureImageGenerationRequest {
  model: string;
  prompt: string;
  size: string;
  quality: string;
  n: number;
  output_format?: string;
  output_compression?: number;
  background?: string;
  moderation?: string;
  style?: string;
  response_format?: string;
  user?: string;
}

// Add interface for Azure OpenAI image generation response
interface AzureImageGenerationResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  created?: number;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

app.post('/api/images/generate', async (req, reply) => {
  const body = ImageReq.parse(req.body);

  // Validate Azure configuration
  if (!AZ.endpoint) {
    return reply.status(400).send({ error: 'Azure OpenAI endpoint not configured' });
  }
  if (!AZ.key && !AZ.token) {
    return reply.status(400).send({ error: 'Azure OpenAI authentication not configured' });
  }

  try {
    // Ensure endpoint format is correct (no trailing slash, proper resource format)
    const baseEndpoint = AZ.endpoint.replace(/\/+$/, '');
    const url = `${baseEndpoint}/openai/v1/images/generations?api-version=${AZ.apiVersion}`;

    // Log diagnostic info for debugging
    req.log.info({
      msg: 'Image generation request',
      endpoint: baseEndpoint,
      fullUrl: url,
      deployment: AZ.imageDeployment,
      apiVersion: AZ.apiVersion,
      hasAuth: !!(AZ.key || AZ.token)
    });

    const imageBase = detectImageBase();
    const isGptImage = imageBase === 'gpt-image-1';
    const isDalle3 = imageBase === 'dall-e-3';
    const isDalle2 = imageBase === 'dall-e-2';
    const fmt = body.output_format;
    const requestBody: AzureImageGenerationRequest = {
      model: AZ.imageDeployment,
      prompt: body.prompt,
      size: body.size,
      // Map quality by model family
      quality: ((): string => {
        if (isGptImage) return body.quality;
        if (isDalle3) {
          // Allowed: 'hd' | 'standard'. Map others sensibly.
          if (body.quality === 'hd') return 'hd';
          if (body.quality === 'standard') return 'standard';
          if (body.quality === 'high') return 'hd';
          if (body.quality === 'medium' || body.quality === 'low') return 'standard';
          // 'auto' → let service choose; omit by returning 'auto'
          return 'standard';
        }
        // DALL·E 2 only supports 'standard'
        return 'standard';
      })(),
      n: body.n,
      ...(isGptImage && body.moderation ? { moderation: body.moderation } : {}),
      ...(isDalle3 && body.style ? { style: body.style } : {}),
      ...((isDalle2 || isDalle3) && body.response_format ? { response_format: body.response_format } : {}),
      ...(body.user ? { user: body.user } : {})
    };
    // gpt-image-1 only
    if (isGptImage) {
      if (fmt) requestBody.output_format = fmt;
      if (typeof body.output_compression === 'number' && (fmt === 'jpeg' || fmt === 'webp')) {
        requestBody.output_compression = body.output_compression;
      }
      if (body.background) {
        requestBody.background = (body.background === 'transparent' && fmt === 'jpeg') ? 'opaque' : body.background;
      }
    }

    const r = await fetch(url, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!r.ok) {
      const errorText = await r.text();
      req.log.error({
        msg: 'Azure image generation failed',
        status: r.status,
        error: errorText,
        url: url,
        deployment: AZ.imageDeployment
      });

      // Provide more specific error messages for common issues
      if (r.status === 404) {
        throw new Error(
          `404 Not Found - Verify: 1) Endpoint format: ${baseEndpoint}, ` +
          `2) Deployment name: ${AZ.imageDeployment}, ` +
          `3) API version: ${AZ.apiVersion}, ` +
          '4) Azure OpenAI Foundry models (Preview) is enabled in your resource'
        );
      }
      throw new Error(`Azure image gen failed: ${r.status} ${errorText}`);
    }
    const data = await r.json() as AzureImageGenerationResponse;
    let b64: string | undefined = data?.data?.[0]?.b64_json;
    let contentType: string | null = null;
    // If response is URL (e.g., dall-e-3 default), fetch the image bytes
    if (!b64) {
      const urlRef: string | undefined = data?.data?.[0]?.url;
      if (!urlRef) throw new Error('No image payload returned (neither b64_json nor url)');
      const fetchRes = await fetch(urlRef, { headers: { Accept: 'image/*' } });
      if (!fetchRes.ok) throw new Error(`Failed to fetch image URL: ${fetchRes.status}`);
      const ab = await fetchRes.arrayBuffer();
      b64 = Buffer.from(ab).toString('base64');
      contentType = fetchRes.headers.get('content-type');
    }

    const id = crypto.randomUUID();
    // Canonical format for type, and extension for file
    let format: 'png' | 'jpeg' | 'webp' = 'png';
    if (isGptImage && fmt) {
      format = fmt;
    } else if (contentType) {
      if (contentType.includes('jpeg') || contentType.includes('jpg')) format = 'jpeg';
      else if (contentType.includes('webp')) format = 'webp';
      else if (contentType.includes('png')) format = 'png';
    }
    const ext = format === 'jpeg' ? 'jpg' : format;
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, 'base64'));

    const item: ImageItem = {
      kind: 'image',
      id, filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: format,
      createdAt: new Date().toISOString()
    };
    const items = await readManifest();
    items.unshift(item);
    await writeManifest(items);

    return reply.send({ image_base64: b64, model: AZ.imageDeployment, size: body.size, format: format, extension: ext, library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Image generation failed' });
  }
});

 // ----------------- IMAGES: edit (gpt-image-1 inpainting/transform) -----------------
const ImageEditReq = z.object({
  image_id: z.string().min(1),
  prompt: z.string().min(1),
  // PNG data URL for mask; transparent pixels mark regions to change
  mask_data_url: z.string().url().optional(),
  size: z.enum(['auto', '1024x1024', '1536x1024', '1024x1536']).default('auto'),
  output_format: z.enum(['png', 'jpeg', 'webp']).default('png'),
  // API enhancements (optional)
  quality: z.enum(['auto','low','medium','high','standard']).optional(),
  background: z.enum(['transparent','opaque','auto']).optional(),
  output_compression: z.number().int().min(0).max(100).optional()
});

function dataURLtoBuffer(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error('Invalid data URL');
  return Buffer.from(m[2], 'base64');
}

app.post('/api/images/edit', async (req, reply) => {
  const body = ImageEditReq.parse(req.body);
  try {
    const items = await readManifest();
    const src = items.find(i => i.kind === 'image' && i.id === body.image_id) as ImageItem | undefined;
    if (!src) return reply.status(404).send({ error: 'Source image not found' });

    // Build multipart for v1 preview images/edits
    const form = new FormData();
    // Align with v1 Images API: pass deployment name in model
    form.set('model', AZ.imageDeployment);
    form.set('prompt', body.prompt);
    form.set('size', body.size);
    // Shape request strictly by model family
    const imageBase = detectImageBase();
    const isGptImage = imageBase === 'gpt-image-1';
    if (isGptImage) {
      form.set('output_format', body.output_format);
    }
    // Optional enhancements
    if (body.quality) {
      // For edits, only gpt-image-1 supports high/medium/low; others standard
      if (isGptImage) form.set('quality', body.quality);
      else form.set('quality', 'standard');
    }
    if (isGptImage && body.background) {
      const fmt = body.output_format;
      const bg = (body.background === 'transparent' && fmt === 'jpeg') ? 'opaque' : body.background;
      form.set('background', bg);
    }
    if (isGptImage && typeof body.output_compression === 'number' && (body.output_format === 'jpeg' || body.output_format === 'webp')) {
      form.set('output_compression', String(body.output_compression));
    }

    // image file
    const srcPath = path.join(IMG_DIR, src.filename);
    const srcBuf = await fs.readFile(srcPath);
    const srcMime = src.filename.endsWith('.jpg') ? 'image/jpeg' : 'image/png';
    // Use a Uint8Array view to ensure BlobPart is ArrayBufferView<ArrayBuffer>
    const srcView = new Uint8Array(srcBuf);
    form.set('image', new File([srcView], src.filename, { type: srcMime }));

    // optional mask (PNG with transparent regions to edit)
  if (body.mask_data_url) {
      // Validate mask type and dimensions before upload
      ensurePngMask(body.mask_data_url);
      const maskBuf = dataURLtoBuffer(body.mask_data_url);
      ensureMaskMatchesImage(srcBuf, maskBuf);
      const maskView = new Uint8Array(maskBuf);
      form.set('mask', new File([maskView], 'mask.png', { type: 'image/png' }));
    }

    const baseEndpoint = AZ.endpoint.replace(/\/+$/, '');
    const url = `${baseEndpoint}/openai/v1/images/edits?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { method: 'POST', headers: authHeaders(), body: form as any });
    if (!r.ok) {
      const errorText = await r.text();
      req.log.error({ msg: 'Azure image edit failed', status: r.status, error: errorText, url, deployment: AZ.imageDeployment });
      if (r.status === 404) {
        throw new Error(
          `404 Not Found - Verify: 1) Endpoint format: ${baseEndpoint}, ` +
          `2) Deployment name: ${AZ.imageDeployment}, ` +
          `3) API version: ${AZ.apiVersion}, ` +
          '4) Azure OpenAI Foundry models (Preview) is enabled in your resource'
        );
      }
      throw new Error(`Azure image edit failed: ${r.status} ${errorText}`);
    }
    const j = await r.json() as any;
    const b64: string | undefined = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error('No edited image returned');

    const id = crypto.randomUUID();
    const ext = body.output_format === 'jpeg' ? 'jpg' : (body.output_format === 'webp' ? 'webp' : 'png');
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, 'base64'));

    const item: ImageItem = {
      kind: 'image',
      id, filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: body.output_format,
      createdAt: new Date().toISOString()
    };
    const all = await readManifest();
    all.unshift(item);
    await writeManifest(all);

    // For edits, return metadata only to avoid large payloads
    return reply.send({ library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Image edit failed' });
  }
});

// ----------------- LIBRARY: list/delete -----------------
app.get('/api/library/media', async (_req, reply) => {
  // Filter out manifest entries whose files are missing on disk to avoid 404s in the UI
  const items = await readManifest();
  const existing: LibraryItem[] = [];

  for (const it of items) {
    const dir = it.kind === 'video' ? VID_DIR : IMG_DIR;
    try {
      await fs.access(path.join(dir, it.filename));
      existing.push(it);
    } catch {
      // File is missing; skip it
    }
  }

  // Persist cleanup so subsequent calls are fast and consistent
  if (existing.length !== items.length) {
    await writeManifest(existing);
  }

  existing.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reply.send({ items: existing });
});

app.delete('/api/library/media/:id', async (req, reply) => {
  const id = (req.params as any)?.id as string;
  if (!id) return reply.status(400).send({ error: 'Missing id' });
  const items = await readManifest();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return reply.status(404).send({ error: 'Not found' });
  const [removed] = items.splice(idx, 1);
  await writeManifest(items);
  try {
    const dir = removed.kind === 'video' ? VID_DIR : IMG_DIR;
    await fs.unlink(path.join(dir, removed.filename));
  } catch { /* empty */ }
  return reply.send({ ok: true });
});

// ----------------- LIBRARY: upload (images) -----------------
app.post('/api/library/upload', async (req, reply) => {
  if (!(req as any).isMultipart?.()) return reply.status(400).send({ error: 'Content-Type must be multipart/form-data' });
  const created: LibraryItem[] = [];
  const maxBytes = Number(process.env.MAX_UPLOAD_BYTES || 20 * 1024 * 1024); // 20MB default
  const allowed = new Set(['image/png', 'image/jpeg', 'image/webp']);

  try {
    for await (const part of (req as any).parts()) {
      if (!part?.file) continue;
      const mime: string = String(part.mimetype || '');
      if (!allowed.has(mime)) {
        for await (const _ of part.file) {}
        continue;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of part.file as AsyncIterable<Buffer>) {
        size += chunk.length;
        if (size > maxBytes) throw new Error(`File exceeds limit of ${maxBytes} bytes`);
        chunks.push(Buffer.from(chunk));
      }
      const buf = Buffer.concat(chunks);
      const id = crypto.randomUUID();
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      const filename = `${id}.${ext}`;
      await fs.writeFile(path.join(IMG_DIR, filename), buf);
      const item: ImageItem = {
        kind: 'image',
        id, filename,
        url: `/static/images/${filename}`,
        prompt: 'uploaded image',
        size: 'auto',
        format: (ext === 'jpg' ? 'jpeg' : ext) as any,
        createdAt: new Date().toISOString()
      };
      created.push(item);
    }
    if (created.length === 0) return reply.status(400).send({ error: 'No valid image files found' });
    const lib = await readManifest();
    for (const it of created) lib.unshift(it);
    await writeManifest(lib);
    return reply.send({ items: created });
  } catch (e: any) {
    (req as any).log?.error?.(e);
    return reply.status(400).send({ error: e.message || 'Upload failed' });
  }
});

// ----------------- PLAYBOOKS: list -----------------
app.get('/api/playbooks', async (_req, reply) => {
  const list: Playbook[] = PLAYBOOKS;
  return reply.send({ playbooks: list });
});

// ----------------- VISION Analysis (Enhanced GPT-4.1) -----------------
import { VisionService } from './lib/vision-service.js';
import { createSoraVideoPrompt } from './lib/vision-prompts.js';

// Initialize new modular vision service
const visionService = new VisionService({
  azure: {
    endpoint: AZ.endpoint,
    visionDeployment: AZ.visionDeployment,
    chatApiVersion: AZ.chatApiVersion
  },
  authHeaders: authHeaders(),
  imagePath: IMG_DIR,
  videoPath: VID_DIR,
  caching: {
    enabled: true,
    ttl: 3600
  },
  moderation: {
    enabled: true,
    strictMode: process.env.MODERATION_STRICT === 'true',
    azureContentSafety: {
      endpoint: process.env.AZURE_CONTENT_SAFETY_ENDPOINT,
      key: process.env.AZURE_CONTENT_SAFETY_KEY
    }
  },
  performance: {
    maxTokens: 4000,
    temperature: 0.1,
    timeout: 30000,
    seed: process.env.AZURE_OPENAI_SEED ? parseInt(process.env.AZURE_OPENAI_SEED) : undefined
  }
});

// Legacy endpoint for backward compatibility
const VisionReq = z.object({
  library_ids: z.array(z.string()).optional(),
  image_urls: z.array(z.string().url()).optional(),
  detail: z.enum(['auto', 'low', 'high']).default('high'),
  style: z.enum(['concise', 'detailed']).default('concise')
});

app.post('/api/vision/describe', async (req, reply) => {
  const body = VisionReq.parse(req.body);
  if (!AZ.visionDeployment) return reply.status(400).send({ error: 'Missing AZURE_OPENAI_VISION_DEPLOYMENT' });

  try {
    if (!body.library_ids?.length && !body.image_urls?.length) {
      return reply.status(400).send({ error: 'No images provided' });
    }

    // Convert to new format for backward compatibility
    if (body.library_ids?.length) {
      const result = await visionService.analyzeImages(body.library_ids, {
        detail: body.detail === 'high' ? 'detailed' : body.detail === 'low' ? 'brief' : 'standard',
        purpose: 'video prompt engineering',
        tone: 'technical'
      });

      // Return legacy format
      return reply.send({
        description: `${result.content.scene_description}\n\nSuggested prompt: ${result.generation_guidance.suggested_prompt}`
      });
    }

    // Handle external URLs - use enhanced vision service for consistency
    if (body.image_urls?.length) {
      // For external URLs, create a simplified analysis using our enhanced system
      const parts = body.image_urls.map(u => ({ type: 'image_url' as const, image_url: { url: u, detail: body.detail } }));
      const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.visionDeployment)}/chat/completions?api-version=${AZ.chatApiVersion}`;

      // Use enhanced Sora prompt for better results
      const detailLevel = body.style === 'concise' ? 'brief' : 'detailed';
      const tone = 'creative';
      const soraPrompt = createSoraVideoPrompt({ detail: detailLevel as any, tone: tone as any });

      const system = `You are an expert vision analyst specializing in video prompt creation. ${soraPrompt}`;

      const r = await fetch(url, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: [{ type: 'text', text: 'Analyze the following image(s) for Sora video generation.' }, ...parts] }
          ],
          max_tokens: 600, // Increased for better prompts
          temperature: 0.3 // Slightly more creative
        })
      });

      if (!r.ok) return reply.status(400).send({ error: await r.text() });
      const j = await r.json() as any;
      return reply.send({ description: j?.choices?.[0]?.message?.content ?? '' });
    }

  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Vision analysis failed' });
  }
});

// Enhanced vision analysis endpoint
const EnhancedVisionReq = z.object({
  library_ids: z.array(z.string()).min(1).max(10),
  purpose: z.string().optional(),
  audience: z.enum(['general', 'technical', 'child', 'academic']).optional(),
  language: z.string().regex(/^[a-z]{2}$/).optional(),
  detail: z.enum(['brief', 'standard', 'detailed', 'comprehensive']).optional(),
  tone: z.enum(['formal', 'casual', 'technical', 'creative']).optional(),
  focus: z.array(z.string()).optional(),
  specific_questions: z.string().optional(),
  enable_moderation: z.boolean().default(true),
  target_age: z.number().int().min(5).max(100).optional(),
  force_refresh: z.boolean().default(false)
});

app.post('/api/vision/analyze', async (req, reply) => {
  if (!AZ.visionDeployment) return reply.status(400).send({ error: 'Missing AZURE_OPENAI_VISION_DEPLOYMENT' });

  try {
    const body = EnhancedVisionReq.parse(req.body);

    const result = await visionService.analyzeImages(body.library_ids, {
      purpose: body.purpose,
      audience: body.audience,
      language: body.language,
      detail: body.detail,
      tone: body.tone,
      focus: body.focus,
      specific_questions: body.specific_questions,
      enable_moderation: body.enable_moderation,
      target_age: body.target_age,
      force: body.force_refresh
    });

    return reply.send(result);
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Enhanced vision analysis failed' });
  }
});

// Vision service health check
app.get('/api/vision/health', async (req, reply) => {
  try {
    const health = await visionService.healthCheck();
    return reply.send(health);
  } catch (e: any) {
    req.log.error(e);
    return reply.status(500).send({ healthy: false, error: e.message });
  }
});

// Accessibility-focused analysis endpoint
const AccessibilityReq = z.object({
  library_ids: z.array(z.string()).min(1).max(5),
  screen_reader_optimized: z.boolean().default(true),
  include_color_info: z.boolean().default(true),
  reading_level: z.number().int().min(1).max(12).default(8)
});

app.post('/api/vision/accessibility', async (req, reply) => {
  if (!AZ.visionDeployment) return reply.status(400).send({ error: 'Missing AZURE_OPENAI_VISION_DEPLOYMENT' });

  try {
    const body = AccessibilityReq.parse(req.body);

    const result = await visionService.analyzeImages(body.library_ids, {
      purpose: 'accessibility compliance',
      audience: 'general',
      detail: 'comprehensive',
      tone: 'casual',
      focus: ['accessibility', 'spatial_relationships', 'text_content'],
      enable_moderation: false, // Less restrictive for accessibility
      force: false
    });

    // Return accessibility-focused response
    return reply.send({
      alt_text: result.accessibility.alt_text,
      long_description: result.accessibility.long_description,
      reading_level: result.accessibility.reading_level,
      color_accessibility: result.accessibility.color_accessibility,
      spatial_layout: result.content.spatial_layout,
      text_content: result.content.text_content,
      processing_notes: result.metadata.processing_notes
    });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Accessibility analysis failed' });
  }
});

// ----------------- SORA: generate (and save to library) -----------------
// Supported resolutions from API: (480, 480), (854, 480), (720, 720), (1280, 720), (1080, 1080), (1920, 1080)
const SUPPORTED_VIDEO_RESOLUTIONS = [
  { width: 480, height: 480 },
  { width: 854, height: 480 },
  { width: 720, height: 720 },
  { width: 1280, height: 720 },
  { width: 1080, height: 1080 },
  { width: 1920, height: 1080 }
] as const;

const SoraReq = z.object({
  prompt: z.string().min(1),
  width: z.number().int().refine(
    w => SUPPORTED_VIDEO_RESOLUTIONS.some(r => r.width === w),
    { message: 'Width must match a supported resolution' }
  ).default(1080),
  height: z.number().int().refine(
    h => SUPPORTED_VIDEO_RESOLUTIONS.some(r => r.height === h),
    { message: 'Height must match a supported resolution' }
  ).default(1080),
  n_seconds: z.number().int().min(1).max(20).default(10),
  // Optional variants; API supports 1–5 variants depending on resolution
  n_variants: z.number().int().min(1).max(5).optional(),
  // Retrieval quality for content download (if supported by service)
  quality: z.enum(['high', 'low']).optional(),
  reference_image_urls: z.array(z.string().url()).optional()
}).refine(
  data => SUPPORTED_VIDEO_RESOLUTIONS.some(r => r.width === data.width && r.height === data.height),
  { message: `Resolution must be one of: ${SUPPORTED_VIDEO_RESOLUTIONS.map(r => `${r.width}x${r.height}`).join(', ')}` }
);
function soraHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  // Support either OAuth bearer or API key (docs allow either)
  if (AZ.token) {
    h['Authorization'] = `Bearer ${AZ.token}`;
  } else if (AZ.key) {
    h['api-key'] = AZ.key;
  }
  return h;
}
app.post('/api/videos/sora/generate', async (req, reply) => {
  const body = SoraReq.parse(req.body);
  try {
    if (!AZ.endpoint) return reply.status(400).send({ error: 'Azure OpenAI endpoint not configured' });
    if (!AZ.key && !AZ.token) return reply.status(400).send({ error: 'Azure OpenAI authentication not configured' });
    if (!AZ.videoDeployment) return reply.status(400).send({ error: 'Missing AZURE_OPENAI_VIDEO_DEPLOYMENT' });

    // Use v1 endpoint format which is currently working
    const base = `${AZ.endpoint.replace(/\/+$/, '')}/openai/v1`;
    const createUrl = `${base}/video/generations/jobs?api-version=${AZ.apiVersion}`;
    const refBlock = (body.reference_image_urls?.length ?? 0) > 0 ? `\n\n[Reference images]\n${body.reference_image_urls!.join('\n')}` : '';
    const finalPrompt = `${body.prompt}${refBlock}`;

    const created = await fetch(createUrl, {
      method: 'POST',
      headers: { ...soraHeaders(), 'Content-Type': 'application/json', 'Accept': 'application/json' },
      // v1 endpoint requires model field
      body: JSON.stringify({
        model: AZ.videoDeployment,
        prompt: finalPrompt,
        width: body.width,
        height: body.height,
        n_seconds: body.n_seconds,
        ...(body.n_variants ? { n_variants: body.n_variants } : {})
      })
    });
    if (!created.ok) throw new Error(await created.text());
    const job = await created.json() as any;
    const jobId = job?.id; if (!jobId) throw new Error('No job id returned');

    const statusUrl = `${base}/video/generations/jobs/${jobId}?api-version=${AZ.apiVersion}`;
    const started = Date.now();
    let status = job?.status || 'queued';
    let generations: any[] = job?.generations || [];

    while (!['succeeded', 'failed', 'cancelled'].includes(status)) {
      if (Date.now() - started > 6 * 60 * 1000) throw new Error('Timed out waiting for Sora job');
      await new Promise(r => setTimeout(r, 5000));
      const sRes = await fetch(statusUrl, { headers: { ...soraHeaders(), 'Accept': 'application/json' } });
      if (!sRes.ok) throw new Error(await sRes.text());
      const s = await sRes.json();
      status = s?.status;
      generations = s?.generations || [];
    }
    if (status !== 'succeeded') return reply.status(400).send({ error: `Job ${status}` });

    const generationId = generations?.[0]?.id; if (!generationId) throw new Error('No generation id');
    const qualityParam = body.quality ? `&quality=${encodeURIComponent(body.quality)}` : '';
    const contentUrl = `${base}/video/generations/${generationId}/content/video?api-version=${AZ.apiVersion}${qualityParam}`;
    const vRes = await fetch(contentUrl, { headers: { ...soraHeaders(), 'Accept': 'video/mp4' } });
    if (!vRes.ok) throw new Error(await vRes.text());
    const ab = await vRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');

    // Save to library
    const id = crypto.randomUUID();
    const filename = `${id}.mp4`;
    await fs.writeFile(path.join(VID_DIR, filename), Buffer.from(b64, 'base64'));
    const item: VideoItem = {
      kind: 'video',
      id, filename,
      url: `/static/videos/${filename}`,
      prompt: body.prompt,
      width: body.width, height: body.height,
      duration: body.n_seconds,
      createdAt: new Date().toISOString()
    };
    const items = await readManifest();
    items.unshift(item);
    await writeManifest(items);

    return reply.send({ job_id: jobId, generation_id: generationId, video_base64: b64, content_type: 'video/mp4', library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Sora generation failed' });
  }
});
// Retrieve alternate quality content for an existing generation (no re-run)
app.get('/api/videos/sora/content/:generationId', async (req, reply) => {
  const generationId = (req.params as any)?.generationId as string | undefined;
  const { quality } = (req.query as any) as { quality?: 'high' | 'low' };
  if (!generationId) return reply.status(400).send({ error: 'Missing generationId' });
  if (!AZ.endpoint) return reply.status(400).send({ error: 'Azure endpoint not configured' });
  try {
    const base = `${AZ.endpoint}/openai/v1`;
    const qualityParam = quality ? `&quality=${encodeURIComponent(quality)}` : '';
    const contentUrl = `${base}/video/generations/${generationId}/content/video?api-version=${AZ.apiVersion}${qualityParam}`;
    const vRes = await fetch(contentUrl, { headers: { ...soraHeaders(), 'Accept': 'video/mp4' } });
    if (!vRes.ok) throw new Error(await vRes.text());
    const ab = await vRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    const ct = vRes.headers.get('content-type') || 'video/mp4';
    return reply.send({ generation_id: generationId, quality: quality || null, content_type: ct, video_base64: b64 });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Failed to retrieve video content' });
  }
});

// List Sora jobs (proxied to Azure v1 list endpoint)
const SoraListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(10),
  before: z.string().optional(),
  after: z.string().optional(),
  statuses: z.string().optional() // comma-separated, pass-through
});
app.get('/api/videos/sora/jobs', async (req, reply) => {
  try {
    if (!AZ.endpoint) return reply.status(400).send({ error: 'Azure endpoint not configured' });
    const q = SoraListQuery.parse(req.query ?? {});
    const params = new URLSearchParams({ limit: String(q.limit) });
    if (q.before) params.set('before', q.before);
    if (q.after) params.set('after', q.after);
    if (q.statuses) params.set('statuses', q.statuses);
    const url = `${AZ.endpoint.replace(/\/+$/, '')}/openai/v1/video/generations/jobs?api-version=${AZ.apiVersion}&${params.toString()}`;
    const r = await fetch(url, { headers: { ...soraHeaders(), 'Accept': 'application/json' } });
    if (!r.ok) {
      const text = await r.text();
      return reply.status(r.status).send({ error: text });
    }
    return reply.send(await r.json());
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Failed to list Sora jobs' });
  }
});

// Get single job by id
app.get('/api/videos/sora/jobs/:jobId', async (req, reply) => {
  const jobId = (req.params as any)?.jobId as string | undefined;
  if (!jobId) return reply.status(400).send({ error: 'Missing jobId' });
  try {
    const base = `${AZ.endpoint.replace(/\/+$/, '')}/openai/v1`;
    const url = `${base}/video/generations/jobs/${encodeURIComponent(jobId)}?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { headers: { ...soraHeaders(), 'Accept': 'application/json' } });
    if (!r.ok) return reply.status(r.status).send({ error: await r.text() });
    return reply.send(await r.json());
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Failed to get Sora job' });
  }
});

// Delete a job
app.delete('/api/videos/sora/jobs/:jobId', async (req, reply) => {
  const jobId = (req.params as any)?.jobId as string | undefined;
  if (!jobId) return reply.status(400).send({ error: 'Missing jobId' });
  try {
    const base = `${AZ.endpoint.replace(/\/+$/, '')}/openai/v1`;
    const url = `${base}/video/generations/jobs/${encodeURIComponent(jobId)}?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { method: 'DELETE', headers: soraHeaders() });
    if (r.status === 204) return reply.send({ ok: true });
    if (!r.ok) return reply.status(r.status).send({ error: await r.text() });
    return reply.send({ ok: true });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Failed to delete Sora job' });
  }
});

// Retrieve generation thumbnail (base64)
app.get('/api/videos/sora/thumbnail/:generationId', async (req, reply) => {
  const generationId = (req.params as any)?.generationId as string | undefined;
  if (!generationId) return reply.status(400).send({ error: 'Missing generationId' });
  try {
    const base = `${AZ.endpoint.replace(/\/+$/, '')}/openai/v1`;
    const url = `${base}/video/generations/${encodeURIComponent(generationId)}/content/thumbnail?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { headers: { ...soraHeaders(), 'Accept': 'image/jpg' } });
    if (!r.ok) return reply.status(r.status).send({ error: await r.text() });
    const ab = await r.arrayBuffer();
    const b64 = Buffer.from(ab).toString('base64');
    const ct = r.headers.get('content-type') || 'image/jpeg';
    return reply.send({ generation_id: generationId, content_type: ct, image_base64: b64 });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Failed to retrieve thumbnail' });
  }
});

// Note: Fastify auto-exposes HEAD for GET routes by default.
// We intentionally avoid defining an explicit HEAD handler for
// /api/videos/sora/content/:generationId to prevent duplicate-route errors.

// ----------------- VIDEOS: basic edits (trim) -----------------
const VideoTrimReq = z.object({
  video_id: z.string().min(1),
  start: z.number().min(0).default(0),
  duration: z.number().min(0.1)
});
app.post('/api/videos/edit/trim', async (req, reply) => {
  const body = VideoTrimReq.parse(req.body);
  const items = await readManifest();
  const src = items.find(i => i.kind === 'video' && i.id === body.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Source video not found' });

  // Clamp to valid ranges based on known source duration
  const start = Math.max(0, body.start);
  if (start >= src.duration) return reply.status(400).send({ error: 'Start is beyond video duration' });
  const maxDur = Math.max(0.1, src.duration - start);
  const duration = Math.max(0.1, Math.min(body.duration, maxDur));

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const outName = `${id}.mp4`;
  const outPath = path.join(VID_DIR, outName);

  const ffmpegPath = (ffmpegStatic as string);
  await new Promise<void>((resolve, reject) => {
    // Re-encode for accurate trimming independent of keyframes
    const args = [
      '-i', inPath,
      '-ss', String(start),
      '-t', String(duration),
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '18',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      outPath,
      '-y'
    ];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', (d) => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video',
    id,
    filename: outName,
    url: `/static/videos/${outName}`,
    prompt: `${src.prompt} (trim ${start}s +${duration}s)`,
    width: src.width, height: src.height,
    duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);

  // stream back base64 (for immediate preview)
  return reply.send({ library_item: item });
});

// ---------- Video Edits: CROP ----------
const CropReq = z.object({
  video_id: z.string(),
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().min(16),
  height: z.number().int().min(16)
});
app.post('/api/videos/edit/crop', async (req, reply) => {
  const b = CropReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vf = `crop=${b.width}:${b.height}:${b.x}:${b.y}`;

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inPath, '-filter:v', vf, '-c:a', 'copy', '-movflags', '+faststart', outPath, '-y'];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (crop ${b.width}x${b.height}+${b.x}+${b.y})`,
    width: b.width, height: b.height, duration: src.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Edits: RESIZE / FIT ----------
const ResizeReq = z.object({
  video_id: z.string(),
  width: z.number().int().min(16),
  height: z.number().int().min(16),
  fit: z.enum(['contain', 'cover', 'stretch']).default('contain'),
  bg: z.string().default('black')
});
app.post('/api/videos/edit/resize', async (req, reply) => {
  const b = ResizeReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });
  // Validate pad color to a safe subset (#RRGGBB or common names)
  const safeColor = (c: string) => /^(#[0-9a-fA-F]{6})$/.test(c) || [
    'black','white','gray','grey','red','green','blue','yellow','magenta','cyan','transparent'
  ].includes(c.toLowerCase());
  if (b.fit === 'contain' && !safeColor(b.bg)) {
    return reply.status(400).send({ error: 'Invalid pad color' });
  }

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vf = b.fit === 'contain'
    ? `scale=${b.width}:${b.height}:force_original_aspect_ratio=decrease,pad=${b.width}:${b.height}:(ow-iw)/2:(oh-ih)/2:color=${b.bg}`
    : b.fit === 'cover'
      ? `scale=${b.width}:${b.height}:force_original_aspect_ratio=increase,crop=${b.width}:${b.height}`
      : `scale=${b.width}:${b.height}`;

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inPath, '-vf', vf, '-c:a', 'copy', '-movflags', '+faststart', outPath, '-y'];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (resize ${b.width}x${b.height} ${b.fit})`,
    width: b.width, height: b.height, duration: src.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Edits: SPEED (with audio) ----------
const SpeedReq = z.object({
  video_id: z.string(),
  speed: z.number().min(0.25).max(4)
});
function atempoChain(speed: number) {
  const parts: string[] = [];
  let s = speed;
  while (s < 0.5) { parts.push('atempo=0.5'); s /= 0.5; }
  while (s > 2.0) { parts.push('atempo=2.0'); s /= 2.0; }
  parts.push(`atempo=${s.toFixed(3)}`);
  return parts.join(',');
}
app.post('/api/videos/edit/speed', async (req, reply) => {
  const b = SpeedReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vset = `setpts=${(1 / b.speed).toFixed(6)}*PTS`;
  const aset = atempoChain(b.speed);

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inPath, '-filter:v', vset, '-filter:a', aset, '-movflags', '+faststart', outPath, '-y'];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const dur = Number((src.duration / b.speed).toFixed(3));
  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (speed x${b.speed})`,
    width: src.width, height: src.height, duration: dur,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Edits: MUTE / VOLUME ----------
const MuteReq = z.object({ video_id: z.string() });
app.post('/api/videos/edit/mute', async (req, reply) => {
  const b = MuteReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inPath, '-an', '-c:v', 'copy', '-movflags', '+faststart', outPath, '-y'];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (muted)`,
    width: src.width, height: src.height, duration: src.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

const VolumeReq = z.object({
  video_id: z.string(),
  gain_db: z.number().min(-30).max(30).default(0)
});
app.post('/api/videos/edit/volume', async (req, reply) => {
  const b = VolumeReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });

  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ['-i', inPath, '-filter:a', `volume=${b.gain_db}dB`, '-movflags', '+faststart', outPath, '-y'];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (vol ${b.gain_db}dB)`,
    width: src.width, height: src.height, duration: src.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Edits: OVERLAY IMAGE (watermark/logo) ----------
const OverlayReq = z.object({
  video_id: z.string(),
  image_id: z.string(),
  x: z.string().default('10'),
  y: z.string().default('10'),
  overlay_width: z.number().int().min(1).optional(),
  overlay_height: z.number().int().min(1).optional(),
  opacity: z.number().min(0).max(1).default(0.85)
});
app.post('/api/videos/edit/overlay', async (req, reply) => {
  const b = OverlayReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  const img = lib.find(i => i.kind === 'image' && i.id === b.image_id) as ImageItem | undefined;
  if (!src || !img) return reply.status(404).send({ error: 'Video or image not found' });

  // Validate overlay expressions to avoid filtergraph injection
  const isSafeExpr = (s: string) => /^[\s0-9+\-*/().WHwh]+$/.test(s);
  if (!isSafeExpr(b.x) || !isSafeExpr(b.y)) {
    return reply.status(400).send({ error: 'Invalid overlay position expression' });
  }

  const inVideo = path.join(VID_DIR, src.filename);
  const inImage = path.join(IMG_DIR, img.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const scalePart = b.overlay_width || b.overlay_height
    ? `scale=${b.overlay_width ?? -1}:${b.overlay_height ?? -1},`
    : '';

  const ovChain = `[1:v]${scalePart}format=rgba,colorchannelmixer=aa=${b.opacity}[ov];[0:v][ov]overlay=${b.x}:${b.y}[v]`;

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = [
      '-i', inVideo,
      '-loop', '1', '-i', inImage,
      '-filter_complex', ovChain,
      '-map', '[v]', '-map', '0:a?', '-shortest',
      '-c:a', 'copy', '-movflags', '+faststart', outPath, '-y'
    ];
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `${src.prompt} (overlay ${img.filename})`,
    width: src.width, height: src.height, duration: src.duration,
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Edits: CONCAT ----------
const ConcatReq = z.object({
  video_ids: z.array(z.string()).min(2),
  target_width: z.number().int().min(16).optional(),
  target_height: z.number().int().min(16).optional()
});
app.post('/api/videos/edit/concat', async (req, reply) => {
  const b = ConcatReq.parse(req.body);
  const lib = await readManifest();
  const vids = b.video_ids.map(id => lib.find(i => i.kind === 'video' && i.id === id) as VideoItem | undefined);
  if (vids.some(v => !v)) return reply.status(404).send({ error: 'One or more videos not found' });

  const inputs: string[] = [];
  vids.forEach(v => inputs.push(path.join(VID_DIR, v!.filename)));
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const n = vids.length;
  const maps: string[] = [];
  const pre: string[] = [];
  // If any input is missing audio (e.g., muted), emit video-only output to avoid concat failures
  // Simple robustness: include audio only if all inputs have audio
  async function hasAudio(filePath: string): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const ff = child_process.spawn(ffmpegStatic as string, ['-i', filePath]);
      let stderr = '';
      ff.stderr.on('data', d => stderr += d.toString());
      ff.on('close', () => resolve(/Audio:\s/.test(stderr)));
      ff.on('error', () => resolve(false));
    });
  }
  const audioPresence = await Promise.all(inputs.map(p => hasAudio(p)));
  const includeAudio = audioPresence.every(Boolean);
  for (let i = 0; i < n; i++) {
    const vLabel = `[v${i}]`;
    const aLabel = `[a${i}]`;
    const scale = (b.target_width && b.target_height)
      ? `scale=${b.target_width}:${b.target_height}:force_original_aspect_ratio=decrease,pad=${b.target_width}:${b.target_height}:(ow-iw)/2:(oh-ih)/2:color=black`
      : 'null';
    pre.push(`[${i}:v]${scale}${vLabel}` + (includeAudio ? `;[${i}:a]anull${aLabel}` : ''));
    maps.push(vLabel);
    if (includeAudio) maps.push(aLabel);
  }
  const fc = includeAudio
    ? `${pre.join('')}${maps.join('')}concat=n=${n}:v=1:a=1[v][a]`
    : `${pre.join('')}${maps.join('')}concat=n=${n}:v=1:a=0[v]`;

  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const baseArgs = inputs.flatMap(f => ['-i', f]).concat(['-filter_complex', fc, '-map', '[v]']);
    if (includeAudio) baseArgs.push('-map', '[a]', '-c:a', 'aac');
    const args = baseArgs.concat(['-c:v', 'libx264', '-shortest', '-movflags', '+faststart', outPath, '-y']);
    const p = child_process.spawn(ffmpegPath, args);
    p.on('error', reject);
    p.stderr.on('data', d => req.log.debug({ ffmpeg: d.toString() }));
    p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: 'video', id, filename: out, url: `/static/videos/${out}`,
    prompt: `concat(${n})`,
    width: b.target_width ?? vids[0]!.width,
    height: b.target_height ?? vids[0]!.height,
    duration: vids.reduce((s, v) => s + v!.duration, 0),
    createdAt: new Date().toISOString()
  };
  const all = await readManifest();
  all.unshift(item);
  await writeManifest(all);
  return reply.send({ library_item: item });
});

// ---------- Video Analysis (Beta) ----------
import { analyzeVideoSequence } from './lib/video-analysis.js';

// Advanced Sora prompt generation is now integrated into the vision service

app.post('/api/videos/analyze', async (req, reply) => {
  if (!process.env.ENABLE_VIDEO_ANALYSIS) {
    return reply.status(404).send({ error: 'Video analysis disabled' });
  }
  const b = z.object({
    video_id: z.string(),
    method: z.enum(['uniform', 'scene-detection']).default('scene-detection'),
    maxFrames: z.number().int().min(1).max(24).default(8),
    minInterval: z.number().min(0.5).max(5).default(1.0),
    outputFormat: z.enum(['png','jpeg']).default('jpeg'),
    quality: z.number().int().min(2).max(10).default(3),
    duration: z.number().min(0.1).optional(),
    width: z.number().int().min(16).optional(),
    height: z.number().int().min(16).optional()
  }).parse(req.body);

  const lib = await readManifest();
  const src = lib.find(i => i.kind === 'video' && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: 'Video not found' });

  try {
    const videoPath = path.join(VID_DIR, src.filename);
    const result = await analyzeVideoSequence(videoPath, {
      method: b.method,
      maxFrames: b.maxFrames,
      minInterval: b.minInterval,
      outputFormat: b.outputFormat,
      quality: b.quality,
      duration: src.duration,
      width: src.width,
      height: src.height
    });
    return reply.send(result);
  } catch (e:any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || 'Video analysis failed' });
  }
});

app.get('/healthz', async () => ({ ok: true }));

// ----------------- ANALYTICS EVENTS -----------------
app.post('/api/analytics', async (req, reply) => {
  try {
    const event = AnalyticsEventSchema.parse(req.body);
    req.log.info({ analytics: event });
    return reply.send({ ok: true });
  } catch (e: any) {
    req.log.warn({ analytics_error: e });
    return reply.status(400).send({ error: 'Invalid analytics event' });
  }
});

// ----------------- Serve built web app (SPA) in production -----------------
try {
  const WEB_DIST_DIR = path.resolve(process.cwd(), '../web/dist');
  // Serve only built assets under /assets/ to avoid route collisions
  await app.register(fstatic, { root: path.join(WEB_DIST_DIR, 'assets'), prefix: '/assets/', decorateReply: false });

  // Register SPA fallback only if index.html exists
  let hasIndex = false;
  try {
    await fs.access(path.join(WEB_DIST_DIR, 'index.html'));
    hasIndex = true;
  } catch {
    app.log.warn({ msg: 'Web dist not found; dev mode?', hint: 'Run: pnpm --dir web build' });
  }

  if (hasIndex) {
    app.get('/*', async (_req, reply) => {
      try {
        const html = await fs.readFile(path.join(WEB_DIST_DIR, 'index.html'), 'utf-8');
        reply.type('text/html').send(html);
      } catch {
        reply.code(404).send({ error: 'Not found' });
      }
    });
  }
} catch (e) {
  app.log.warn({ msg: 'Failed to configure web static', error: (e as any)?.message });
}

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: '0.0.0.0' }).catch((e) => { app.log.error(e); process.exit(1); });
