// Azure OpenAI Responses API client for GPT-5 integration
import { withTimeout } from './error-handling.js';

export interface ResponsesAPIConfig {
  endpoint: string;
  deployment: string;
  apiVersion: string;
  authHeaders: Record<string, string>;
  maxTokens?: number;
  temperature?: number;
  seed?: number;
  timeoutMs?: number;
}

export interface ResponsesCreateParams {
  model: string;
  input: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
      url: string;
      detail?: 'low' | 'high' | 'auto';
    };
  }>;
  max_output_tokens?: number;
  temperature?: number;
  verbosity?: 'low' | 'medium' | 'high';
  seed?: number;
  instructions?: string;
}

export interface ResponsesAPIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
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
  // Use the new v1 responses endpoint
  const url = `${config.endpoint}/openai/v1/responses?api-version=${config.apiVersion}`;

  const requestBody = {
    model: config.deployment, // Use deployment name for model
    input: params.input,
    max_output_tokens: params.max_output_tokens || config.maxTokens || 1500,
    temperature: params.temperature ?? config.temperature ?? 0.1,
    verbosity: params.verbosity || 'medium',
    instructions: params.instructions,
    ...(config.seed && { seed: config.seed })
  };

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers: {
        ...config.authHeaders,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    }),
    config.timeoutMs || 30000,
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
): string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: any }> {
  // Find the user message with content
  const userMessage = messages.find(m => m.role === 'user');
  if (!userMessage) {
    throw new Error('No user message found in messages array');
  }

  // If content is a string, return it directly
  if (typeof userMessage.content === 'string') {
    return userMessage.content;
  }

  // If content is an array, convert it to the responses API format
  if (Array.isArray(userMessage.content)) {
    return userMessage.content.map((item: any) => {
      if (item.type === 'text') {
        return {
          type: 'text' as const,
          text: item.text
        };
      } else if (item.type === 'image_url') {
        return {
          type: 'image_url' as const,
          image_url: item.image_url
        };
      }
      return item;
    });
  }

  return userMessage.content;
}

/**
 * Get system instructions from messages array
 */
export function extractSystemInstructions(messages: any[]): string | undefined {
  const systemMessage = messages.find(m => m.role === 'system');
  return systemMessage?.content;
}