// Comprehensive prompt architecture for vision analysis
import { DescriptionParams, VideoParams } from '../types/vision.js';

// System prompt - stable foundation with safety and accessibility
export const SYSTEM_PROMPT = `You are an AI vision specialist providing accessible, safe, and accurate descriptions of visual content.

ROLE AND OBJECTIVES:
- Generate descriptions that are factual, inclusive, and useful for all users
- Prioritize accessibility for screen readers and assistive technologies
- Support content creators with actionable insights for AI generation

SAFETY REQUIREMENTS:
- Never infer or speculate about protected characteristics (race, gender, age, etc.) unless explicitly visible and relevant
- Use person-first, respectful language
- Avoid medical, legal, or financial assessments
- Redact any visible PII (license plates, addresses, phone numbers)
- Flag potentially sensitive content appropriately

ACCESSIBILITY STANDARDS:
- Follow WCAG 2.1 Level AA guidelines for alternative text
- Provide both concise alt text (under 125 characters) and detailed descriptions
- Use clear, simple language at 8th-grade reading level by default
- Include spatial relationships and visual hierarchy

UNCERTAINTY HANDLING:
- Use calibrated language: "appears to be", "likely", "possibly" when uncertain
- Explicitly state "cannot determine from the image" for unclear elements
- Never fabricate details not visible in the content
- Acknowledge limitations (e.g., "text too small to read")

CONTENT POLICIES:
- Refuse to describe illegal activities in detail
- Warn about potentially disturbing content before describing
- Maintain neutrality on controversial subjects
- Focus on observable facts over interpretations`;

// Developer message - schema definition for structured output
export const DEVELOPER_MESSAGE = `Output must be valid JSON matching this schema:
{
  "metadata": {
    "language": "string (ISO 639-1 code)",
    "confidence": "high|medium|low",
    "content_type": "photograph|illustration|screenshot|diagram|artwork|other",
    "sensitive_content": boolean,
    "processing_notes": ["string"]
  },
  "accessibility": {
    "alt_text": "string (max 125 chars, screen-reader optimized)",
    "long_description": "string (detailed narrative for context)",
    "reading_level": "number (Flesch-Kincaid grade level)",
    "color_accessibility": {
      "relies_on_color": boolean,
      "color_blind_safe": boolean
    }
  },
  "content": {
    "primary_subjects": ["string"],
    "scene_description": "string",
    "visual_elements": {
      "composition": "string",
      "lighting": "string",
      "colors": ["string (dominant colors)"],
      "style": "string",
      "mood": "string"
    },
    "text_content": ["string (any visible text)"],
    "spatial_layout": "string"
  },
  "generation_guidance": {
    "suggested_prompt": "string",
    "style_keywords": ["string"],
    "technical_parameters": {
      "aspect_ratio": "string",
      "recommended_model": "string",
      "complexity_score": "number (1-10)"
    }
  },
  "safety_flags": {
    "violence": boolean,
    "adult_content": boolean,
    "pii_detected": boolean,
    "medical_content": boolean,
    "weapons": boolean,
    "substances": boolean
  },
  "uncertainty_notes": ["string (elements that couldn't be determined)"]
}

CRITICAL REQUIREMENTS:
- Output ONLY valid JSON matching this exact schema
- Include ALL required fields, use empty arrays/false values if needed
- Keep alt_text under 125 characters
- Set reading_level to appropriate grade level (typically 6-12)
- Be specific and factual in all descriptions`;

// User message templates for different scenarios
export function createImageUserMessage(params: DescriptionParams): string {
  const purpose = params.purpose || 'general description';
  const audience = params.audience || 'general public';
  const language = params.language || 'en';
  const detail = params.detail || 'standard';
  const tone = params.tone || 'neutral professional';
  const focus = params.focus?.join(', ') || 'all elements';

  let message = `Analyze the provided image(s) with these parameters:
- Purpose: ${purpose}
- Target audience: ${audience}
- Language: ${language}
- Detail level: ${detail}
- Tone: ${tone}
- Focus areas: ${focus}`;

  if (params.specific_questions) {
    message += `\n\nAddress these specific questions:\n${params.specific_questions}`;
  }

  message += '\n\nProvide comprehensive analysis following the JSON schema.';

  return message;
}

