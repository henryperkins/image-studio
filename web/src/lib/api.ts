// Dynamically determine API URL based on current host
// This allows mobile devices to connect to the dev server
function getApiBaseUrl() {
  const envUrl = (import.meta as any).env.VITE_API_BASE_URL;
  if (envUrl) {
    console.log(`📍 Using env-configured API URL: ${envUrl}`);
    return envUrl;
  }

  // If accessing from localhost, use localhost
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    console.log(`🏠 Using localhost API URL`);
    return "http://localhost:8787";
  }

  // Otherwise, use the same hostname as the web app but on port 8787
  // This works when accessing from mobile devices on the same network
  const apiUrl = `http://${window.location.hostname}:8787`;
  console.log(`📱 Using network API URL for mobile/remote access: ${apiUrl}`);
  return apiUrl;
}

export const API_BASE_URL = getApiBaseUrl();

// Enhanced debugging info for mobile connections
console.log(`🔗 API Base URL: ${API_BASE_URL}`);
console.log(`📱 User Agent: ${navigator.userAgent}`);
console.log(`🌐 Current host: ${window.location.hostname}:${window.location.port || '(default)'}`);

function withTimeout(ms: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timeout) };
}

async function fetchJson(input: RequestInfo, init: RequestInit & { timeoutMs?: number } = {}) {
  const { timeoutMs = 30000, ...rest } = init;
  const { signal, cancel } = withTimeout(timeoutMs);

  // Log API calls for debugging (especially mobile)
  if (typeof input === 'string') {
    console.log(`🔄 API Request: ${input}`);
  }

  try {
    const r = await fetch(input, { ...rest, signal });
    if (!r.ok) {
      const text = await r.text().catch(() => r.statusText);
      console.error(`❌ API Error (${r.status}): ${text}`);
      throw new Error(text || `HTTP ${r.status}`);
    }
    const ct = r.headers.get('content-type') || '';
    const result = ct.includes('application/json') ? await r.json() : await r.text();
    console.log(`✅ API Response received`);
    return result;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.error(`⏱️ Request timeout after ${timeoutMs}ms`);
      throw new Error(`Request timeout after ${timeoutMs/1000}s. The server may be unreachable.`);
    }
    console.error(`🔌 Network error:`, error);
    throw error;
  } finally {
    cancel();
  }
}

import type {
  ImageItem,
  VideoItem,
  LibraryItem,
  StructuredVisionResult,
  AccessibilityAnalysisResult,
  VisionHealthStatus
} from "@image-studio/shared";

// Re-export types that are used in other files
export type {
  ImageItem,
  VideoItem,
  LibraryItem,
  StructuredVisionResult,
  AccessibilityAnalysisResult,
  VisionHealthStatus
};

export const isVideoItem = (i: LibraryItem): i is VideoItem => i.kind === "video";

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
  console.log("Fetching suggestions from server (mocked)");
  return Promise.resolve([]);
}

export async function savePromptSuggestion(suggestion: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>): Promise<PromptSuggestion> {
  // In a real implementation, this would POST to a server endpoint
  // The server would handle ID generation, timestamping, and dedupe key creation.
  console.log("Saving suggestion to server (mocked)", suggestion);
  const newSuggestion: PromptSuggestion = {
    ...suggestion,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    dedupeKey: await hashText(suggestion.text.trim().toLowerCase()),
  };
  return Promise.resolve(newSuggestion);
}

// Helper for client-side dedupe key generation
async function hashText(text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}


export async function listLibrary(): Promise<LibraryItem[]> {
  const r = await fetch(`${API_BASE_URL}/api/library/media`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()).items as LibraryItem[];
}

