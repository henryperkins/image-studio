export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8787";

export type ImageItem = {
  kind: "image";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "1024x1024" | "1536x1024" | "1024x1536";
  format: "png" | "jpeg";
  createdAt: string;
};

export type VideoItem = {
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

export type LibraryItem = ImageItem | VideoItem;
export const isVideoItem = (i: LibraryItem): i is VideoItem => i.kind === "video";

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
  const r = await fetch(`${API_BASE_URL}/api/images/generate`, {
    method: "POST", headers: {"Content-Type":"application/json"},
    body: JSON.stringify({ prompt, size, quality, output_format: format, n: 1 })
  });
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
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

export interface StructuredVisionResult {
  metadata: {
    language: string;
    confidence: 'high' | 'medium' | 'low';
    content_type: 'photograph' | 'illustration' | 'screenshot' | 'diagram' | 'artwork' | 'other';
    sensitive_content: boolean;
    processing_notes: string[];
  };
  accessibility: {
    alt_text: string;
    long_description: string;
    reading_level: number;
    color_accessibility: {
      relies_on_color: boolean;
      color_blind_safe: boolean;
    };
  };
  content: {
    primary_subjects: string[];
    scene_description: string;
    visual_elements: {
      composition: string;
      lighting: string;
      colors: string[];
      style: string;
      mood: string;
    };
    text_content: string[];
    spatial_layout: string;
  };
  generation_guidance: {
    suggested_prompt: string;
    style_keywords: string[];
    technical_parameters: {
      aspect_ratio: string;
      recommended_model: string;
      complexity_score: number;
    };
  };
  safety_flags: {
    violence: boolean;
    adult_content: boolean;
    pii_detected: boolean;
    medical_content: boolean;
    weapons: boolean;
    substances: boolean;
  };
  uncertainty_notes: string[];
}

export interface AccessibilityAnalysisResult {
  alt_text: string;
  long_description: string;
  reading_level: number;
  color_accessibility: {
    relies_on_color: boolean;
    color_blind_safe: boolean;
  };
  spatial_layout: string;
  text_content: string[];
  processing_notes: string[];
}

export interface VisionHealthStatus {
  healthy: boolean;
  details: {
    service?: {
      healthy: boolean;
      latency?: number;
      error?: string;
    };
    cache?: {
      size: number;
      healthy: boolean;
    };
    circuitBreaker?: {
      state: string;
    };
    metrics?: {
      total_requests: number;
      successful_requests: number;
      failed_requests: number;
      cache_hits: number;
      cache_misses: number;
      average_latency: number;
      success_rate: number;
      cache_hit_rate: number;
      error_counts: Record<string, number>;
    };
  };
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
  const r = await fetch(`${API_BASE_URL}/api/vision/analyze`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      library_ids: ids,
      ...options
    })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as StructuredVisionResult;
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
  const r = await fetch(`${API_BASE_URL}/api/vision/accessibility`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify({
      library_ids: ids,
      screen_reader_optimized: options.screen_reader_optimized ?? true,
      include_color_info: options.include_color_info ?? true,
      reading_level: options.reading_level ?? 8
    })
  });
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as AccessibilityAnalysisResult;
}

// Get vision service health status
export async function getVisionHealth(): Promise<VisionHealthStatus> {
  const r = await fetch(`${API_BASE_URL}/api/vision/health`);
  if (!r.ok) throw new Error(await r.text());
  return (await r.json()) as VisionHealthStatus;
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