// Enhanced error handling with retry logic and caching
import { VisionAPIError, ErrorCode, FallbackStrategy, RetryOptions } from '../types/vision.js';

// Simple in-memory cache implementation
class VisionCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private maxEntries: number;

  constructor(maxEntries = 1000) {
    this.maxEntries = maxEntries;
  }

  set(key: string, data: any, ttl = 3600): void {
    // Clean expired entries if cache is full
    if (this.cache.size >= this.maxEntries) {
      this.cleanup();
    }

    this.cache.set(key, {
      data: JSON.parse(JSON.stringify(data)), // Deep copy to prevent mutations
      timestamp: Date.now(),
      ttl: ttl * 1000 // Convert to milliseconds
    });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return JSON.parse(JSON.stringify(entry.data)); // Deep copy
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }

    // If still full after cleanup, remove oldest entries
    if (this.cache.size >= this.maxEntries) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = Math.floor(this.maxEntries * 0.2); // Remove oldest 20%
      for (let i = 0; i < toRemove && i < entries.length; i++) {
        this.cache.delete(entries[i][0]);
      }
    }
  }

  size(): number {
    this.cleanup();
    return this.cache.size;
  }
}

// Global cache instance
export const visionCache = new VisionCache(1000);

// Generate cache key for vision requests
export function generateCacheKey(imageIds: string[], options: any): string {
  const keyData = {
    imageIds: imageIds.sort(), // Sort for consistent keys
    options: {
      ...options,
      timestamp: undefined // Remove timestamp for caching
    }
  };
  
  return `vision:${Buffer.from(JSON.stringify(keyData)).toString('base64')}`;
}

// Error classification
export function classifyError(error: any): ErrorCode {
  const message = error.message?.toLowerCase() || '';
  const status = error.status || error.statusCode;

  // Rate limiting
  if (status === 429 || message.includes('rate limit') || message.includes('quota')) {
    return ErrorCode.RATE_LIMIT;
  }

  // Content filtering
  if (status === 400 && (message.includes('content_filter') || message.includes('safety'))) {
    return ErrorCode.CONTENT_FILTERED;
  }

  // Token limits
  if (message.includes('token') && (message.includes('limit') || message.includes('length'))) {
    return ErrorCode.TOKEN_LIMIT;
  }

  // Network issues
  if (status >= 500 || message.includes('network') || message.includes('timeout') || message.includes('connect')) {
    return ErrorCode.NETWORK;
  }

  // Validation errors
  if (status === 400 && !message.includes('content_filter')) {
    return ErrorCode.VALIDATION;
  }

  return ErrorCode.NETWORK; // Default fallback
}

// Delay function with jitter
function delay(ms: number, jitter = true): Promise<void> {
  const actualMs = jitter ? ms + Math.random() * ms * 0.1 : ms;
  return new Promise(resolve => setTimeout(resolve, actualMs));
}

// Exponential backoff calculation
function calculateBackoff(attempt: number, baseDelay = 1000, maxDelay = 30000): number {
  const exponentialDelay = baseDelay * Math.pow(2, attempt);
  return Math.min(exponentialDelay, maxDelay);
}

