// Dynamically determine API URL based on current host
const meta = import.meta as unknown as { env?: { DEV?: boolean; VITE_API_BASE_URL?: string } };
// This allows mobile devices to connect to the dev server
function getApiBaseUrl() {
  // 1) Build-time override via env
  const envUrl = meta.env?.VITE_API_BASE_URL;
  if (envUrl) {
    console.warn(`📍 Using env-configured API URL: ${envUrl}`);
    return envUrl;
  }

  // 2) Runtime overrides
  try {
    const url = new URL(window.location.href);
    const paramUrl = url.searchParams.get('api');
    if (paramUrl) {
      // Persist for subsequent loads
      localStorage.setItem('API_BASE_URL', paramUrl);
      console.warn(`🧭 API override from URL param: ${paramUrl}`);
      return paramUrl;
    }
  } catch {}

  try {
    const stored = localStorage.getItem('API_BASE_URL');
    if (stored) {
      console.warn(`💾 API override from localStorage: ${stored}`);
      return stored;
    }
  } catch {}

  // 3) Smart defaults based on current host
  const host = window.location.hostname;

  // In production builds, prefer same-origin API to work on public URLs
  if (meta.env && meta.env.DEV === false) {
    const sameOrigin = window.location.origin;
    if (!meta.env?.DEV) console.warn(`🌐 Using same-origin API (prod): ${sameOrigin}`);
    return sameOrigin;
  }

  // In dev, default to localhost or LAN host:8787
  if (host === 'localhost' || host === '127.0.0.1') {
    if (meta.env?.DEV) console.warn('🏠 Using localhost API URL');
    return 'http://localhost:8787';
  }
  const apiUrl = `http://${host}:8787`;
  if (meta.env?.DEV) console.warn(`📱 Using network API URL for mobile/remote access: ${apiUrl}`);
  return apiUrl;
}

export const API_BASE_URL = getApiBaseUrl();

// Enhanced debugging info for mobile connections — dev only
if (meta.env?.DEV) {
  console.warn(`🔗 API Base URL: ${API_BASE_URL}`);
  console.warn(`📱 User Agent: ${navigator.userAgent}`);
  console.warn(`🌐 Current host: ${window.location.hostname}:${window.location.port || '(default)'}`);
}

// Abort helper that supports both a timeout and an external signal
function withTimeout(ms: number, externalSignal?: AbortSignal) {
  const controller = new AbortController()
  const onExternalAbort = () => controller.abort()
  const timeout = setTimeout(() => controller.abort(), ms)

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onExternalAbort)
    }
  }

  return {
    signal: controller.signal,
    cancel: () => {
      clearTimeout(timeout)
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }
}

type RequestInitWithTimeout = RequestInit & { timeoutMs?: number }

async function fetchJson(input: RequestInfo, init: RequestInitWithTimeout = {}) {
  const { timeoutMs = 300000, signal: externalSignal, ...rest } = init
  const { signal, cancel } = withTimeout(timeoutMs, externalSignal)

  // Log API calls for debugging (especially mobile) — dev only
  if (typeof input === 'string' && meta.env?.DEV) {
    console.warn(`🔄 API Request: ${input}`);
  }

  try {
    const r = await fetch(input, { ...rest, signal })
    if (!r.ok) {
      const text = await r.text().catch(() => r.statusText);
      console.error(`❌ API Error (${r.status}): ${text}`);
      throw new Error(text || `HTTP ${r.status}`);
    }
    const ct = r.headers.get('content-type') || ''
    const result = ct.includes('application/json') ? await r.json() : await r.text()
    if (meta.env?.DEV) console.warn('✅ API Response received')
    return result
  } catch (error: unknown) {
    const err = error as Error;
    if (err.name === 'AbortError') {
      console.error(`⏱️ Request timeout after ${timeoutMs}ms`);
      throw new Error(`Request timeout after ${timeoutMs/1000}s. The server may be unreachable.`);
    }
    console.error('🔌 Network error:', err);
    throw error;
  } finally {
    cancel()
  }
}

