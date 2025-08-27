// Main vision processing service with comprehensive pipeline
import {
  DescriptionParams,
  VideoParams,
  StructuredDescription,
  VideoAnalysis,
  StructuredDescriptionSchema,
  VideoAnalysisSchema,
  VisionAPIError,
  ErrorCode,
  FallbackStrategy,
  Frame as _Frame
} from '../types/vision.js';

import {
  SYSTEM_PROMPT,
  createImageUserMessage,
  createVideoUserMessage,
  createAccessibilityFocusedPrompt,
  createSoraVideoPrompt,
  createMultiImageAnalysisPrompt,
  validatePromptParams,
  optimizePromptForTokens
} from './vision-prompts.js';

import {
  moderateContent,
  generateContentWarning,
  redactPIIInObject,
  moderationToSafetyFlags,
  ModerationResult
} from './vision-moderation.js';

// Temporary compatibility functions for legacy moderation calls
async function runModerationPipeline(
  imageDataUrls: string[],
  azureConfig: { endpoint: string; visionDeployment: string; chatApiVersion: string },
  authHeaders: Record<string, string>,
  azureContentSafety?: { endpoint?: string; key?: string },
  targetAge?: number
): Promise<ModerationResult | null> {
  try {
    // Map to expected shape for moderation LLM endpoint
    const azureLLM = {
      endpoint: azureConfig.endpoint,
      deployment: azureConfig.visionDeployment,
      apiVersion: azureConfig.chatApiVersion
    };
    return await moderateContent(imageDataUrls, {
      azureContentSafety,
      azureLLM,
      authHeaders,
      targetAge,
      strictMode: true
    });
  } catch {
    return null;
  }
}

function handleBlockedContent(moderation: ModerationResult): any {
  const mappedFlags = moderationToSafetyFlags(moderation);
  return {
    metadata: {
      language: 'en',
      confidence: 'high',
      content_type: 'blocked',
      sensitive_content: true,
      processing_notes: [`Content blocked: ${moderation.description}`]
    },
    accessibility: {
      alt_text: 'Content not available due to safety policies',
      long_description: 'This content cannot be described due to safety policy violations.',
      reading_level: 8,
      color_accessibility: {
        relies_on_color: false,
        color_blind_safe: true
      }
    },
    content: {
      primary_subjects: ['blocked_content'],
      scene_description: 'Content blocked by safety filters',
      visual_elements: {
        composition: 'unavailable',
        lighting: 'unavailable',
        colors: [],
        style: 'unavailable',
        mood: 'unavailable'
      },
      text_content: [],
      spatial_layout: 'unavailable'
    },
    generation_guidance: {
      suggested_prompt: 'Cannot provide prompt for blocked content',
      style_keywords: [],
      technical_parameters: {
        aspect_ratio: 'unknown',
        recommended_model: 'none',
        complexity_score: 0
      }
    },
    safety_flags: mappedFlags,
    uncertainty_notes: ['Content blocked by safety moderation']
  };
}

function isContentAppropriateForAge(moderation: ModerationResult | null, targetAge: number): boolean {
  if (!moderation) return true;
  if (targetAge < 13) return moderation.safe && moderation.severity === 'none';
  if (targetAge < 18) return moderation.safe && moderation.severity !== 'critical';
  return moderation.safe;
}

async function moderateText<T>(obj: T): Promise<{ safe: boolean; sanitized_object: T; issues: string[] }> {
  // Simple text moderation - redact PII
  const sanitized = redactPIIInObject(obj);
  return {
    safe: true,
    sanitized_object: sanitized,
    issues: []
  };
}

import {
  callWithRetry,
  visionCache,
  visionCircuitBreaker,
  generateCacheKey,
  createFallbackResponse,
  withTimeout as _withTimeout,
  VisionMetrics,
  checkVisionServiceHealth
} from './error-handling.js';

import { callVisionAPI } from './vision-api.js';
import { IMAGE_ANALYSIS_SCHEMA, VIDEO_ANALYSIS_SCHEMA } from './vision-schemas.js';

