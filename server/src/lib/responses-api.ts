// Azure OpenAI Responses API client for GPT-5 integration
import { withTimeout } from './error-handling.js';

export interface ResponsesAPIConfig {
  endpoint: string;
  deployment: string;
  apiVersion: string;
  authHeaders: Record<string, string>;
  maxTokens?: number;
  seed?: number;
  timeoutMs?: number;
}

export interface ResponsesCreateParams {
  model: string; // Deployment name for Azure OpenAI
  input: string | Array<{
    role: 'developer' | 'user' | 'assistant';
    content: string | Array<{
      type: 'input_text' | 'input_image';
      text?: string; // For input_text type
      image_url?: string; // For input_image type - URL or data:image/... base64
    }>;
  }>;
  max_output_tokens?: number;
  text?: {
    verbosity?: 'low' | 'medium' | 'high';
    format?: { type: 'text' };
  };
  reasoning?: {
    effort?: 'minimal' | 'low' | 'medium' | 'high';
  };
  seed?: number;
  instructions?: string;
  tools?: any[];
  tool_choice?: string | object;
}

export interface ResponsesAPIResponse {
  id: string;
  object: string;
  created?: number;
  created_at?: number;
  model: string;
  output_text?: string;
  output?: Array<{
    id?: string;
    type?: string;
    status?: string;
    content?: Array<{
      text?: string;
      type?: string;
    }>;
    role?: string;
  }>;
  choices?: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens?: number;
    input_tokens?: number;
    completion_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
}

/**
 * Create a response using Azure OpenAI's Responses API
 * This is the new stateful API that supports GPT-5 models
 */
export async function createResponse(
  params: ResponsesCreateParams,
  config: ResponsesAPIConfig
): Promise<ResponsesAPIResponse> {
  // Azure OpenAI Responses API uses /openai/v1/responses with api-version=preview
  // IMPORTANT: Handle both endpoint formats:
  // - If endpoint already includes /openai/v1, use it as-is
  // - Otherwise, append /openai/v1
  let baseUrl = config.endpoint.replace(/\/+$/, ''); // Remove trailing slashes
  
  // Check if endpoint already has the path
  if (!baseUrl.includes('/openai/v1')) {
    baseUrl = `${baseUrl}/openai/v1`;
  }
  
  const url = `${baseUrl}/responses?api-version=preview`;

  const requestBody = {
    model: config.deployment, // Use deployment name for model
    input: params.input,
    max_output_tokens: params.max_output_tokens || config.maxTokens || 1500,
    // Note: GPT-5 doesn't support temperature parameter
    ...(params.text && { text: params.text }),
    ...(params.reasoning && { reasoning: params.reasoning }),
    ...(params.instructions && { instructions: params.instructions }),
    ...(params.seed !== undefined && { seed: params.seed }),
    ...(params.tools && { tools: params.tools }),
    ...(params.tool_choice && { tool_choice: params.tool_choice })
  };

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        ...config.authHeaders,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(requestBody)
    }),
    config.timeoutMs || 300000,
    'Responses API call'
  );

  if (!response.ok) {
    const errorText = await response.text();
    const err: any = new Error(`Responses API failed: ${response.status} ${errorText}`);
    err.status = response.status;
    try {
      err.headers = Object.fromEntries(response.headers.entries());
    } catch {
      err.headers = {};
    }
    err.body = errorText;
    throw err;
  }

  const data = await response.json();
  return data as ResponsesAPIResponse;
}

/**
 * Convert messages format to Responses API input format
 */
export function convertMessagesToResponsesInput(
  messages: any[]
): Array<{ role: 'developer' | 'user' | 'assistant'; content: any }> {
  // Convert messages array to Responses API format
  return messages
    .filter(msg => msg && typeof msg === 'object' && msg.role) // Filter out invalid messages
    .map(msg => {
      // Convert 'system' role to 'developer' for GPT-5
      const role = msg.role === 'system' ? 'developer' : msg.role;

      // Convert content format if it contains images
      let content = msg.content;
      if (Array.isArray(content)) {
        content = content.map((part: any) => {
          if (part.type === 'text') {
            return { type: 'input_text', text: part.text };
          } else if (part.type === 'image_url') {
            // Convert Chat Completions image_url format to Responses API input_image format
            // Responses API expects: { type: "input_image", image_url: "<url>" }
            // Note: Responses API doesn't support 'detail' field, just the URL string
            const imageUrl = typeof part.image_url === 'object' ? part.image_url.url : part.image_url;
            return {
              type: 'input_image',
              image_url: imageUrl
            };
          }
          return part;
        });
      }

      return {
        role,
        content
      };
    });
}

/**
 * Get system instructions from messages array
 */
export function extractSystemInstructions(messages: any[]): string | undefined {
  const systemMessage = messages.find(m => m.role === 'system');
  return systemMessage?.content;
}
