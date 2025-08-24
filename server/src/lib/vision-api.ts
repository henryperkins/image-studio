// Azure OpenAI Vision API calls with strict schema enforcement

import { IMAGE_ANALYSIS_SCHEMA, VIDEO_ANALYSIS_SCHEMA, mapToLegacyFormat } from './vision-schemas.js';
import { withTimeout } from './error-handling.js';
import { 
  createResponse, 
  convertMessagesToResponsesInput, 
  extractSystemInstructions, 
  type ResponsesAPIConfig 
} from './responses-api.js';

import { SYSTEM_PROMPT, createVideoUserMessage, createImageUserMessage } from './vision-prompts.js';
export { createImageUserMessage as createUserMessage } from './vision-prompts.js';

// Detect if we should use Responses API based on deployment name
function shouldUseResponsesAPI(deployment: string, apiVersion: string): boolean {
  // Use Responses API for GPT-5 models
  // Note: When using Responses API, we'll use api-version=preview regardless of config
  const isGPT5 = deployment.toLowerCase().includes('gpt-5') || deployment.toLowerCase().includes('gpt5');
  return isGPT5;
}

// New GPT-5 Responses API call with JSON mode
export async function callVisionAPIWithResponses(
  messages: any[],
  schema: typeof IMAGE_ANALYSIS_SCHEMA | typeof VIDEO_ANALYSIS_SCHEMA,
  config: {
    endpoint: string;
    deployment: string;
    apiVersion: string;
    authHeaders: Record<string, string>;
    maxTokens?: number;
    temperature?: number;
    seed?: number;
    timeoutMs?: number;
    mapToStructured?: boolean;
  }
): Promise<any> {
  const input = convertMessagesToResponsesInput(messages);
  const instructions = extractSystemInstructions(messages);
  
  // Create JSON schema instructions for GPT-5
  const schemaInstructions = `${instructions || SYSTEM_PROMPT}

IMPORTANT: You must respond with valid JSON that exactly matches this schema:
${JSON.stringify(schema, null, 2)}

Ensure all required fields are present and data types match exactly. Do not include any text outside the JSON response.`;

  const responsesConfig: ResponsesAPIConfig = {
    endpoint: config.endpoint,
    deployment: config.deployment,
    apiVersion: config.apiVersion,
    authHeaders: config.authHeaders,
    maxTokens: config.maxTokens,
    temperature: config.temperature,
    seed: config.seed,
    timeoutMs: config.timeoutMs
  };

  const response = await createResponse({
    model: config.deployment,
    input: input,
    max_output_tokens: config.maxTokens || 1500,
    // temperature not supported by GPT-5
    text: { verbosity: 'medium' }, // Use medium verbosity for detailed analysis
    reasoning: { effort: 'low' }, // Use low effort for faster responses
    instructions: schemaInstructions,
    seed: config.seed
  }, responsesConfig);

  // GPT-5 Responses API returns output_text or output array
  const content = response?.output_text || 
                  response?.output?.[0]?.content?.[0]?.text || 
                  response?.choices?.[0]?.message?.content;
  
  if (!content) {
    throw new Error('Empty response from Responses API');
  }

  // Parse the JSON response
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON response from Responses API: ${content}`);
  }

  // Map to legacy/structured app format when requested (default true for images)
  if (config.mapToStructured !== false) {
    return mapToLegacyFormat(parsed);
  }

  return parsed;
}

// API call with strict schema enforcement (supports both legacy and Responses API)
export async function callVisionAPI(
  messages: any[],
  schema: typeof IMAGE_ANALYSIS_SCHEMA | typeof VIDEO_ANALYSIS_SCHEMA,
  config: {
    endpoint: string;
    deployment: string;
    apiVersion: string;
    authHeaders: Record<string, string>;
    maxTokens?: number;
    temperature?: number;
    seed?: number;
    timeoutMs?: number;
    // When true, map model JSON to the legacy/structured format used by the app.
    // Set to false when the provided schema already matches the app's expected output (e.g., video schema paths).
    mapToStructured?: boolean;
  }
): Promise<any> {
  // Route to Responses API for GPT-5 models
  if (shouldUseResponsesAPI(config.deployment, config.apiVersion)) {
    return callVisionAPIWithResponses(messages, schema, config);
  }

  // Legacy Chat Completions API for other models
  const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(config.deployment)}/chat/completions?api-version=${config.apiVersion}`;

  const requestBody = {
    messages,
    max_tokens: config.maxTokens || 1500,
    temperature: config.temperature ?? 0.1,
    top_p: 1.0,
    // Strict JSON schema enforcement
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: "vision_analysis",
        schema,
        strict: true
      }
    },
    // Add seed if supported by Azure deployment
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
    'Vision API call'
  );

  if (!response.ok) {
    const errorText = await response.text();
    const err: any = new Error(`Vision API failed: ${response.status} ${errorText}`);
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
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Empty response from vision API');
  }

  // Parse the JSON response (guaranteed valid by strict schema)
  const parsed = JSON.parse(content);

  // Map to legacy/structured app format when requested (default true for images)
  if (config.mapToStructured !== false) {
    return mapToLegacyFormat(parsed);
  }

  // Return raw parsed JSON when the schema already matches the consumer
  return parsed;
}

// Re-export analyzeVideoTwoPass from vision-service if needed externally
// The implementation is now centralized in vision-service.ts
