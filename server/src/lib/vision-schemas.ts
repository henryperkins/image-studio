// Strict JSON schemas for Azure OpenAI vision analysis
import { StructuredDescriptionSchema, VideoAnalysisSchema } from "@image-studio/shared";

export const IMAGE_ANALYSIS_SCHEMA = {
  type: "object",
  required: [
    "language",
    "title",
    "short_caption",
    "long_description",
    "tags",
    "safety_tags",
    "content_warnings",
    "content",
    "generation_guidance",
    "safety_flags",
    "uncertainty_notes"
  ],
  properties: {
    language: {
      type: "string",
      pattern: "^[a-z]{2}$",
      description: "ISO 639-1 language code"
    },
    title: {
      type: "string",
      maxLength: 80,
      description: "Brief title for the image"
    },
    short_caption: {
      type: "string",
      maxLength: 125,
      description: "WCAG-compliant alt text for screen readers"
    },
    long_description: {
      type: "string",
      description: "Detailed description with context and spatial layout"
    },
    tags: {
      type: "array",
      items: { type: "string" },
      description: "Content tags for categorization"
    },
    safety_tags: {
      type: "array",
      items: { type: "string" },
      description: "Safety-related tags"
    },
    content_warnings: {
      type: "array",
      items: { type: "string" },
      description: "Content warnings if applicable"
    },
    content: {
      type: "object",
      required: ["primary_subjects", "scene_description", "visual_elements", "text_content", "spatial_layout"],
      properties: {
        primary_subjects: {
          type: "array",
          items: { type: "string" },
          description: "Main subjects in the image"
        },
        scene_description: {
          type: "string",
          description: "Overall scene description"
        },
        visual_elements: {
          type: "object",
          required: ["composition", "lighting", "colors", "style", "mood"],
          properties: {
            composition: { type: "string" },
            lighting: { type: "string" },
            colors: {
              type: "array",
              items: { type: "string" }
            },
            style: { type: "string" },
            mood: { type: "string" }
          }
        },
        text_content: {
          type: "array",
          items: { type: "string" },
          description: "Any visible text in the image"
        },
        spatial_layout: {
          type: "string",
          description: "Spatial relationships and layout"
        }
      }
    },
    generation_guidance: {
      type: "object",
      required: ["suggested_prompt", "style_keywords", "technical_parameters"],
      properties: {
        suggested_prompt: {
          type: "string",
          description: "Suggested prompt for image/video generation"
        },
        style_keywords: {
          type: "array",
          items: { type: "string" }
        },
        technical_parameters: {
          type: "object",
          required: ["aspect_ratio", "recommended_model", "complexity_score"],
          properties: {
            aspect_ratio: { type: "string" },
            recommended_model: { type: "string" },
            complexity_score: {
              type: "number",
              minimum: 1,
              maximum: 10
            }
          }
        }
      }
    },
    safety_flags: {
      type: "object",
      required: ["violence", "adult_content", "pii_detected", "medical_content", "weapons", "substances"],
      properties: {
        violence: { type: "boolean" },
        adult_content: { type: "boolean" },
        pii_detected: { type: "boolean" },
        medical_content: { type: "boolean" },
        weapons: { type: "boolean" },
        substances: { type: "boolean" }
      }
    },
    uncertainty_notes: {
      type: "array",
      items: { type: "string" },
      description: "Elements that couldn't be determined with confidence"
    }
  }
};

export const VIDEO_ANALYSIS_SCHEMA = {
  ...IMAGE_ANALYSIS_SCHEMA,
  properties: {
    ...IMAGE_ANALYSIS_SCHEMA.properties,
    duration_seconds: {
      type: "number",
      description: "Total video duration in seconds"
    },
    keyframes: {
      type: "array",
      items: {
        type: "object",
        required: ["timestamp", "summary"],
        properties: {
          timestamp: { type: "number" },
          summary: { type: "string" }
        }
      }
    },
    scene_segments: {
      type: "array",
      items: {
        type: "object",
        required: ["start_time", "end_time", "summary"],
        properties: {
          start_time: { type: "number" },
          end_time: { type: "number" },
          summary: { type: "string" }
        }
      }
    },
    actions: {
      type: "array",
      items: { type: "string" },
      description: "Detected actions or events in the video"
    }
  }
};

// Backwards compatibility mapper
export function mapToLegacyFormat(result: any): any {
  return {
    metadata: {
      language: result.language,
      confidence: result.uncertainty_notes?.length > 2 ? "low" :
                  result.uncertainty_notes?.length > 0 ? "medium" : "high",
      content_type: "other",
      sensitive_content: result.content_warnings?.length > 0,
      processing_notes: [...(result.content_warnings || []), ...(result.uncertainty_notes || [])]
    },
    accessibility: {
      alt_text: result.short_caption,
      long_description: result.long_description,
      reading_level: 8,
      color_accessibility: {
        relies_on_color: false,
        color_blind_safe: true
      }
    },
    content: result.content,
    generation_guidance: result.generation_guidance,
    safety_flags: result.safety_flags,
    uncertainty_notes: result.uncertainty_notes
  };
}