import type {
  ImageItem,
  VideoItem,
  LibraryItem,
  StructuredVisionResult,
  AccessibilityAnalysisResult,
  VisionHealthStatus,
  Playbook
} from '@image-studio/shared';
import { hashText, safeRandomUUID } from './hash';

// Re-export types that are used in other files
export type {
  ImageItem,
  VideoItem,
  LibraryItem,
  StructuredVisionResult,
  AccessibilityAnalysisResult,
  VisionHealthStatus,
  Playbook
};

export const isVideoItem = (i: LibraryItem): i is VideoItem => i.kind === 'video';

// Prompt Suggestions
export type PromptSuggestion = {
  id: string; // stable UUID
  text: string;
  sourceModel: 'gpt-4.1' | 'claude-3-opus' | 'gemini-1.5-pro' | string;
  origin: 'vision-analysis' | 'user-request' | 'remix' | string;
  videoId?: string;
  sessionId?: string;
  tags: string[];
  createdAt: string; // ISO timestamp
  dedupeKey: string; // normalized text hash
};

export async function getPromptSuggestions(): Promise<PromptSuggestion[]> {
  // In a real implementation, this would fetch from a server endpoint
  // For now, we'll rely on local storage persistence.
  console.warn('Fetching suggestions from server (mocked)');
  return Promise.resolve([]);
}

export async function savePromptSuggestion(suggestion: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>): Promise<PromptSuggestion> {
  // In a real implementation, this would POST to a server endpoint
  // The server would handle ID generation, timestamping, and dedupe key creation.
  console.warn('Saving suggestion to server (mocked)', suggestion);
  const newSuggestion: PromptSuggestion = {
    ...suggestion,
    id: safeRandomUUID(),
    createdAt: new Date().toISOString(),
    dedupeKey: await hashText(suggestion.text.trim().toLowerCase())
  };
  return Promise.resolve(newSuggestion);
}

// hashText moved to web/src/lib/hash.ts with secure-context fallback


import { apiCache } from './apiCache';

export async function listLibrary(opts: { signal?: AbortSignal; timeoutMs?: number } = {}): Promise<LibraryItem[]> {
  const cacheKey = 'library:items';

  // Check cache first
  const cached = apiCache.get<LibraryItem[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const data = (await fetchJson(
    `${API_BASE_URL}/api/library/media`,
    { method: 'GET', timeoutMs: opts.timeoutMs ?? 15000, signal: opts.signal }
  ) as any).items as LibraryItem[]

  // Cache the result
  apiCache.set(cacheKey, data);

  return data;
}

export async function deleteLibraryItem(id: string) {
  const r = await fetch(`${API_BASE_URL}/api/library/media/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());

  // Clear cache when items are modified
  apiCache.delete('library:items');

  return true;
}

export async function uploadLibraryImages(files: File[]): Promise<LibraryItem[]> {
  const form = new FormData();
  for (const f of files) form.append('file', f);
  const r = await fetch(`${API_BASE_URL}/api/library/upload`, { method: 'POST', body: form });
  if (!r.ok) throw new Error(await r.text());
  const j = await r.json();

  // Clear cache when new items are uploaded
  apiCache.delete('library:items');

  return (j.items || []) as LibraryItem[];
}

export async function generateImage(
  prompt: string,
  size: string,
  quality: string,
  format: 'png'|'jpeg'|'webp',
  options: { output_compression?: number; background?: 'transparent' | 'opaque' | 'auto' } = {}
) {
  const url = `${API_BASE_URL}/api/images/generate`;
  console.warn(`🎨 Generating image at: ${url}`);

  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ prompt, size, quality, output_format: format, n: 1, ...options })
    });

    if (!r.ok) {
      const errorText = await r.text();
      console.error(`❌ Image generation failed (${r.status}): ${errorText}`);
      throw new Error(errorText);
    }

    const result = await r.json();
    console.warn('✅ Image generated successfully');

    // Clear cache when new items are generated
    apiCache.delete('library:items');

    return result;
  } catch (error: unknown) {
    const err = error as Error;
    // Enhanced error for mobile debugging
    if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        console.error('📱 Mobile network error detected');
        console.error('💡 Tip: Ensure you\'re on the same WiFi as the server');
        console.error(`💡 Server should be accessible at: ${API_BASE_URL}`);
        throw new Error(`Network error: Cannot reach server at ${API_BASE_URL}. Make sure you're on the same WiFi network as the server.`);
      }
    }
    throw err;
  }
}

