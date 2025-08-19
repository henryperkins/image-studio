/**
 * Vision Analysis Types and Additional Schemas
 * Core schemas have been moved to @image-studio/shared/schemas
 */
import type {
  ImageItem,
  VideoItem,
  LibraryItem,
  StructuredVisionResult,
  AccessibilityAnalysisResult,
  VisionHealthStatus,
  VisionMetadata,
  Accessibility,
  Content,
  GenerationGuidance,
  SafetyFlags,
  StructuredDescription,
  VideoAnalysis
} from "@image-studio/shared";

export type {
  VisionMetadata,
  Accessibility,
  Content,
  GenerationGuidance,
  SafetyFlags,
  StructuredDescription,
  VideoAnalysis
} from "@image-studio/shared";

export {
  VisionMetadataSchema,
  AccessibilitySchema,
  ContentSchema,
  GenerationGuidanceSchema,
  SafetyFlagsSchema,
  StructuredDescriptionSchema,
  VideoAnalysisSchema
} from "@image-studio/shared";

// Moderation result interface
export interface ModerationResult {
  safe: boolean;
  flags: {
    violence: boolean;
    adult_content: boolean;
    hate_speech: boolean;
    illegal_activity: boolean;
    self_harm: boolean;
    pii_visible: boolean;
  };
  severity: 'none' | 'low' | 'medium' | 'high' | 'critical';
  description: string;
  recommended_action: 'allow' | 'warn' | 'block';
}

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