export function createVideoUserMessage(frames: any[], params: VideoParams): string {
  const frameInfo = frames.map((f, i) => `Frame ${i+1} @ ${f.timestamp}s`).join('\n');
  
  return `Analyze this video sequence across ${frames.length} keyframes:
${frameInfo}

Video context:
- Duration: ${params.duration}s
- Resolution: ${params.width}x${params.height}
- Purpose: ${params.purpose || 'video generation reference'}

Provide:
1. Overall scene continuity and transitions
2. Temporal changes and motion patterns
3. Key moments and scene boundaries
4. Narrative arc if applicable
5. Technical quality assessment

Output as structured JSON with additional "video_analysis" section containing:
- scene_segments: array of {start_time, end_time, description}
- motion_analysis: {camera_movement, subject_movement, transitions}
- temporal_coherence: score 1-10
- keyframe_quality: array of quality assessments`;
}

// Specialized prompts for different use cases
export function createAccessibilityFocusedPrompt(params: DescriptionParams): string {
  return `Analyze for accessibility compliance:
- Purpose: ${params.purpose || 'screen reader support'}
- Audience: users with visual impairments
- Language: ${params.language || 'en'}
- Detail: comprehensive but concise
- Tone: clear and helpful
- Focus: spatial relationships, text content, essential visual information

Ensure alt text works without visual context and meets WCAG 2.1 AA standards.`;
}

export function createSoraVideoPrompt(params: DescriptionParams): string {
  return `Analyze for video generation reference:
- Purpose: Sora video prompt creation
- Extract: common style, mood, composition patterns
- Identify: motion potential, scene continuity opportunities
- Focus: cinematic elements, lighting transitions, subject movements

Synthesize into cohesive video generation guidance optimized for Sora model.`;
}

export function createMultiImageAnalysisPrompt(imageCount: number, params: DescriptionParams): string {
  return `Analyze ${imageCount} reference images for consistency:
- Purpose: ${params.purpose || 'multi-image analysis'}
- Compare: styles, subjects, compositions, color palettes
- Identify: common themes, variations, narrative connections
- Focus: ${params.focus?.join(', ') || 'style consistency and narrative flow'}

Provide unified analysis highlighting similarities and meaningful differences.`;
}

// Content moderation prompts for pre-analysis filtering
export function createModerationPrompt(): string {
  return `Perform content safety analysis on the provided image(s).

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
}

// Prompt validation helpers
export function validatePromptParams(params: DescriptionParams): string[] {
  const errors: string[] = [];
  
  if (params.language && !/^[a-z]{2}$/.test(params.language)) {
    errors.push('Language must be ISO 639-1 code (e.g., "en", "es")');
  }
  
  if (params.audience && !['general', 'technical', 'child', 'academic'].includes(params.audience)) {
    errors.push('Invalid audience type');
  }
  
  if (params.detail && !['brief', 'standard', 'detailed', 'comprehensive'].includes(params.detail)) {
    errors.push('Invalid detail level');
  }
  
  if (params.tone && !['formal', 'casual', 'technical', 'creative'].includes(params.tone)) {
    errors.push('Invalid tone');
  }
  
  return errors;
}

// Token optimization helpers
export function optimizePromptForTokens(basePrompt: string, maxTokens: number): string {
  // Rough estimate: 1 token ≈ 4 characters for English
  const estimatedTokens = Math.ceil(basePrompt.length / 4);
  
  if (estimatedTokens <= maxTokens * 0.7) { // Leave room for response
    return basePrompt;
  }
  
  // Progressively shorten prompt while maintaining core functionality
  let optimized = basePrompt;
  
  // Remove examples if present
  optimized = optimized.replace(/EXAMPLES?:[\s\S]*?(?=\n\n[A-Z]|$)/g, '');
  
  // Condense repetitive sections
  optimized = optimized.replace(/\n\n+/g, '\n\n');
  
  // Remove verbose explanations while keeping core requirements
  optimized = optimized.replace(/\([^)]*explanation[^)]*\)/gi, '');
  
  return optimized.trim();
}