export async function editImage(
  image_id: string,
  prompt: string,
  mask_data_url?: string,
  size: string = '1024x1024',
  output_format: 'png' | 'jpeg' | 'webp' = 'png',
  options: {
    quality?: 'auto' | 'low' | 'medium' | 'high' | 'standard';
    background?: 'transparent' | 'opaque' | 'auto';
    output_compression?: number;
  } = {}
) {
  const r = await fetch(`${API_BASE_URL}/api/images/edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_id,
      prompt,
      mask_data_url,
      size,
      output_format,
      ...options
    })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

// Vision analysis types
export interface VisionAnalysisParams {
  purpose?: string;
  audience?: 'general' | 'technical' | 'child' | 'academic';
  language?: string;
  detail?: 'brief' | 'standard' | 'detailed' | 'comprehensive';
  tone?: 'formal' | 'casual' | 'technical' | 'creative';
  focus?: string[];
  specific_questions?: string;
  enable_moderation?: boolean;
  target_age?: number;
  force_refresh?: boolean;
}



// Legacy function for backward compatibility
export async function describeImagesByIds(ids: string[], detail: 'auto'|'low'|'high' = 'high', _mode: 'describe'|'video_ideas' = 'describe', style: 'concise'|'detailed' = 'concise') {
  const r = await fetch(`${API_BASE_URL}/api/vision/describe`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ library_ids: ids, detail, style })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as { description: string };
}

// Enhanced vision analysis with structured output
export async function analyzeImages(ids: string[], options: VisionAnalysisParams = {}): Promise<StructuredVisionResult> {
  const r = await fetchJson(`${API_BASE_URL}/api/vision/analyze`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ library_ids: ids, ...options }),
    timeoutMs: 300000
  });
  return r as StructuredVisionResult;
}

// Accessibility-focused analysis
export async function analyzeImagesForAccessibility(
  ids: string[],
  options: {
    screen_reader_optimized?: boolean;
    include_color_info?: boolean;
    reading_level?: number;
  } = {}
): Promise<AccessibilityAnalysisResult> {
  const r = await fetchJson(`${API_BASE_URL}/api/vision/accessibility`, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({
      library_ids: ids,
      screen_reader_optimized: options.screen_reader_optimized ?? true,
      include_color_info: options.include_color_info ?? true,
      reading_level: options.reading_level ?? 8
    }),
    timeoutMs: 300000
  });
  return r as AccessibilityAnalysisResult;
}

// Get vision service health status
export async function getVisionHealth(): Promise<VisionHealthStatus> {
  const r = await fetchJson(`${API_BASE_URL}/api/vision/health`, { timeoutMs: 5000 });
  return r as VisionHealthStatus;
}

// Enhanced Sora prompt generation with advanced features
export async function generateSoraPrompt(ids: string[], options: Partial<VisionAnalysisParams> = {}): Promise<string> {
  const result = await analyzeImages(ids, {
    ...options,
    purpose: 'Sora video prompt creation',
    detail: 'detailed', // Always use detailed for best results
    tone: 'creative', // Creative tone triggers advanced GPT-5 analysis
    focus: ['motion_potential', 'cinematic_elements', 'scene_continuity', 'lighting_transitions', 'subject_movements']
  });

  // Extract enhanced prompt with technical notes if available
  const basePrompt = result.generation_guidance.suggested_prompt;
  const styleKeywords = result.generation_guidance.style_keywords || [];
  const technicalNotes = result.metadata.processing_notes.filter(note =>
    note.includes('technical') || note.includes('cinematography') || note.includes('optimal')
  );

  // Combine base prompt with style enhancements
  let enhancedPrompt = basePrompt;
  if (styleKeywords.length > 0) {
    enhancedPrompt += `\n\nStyle elements: ${styleKeywords.join(', ')}`;
  }
  if (technicalNotes.length > 0) {
    enhancedPrompt += `\n\nTechnical notes: ${technicalNotes.join(' ')}`;
  }

  return enhancedPrompt;
}

export async function generateAccessibleAltText(ids: string[], options: { reading_level?: number } = {}): Promise<string> {
  const result = await analyzeImagesForAccessibility(ids, {
    screen_reader_optimized: true,
    reading_level: options.reading_level ?? 8
  });

  return result.alt_text;
}

export async function analyzeImageSafety(ids: string[]): Promise<{
  safe: boolean;
  flags: Record<string, boolean>;
  warnings: string[];
}> {
  const result = await analyzeImages(ids, {
    enable_moderation: true,
    purpose: 'content safety analysis'
  });

  const hasFlags = Object.values(result.safety_flags).some(flag => flag);
  const warnings = result.metadata.processing_notes.filter(note =>
    note.includes('warning') || note.includes('advisory')
  );

  return {
    safe: !hasFlags && warnings.length === 0,
    flags: result.safety_flags,
    warnings
  };
}

// Batch analysis for multiple image sets
export async function batchAnalyzeImages(
  imageSets: { ids: string[]; name?: string }[],
  options: VisionAnalysisParams = {}
): Promise<Array<{ name?: string; result: StructuredVisionResult; error?: string }>> {
  const results = await Promise.allSettled(
    imageSets.map(async (set) => ({
      name: set.name,
      result: await analyzeImages(set.ids, options)
    }))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    } else {
      return {
        name: imageSets[index].name,
        result: {} as StructuredVisionResult,
        error: result.reason?.message || 'Analysis failed'
      };
    }
  });
}

export async function generateVideo(
  prompt: string,
  width: number,
  height: number,
  n_seconds: number,
  reference_image_urls: string[],
  options: { n_variants?: number; quality?: 'high' | 'low' } = {}
) {
  const r = await fetch(`${API_BASE_URL}/api/videos/sora/generate`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt, width, height, n_seconds, reference_image_urls, ...options })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

/**
 * Generate a video and report download progress of the JSON response.
 * Note: Progress here reflects the response download only (final phase), not Azure job processing.
 */
export async function generateVideoWithProgress(
  prompt: string,
  width: number,
  height: number,
  n_seconds: number,
  reference_image_urls: string[],
  options: { n_variants?: number; quality?: 'high' | 'low' } = {},
  onDownloadProgress?: (loadedBytes: number, totalBytes: number) => void
): Promise<{ data: unknown; bytesRead: number; total?: number }> {
  const url = `${API_BASE_URL}/api/videos/sora/generate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ prompt, width, height, n_seconds, reference_image_urls, ...options })
  });
  if (!res.ok) throw new Error(await res.text());

  const total = Number(res.headers.get('Content-Length') || 0);

  // If streaming is not available, fall back to standard json() (no progress)
  const body: ReadableStream<Uint8Array> | null = (res as any).body ?? null;
  if (!body || typeof (body as ReadableStream<Uint8Array>).getReader !== 'function') {
    const data = await res.json();
    return { data, bytesRead: 0, total };
  }

  const reader = (body as ReadableStream<Uint8Array>).getReader();
  let received = 0;
  const chunks: Uint8Array[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.length;
      onDownloadProgress?.(received, total);
    }
  }

  const decoder = new TextDecoder();
  const text = chunks.map(c => decoder.decode(c, { stream: true })).join('') + decoder.decode();
  // Avoid JSON.parse on very large payloads (video_base64) which can block the UI.
  // Try to extract the minimal fields we need via regex. Fallback to JSON.parse if extraction fails.
  let data: unknown;
  try {
    const b64Match = text.match(/"video_base64"\s*:\s*"([A-Za-z0-9+/=]+)"/);
    const idMatch = text.match(/"generation_id"\s*:\s*"([^"]+)"/);
    const ctMatch = text.match(/"content_type"\s*:\s*"([^"]+)"/);
    if (b64Match) {
      data = {
        video_base64: b64Match[1],
        generation_id: idMatch ? idMatch[1] : undefined,
        content_type: ctMatch ? ctMatch[1] : 'video/mp4'
      } as any;
    } else {
      // Briefly yield before heavy parse to keep the main thread responsive
      await new Promise<void>(requestAnimationFrame);
      data = JSON.parse(text);
    }
  } catch {
    // As a last resort, parse normally
    data = JSON.parse(text);
  }
  return { data, bytesRead: received, total };
}
/**
 * Retrieve alternate-quality video content by generation id without re-running the job.
 */