// Advanced retry logic with classification and fallback
export async function callWithRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions & { context?: string } = { maxRetries: 3, backoff: 'exponential' }
): Promise<T> {
  const { maxRetries, backoff, allowDegradation, context } = options;
  let { maxTokens } = options;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorType = classifyError(error);
      
      console.warn(`${context || 'Vision API'} attempt ${attempt + 1} failed:`, {
        error: error.message,
        type: errorType,
        retryable: attempt < maxRetries
      });

      // Don't retry on final attempt
      if (attempt >= maxRetries) break;

      switch (errorType) {
        case ErrorCode.RATE_LIMIT: {
          // Extract retry-after header if available
          const retryAfter = error.headers?.['retry-after'];
          const waitTime = retryAfter 
            ? parseInt(retryAfter) * 1000 
            : calculateBackoff(attempt);
          await delay(waitTime);
          continue;
        }

        case ErrorCode.CONTENT_FILTERED:
          throw new VisionAPIError(
            'Content filtered by safety system',
            ErrorCode.CONTENT_FILTERED,
            false,
            FallbackStrategy.USE_GENERIC_DESCRIPTION
          );

        case ErrorCode.TOKEN_LIMIT:
          if (allowDegradation && maxTokens && maxTokens > 200) {
            maxTokens = Math.floor(maxTokens * 0.75);
            console.warn(`Reducing max tokens to ${maxTokens} and retrying`);
            continue;
          }
          break;

        case ErrorCode.NETWORK: {
          const networkDelay = backoff === 'exponential' 
            ? calculateBackoff(attempt)
            : (attempt + 1) * 1000;
          await delay(networkDelay);
          continue;
        }

        case ErrorCode.VALIDATION:
          // Don't retry validation errors
          throw new VisionAPIError(
            `Validation error: ${error.message}`,
            ErrorCode.VALIDATION,
            false
          );

        default: {
          const defaultDelay = backoff === 'exponential'
            ? calculateBackoff(attempt)
            : (attempt + 1) * 500;
          await delay(defaultDelay);
          continue;
        }
      }
    }
  }

  // Final error handling
  if (!lastError) {
    throw new VisionAPIError('Unknown error occurred', ErrorCode.NETWORK, true);
  }
  const finalErrorType = classifyError(lastError);
  throw new VisionAPIError(
    lastError.message || 'Vision API call failed',
    finalErrorType,
    finalErrorType === ErrorCode.RATE_LIMIT || finalErrorType === ErrorCode.NETWORK
  );
}

// Circuit breaker pattern for failing services
class CircuitBreaker {
  private failures = 0;
  private lastFailTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private failureThreshold = 5,
    private timeout = 60000, // 1 minute
    private monitorWindow = 300000 // 5 minutes
  ) {}

  async call<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailTime > this.timeout) {
        this.state = 'half-open';
      } else {
        throw new VisionAPIError(
          'Service temporarily unavailable (circuit breaker open)',
          ErrorCode.NETWORK,
          true
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailTime = Date.now();

    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
    }
  }

  getState(): string {
    return this.state;
  }
}

// Global circuit breaker for vision API
export const visionCircuitBreaker = new CircuitBreaker(5, 60000, 300000);

// Graceful degradation strategies
export function createFallbackResponse(
  strategy: FallbackStrategy,
  originalError: Error,
  imageIds: string[]
): any {
  const baseResponse = {
    metadata: {
      language: 'en',
      confidence: 'low' as const,
      content_type: 'other' as const,
      sensitive_content: false,
      processing_notes: [`Fallback response due to: ${originalError.message}`]
    },
    accessibility: {
      alt_text: 'Image analysis unavailable',
      long_description: 'Unable to provide detailed description due to technical issues.',
      reading_level: 8,
      color_accessibility: {
        relies_on_color: false,
        color_blind_safe: true
      }
    },
    content: {
      primary_subjects: ['unknown'],
      scene_description: 'Analysis unavailable',
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
      suggested_prompt: 'Image analysis failed - manual prompt required',
      style_keywords: [],
      technical_parameters: {
        aspect_ratio: 'unknown',
        recommended_model: 'gpt-image-1',
        complexity_score: 5
      }
    },
    safety_flags: {
      violence: false,
      adult_content: false,
      pii_detected: false,
      medical_content: false,
      weapons: false,
      substances: false
    },
    uncertainty_notes: ['Complete analysis unavailable due to service error']
  };

  switch (strategy) {
    case FallbackStrategy.USE_GENERIC_DESCRIPTION:
      return {
        ...baseResponse,
        accessibility: {
          ...baseResponse.accessibility,
          alt_text: `Image ${imageIds.length > 1 ? 's' : ''} from user library`,
          long_description: `This contains ${imageIds.length} user-generated image${imageIds.length > 1 ? 's' : ''} from the media library. Detailed analysis is not available at this time.`
        },
        content: {
          ...baseResponse.content,
          scene_description: `User library image${imageIds.length > 1 ? 's' : ''} - content analysis unavailable`
        }
      };

    case FallbackStrategy.REDUCE_DETAIL:
      return {
        ...baseResponse,
        metadata: {
          ...baseResponse.metadata,
          processing_notes: ['Reduced detail analysis due to service constraints']
        },
        accessibility: {
          ...baseResponse.accessibility,
          alt_text: 'Image content - full analysis unavailable'
        }
      };

    default:
      return baseResponse;
  }
}

