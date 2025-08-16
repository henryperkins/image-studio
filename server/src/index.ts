import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fstatic from "@fastify/static";
import multipart from "@fastify/multipart";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import child_process from "node:child_process";
import ffmpegStatic from "ffmpeg-static";

const app = Fastify({ logger: true });

const ORIGIN_ENV = process.env.CORS_ORIGIN || "http://localhost:5174,http://127.0.0.1:5174";
const ORIGIN_LIST = ORIGIN_ENV.split(",").map(s => s.trim()).filter(Boolean);

await app.register(cors, {
  // Allow local dev on 5174 (localhost and 127.0.0.1) or any origins listed in CORS_ORIGIN
  origin: (origin, cb) => {
    // Allow non-browser or same-origin requests with no Origin header
    // if (!origin) return cb(null, true);
    // if (ORIGIN_LIST.includes(origin)) return cb(null, true);
    // return cb(new Error("Not allowed by CORS"), false);
    cb(null, true);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
});
await app.register(multipart);

const AZ = {
  endpoint: (process.env.AZURE_OPENAI_ENDPOINT || "").replace(/\/+$/, ""),
  key: process.env.AZURE_OPENAI_API_KEY || "",
  // Sora preview
  apiVersion: process.env.AZURE_OPENAI_API_VERSION || "preview",
  // Images gen
  imageApiVersion: process.env.AZURE_OPENAI_IMAGE_API_VERSION || "2025-04-01-preview",
  imageDeployment: process.env.AZURE_OPENAI_IMAGE_DEPLOYMENT || "",
  // Vision chat
  chatApiVersion: process.env.AZURE_OPENAI_CHAT_API_VERSION || "2024-02-15-preview",
  visionDeployment: process.env.AZURE_OPENAI_VISION_DEPLOYMENT || ""
};
if (!AZ.endpoint) throw new Error("Missing AZURE_OPENAI_ENDPOINT");

// ----------------- library layout -----------------
const DATA_DIR = path.resolve(process.cwd(), "data");
const IMG_DIR = path.join(DATA_DIR, "images");
const VID_DIR = path.join(DATA_DIR, "videos");
const MANIFEST = path.join(DATA_DIR, "manifest.json");

type ImageItem = {
  kind: "image";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

type VideoItem = {
  kind: "video";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  width: number;
  height: number;
  duration: number;
  createdAt: string;
};

type LibraryItem = ImageItem | VideoItem;

async function ensureDirs() {
  await fs.mkdir(IMG_DIR, { recursive: true });
  await fs.mkdir(VID_DIR, { recursive: true });
  try { await fs.access(MANIFEST); } catch { await fs.writeFile(MANIFEST, "[]"); }
}
await ensureDirs();

async function readManifest(): Promise<LibraryItem[]> {
  try { return JSON.parse(await fs.readFile(MANIFEST, "utf-8")); } catch { return []; }
}
async function writeManifest(items: LibraryItem[]) {
  await fs.writeFile(MANIFEST, JSON.stringify(items, null, 2));
}

// Static
await app.register(fstatic, { root: IMG_DIR, prefix: "/static/images/", decorateReply: false });
await app.register(fstatic, { root: VID_DIR, prefix: "/static/videos/", decorateReply: false });

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (AZ.key) h["api-key"] = AZ.key;
  return h;
}

// ----------------- IMAGES: generate -----------------
const ImageReq = z.object({
  prompt: z.string().min(1),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  quality: z.enum(["low", "medium", "high"]).default("high"),
  output_format: z.enum(["png", "jpeg"]).default("png"),
  n: z.number().int().min(1).max(10).default(1)
});

app.post("/api/images/generate", async (req, reply) => {
  const body = ImageReq.parse(req.body);
  if (!AZ.imageDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_IMAGE_DEPLOYMENT" });

  try {
    const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.imageDeployment)}/images/generations?api-version=${AZ.imageApiVersion}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: body.prompt,
        size: body.size,
        quality: body.quality,
        output_format: body.output_format,
        n: body.n
      })
    });
    if (!r.ok) throw new Error(`Azure image gen failed: ${r.status} ${await r.text()}`);
    const data = await r.json() as any;
    const b64: string | undefined = data?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No image payload returned");

    const id = crypto.randomUUID();
    const ext = body.output_format === "jpeg" ? "jpg" : "png";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, "base64"));

    const item: ImageItem = {
      kind: "image",
      id, filename,
      url: `/static/images/${filename}`,
      prompt: body.prompt,
      size: body.size,
      format: body.output_format,
      createdAt: new Date().toISOString()
    };
    const items = await readManifest();
    items.unshift(item);
    await writeManifest(items);

    return reply.send({ image_base64: b64, model: "gpt-image-1", size: body.size, format: body.output_format, library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Image generation failed" });
  }
});