export async function getSoraVideoContent(generation_id: string, quality: 'high' | 'low' = 'high') {
  const r = await fetchJson(`${API_BASE_URL}/api/videos/sora/content/${encodeURIComponent(generation_id)}?quality=${quality}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
    timeoutMs: 300000
  });
  return r as { generation_id: string; quality?: 'high' | 'low'; content_type: string; video_base64: string };
}

// --- Sora jobs helpers ---
export type SoraJob = {
  id: string;
  status: string;
  created_at?: number | string;
  prompt?: string;
};

export async function listSoraJobs(params: { limit?: number; before?: string; after?: string; statuses?: string } = {}) {
  const p = new URLSearchParams();
  if (params.limit) p.set('limit', String(params.limit)); else p.set('limit', '10');
  if (params.before) p.set('before', params.before);
  if (params.after) p.set('after', params.after);
  if (params.statuses) p.set('statuses', params.statuses);
  const r = await fetchJson(`${API_BASE_URL}/api/videos/sora/jobs?${p.toString()}`, { headers: { 'Accept':'application/json' } });
  return r as { data?: SoraJob[]; jobs?: SoraJob[]; [k: string]: unknown };
}

export async function getSoraJob(jobId: string) {
  const r = await fetchJson(`${API_BASE_URL}/api/videos/sora/jobs/${encodeURIComponent(jobId)}`, { headers: { 'Accept':'application/json' } });
  return r as { id: string; status: string; generations?: Array<{ id: string }>; [k: string]: unknown };
}

export async function deleteSoraJob(jobId: string) {
  const r = await fetch(`${API_BASE_URL}/api/videos/sora/jobs/${encodeURIComponent(jobId)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

export async function getSoraThumbnail(generationId: string) {
  const r = await fetchJson(`${API_BASE_URL}/api/videos/sora/thumbnail/${encodeURIComponent(generationId)}`, { headers: { 'Accept': 'application/json' } });
  return r as { generation_id: string; content_type: string; image_base64: string };
}

// --- Playbooks ---
export async function listPlaybooks(): Promise<Playbook[]> {
  const r = await fetchJson(`${API_BASE_URL}/api/playbooks`, { headers: { 'Accept': 'application/json' } });
  return (r.playbooks || []) as Playbook[];
}

export async function trimVideo(video_id: string, start: number, duration: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/trim`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, start, duration })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function cropVideo(video_id: string, x: number, y: number, width: number, height: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/crop`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, x, y, width, height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function resizeVideo(video_id: string, width: number, height: number, fit: 'contain'|'cover'|'stretch' = 'contain', bg = 'black') {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/resize`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, width, height, fit, bg })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function speedVideo(video_id: string, speed: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/speed`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, speed })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function muteVideo(video_id: string) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/mute`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function volumeVideo(video_id: string, gain_db: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/volume`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, gain_db })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function overlayImageOnVideo(video_id: string, image_id: string, opts: { x?: string; y?: string; overlay_width?: number; overlay_height?: number; opacity?: number } = {}) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/overlay`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_id, image_id, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function concatVideos(video_ids: string[], target_width?: number, target_height?: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/concat`, {
    method: 'POST', headers: { 'Content-Type':'application/json' },
    body: JSON.stringify({ video_ids, target_width, target_height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
