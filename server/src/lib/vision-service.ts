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
  Frame
} from '../types/vision.js';

import {
  SYSTEM_PROMPT,
  DEVELOPER_MESSAGE,
  createImageUserMessage,
  createVideoUserMessage,
  createAccessibilityFocusedPrompt,
  createSoraVideoPrompt,
  createMultiImageAnalysisPrompt,
  validatePromptParams,
  optimizePromptForTokens
} from './vision-prompts.js';

import {
  moderateImages,
  moderateText,
  handleBlockedContent,
  generateContentWarning,
  isContentAppropriateForAge,
  ModerationResult
} from './content-moderation.js';

import {
  callWithRetry,
  visionCache,
  visionCircuitBreaker,
  generateCacheKey,
  createFallbackResponse,
  withTimeout,
  VisionMetrics,
  checkVisionServiceHealth
} from './error-handling.js';

import { promises as fs } from "node:fs";
import path from "node:path";

// Configuration interface
export interface VisionServiceConfig {
  azure: {
    endpoint: string;
    visionDeployment: string;
    chatApiVersion: string;
  };
  authHeaders: Record<string, string>;
  imagePath: string;
  caching: {
    enabled: boolean;
    ttl: number;
  };
  moderation: {
    enabled: boolean;
    strictMode: boolean;
  };
  performance: {
    maxTokens: number;
    temperature: number;
    timeout: number;
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

      // 2. Check cache
      if (this.config.caching.enabled && !options.force) {
        cacheKey = generateCacheKey(imageIds, options);
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

      // 4. Content moderation (if enabled)
      let moderationResult: ModerationResult | null = null;
      if (this.config.moderation.enabled && options.enableModeration !== false) {
        moderationResult = await moderateImages(
          imageDataUrls,
          this.config.azure,
          this.config.authHeaders
        );

        if (moderationResult.recommended_action === 'block') {
          const blockedResponse = handleBlockedContent(moderationResult);
          if (cacheKey) visionCache.set(cacheKey, blockedResponse, this.config.caching.ttl);
          return blockedResponse;
        }

        // Check age appropriateness
        if (options.targetAge && !isContentAppropriateForAge(moderationResult, options.targetAge)) {
          throw new VisionAPIError(
            `Content not appropriate for target age ${options.targetAge}`,
            ErrorCode.CONTENT_FILTERED,
            false,
            FallbackStrategy.USE_GENERIC_DESCRIPTION
          );
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

  // Video frame analysis pipeline
  async analyzeVideoFrames(
    videoId: string,
    options: VideoParams & {
      extractionMethod?: 'uniform' | 'scene-detection' | 'manual';
      maxFrames?: number;
      minInterval?: number;
    } = {} as VideoParams
  ): Promise<VideoAnalysis> {
    // This is a placeholder for video frame analysis
    // In a full implementation, this would:
    // 1. Extract keyframes from video using FFmpeg
    // 2. Analyze frames using similar pipeline to images
    // 3. Add temporal analysis for continuity and motion
    
    throw new VisionAPIError(
      'Video frame analysis not yet implemented',
      ErrorCode.VALIDATION,
      false
    );
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

    const imageParts = imageDataUrls.map(url => ({
      type: "image_url" as const,
      image_url: {
        url,
        detail: options.detail === 'brief' ? 'low' as const : 'high' as const
      }
    }));

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "assistant", content: DEVELOPER_MESSAGE },
      {
        role: "user",
        content: [
          { type: "text", text: userMessage },
          ...imageParts
        ]
      }
    ];

    return messages;
  }

  private async callVisionAPI(messages: any[], options: DescriptionParams): Promise<any> {
    const url = `${this.config.azure.endpoint}/openai/deployments/${encodeURIComponent(this.config.azure.visionDeployment)}/chat/completions?api-version=${this.config.azure.chatApiVersion}`;
    
    const requestBody = {
      messages,
      max_tokens: this.config.performance.maxTokens,
      temperature: this.config.performance.temperature,
      response_format: { type: "json_object" as const }
    };

    const response = await withTimeout(
      fetch(url, {
        method: "POST",
        headers: { ...this.config.authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify(requestBody)
      }),
      this.config.performance.timeout,
      'Vision API call'
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Vision API failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content;
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
    } catch (error) {
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

  private async postProcessResponse(
    structured: StructuredDescription,
    moderationResult: ModerationResult | null
  ): Promise<StructuredDescription> {
    // Post-moderate the text content
    const textModeration = await moderateText(structured);
    
    if (!textModeration.safe) {
      structured.metadata.processing_notes.push(...textModeration.issues);
    }

    // Add content warnings if needed
    if (moderationResult) {
      const warning = generateContentWarning(moderationResult);
      if (warning) {
        structured.metadata.processing_notes.unshift(warning);
      }
    }

    return textModeration.sanitized_text || structured;
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
      strictMode: false
    },
    performance: {
      maxTokens: config.maxTokens ?? 1500,
      temperature: 0.1,
      timeout: 30000 // 30 seconds
    }
  };

  return new VisionService(serviceConfig);
}