// ----------------- IMAGES: edit (gpt-image-1 inpainting/transform) -----------------
const ImageEditReq = z.object({
  image_id: z.string().min(1),
  prompt: z.string().min(1),
  // PNG data URL for mask; transparent pixels mark regions to change
  mask_data_url: z.string().url().optional(),
  size: z.enum(["1024x1024", "1536x1024", "1024x1536"]).default("1024x1024"),
  output_format: z.enum(["png", "jpeg"]).default("png")
});

function dataURLtoBuffer(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) throw new Error("Invalid data URL");
  return Buffer.from(m[2], "base64");
}

app.post("/api/images/edit", async (req, reply) => {
  const body = ImageEditReq.parse(req.body);
  try {
    const items = await readManifest();
    const src = items.find(i => i.kind === "image" && i.id === body.image_id) as ImageItem | undefined;
    if (!src) return reply.status(404).send({ error: "Source image not found" });

    // Build multipart for v1 preview images/edits
    const form = new FormData();
    form.set("model", "gpt-image-1");
    form.set("prompt", body.prompt);
    form.set("size", body.size);
    form.set("output_format", body.output_format);

    // image file
    const srcPath = path.join(IMG_DIR, src.filename);
    const srcBuf = await fs.readFile(srcPath);
    const srcMime = src.filename.endsWith(".jpg") ? "image/jpeg" : "image/png";
    form.set("image", new File([srcBuf], src.filename, { type: srcMime }));

    // optional mask (PNG with transparent regions to edit)
    if (body.mask_data_url) {
      const maskBuf = dataURLtoBuffer(body.mask_data_url);
      form.set("mask", new File([maskBuf], "mask.png", { type: "image/png" }));
    }

    const url = `${AZ.endpoint}/openai/v1/images/edits?api-version=${AZ.apiVersion}`;
    const r = await fetch(url, { method: "POST", headers: authHeaders(), body: form as any });
    if (!r.ok) throw new Error(`Azure image edit failed: ${r.status} ${await r.text()}`);
    const j = await r.json() as any;
    const b64: string | undefined = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error("No edited image returned");

    const id = crypto.randomUUID();
    const ext = body.output_format === "jpeg" ? "jpg" : "png";
    const filename = `${id}.${ext}`;
    await fs.writeFile(path.join(IMG_DIR, filename), Buffer.from(b64, "base64"));

    const item: ImageItem = {
      kind: "image",
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

    return reply.send({ image_base64: b64, library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Image edit failed" });
  }
});

// ----------------- LIBRARY: list/delete -----------------
app.get("/api/library/media", async (_req, reply) => {
  const items = await readManifest();
  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  return reply.send({ items });
});

app.delete("/api/library/media/:id", async (req, reply) => {
  const id = (req.params as any)?.id as string;
  if (!id) return reply.status(400).send({ error: "Missing id" });
  const items = await readManifest();
  const idx = items.findIndex((x) => x.id === id);
  if (idx === -1) return reply.status(404).send({ error: "Not found" });
  const [removed] = items.splice(idx, 1);
  await writeManifest(items);
  try {
    const dir = removed.kind === "video" ? VID_DIR : IMG_DIR;
    await fs.unlink(path.join(dir, removed.filename));
  } catch { }
  return reply.send({ ok: true });
});

// ----------------- VISION Analysis (Enhanced GPT-4.1) -----------------
import { createVisionService } from './lib/vision-service.js';

// Initialize vision service
const visionService = createVisionService({
  azureEndpoint: AZ.endpoint,
  visionDeployment: AZ.visionDeployment,
  chatApiVersion: AZ.chatApiVersion,
  authHeaders: authHeaders(),
  imagePath: IMG_DIR,
  cachingEnabled: true,
  moderationEnabled: true,
  maxTokens: 1500
});

// Legacy endpoint for backward compatibility
const VisionReq = z.object({
  library_ids: z.array(z.string()).optional(),
  image_urls: z.array(z.string().url()).optional(),
  detail: z.enum(["auto", "low", "high"]).default("high"),
  style: z.enum(["concise", "detailed"]).default("concise")
});

app.post("/api/vision/describe", async (req, reply) => {
  const body = VisionReq.parse(req.body);
  if (!AZ.visionDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_VISION_DEPLOYMENT" });
  
  try {
    if (!body.library_ids?.length && !body.image_urls?.length) {
      return reply.status(400).send({ error: "No images provided" });
    }

    // Convert to new format for backward compatibility
    if (body.library_ids?.length) {
      const result = await visionService.processImageDescription(body.library_ids, {
        detail: body.detail === "high" ? "detailed" : body.detail === "low" ? "brief" : "standard",
        purpose: "video prompt engineering",
        tone: "technical"
      });

      // Return legacy format
      return reply.send({
        description: `${result.content.scene_description}\n\nSuggested prompt: ${result.generation_guidance.suggested_prompt}`
      });
    }

    // Handle external URLs (fallback to old implementation)
    if (body.image_urls?.length) {
      // Keep old implementation for external URLs for now
      const parts = body.image_urls.map(u => ({ type: "image_url" as const, image_url: { url: u, detail: body.detail } }));
      const url = `${AZ.endpoint}/openai/deployments/${encodeURIComponent(AZ.visionDeployment)}/chat/completions?api-version=${AZ.chatApiVersion}`;
      const system = body.style === "concise"
        ? "You are an expert visual describer for video prompt engineering. Summarize key content, composition, palette, lighting, and style in 3–6 bullets. End with 'Suggested prompt:' line."
        : "You are an expert visual describer for video prompt engineering. Provide thorough description (subject, composition, palette, lighting, camera, mood, textures). End with 'Suggested prompt:' line.";

      const r = await fetch(url, {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: system },
            { role: "user", content: [{ type: "text", text: "Analyze the following image(s)." }, ...parts] }
          ],
          max_tokens: 400,
          temperature: 0.2
        })
      });
      
      if (!r.ok) return reply.status(400).send({ error: await r.text() });
      const j = await r.json() as any;
      return reply.send({ description: j?.choices?.[0]?.message?.content ?? "" });
    }

  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Vision analysis failed" });
  }
});