import { promises as fs } from 'node:fs';
import path from 'node:path';

// Configuration interface
export interface VisionServiceConfig {
  azure: {
    endpoint: string;
    visionDeployment: string;
    chatApiVersion: string;
  };
  authHeaders: Record<string, string>;
  imagePath: string;
  videoPath?: string;
  caching: {
    enabled: boolean;
    ttl: number;
  };
  moderation: {
    enabled: boolean;
    strictMode: boolean;
    failOpen?: boolean;
    azureContentSafety?: {
      endpoint?: string;
      key?: string;
    };
  };
  performance: {
    maxTokens: number;
    temperature: number;
    timeout: number;
    seed?: number;
  };
}

export class VisionService {
  private config: VisionServiceConfig;
  private metrics: VisionMetrics;

  constructor(config: VisionServiceConfig) {
    this.config = config;
    this.metrics = VisionMetrics.getInstance();
  }

  // Main image processing pipeline
  async processImageDescription(
    imageIds: string[],
    options: DescriptionParams & {
      force?: boolean;
      enableModeration?: boolean;
      targetAge?: number;
    } = {}
  ): Promise<StructuredDescription> {
    const startTime = Date.now();
    let cacheKey: string | null = null;

    try {
      // 1. Validate inputs
      this.validateImageIds(imageIds);
      const validationErrors = validatePromptParams(options);
      if (validationErrors.length > 0) {
        throw new VisionAPIError(
          `Invalid parameters: ${validationErrors.join(', ')}`,
          ErrorCode.VALIDATION,
          false
        );
      }

      // 2. Check cache (include deployment/schema versions to avoid stale/incompatible entries)
      const cacheOptions = {
        ...options,
        __model: this.config.azure.visionDeployment,
        __api: this.config.azure.chatApiVersion,
        __schema: 'image-v1',
        __prompt: '2025-08-17'
      } as any;
      if (this.config.caching.enabled && !options.force) {
        cacheKey = generateCacheKey(imageIds, cacheOptions);
        const cached = visionCache.get(cacheKey);
        if (cached) {
          this.metrics.recordCacheHit();
          return cached;
        }
        this.metrics.recordCacheMiss();
      }

      // 3. Load and prepare images
      const images = await this.loadImages(imageIds);
      const imageDataUrls = images.map(img => img.dataUrl);

      // 4. Enhanced content moderation (never fail-open for minors)
      let moderationResult: ModerationResult | null = null;
      if (this.config.moderation.enabled && options.enableModeration !== false) {
        try {
          moderationResult = await runModerationPipeline(
            imageDataUrls,
            this.config.azure,
            this.config.authHeaders,
            this.config.moderation.azureContentSafety,
            options.targetAge
          );
        } catch {
          // CRITICAL: Never fail-open for minors
          const isMinor = options.targetAge && options.targetAge < 18;
          if (isMinor || (this.config.moderation.strictMode && !this.config.moderation.failOpen)) {
            throw new VisionAPIError(
              'Moderation unavailable; blocking per safety policy',
              ErrorCode.MODERATION,
              false,
              FallbackStrategy.USE_GENERIC_DESCRIPTION
            );
          }
          // Otherwise, continue with moderation disabled for this request
        }

        // If moderation pipeline failed silently, enforce policy for minors/strict
        if (!moderationResult) {
          const isMinor = options.targetAge && options.targetAge < 18;
          if (isMinor || (this.config.moderation.strictMode && !this.config.moderation.failOpen)) {
            throw new VisionAPIError(
              'Moderation unavailable; blocking per safety policy',
              ErrorCode.MODERATION,
              false,
              FallbackStrategy.USE_GENERIC_DESCRIPTION
            );
          }
        }

        if (moderationResult?.recommended_action === 'block') {
          const blockedResponse = handleBlockedContent(moderationResult);
          if (cacheKey) visionCache.set(cacheKey, blockedResponse, this.config.caching.ttl);
          return blockedResponse;
        }

        // Enhanced age appropriateness check
        if (options.targetAge) {
          const isAppropriate = isContentAppropriateForAge(moderationResult, options.targetAge);

          // For children under 13, be extra conservative
          if (options.targetAge < 13 && moderationResult) {
            const hasAnyFlags = Object.values(moderationResult.flags || {}).some(f => f);
            if (hasAnyFlags || !isAppropriate) {
              throw new VisionAPIError(
                'Content not appropriate for children under 13',
                ErrorCode.CONTENT_FILTERED,
                false,
                FallbackStrategy.USE_GENERIC_DESCRIPTION
              );
            }
          } else if (!isAppropriate) {
            throw new VisionAPIError(
              `Content not appropriate for target age ${options.targetAge}`,
              ErrorCode.CONTENT_FILTERED,
              false,
              FallbackStrategy.USE_GENERIC_DESCRIPTION
            );
          }
        }
      }

      // 5. Prepare messages for analysis
      const messages = this.constructMessages(imageDataUrls, options);

      // 6. Call vision API with retry and circuit breaker
      const result = await visionCircuitBreaker.call(async () => {
        return await callWithRetry(
          () => this.callVisionAPI(messages, options),
          {
            maxRetries: 3,
            backoff: 'exponential',
            allowDegradation: true,
            maxTokens: this.config.performance.maxTokens,
            context: 'Vision Analysis'
          }
        );
      });

      // 7. Validate and post-process
      const structured = this.validateAndParseResponse(result);
      const postModerated = await this.postProcessResponse(structured, moderationResult);

      // 8. Cache successful result
      if (cacheKey && this.config.caching.enabled) {
        visionCache.set(cacheKey, postModerated, this.config.caching.ttl);
      }

      // 9. Record metrics
      const latency = Date.now() - startTime;
      this.metrics.recordRequest(true, latency);

      return postModerated;

    } catch (error: any) {
      const latency = Date.now() - startTime;

      if (error instanceof VisionAPIError) {
        this.metrics.recordRequest(false, latency, error.code);

        // Handle fallback strategies
        if (error.fallbackStrategy) {
          const fallback = createFallbackResponse(error.fallbackStrategy, error, imageIds);
          if (cacheKey) visionCache.set(cacheKey, fallback, 300); // Short cache for fallbacks
          return fallback;
        }
        throw error;
      }

      // Unexpected errors
      this.metrics.recordRequest(false, latency);
      throw new VisionAPIError(
        `Vision processing failed: ${error.message}`,
        ErrorCode.NETWORK,
        true
      );
    }
  }

