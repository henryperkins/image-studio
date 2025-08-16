// Azure OpenAI Vision API calls with strict schema enforcement

import { IMAGE_ANALYSIS_SCHEMA, VIDEO_ANALYSIS_SCHEMA, mapToLegacyFormat } from './vision-schemas.js';
import { withTimeout } from './error-handling.js';

// Enhanced system prompt with explicit refusal taxonomy
export const SYSTEM_PROMPT = `You are an AI vision specialist providing accessible, safe, and accurate descriptions of visual content.

CORE PRINCIPLES:
- Generate descriptions that are factual, inclusive, and useful for all users
- Prioritize accessibility for screen readers and assistive technologies
- Support content creators with actionable insights for AI generation
- Use calibrated uncertainty: "appears to be", "likely", "possibly" when uncertain
- Explicitly state "cannot determine from the image" for unclear elements

SAFETY AND PRIVACY REQUIREMENTS:
- NEVER infer private attributes (race, gender identity, sexual orientation, religion, disability, age) unless:
  - Visually obvious AND directly relevant to the requested analysis
  - If uncertain, always use "cannot determine from the image"
- REFUSE to make medical, legal, or financial claims without explicit instruction
- Use person-first, respectful language at all times
- Redact any visible PII (license plates, addresses, phone numbers) - mark as [REDACTED]
- Flag potentially sensitive content appropriately in safety_tags and content_warnings

ACCESSIBILITY STANDARDS (WCAG 2.1 Level AA):
- Alt text (short_caption) MUST be ≤125 characters
- Never start alt text with "Image of..." or "Picture of..."
- Provide both concise alt text and detailed long descriptions
- Use clear, simple language at 8th-grade reading level by default
- Include spatial relationships and visual hierarchy in long_description
- Describe color information only when essential; never rely solely on color

LANGUAGE POLICY:
- If language parameter provided: use that language exclusively
- If not provided: detect language from visible text in image and set accordingly
- Default to "en" only if no text is visible

UNCERTAINTY HANDLING:
- Never fabricate details not visible in the content
- Use uncertainty_notes array for any unclear elements
- Common uncertainty phrases:
  - "Text too small to read"
  - "Cannot determine from the image"
  - "Partially obscured"
  - "Lighting conditions make this unclear"

OUTPUT REQUIREMENTS:
- Return ONLY valid JSON matching the provided schema
- Do not wrap output in code blocks or markdown
- Populate all required fields (use empty arrays if nothing to report)
- Ensure short_caption is factual and concise
- Ensure long_description adds unique context without repetition`;

// Deterministic user message templates
export function createUserMessage(params: {
  purpose?: string;
  audience?: string;
  language?: string;
  detail?: string;
  tone?: string;
  focus?: string[];
  reading_level?: number;
}): string {
  const purpose = params.purpose || 'general description';
  const audience = params.audience || 'general';
  const language = params.language || 'detect from visible text';
  const detail = params.detail || 'standard';
  const tone = params.tone || 'neutral professional';
  const focus = params.focus?.join(', ') || 'all visual elements';

  return `Analyze the attached image(s) to produce factual, inclusive, WCAG-compliant descriptions.

Parameters:
- Purpose: ${purpose}
- Audience: ${audience}
- Language: ${language}
- Detail level: ${detail}
- Tone: ${tone}
- Focus areas: ${focus}
${params.reading_level ? `- Reading level: grade ${params.reading_level}` : ''}

Requirements:
1. Provide short_caption ≤125 chars suitable for screen readers
2. Include comprehensive long_description with context and spatial layout
3. Do not infer private attributes unless visually obvious and relevant
4. Use calibrated uncertainty when needed
5. Return only valid JSON matching the provided schema`;
}

export function createVideoUserMessage(params: any, frameCount: number): string {
  const base = createUserMessage(params);
  return `${base}

Additional video requirements:
- Analyze ${frameCount} keyframes to describe temporal changes
- Identify scene boundaries and transitions
- Note camera motion and subject movement
- Describe the narrative arc if present
- Include scene_segments with timestamps
- List detected actions in chronological order`;
}

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

  // Map to legacy format for backwards compatibility
  return mapToLegacyFormat(parsed);
}

// Two-pass video analysis for efficiency
export async function analyzeVideoTwoPass(
  videoId: string,
  keyframes: Array<{ timestamp: number; dataUrl: string }>,
  params: any,
  config: any
): Promise<any> {
  // Pass 1: Sparse outline (6-10 frames)
  const sparseFrames = keyframes.filter((_, i) => i % Math.ceil(keyframes.length / 8) === 0);

  const pass1Messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        { type: "text", text: createVideoUserMessage(params, sparseFrames.length) },
        ...sparseFrames.map(f => ({
          type: "image_url" as const,
          image_url: { url: f.dataUrl, detail: "low" as const }
        }))
      ]
    }
  ];

  const pass1Result = await callVisionAPI(
    pass1Messages,
    VIDEO_ANALYSIS_SCHEMA,
    { ...config, maxTokens: 800, temperature: 0.1 }
  );

  // Pass 2: Targeted drilling (conditional)
  // Only if uncertainty is high or specific segments need detail
  const needsDetail = pass1Result.uncertainty_notes?.length > 3 ||
                     params.detail === 'comprehensive';

  if (needsDetail && pass1Result.scene_segments?.length > 0) {
    // Extract additional frames from uncertain segments
    const uncertainSegments = pass1Result.scene_segments.slice(0, 2);
    const detailFrames = keyframes.filter(f =>
      uncertainSegments.some(s =>
        f.timestamp >= s.start_time && f.timestamp <= s.end_time
      )
    );

    if (detailFrames.length > 0) {
      const pass2Messages = [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Provide additional detail for these specific segments:\n${
                uncertainSegments.map(s => `${s.start_time}-${s.end_time}s: ${s.summary}`).join('\n')
              }\nFocus on resolving uncertainties and adding specific details.`
            },
            ...detailFrames.map(f => ({
              type: "image_url" as const,
              image_url: { url: f.dataUrl, detail: "high" as const }
            }))
          ]
        }
      ];

      const pass2Result = await callVisionAPI(
        pass2Messages,
        VIDEO_ANALYSIS_SCHEMA,
        { ...config, maxTokens: 1200, temperature: 0.1 }
      );

      // Merge results
      return {
        ...pass1Result,
        scene_segments: [...pass1Result.scene_segments, ...pass2Result.scene_segments],
        uncertainty_notes: pass2Result.uncertainty_notes,
        metadata: {
          ...pass1Result.metadata,
          processing_notes: [
            ...pass1Result.metadata.processing_notes,
            'Two-pass analysis completed for enhanced detail'
          ]
        }
      };
    }
  }

  return pass1Result;
}