// Request timeout wrapper
export function withTimeout<T>(
  promise: Promise<T>, 
  timeoutMs = 45000,
  context = 'Vision API call'
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => 
      setTimeout(
        () => reject(new VisionAPIError(
          `${context} timed out after ${timeoutMs}ms`,
          ErrorCode.NETWORK,
          true
        )), 
        timeoutMs
      )
    )
  ]);
}

// Health check for vision service
export async function checkVisionServiceHealth(
  azureConfig: { endpoint: string; visionDeployment: string; chatApiVersion: string },
  authHeaders: Record<string, string>
): Promise<{ healthy: boolean; latency?: number; error?: string }> {
  const start = Date.now();
  
  try {
    // Check if this is a GPT-5 deployment that should use Responses API
    const isGPT5 = azureConfig.visionDeployment.toLowerCase().includes('gpt-5') || 
                   azureConfig.visionDeployment.toLowerCase().includes('gpt5');
    
    let testUrl: string;
    let requestBody: any;
    
    if (isGPT5 && process.env.AZURE_OPENAI_USE_RESPONSES_API !== 'false') {
      // Use Responses API for GPT-5 with v1 path
      let baseUrl = azureConfig.endpoint.replace(/\/+$/, ''); // Remove trailing slashes
      if (!baseUrl.includes('/openai/v1')) {
        baseUrl = `${baseUrl}/openai/v1`;
      }
      const responsesApiVersion = (process.env.AZURE_OPENAI_API_VERSION || 'v1').trim();
      testUrl = `${baseUrl}/responses?api-version=${responsesApiVersion}`;
      requestBody = {
        model: azureConfig.visionDeployment,
        input: [{ role: 'user', content: 'Health check' }],
        max_output_tokens: 1
      };
    } else {
      // Use Chat Completions API for other models
      testUrl = `${azureConfig.endpoint}/openai/deployments/${encodeURIComponent(azureConfig.visionDeployment)}/chat/completions?api-version=${azureConfig.chatApiVersion}`;
      requestBody = {
        messages: [{ role: 'user', content: 'Health check' }],
        max_tokens: 1
      };
    }
    
    const response = await withTimeout(
      fetch(testUrl, {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      }),
      5000,
      'Health check'
    );

    const latency = Date.now() - start;
    
    // Even if the request fails, if we get a response it means the service is reachable
    return {
      healthy: response.status < 500,
      latency,
      error: response.status >= 500 ? `HTTP ${response.status}` : undefined
    };
  } catch (error: any) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: error.message
    };
  }
}

// Metrics collection for monitoring
export class VisionMetrics {
  private static instance: VisionMetrics;
  private metrics = {
    total_requests: 0,
    successful_requests: 0,
    failed_requests: 0,
    cache_hits: 0,
    cache_misses: 0,
    average_latency: 0,
    error_counts: {} as Record<string, number>
  };

  static getInstance(): VisionMetrics {
    if (!VisionMetrics.instance) {
      VisionMetrics.instance = new VisionMetrics();
    }
    return VisionMetrics.instance;
  }

  recordRequest(success: boolean, latency: number, error?: ErrorCode): void {
    this.metrics.total_requests++;
    
    if (success) {
      this.metrics.successful_requests++;
    } else {
      this.metrics.failed_requests++;
      if (error) {
        this.metrics.error_counts[error] = (this.metrics.error_counts[error] || 0) + 1;
      }
    }

    // Update running average latency
    const totalSuccessful = this.metrics.successful_requests;
    if (totalSuccessful > 0) {
      this.metrics.average_latency = (
        (this.metrics.average_latency * (totalSuccessful - 1)) + latency
      ) / totalSuccessful;
    }
  }

  recordCacheHit(): void {
    this.metrics.cache_hits++;
  }

  recordCacheMiss(): void {
    this.metrics.cache_misses++;
  }

  getMetrics() {
    return {
      ...this.metrics,
      success_rate: this.metrics.total_requests > 0 
        ? this.metrics.successful_requests / this.metrics.total_requests 
        : 0,
      cache_hit_rate: (this.metrics.cache_hits + this.metrics.cache_misses) > 0
        ? this.metrics.cache_hits / (this.metrics.cache_hits + this.metrics.cache_misses)
        : 0
    };
  }

  reset(): void {
    this.metrics = {
      total_requests: 0,
      successful_requests: 0,
      failed_requests: 0,
      cache_hits: 0,
      cache_misses: 0,
      average_latency: 0,
      error_counts: {}
    };
  }
}