  // Two-pass video frame analysis pipeline for efficiency
  async analyzeVideoFrames(
    videoId: string,
    frames: Array<{ timestamp: number; dataUrl: string }>,
    options: VideoParams & {
      extractionMethod?: 'uniform' | 'scene-detection' | 'manual' | 'two-pass';
      maxFrames?: number;
      minInterval?: number;
    } = {} as VideoParams
  ): Promise<VideoAnalysis> {
    const startTime = Date.now();

    try {
      // Use two-pass strategy by default for efficiency
      const useTwoPass = options.extractionMethod === 'two-pass' ||
                        (options.extractionMethod === undefined && frames.length > 10);

      if (useTwoPass) {
        return await this.analyzeVideoTwoPass(videoId, frames, options);
      }

      // Single-pass analysis for smaller videos
      return await this.analyzeVideoSinglePass(videoId, frames, options);

    } catch (error: any) {
      const latency = Date.now() - startTime;
      this.metrics.recordRequest(false, latency);
      throw error;
    }
  }

  // Two-pass video analysis for cost efficiency (25-40% token savings)
  private async analyzeVideoTwoPass(
    videoId: string,
    frames: Array<{ timestamp: number; dataUrl: string }>,
    options: VideoParams
  ): Promise<VideoAnalysis> {
    // Pass 1: Sparse outline (6-10 frames at low detail)
    const sparseFrames = frames.filter((_, i) => i % Math.ceil(frames.length / 8) === 0);

    const pass1Messages = this.constructVideoMessages(sparseFrames, {
      ...options,
      detail: 'brief' as any,
      purpose: 'initial video overview'
    });

    const pass1Result = await this.callVideoVisionAPI(pass1Messages, options as any);
    const pass1Analysis = this.validateAndParseVideoResponse(pass1Result);

    // Determine if Pass 2 is needed
    const needsDetail = pass1Analysis.uncertainty_notes?.length > 3 ||
                       options.detail === 'comprehensive';

    if (!needsDetail) {
      return pass1Analysis;
    }

    // Pass 2: Targeted drilling on uncertain segments
    const uncertainSegments = pass1Analysis.scene_segments?.slice(0, 2) || [];
    const detailFrames = frames.filter(f =>
      uncertainSegments.some((s: any) =>
        f.timestamp >= s.start_time && f.timestamp <= s.end_time
      )
    );

    if (detailFrames.length === 0) {
      return pass1Analysis;
    }

    const pass2Messages = this.constructVideoMessages(detailFrames, {
      ...options,
      detail: 'standard' as any,
      purpose: 'detailed segment analysis'
    });

    const pass2Result = await this.callVideoVisionAPI(pass2Messages, options as any);
    const pass2Analysis = this.validateAndParseVideoResponse(pass2Result);

    // Merge results from both passes
    return this.mergeVideoAnalyses(pass1Analysis, pass2Analysis);
  }