// Enhanced vision analysis endpoint
const EnhancedVisionReq = z.object({
  library_ids: z.array(z.string()).min(1).max(10),
  purpose: z.string().optional(),
  audience: z.enum(["general", "technical", "child", "academic"]).optional(),
  language: z.string().regex(/^[a-z]{2}$/).optional(),
  detail: z.enum(["brief", "standard", "detailed", "comprehensive"]).optional(),
  tone: z.enum(["formal", "casual", "technical", "creative"]).optional(),
  focus: z.array(z.string()).optional(),
  specific_questions: z.string().optional(),
  enable_moderation: z.boolean().default(true),
  target_age: z.number().int().min(5).max(100).optional(),
  force_refresh: z.boolean().default(false)
});

app.post("/api/vision/analyze", async (req, reply) => {
  if (!AZ.visionDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_VISION_DEPLOYMENT" });
  
  try {
    const body = EnhancedVisionReq.parse(req.body);
    
    const result = await visionService.processImageDescription(body.library_ids, {
      purpose: body.purpose,
      audience: body.audience,
      language: body.language,
      detail: body.detail,
      tone: body.tone,
      focus: body.focus,
      specific_questions: body.specific_questions,
      enableModeration: body.enable_moderation,
      targetAge: body.target_age,
      force: body.force_refresh
    });

    return reply.send(result);
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Enhanced vision analysis failed" });
  }
});

// Vision service health check
app.get("/api/vision/health", async (req, reply) => {
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

app.post("/api/vision/accessibility", async (req, reply) => {
  if (!AZ.visionDeployment) return reply.status(400).send({ error: "Missing AZURE_OPENAI_VISION_DEPLOYMENT" });
  
  try {
    const body = AccessibilityReq.parse(req.body);
    
    const result = await visionService.processImageDescription(body.library_ids, {
      purpose: "accessibility compliance",
      audience: "general",
      detail: "comprehensive",
      tone: "casual",
      focus: ["accessibility", "spatial_relationships", "text_content"],
      enableModeration: false, // Less restrictive for accessibility
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
    return reply.status(400).send({ error: e.message || "Accessibility analysis failed" });
  }
});

// ----------------- SORA: generate (and save to library) -----------------
const SoraReq = z.object({
  prompt: z.string().min(1),
  width: z.number().int().min(256).max(1920).default(1080),
  height: z.number().int().min(256).max(1920).default(1080),
  n_seconds: z.number().int().min(1).max(20).default(10),
  reference_image_urls: z.array(z.string().url()).optional()
});
function soraHeaders(): Record<string, string> {
  const h: Record<string, string> = {};
  if (AZ.key) h["api-key"] = AZ.key;
  return h;
}
app.post("/api/videos/sora/generate", async (req, reply) => {
  const body = SoraReq.parse(req.body);
  try {
    const base = `${AZ.endpoint}/openai/v1`;
    const createUrl = `${base}/video/generations/jobs?api-version=${AZ.apiVersion}`;
    const refBlock = (body.reference_image_urls?.length ?? 0) > 0 ? `\n\n[Reference images]\n${body.reference_image_urls!.join("\n")}` : "";
    const finalPrompt = `${body.prompt}${refBlock}`;

    const created = await fetch(createUrl, {
      method: "POST",
      headers: { ...soraHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "sora", prompt: finalPrompt, width: body.width, height: body.height, n_seconds: body.n_seconds })
    });
    if (!created.ok) throw new Error(await created.text());
    const job = await created.json() as any;
    const jobId = job?.id; if (!jobId) throw new Error("No job id returned");

    const statusUrl = `${base}/video/generations/jobs/${jobId}?api-version=${AZ.apiVersion}`;
    const started = Date.now();
    let status = job?.status || "queued";
    let generations: any[] = job?.generations || [];

    while (!["succeeded", "failed", "cancelled"].includes(status)) {
      if (Date.now() - started > 6 * 60 * 1000) throw new Error("Timed out waiting for Sora job");
      await new Promise(r => setTimeout(r, 5000));
      const sRes = await fetch(statusUrl, { headers: soraHeaders() });
      if (!sRes.ok) throw new Error(await sRes.text());
      const s = await sRes.json();
      status = s?.status;
      generations = s?.generations || [];
    }
    if (status !== "succeeded") return reply.status(400).send({ error: `Job ${status}` });

    const generationId = generations?.[0]?.id; if (!generationId) throw new Error("No generation id");
    const contentUrl = `${base}/video/generations/${generationId}/content/video?api-version=${AZ.apiVersion}`;
    const vRes = await fetch(contentUrl, { headers: soraHeaders() });
    if (!vRes.ok) throw new Error(await vRes.text());
    const ab = await vRes.arrayBuffer();
    const b64 = Buffer.from(ab).toString("base64");

    // Save to library
    const id = crypto.randomUUID();
    const filename = `${id}.mp4`;
    await fs.writeFile(path.join(VID_DIR, filename), Buffer.from(b64, "base64"));
    const item: VideoItem = {
      kind: "video",
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

    return reply.send({ job_id: jobId, generation_id: generationId, video_base64: b64, content_type: "video/mp4", library_item: item });
  } catch (e: any) {
    req.log.error(e);
    return reply.status(400).send({ error: e.message || "Sora generation failed" });
  }
});

// ----------------- VIDEOS: basic edits (trim) -----------------
const VideoTrimReq = z.object({
  video_id: z.string().min(1),
  start: z.number().min(0).default(0),
  duration: z.number().min(0.1)
});
app.post("/api/videos/edit/trim", async (req, reply) => {
  const body = VideoTrimReq.parse(req.body);
  const items = await readManifest();
  const src = items.find(i => i.kind === "video" && i.id === body.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Source video not found" });

  // Clamp to valid ranges based on known source duration
  const start = Math.max(0, body.start);
  if (start >= src.duration) return reply.status(400).send({ error: "Start is beyond video duration" });
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
      "-i", inPath,
      "-ss", String(start),
      "-t", String(duration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-c:a", "aac",
      "-movflags", "+faststart",
      outPath,
      "-y"
    ];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", (d) => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: "video",
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
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: CROP ----------
const CropReq = z.object({ 
  video_id: z.string(), 
  x: z.number().int().min(0), 
  y: z.number().int().min(0), 
  width: z.number().int().min(16), 
  height: z.number().int().min(16) 
});
app.post("/api/videos/edit/crop", async (req, reply) => {
  const b = CropReq.parse(req.body);
  const lib = await readManifest(); 
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });
  
  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vf = `crop=${b.width}:${b.height}:${b.x}:${b.y}`;
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ["-i", inPath, "-filter:v", vf, "-c:a", "copy", outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  
  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (crop ${b.width}x${b.height}+${b.x}+${b.y})`, 
    width: b.width, height: b.height, duration: src.duration, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: RESIZE / FIT ----------
const ResizeReq = z.object({ 
  video_id: z.string(), 
  width: z.number().int().min(16), 
  height: z.number().int().min(16), 
  fit: z.enum(["contain", "cover", "stretch"]).default("contain"), 
  bg: z.string().default("black") 
});
app.post("/api/videos/edit/resize", async (req, reply) => {
  const b = ResizeReq.parse(req.body);
  const lib = await readManifest(); 
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });
  
  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vf = b.fit === "contain"
    ? `scale=${b.width}:${b.height}:force_original_aspect_ratio=decrease,pad=${b.width}:${b.height}:(ow-iw)/2:(oh-ih)/2:color=${b.bg}`
    : b.fit === "cover"
      ? `scale=${b.width}:${b.height}:force_original_aspect_ratio=increase,crop=${b.width}:${b.height}`
      : `scale=${b.width}:${b.height}`;
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ["-i", inPath, "-vf", vf, "-c:a", "copy", outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  
  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (resize ${b.width}x${b.height} ${b.fit})`, 
    width: b.width, height: b.height, duration: src.duration, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: SPEED (with audio) ----------
const SpeedReq = z.object({ 
  video_id: z.string(), 
  speed: z.number().min(0.25).max(4) 
});
function atempoChain(speed: number) { 
  const parts: string[] = []; 
  let s = speed;
  while (s < 0.5) { parts.push("atempo=0.5"); s /= 0.5; }
  while (s > 2.0) { parts.push("atempo=2.0"); s /= 2.0; }
  parts.push(`atempo=${s.toFixed(3)}`);
  return parts.join(",");
}
app.post("/api/videos/edit/speed", async (req, reply) => {
  const b = SpeedReq.parse(req.body);
  const lib = await readManifest(); 
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });
  
  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  const vset = `setpts=${(1 / b.speed).toFixed(6)}*PTS`;
  const aset = atempoChain(b.speed);
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ["-i", inPath, "-filter:v", vset, "-filter:a", aset, outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  
  const dur = Number((src.duration / b.speed).toFixed(3));
  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (speed x${b.speed})`, 
    width: src.width, height: src.height, duration: dur, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: MUTE / VOLUME ----------
const MuteReq = z.object({ video_id: z.string() });
app.post("/api/videos/edit/mute", async (req, reply) => {
  const b = MuteReq.parse(req.body);
  const lib = await readManifest(); 
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });
  
  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ["-i", inPath, "-an", "-c:v", "copy", outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  
  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (muted)`, 
    width: src.width, height: src.height, duration: src.duration, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

const VolumeReq = z.object({ 
  video_id: z.string(), 
  gain_db: z.number().min(-30).max(30).default(0) 
});
app.post("/api/videos/edit/volume", async (req, reply) => {
  const b = VolumeReq.parse(req.body);
  const lib = await readManifest(); 
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });
  
  const inPath = path.join(VID_DIR, src.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = ["-i", inPath, "-filter:a", `volume=${b.gain_db}dB`, outPath, "-y"];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });
  
  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (vol ${b.gain_db}dB)`, 
    width: src.width, height: src.height, duration: src.duration, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: OVERLAY IMAGE (watermark/logo) ----------
const OverlayReq = z.object({
  video_id: z.string(),
  image_id: z.string(),
  x: z.string().default("10"),
  y: z.string().default("10"),
  overlay_width: z.number().int().min(1).optional(),
  overlay_height: z.number().int().min(1).optional(),
  opacity: z.number().min(0).max(1).default(0.85)
});
app.post("/api/videos/edit/overlay", async (req, reply) => {
  const b = OverlayReq.parse(req.body);
  const lib = await readManifest();
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  const img = lib.find(i => i.kind === "image" && i.id === b.image_id) as ImageItem | undefined;
  if (!src || !img) return reply.status(404).send({ error: "Video or image not found" });

  const inVideo = path.join(VID_DIR, src.filename);
  const inImage = path.join(IMG_DIR, img.filename);
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const scalePart = b.overlay_width || b.overlay_height
    ? `scale=${b.overlay_width ?? -1}:${b.overlay_height ?? -1},`
    : "";

  const ovChain = `[1:v]${scalePart}format=rgba,colorchannelmixer=aa=${b.opacity}[ov];[0:v][ov]overlay=${b.x}:${b.y}[v]`;
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-i", inVideo,
      "-loop", "1", "-i", inImage,
      "-filter_complex", ovChain,
      "-map", "[v]", "-map", "0:a?", "-shortest",
      "-c:a", "copy", outPath, "-y"
    ];
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = { 
    kind: "video", id, filename: out, url: `/static/videos/${out}`, 
    prompt: `${src.prompt} (overlay ${img.filename})`, 
    width: src.width, height: src.height, duration: src.duration, 
    createdAt: new Date().toISOString() 
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Edits: CONCAT ----------
const ConcatReq = z.object({
  video_ids: z.array(z.string()).min(2),
  target_width: z.number().int().min(16).optional(),
  target_height: z.number().int().min(16).optional()
});
app.post("/api/videos/edit/concat", async (req, reply) => {
  const b = ConcatReq.parse(req.body);
  const lib = await readManifest();
  const vids = b.video_ids.map(id => lib.find(i => i.kind === "video" && i.id === id) as VideoItem | undefined);
  if (vids.some(v => !v)) return reply.status(404).send({ error: "One or more videos not found" });
  
  const inputs: string[] = [];
  vids.forEach(v => inputs.push(path.join(VID_DIR, v!.filename)));
  const id = crypto.randomUUID();
  const out = `${id}.mp4`;
  const outPath = path.join(VID_DIR, out);

  const n = vids.length;
  const maps: string[] = [];
  const pre: string[] = [];
  for (let i = 0; i < n; i++) {
    const vLabel = `[v${i}]`;
    const aLabel = `[a${i}]`;
    const scale = (b.target_width && b.target_height)
      ? `scale=${b.target_width}:${b.target_height}:force_original_aspect_ratio=decrease,pad=${b.target_width}:${b.target_height}:(ow-iw)/2:(oh-ih)/2:color=black`
      : "null";
    pre.push(`[${i}:v]${scale}${vLabel};[${i}:a]anull${aLabel}`);
    maps.push(vLabel, aLabel);
  }
  const fc = `${pre.join("")}${maps.join("")}concat=n=${n}:v=1:a=1[v][a]`;
  
  const ffmpegPath = ffmpegStatic as string;
  await new Promise<void>((resolve, reject) => {
    const args = inputs.flatMap(f => ["-i", f]).concat([
      "-filter_complex", fc, "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-c:a", "aac", "-shortest", outPath, "-y"
    ]);
    const p = child_process.spawn(ffmpegPath, args);
    p.on("error", reject);
    p.stderr.on("data", d => req.log.debug({ ffmpeg: d.toString() }));
    p.on("close", code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`)));
  });

  const item: VideoItem = {
    kind: "video", id, filename: out, url: `/static/videos/${out}`,
    prompt: `concat(${n})`,
    width: b.target_width ?? vids[0]!.width,
    height: b.target_height ?? vids[0]!.height,
    duration: vids.reduce((s, v) => s + v!.duration, 0),
    createdAt: new Date().toISOString()
  };
  const all = await readManifest(); 
  all.unshift(item); 
  await writeManifest(all);
  const b64 = (await fs.readFile(outPath)).toString("base64");
  return reply.send({ video_base64: b64, library_item: item, content_type: "video/mp4" });
});

// ---------- Video Analysis (Beta) ----------
import { analyzeVideoSequence } from './lib/video-analysis.js';

app.post("/api/videos/analyze", async (req, reply) => {
  if (!process.env.ENABLE_VIDEO_ANALYSIS) {
    return reply.status(404).send({ error: "Video analysis disabled" });
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
    height: z.number().int().min(16).optional(),
  }).parse(req.body);

  const lib = await readManifest();
  const src = lib.find(i => i.kind === "video" && i.id === b.video_id) as VideoItem | undefined;
  if (!src) return reply.status(404).send({ error: "Video not found" });

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
    return reply.status(400).send({ error: e.message || "Video analysis failed" });
  }
});

app.get("/healthz", async () => ({ ok: true }));

const port = Number(process.env.PORT || 8787);
app.listen({ port, host: "0.0.0.0" }).catch((e) => { app.log.error(e); process.exit(1); });
