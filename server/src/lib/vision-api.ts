// Azure OpenAI Vision API calls with strict schema enforcement

import { IMAGE_ANALYSIS_SCHEMA, VIDEO_ANALYSIS_SCHEMA, mapToLegacyFormat } from './vision-schemas.js';
import { withTimeout } from './error-handling.js';

import { SYSTEM_PROMPT, createVideoUserMessage, createImageUserMessage } from './vision-prompts.js';
export { createImageUserMessage as createUserMessage } from './vision-prompts.js';

// API call with strict schema enforcement
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
    // When true, map model JSON to the legacy/structured format used by the app.
    // Set to false when the provided schema already matches the app's expected output (e.g., video schema paths).
    mapToStructured?: boolean;
  }
): Promise<any> {
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
    30000,
    'Vision API call'
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Vision API failed: ${response.status} ${errorText}`);
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