export async function deleteLibraryItem(id: string) {
  const r = await fetch(`${API_BASE_URL}/api/library/media/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error(await r.text());
  return true;
}

export async function generateImage(prompt: string, size: string, quality: string, format: "png"|"jpeg") {
  const url = `${API_BASE_URL}/api/images/generate`;
  console.log(`🎨 Generating image at: ${url}`);

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({ prompt, size, quality, output_format: format, n: 1 })
    });

    if (!r.ok) {
      const errorText = await r.text();
      console.error(`❌ Image generation failed (${r.status}): ${errorText}`);
      throw new Error(errorText);
    }

    const result = await r.json();
    console.log(`✅ Image generated successfully`);
    return result;
  } catch (error: any) {
    // Enhanced error for mobile debugging
    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      if (isMobile) {
        console.error(`📱 Mobile network error detected`);
        console.error(`💡 Tip: Ensure you're on the same WiFi as the server`);
        console.error(`💡 Server should be accessible at: ${API_BASE_URL}`);
        throw new Error(`Network error: Cannot reach server at ${API_BASE_URL}. Make sure you're on the same WiFi network as the server.`);
      }
    }
    throw error;
  }
}

export async function editImage(image_id: string, prompt: string, mask_data_url?: string, size: string = "1024x1024", output_format: "png"|"jpeg" = "png") {
  const r = await fetch(`${API_BASE_URL}/api/images/edit`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ image_id, prompt, mask_data_url, size, output_format })
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
export async function describeImagesByIds(ids: string[], detail: "auto"|"low"|"high" = "high", mode: "describe"|"video_ideas" = "describe", style: "concise"|"detailed" = "concise") {
  const r = await fetch(`${API_BASE_URL}/api/vision/describe`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ library_ids: ids, detail, style })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as { description: string };
}

// Enhanced vision analysis with structured output
export async function analyzeImages(ids: string[], options: VisionAnalysisParams = {}): Promise<StructuredVisionResult> {
  const r = await fetchJson(`${API_BASE_URL}/api/vision/analyze`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ library_ids: ids, ...options }),
    timeoutMs: 45000
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
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      library_ids: ids,
      screen_reader_optimized: options.screen_reader_optimized ?? true,
      include_color_info: options.include_color_info ?? true,
      reading_level: options.reading_level ?? 8
    }),
    timeoutMs: 45000
  });
  return r as AccessibilityAnalysisResult;
}

// Get vision service health status
export async function getVisionHealth(): Promise<VisionHealthStatus> {
  const r = await fetchJson(`${API_BASE_URL}/api/vision/health`, { timeoutMs: 5000 });
  return r as VisionHealthStatus;
}

// Convenience functions for common use cases
export async function generateSoraPrompt(ids: string[], options: Partial<VisionAnalysisParams> = {}): Promise<string> {
  const result = await analyzeImages(ids, {
    ...options,
    purpose: 'Sora video prompt creation',
    detail: 'detailed',
    tone: 'creative',
    focus: ['motion_potential', 'cinematic_elements', 'scene_continuity']
  });

  return result.generation_guidance.suggested_prompt;
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

export async function generateVideo(prompt: string, width: number, height: number, n_seconds: number, reference_image_urls: string[]) {
  const r = await fetch(`${API_BASE_URL}/api/videos/sora/generate`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ prompt, width, height, n_seconds, reference_image_urls })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function trimVideo(video_id: string, start: number, duration: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/trim`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, start, duration })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function cropVideo(video_id: string, x: number, y: number, width: number, height: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/crop`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, x, y, width, height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function resizeVideo(video_id: string, width: number, height: number, fit: "contain"|"cover"|"stretch" = "contain", bg = "black") {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/resize`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, width, height, fit, bg })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function speedVideo(video_id: string, speed: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/speed`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, speed })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function muteVideo(video_id: string) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/mute`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function volumeVideo(video_id: string, gain_db: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/volume`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, gain_db })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function overlayImageOnVideo(video_id: string, image_id: string, opts: { x?: string; y?: string; overlay_width?: number; overlay_height?: number; opacity?: number } = {}) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/overlay`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_id, image_id, ...opts })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

export async function concatVideos(video_ids: string[], target_width?: number, target_height?: number) {
  const r = await fetch(`${API_BASE_URL}/api/videos/edit/concat`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ video_ids, target_width, target_height })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}
