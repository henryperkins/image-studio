// Content moderation pipeline for vision analysis
import { SafetyFlags, VisionAPIError, ErrorCode } from '../types/vision.js';

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

export interface TextModerationResult {
  safe: boolean;
  issues: string[];
  sanitized_text: string;
}

// Pre-analysis content moderation using Azure OpenAI
export async function moderateImages(
  imageDataUrls: string[],
  azureConfig: { endpoint: string; visionDeployment: string; chatApiVersion: string },
  authHeaders: Record<string, string>
): Promise<ModerationResult> {
  const moderationPrompt = `Perform content safety analysis on the provided image(s).

Output JSON format:
{
  "safe": boolean,
  "flags": {
    "violence": boolean,
    "adult_content": boolean,
    "hate_speech": boolean,
    "illegal_activity": boolean,
    "self_harm": boolean,
    "pii_visible": boolean
  },
  "severity": "none|low|medium|high|critical",
  "description": "string (brief explanation if flagged)",
  "recommended_action": "allow|warn|block"
}

Be conservative but fair - flag only genuinely problematic content.`;

  const imageParts = imageDataUrls.map(url => ({
    type: "image_url" as const,
    image_url: { url, detail: "low" as const }
  }));

  const url = `${azureConfig.endpoint}/openai/deployments/${encodeURIComponent(azureConfig.visionDeployment)}/chat/completions?api-version=${azureConfig.chatApiVersion}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: moderationPrompt },
          { role: "user", content: [{ type: "text", text: "Analyze these images for content safety." }, ...imageParts] }
        ],
        max_tokens: 300,
        temperature: 0.0,
        response_format: { type: "json_object" }
      })
    });

    if (!response.ok) {
      throw new VisionAPIError(
        `Moderation API failed: ${response.status}`,
        ErrorCode.NETWORK,
        true
      );
    }

    const data = await response.json();
    const result = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
    
    return {
      safe: result.safe ?? true,
      flags: {
        violence: result.flags?.violence ?? false,
        adult_content: result.flags?.adult_content ?? false,
        hate_speech: result.flags?.hate_speech ?? false,
        illegal_activity: result.flags?.illegal_activity ?? false,
        self_harm: result.flags?.self_harm ?? false,
        pii_visible: result.flags?.pii_visible ?? false
      },
      severity: result.severity ?? 'none',
      description: result.description ?? '',
      recommended_action: result.recommended_action ?? 'allow'
    };
  } catch (error) {
    // Fail open for moderation errors - don't block legitimate content
    console.warn('Content moderation failed, allowing content:', error);
    return {
      safe: true,
      flags: {
        violence: false,
        adult_content: false,
        hate_speech: false,
        illegal_activity: false,
        self_harm: false,
        pii_visible: false
      },
      severity: 'none',
      description: 'Moderation unavailable',
      recommended_action: 'allow'
    };
  }
}

// Post-analysis text moderation for generated descriptions
export async function moderateText(description: any): Promise<TextModerationResult> {
  const issues: string[] = [];
  let sanitized = JSON.stringify(description);

  // Basic PII pattern detection and redaction
  const piiPatterns = [
    // Email addresses
    { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
    // Phone numbers (various formats)
    { pattern: /\b(?:\+?1[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g, replacement: '[PHONE_REDACTED]' },
    // Social Security Numbers
    { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]' },
    // Credit card numbers (basic pattern)
    { pattern: /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, replacement: '[CARD_REDACTED]' },
    // License plates (US format)
    { pattern: /\b[A-Z]{1,3}[-\s]?\d{1,4}[A-Z]?\b/g, replacement: '[PLATE_REDACTED]' },
    // Addresses (basic pattern)
    { pattern: /\b\d+\s+[A-Za-z\s]+(?:Street|St|Avenue|Ave|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Way|Court|Ct)\b/gi, replacement: '[ADDRESS_REDACTED]' }
  ];

  for (const { pattern, replacement } of piiPatterns) {
    if (pattern.test(sanitized)) {
      sanitized = sanitized.replace(pattern, replacement);
      issues.push(`PII detected and redacted: ${pattern.source}`);
    }
  }

  // Check for potentially problematic content in text
  const problematicPatterns = [
    { pattern: /\b(?:kill|murder|suicide|harm)\s+(?:yourself|myself|themselves)\b/gi, issue: 'Self-harm language detected' },
    { pattern: /\b(?:nazi|hitler|holocaust\s+denial)\b/gi, issue: 'Hate speech indicators detected' },
    { pattern: /\b(?:how\s+to\s+make|instructions\s+for)(?:.*?)(?:bomb|explosive|weapon)\b/gi, issue: 'Dangerous instructions detected' }
  ];

  for (const { pattern, issue } of problematicPatterns) {
    if (pattern.test(sanitized)) {
      issues.push(issue);
    }
  }

  let parsedSanitized;
  try {
    parsedSanitized = JSON.parse(sanitized);
  } catch {
    // If JSON parsing fails, return original with warning
    issues.push('JSON structure corrupted during sanitization');
    parsedSanitized = description;
  }

  return {
    safe: issues.length === 0,
    issues,
    sanitized_text: parsedSanitized
  };
}

// Convert moderation result to safety flags for structured output
export function moderationToSafetyFlags(moderation: ModerationResult): SafetyFlags {
  return {
    violence: moderation.flags.violence,
    adult_content: moderation.flags.adult_content,
    pii_detected: moderation.flags.pii_visible,
    medical_content: false, // Will be detected during analysis
    weapons: moderation.flags.illegal_activity, // Approximation
    substances: false // Will be detected during analysis
  };
}

// Handle blocked content with appropriate fallback
export function handleBlockedContent(moderation: ModerationResult): any {
  const safetyFlags = moderationToSafetyFlags(moderation);
  
  return {
    metadata: {
      language: "en",
      confidence: "high",
      content_type: "other",
      sensitive_content: true,
      processing_notes: [`Content blocked: ${moderation.description}`]
    },
    accessibility: {
      alt_text: "Content not available due to safety policies",
      long_description: "This content cannot be described due to safety policy violations.",
      reading_level: 8,
      color_accessibility: {
        relies_on_color: false,
        color_blind_safe: true
      }
    },
    content: {
      primary_subjects: ["blocked_content"],
      scene_description: "Content blocked by safety filters",
      visual_elements: {
        composition: "unavailable",
        lighting: "unavailable", 
        colors: [],
        style: "unavailable",
        mood: "unavailable"
      },
      text_content: [],
      spatial_layout: "unavailable"
    },
    generation_guidance: {
      suggested_prompt: "Cannot provide prompt for blocked content",
      style_keywords: [],
      technical_parameters: {
        aspect_ratio: "unknown",
        recommended_model: "none",
        complexity_score: 0
      }
    },
    safety_flags: safetyFlags,
    uncertainty_notes: ["Content blocked by safety moderation"]
  };
}

// Severity-based warning system
export function generateContentWarning(moderation: ModerationResult): string | null {
  if (moderation.recommended_action === 'allow') {
    return null;
  }

  switch (moderation.severity) {
    case 'low':
      return `⚠️ Content advisory: ${moderation.description}`;
    case 'medium':
      return `⚠️ Content warning: This image contains ${moderation.description}. Viewer discretion advised.`;
    case 'high':
      return `🚨 Strong content warning: This image contains potentially disturbing content (${moderation.description}). Proceed with caution.`;
    case 'critical':
      return `🚨 Critical content warning: This image has been flagged for ${moderation.description} and may violate platform policies.`;
    default:
      return null;
  }
}

// Age-appropriate filtering
export function isContentAppropriateForAge(moderation: ModerationResult, targetAge?: number): boolean {
  if (!targetAge) return moderation.safe;

  if (targetAge < 13) {
    // Very strict for children
    return moderation.safe && moderation.severity === 'none' && !Object.values(moderation.flags).some(flag => flag);
  } else if (targetAge < 18) {
    // Moderate restrictions for teens
    return moderation.safe && !moderation.flags.adult_content && !moderation.flags.violence;
  } else {
    // Adult content - only block clearly harmful content
    return moderation.recommended_action !== 'block';
  }
}