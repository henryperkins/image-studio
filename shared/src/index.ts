// Library/media item types
export type ImageItem = {
  kind: "image";
  id: string;
  url: string;
  filename: string;
  prompt: string;
  size: "auto" | "1024x1024" | "1536x1024" | "1024x1536" | "1792x1024" | "1024x1792";
  format: "png" | "jpeg" | "webp";
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

// Vision result contracts (structured output returned by server)
export interface StructuredVisionResult {
  metadata: {
    language: string;
    confidence: "high" | "medium" | "low";
    content_type: "photograph" | "illustration" | "screenshot" | "diagram" | "artwork" | "other";
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

// Accessibility-only response contract used by the dedicated endpoint
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

// Vision service health status contract
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

// Re-export schemas and types
export {
  VisionMetadataSchema,
  AccessibilitySchema,
  ContentSchema,
  GenerationGuidanceSchema,
  SafetyFlagsSchema,
  StructuredDescriptionSchema,
  VideoAnalysisSchema,
  AnalyticsEventSchema,
  type VisionMetadata,
  type Accessibility,
  type Content,
  type GenerationGuidance,
  type SafetyFlags,
  type StructuredDescription,
  type VideoAnalysis,
  type AnalyticsEvent
} from './schemas';

// Shared timeout error contract to align web/server semantics (Phase 4)
export interface TimeoutError {
  kind: "timeout";
  message: string;
  timeoutMs: number;
  context?: string;
}
