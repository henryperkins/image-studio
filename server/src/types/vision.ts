// Vision Analysis Types and Schemas
import { z } from "zod";

// Processing parameters for vision analysis
export interface DescriptionParams {
  purpose?: string;
  audience?: 'general' | 'technical' | 'child' | 'academic';
  language?: string;
  detail?: 'brief' | 'standard' | 'detailed' | 'comprehensive';
  tone?: 'formal' | 'casual' | 'technical' | 'creative';
  focus?: string[];
  specific_questions?: string;
}

export interface VideoParams extends DescriptionParams {
  duration: number;
  width: number;
  height: number;
}

export interface Frame {
  timestamp: number;
  data_url: string;
}

// Structured output schema for vision analysis
export const VisionMetadataSchema = z.object({
  language: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
  content_type: z.enum(['photograph', 'illustration', 'screenshot', 'diagram', 'artwork', 'other']),
  sensitive_content: z.boolean(),
  processing_notes: z.array(z.string())
});

export const AccessibilitySchema = z.object({
  alt_text: z.string().max(125),
  long_description: z.string(),
  reading_level: z.number(),
  color_accessibility: z.object({
    relies_on_color: z.boolean(),
    color_blind_safe: z.boolean()
  })
});

export const ContentSchema = z.object({
  primary_subjects: z.array(z.string()),
  scene_description: z.string(),
  visual_elements: z.object({
    composition: z.string(),
    lighting: z.string(),
    colors: z.array(z.string()),
    style: z.string(),
    mood: z.string()
  }),
  text_content: z.array(z.string()),
  spatial_layout: z.string()
});

export const GenerationGuidanceSchema = z.object({
  suggested_prompt: z.string(),
  style_keywords: z.array(z.string()),
  technical_parameters: z.object({
    aspect_ratio: z.string(),
    recommended_model: z.string(),
    complexity_score: z.number().min(1).max(10)
  })
});

export const SafetyFlagsSchema = z.object({
  violence: z.boolean(),
  adult_content: z.boolean(),
  pii_detected: z.boolean(),
  medical_content: z.boolean(),
  weapons: z.boolean(),
  substances: z.boolean()
});

export const StructuredDescriptionSchema = z.object({
  metadata: VisionMetadataSchema,
  accessibility: AccessibilitySchema,
  content: ContentSchema,
  generation_guidance: GenerationGuidanceSchema,
  safety_flags: SafetyFlagsSchema,
  uncertainty_notes: z.array(z.string())
});

export const VideoAnalysisSchema = StructuredDescriptionSchema.extend({
  video_analysis: z.object({
    scene_segments: z.array(z.object({
      start_time: z.number(),
      end_time: z.number(),
      description: z.string()
    })),
    motion_analysis: z.object({
      camera_movement: z.string(),
      subject_movement: z.string(),
      transitions: z.string()
    }),
    temporal_coherence: z.number().min(1).max(10),
    keyframe_quality: z.array(z.string())
  })
});

export type VisionMetadata = z.infer<typeof VisionMetadataSchema>;
export type Accessibility = z.infer<typeof AccessibilitySchema>;
export type Content = z.infer<typeof ContentSchema>;
export type GenerationGuidance = z.infer<typeof GenerationGuidanceSchema>;
export type SafetyFlags = z.infer<typeof SafetyFlagsSchema>;
export type StructuredDescription = z.infer<typeof StructuredDescriptionSchema>;
export type VideoAnalysis = z.infer<typeof VideoAnalysisSchema>;

// Error types for vision processing
export enum ErrorCode {
  RATE_LIMIT = 'RATE_LIMIT',
  CONTENT_FILTERED = 'CONTENT_FILTERED',
  TOKEN_LIMIT = 'TOKEN_LIMIT',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  MODERATION = 'MODERATION'
}

export enum FallbackStrategy {
  USE_GENERIC_DESCRIPTION = 'USE_GENERIC_DESCRIPTION',
  REDUCE_DETAIL = 'REDUCE_DETAIL',
  RETRY_WITH_DIFFERENT_PARAMS = 'RETRY_WITH_DIFFERENT_PARAMS'
}

export class VisionAPIError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public retryable: boolean,
    public fallbackStrategy?: FallbackStrategy
  ) {
    super(message);
    this.name = 'VisionAPIError';
  }
}

// Retry configuration
export interface RetryOptions {
  maxRetries: number;
  backoff: 'linear' | 'exponential';
  allowDegradation?: boolean;
  maxTokens?: number;
}

// Cache configuration
export interface CacheConfig {
  ttl: number; // Time to live in seconds
  maxEntries?: number;
}