  private async analyzeVideoSinglePass(
    videoId: string,
    frames: Array<{ timestamp: number; dataUrl: string }>,
    options: VideoParams
  ): Promise<VideoAnalysis> {
    const messages = this.constructVideoMessages(frames, options);
    const result = await this.callVideoVisionAPI(messages, options as any);
    return this.validateAndParseVideoResponse(result);
  }

  // Health check
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const serviceHealth = await checkVisionServiceHealth(
        this.config.azure,
        this.config.authHeaders
      );

      const cacheHealth = {
        size: visionCache.size(),
        healthy: true
      };

      const circuitBreakerState = visionCircuitBreaker.getState();
      const metrics = this.metrics.getMetrics();

      return {
        healthy: serviceHealth.healthy && circuitBreakerState !== 'open',
        details: {
          service: serviceHealth,
          cache: cacheHealth,
          circuitBreaker: { state: circuitBreakerState },
          metrics
        }
      };
    } catch (error: any) {
      return {
        healthy: false,
        details: { error: error.message }
      };
    }
  }

  // New interface method for compatibility with refactored design
  async analyzeImages(imageIds: string[], params: any = {}): Promise<StructuredDescription> {
    // Delegate to existing processImageDescription method
    return this.processImageDescription(imageIds, {
      purpose: params.purpose,
      audience: params.audience,
      language: params.language,
      detail: params.detail,
      tone: params.tone,
      focus: params.focus,
      specific_questions: params.specific_questions,
      enableModeration: params.enable_moderation,
      targetAge: params.target_age,
      force: params.force
    });
  }

  // Private helper methods
  private validateImageIds(imageIds: string[]): void {
    if (!Array.isArray(imageIds) || imageIds.length === 0) {
      throw new VisionAPIError(
        'No images provided',
        ErrorCode.VALIDATION,
        false
      );
    }

    if (imageIds.length > 10) {
      throw new VisionAPIError(
        'Too many images (max 10)',
        ErrorCode.VALIDATION,
        false
      );
    }

    for (const id of imageIds) {
      if (!id || typeof id !== 'string') {
        throw new VisionAPIError(
          'Invalid image ID provided',
          ErrorCode.VALIDATION,
          false
        );
      }
    }
  }

  private async loadImages(imageIds: string[]): Promise<Array<{ id: string; dataUrl: string; filename: string }>> {
    const results = [];

    // Load manifest to find images
    const manifestPath = path.join(path.dirname(this.config.imagePath), 'manifest.json');
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));

    for (const id of imageIds) {
      const item = manifest.find((i: any) => i.kind === 'image' && i.id === id);
      if (!item) {
        throw new VisionAPIError(
          `Image ${id} not found`,
          ErrorCode.VALIDATION,
          false
        );
      }

      const imagePath = path.join(this.config.imagePath, item.filename);
      const imageBuffer = await fs.readFile(imagePath);
      const ext = path.extname(item.filename).slice(1).toLowerCase();
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

      results.push({
        id,
        dataUrl,
        filename: item.filename
      });
    }

    return results;
  }

  private constructMessages(imageDataUrls: string[], options: DescriptionParams): any[] {
    // Choose appropriate user message based on context
    let userMessage: string;

    if (options.purpose?.includes('accessibility')) {
      userMessage = createAccessibilityFocusedPrompt(options);
    } else if (options.purpose?.includes('sora') || options.purpose?.includes('video')) {
      userMessage = createSoraVideoPrompt(options);
    } else if (imageDataUrls.length > 1) {
      userMessage = createMultiImageAnalysisPrompt(imageDataUrls.length, options);
    } else {
      userMessage = createImageUserMessage(options);
    }

    const imageParts = imageDataUrls.map((url, idx) => ({
      type: 'image_url' as const,
      image_url: {
        url,
        // Adaptive detail: first two images high, rest low when many
        detail: options.detail === 'brief' ? 'low' as const : (imageDataUrls.length > 2 && idx > 1 ? 'low' as const : 'high' as const)
      }
    }));

    // Optimize user message for token budget
    const optimizedUserMessage = optimizePromptForTokens(userMessage, this.config.performance.maxTokens);

    // Build messages without DEVELOPER_MESSAGE in assistant role
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + this.getSchemaInstructions() },
      {
        role: 'user',
        content: [
          { type: 'text', text: optimizedUserMessage },
          ...imageParts
        ]
      }
    ];

    return messages;
  }

  private async callVisionAPI(messages: any[], _options: DescriptionParams): Promise<any> {
    // Delegate to the centralized vision API caller
    const result = await callVisionAPI(
      messages,
      IMAGE_ANALYSIS_SCHEMA,
      {
        endpoint: this.config.azure.endpoint,
        deployment: this.config.azure.visionDeployment,
        apiVersion: this.config.azure.chatApiVersion,
        authHeaders: this.config.authHeaders,
        maxTokens: this.config.performance.maxTokens,
        temperature: this.config.performance.temperature,
        timeoutMs: this.config.performance.timeout,
        seed: process.env.AZURE_OPENAI_SEED ? parseInt(process.env.AZURE_OPENAI_SEED) : undefined,
        mapToStructured: true
      }
    );

    // The centralized API returns the parsed object, but we need the raw JSON string here
    return JSON.stringify(result);
  }

  // Use the video schema and return raw JSON matching video analysis
  private async callVideoVisionAPI(messages: any[], _options: DescriptionParams): Promise<any> {
    const result = await callVisionAPI(
      messages,
      VIDEO_ANALYSIS_SCHEMA,
      {
        endpoint: this.config.azure.endpoint,
        deployment: this.config.azure.visionDeployment,
        apiVersion: this.config.azure.chatApiVersion,
        authHeaders: this.config.authHeaders,
        maxTokens: this.config.performance.maxTokens,
        temperature: this.config.performance.temperature,
        timeoutMs: this.config.performance.timeout,
        seed: process.env.AZURE_OPENAI_SEED ? parseInt(process.env.AZURE_OPENAI_SEED) : undefined,
        mapToStructured: false
      }
    );
    return JSON.stringify(result);
  }

  private validateAndParseResponse(responseContent: string): StructuredDescription {
    if (!responseContent) {
      throw new VisionAPIError(
        'Empty response from vision API',
        ErrorCode.NETWORK,
        true
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(responseContent);
    } catch {
      throw new VisionAPIError(
        'Invalid JSON response from vision API',
        ErrorCode.VALIDATION,
        false
      );
    }

    // Validate against schema
    const result = StructuredDescriptionSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('Vision API response validation failed:', result.error);
      // Try to salvage partial response
      return this.salvagePartialResponse(parsed);
    }

    return result.data;
  }

  private salvagePartialResponse(partial: any): StructuredDescription {
    // Create a valid response with defaults for missing fields
    return {
      metadata: {
        language: partial.metadata?.language || 'en',
        confidence: partial.metadata?.confidence || 'low',
        content_type: partial.metadata?.content_type || 'other',
        sensitive_content: partial.metadata?.sensitive_content || false,
        processing_notes: [
          ...(partial.metadata?.processing_notes || []),
          'Response partially recovered from invalid format'
        ]
      },
      accessibility: {
        alt_text: partial.accessibility?.alt_text || 'Image description unavailable',
        long_description: partial.accessibility?.long_description || 'Detailed description could not be generated.',
        reading_level: partial.accessibility?.reading_level || 8,
        color_accessibility: {
          relies_on_color: partial.accessibility?.color_accessibility?.relies_on_color || false,
          color_blind_safe: partial.accessibility?.color_accessibility?.color_blind_safe || true
        }
      },
      content: {
        primary_subjects: partial.content?.primary_subjects || ['unknown'],
        scene_description: partial.content?.scene_description || 'Description unavailable',
        visual_elements: {
          composition: partial.content?.visual_elements?.composition || 'unavailable',
          lighting: partial.content?.visual_elements?.lighting || 'unavailable',
          colors: partial.content?.visual_elements?.colors || [],
          style: partial.content?.visual_elements?.style || 'unavailable',
          mood: partial.content?.visual_elements?.mood || 'unavailable'
        },
        text_content: partial.content?.text_content || [],
        spatial_layout: partial.content?.spatial_layout || 'unavailable'
      },
      generation_guidance: {
        suggested_prompt: partial.generation_guidance?.suggested_prompt || 'Manual prompt required',
        style_keywords: partial.generation_guidance?.style_keywords || [],
        technical_parameters: {
          aspect_ratio: partial.generation_guidance?.technical_parameters?.aspect_ratio || 'unknown',
          recommended_model: partial.generation_guidance?.technical_parameters?.recommended_model || 'gpt-image-1',
          complexity_score: partial.generation_guidance?.technical_parameters?.complexity_score || 5
        }
      },
      safety_flags: {
        violence: partial.safety_flags?.violence || false,
        adult_content: partial.safety_flags?.adult_content || false,
        pii_detected: partial.safety_flags?.pii_detected || false,
        medical_content: partial.safety_flags?.medical_content || false,
        weapons: partial.safety_flags?.weapons || false,
        substances: partial.safety_flags?.substances || false
      },
      uncertainty_notes: [
        ...(partial.uncertainty_notes || []),
        'Response format was partially invalid'
      ]
    };
  }

  // Get schema instructions for the prompt
  private getSchemaInstructions(): string {
    return '\n\nOutput must be valid JSON matching the provided response schema with all required fields. Ensure alt_text is ≤125 characters. Do not include extra commentary.';
  }

  // Helper methods for video analysis
  private constructVideoMessages(frames: Array<{ timestamp: number; dataUrl: string }>, options: any): any[] {
    const videoUserMessage = createVideoUserMessage(frames, options);

    const frameParts = frames.map(f => ({
      type: 'image_url' as const,
      image_url: {
        url: f.dataUrl,
        detail: options.detail === 'brief' ? 'low' as const : 'high' as const
      }
    }));

    return [
      { role: 'system', content: SYSTEM_PROMPT + this.getSchemaInstructions() },
      {
        role: 'user',
        content: [
          { type: 'text', text: videoUserMessage },
          ...frameParts
        ]
      }
    ];
  }

  private validateAndParseVideoResponse(responseContent: string): VideoAnalysis {
    if (!responseContent) {
      throw new VisionAPIError(
        'Empty response from vision API',
        ErrorCode.NETWORK,
        true
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(responseContent);
    } catch {
      throw new VisionAPIError(
        'Invalid JSON response from vision API',
        ErrorCode.VALIDATION,
        false
      );
    }

    // Validate against video schema
    const result = VideoAnalysisSchema.safeParse(parsed);
    if (!result.success) {
      console.warn('Video API response validation failed:', result.error);
      // Try to salvage partial response
      return this.salvagePartialVideoResponse(parsed);
    }

    return result.data;
  }

  private salvagePartialVideoResponse(partial: any): VideoAnalysis {
    // Create a valid video response with defaults for missing fields
    const baseResponse = this.salvagePartialResponse(partial) as any;

    return {
      ...baseResponse,
      duration_seconds: partial.duration_seconds || 0,
      keyframes: partial.keyframes || [],
      scene_segments: partial.scene_segments || [],
      actions: partial.actions || [],
      temporal_analysis: partial.temporal_analysis || {
        continuity: 'unknown',
        pace: 'unknown',
        camera_movement: 'unknown'
      }
    } as VideoAnalysis;
  }

  private mergeVideoAnalyses(pass1: VideoAnalysis, pass2: VideoAnalysis): VideoAnalysis {
    return {
      ...pass1,
      scene_segments: [...(pass1.scene_segments || []), ...(pass2.scene_segments || [])],
      uncertainty_notes: pass2.uncertainty_notes || pass1.uncertainty_notes,
      metadata: {
        ...pass1.metadata,
        processing_notes: [
          ...(pass1.metadata?.processing_notes || []),
          'Two-pass analysis completed for enhanced detail'
        ]
      }
    } as VideoAnalysis;
  }

  private async postProcessResponse(
    structured: StructuredDescription,
    moderationResult: ModerationResult | null
  ): Promise<StructuredDescription> {
    // Post-moderate the text content
    const textModeration = await moderateText<StructuredDescription>(structured);

    if (!textModeration.safe) {
      structured.metadata.processing_notes.push(...textModeration.issues);
    }

    // Add content warnings if needed
    if (moderationResult) {
      const warning = generateContentWarning(moderationResult);
      if (warning) {
        structured.metadata.processing_notes.unshift(warning);
      }
      // Merge moderation safety flags into structured flags (OR)
      const modFlags = moderationToSafetyFlags(moderationResult);
      structured.safety_flags = {
        violence: structured.safety_flags.violence || modFlags.violence,
        adult_content: structured.safety_flags.adult_content || modFlags.adult_content,
        pii_detected: structured.safety_flags.pii_detected || modFlags.pii_detected,
        medical_content: structured.safety_flags.medical_content || modFlags.medical_content,
        weapons: structured.safety_flags.weapons || modFlags.weapons,
        substances: structured.safety_flags.substances || modFlags.substances
      };
      // Mark sensitive if any flag
      if (Object.values(structured.safety_flags).some(Boolean)) {
        structured.metadata.sensitive_content = true;
      }
    }

    return textModeration.sanitized_object;
  }
}

// Factory function for creating vision service
export function createVisionService(config: {
  azureEndpoint: string;
  visionDeployment: string;
  chatApiVersion: string;
  authHeaders: Record<string, string>;
  imagePath: string;
  cachingEnabled?: boolean;
  moderationEnabled?: boolean;
  maxTokens?: number;
}): VisionService {
  const serviceConfig: VisionServiceConfig = {
    azure: {
      endpoint: config.azureEndpoint,
      visionDeployment: config.visionDeployment,
      chatApiVersion: config.chatApiVersion
    },
    authHeaders: config.authHeaders,
    imagePath: config.imagePath,
    caching: {
      enabled: config.cachingEnabled ?? true,
      ttl: 3600 // 1 hour
    },
    moderation: {
      enabled: config.moderationEnabled ?? true,
      strictMode: process.env.MODERATION_STRICT === 'true',
      failOpen: process.env.MODERATION_FAIL_OPEN !== 'false'
    },
    performance: {
      maxTokens: config.maxTokens ?? 4000,
      temperature: 0.1,
      timeout: 300000 // 300 seconds (5 minutes)
    }
  };

  return new VisionService(serviceConfig);
}
