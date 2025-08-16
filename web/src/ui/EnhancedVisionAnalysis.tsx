import { useState, useEffect, useCallback } from "react";
import {
  analyzeImages,
  generateSoraPrompt,
  analyzeImagesForAccessibility,
  analyzeImageSafety,
  type VisionAnalysisParams,
  type StructuredVisionResult,
  type AccessibilityAnalysisResult
} from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import { usePromptSuggestions } from "../contexts/PromptSuggestionsContext";

interface EnhancedVisionAnalysisProps {
  selectedIds: string[];
  // onPromptGenerated is intentionally unused now; suggestions are routed to the sidebar store
  onPromptGenerated?: (prompt: string) => void;
  mode?: "sora" | "accessibility" | "general" | "safety";
}

export default function EnhancedVisionAnalysis({
  selectedIds,
  onPromptGenerated, // eslint-disable-line @typescript-eslint/no-unused-vars
  mode = "sora",
}: EnhancedVisionAnalysisProps) {
  // Analysis state
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<StructuredVisionResult | null>(null);
  const [accessibilityResult, setAccessibilityResult] = useState<AccessibilityAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Analysis parameters
  const [params, setParams] = useState<VisionAnalysisParams>({
    purpose: mode === "sora" ? "Sora video prompt creation" : "general description",
    audience: "general",
    language: "en",
    detail: "standard",
    tone: mode === "sora" ? "creative" : "casual",
    focus: mode === "sora" ? ["motion_potential", "cinematic_elements", "scene_continuity"] : undefined,
    enable_moderation: true,
    force_refresh: false,
  });

  // UI state
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    basic: true,
    advanced: false,
    accessibility: false,
    safety: false,
  });

  // Only structured/accessibility displays remain (prompt UI moved to sidebar)
  const [displayMode, setDisplayMode] = useState<"structured" | "accessibility">("structured");

  const { showToast } = useToast();
  const { addSuggestion } = usePromptSuggestions();

  // Supported languages for analysis
  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ja", name: "Japanese" },
    { code: "ko", name: "Korean" },
    { code: "zh", name: "Chinese" },
  ];

  // Focus areas based on mode
  const focusAreas = {
    sora: ["motion_potential", "cinematic_elements", "scene_continuity", "lighting_transitions", "subject_movements"],
    accessibility: ["spatial_relationships", "text_content", "color_information", "essential_details"],
    general: ["composition", "subjects", "colors", "lighting", "mood", "style"],
    safety: ["content_safety", "age_appropriateness", "sensitive_content"],
  };

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const runAnalysis = useCallback(async () => {
    if (!selectedIds.length) {
      setError("No images selected for analysis");
      return;
    }

    setAnalyzing(true);
    setError(null);
    setWarnings([]);

    try {
      let analysisResult: StructuredVisionResult;

      if (mode === "accessibility") {
        // Run both structured and accessibility analysis
        const [structuredResult, accessibilityData] = await Promise.all([
          analyzeImages(selectedIds, params),
          analyzeImagesForAccessibility(selectedIds, {
            screen_reader_optimized: true,
            include_color_info: true,
            reading_level: 8,
          }),
        ]);

        analysisResult = structuredResult;
        setAccessibilityResult(accessibilityData);
      } else {
        analysisResult = await analyzeImages(selectedIds, params);
      }

      setResult(analysisResult);

      // Content warnings
      if (analysisResult.metadata.sensitive_content) {
        setWarnings(["Content may contain sensitive material"]);
      }

      // Extract processing notes as warnings
      const processingWarnings = analysisResult.metadata.processing_notes.filter(
        (note) => note.includes("warning") || note.includes("advisory") || note.includes("redacted")
      );
      if (processingWarnings.length > 0) {
        setWarnings((prev) => [...prev, ...processingWarnings]);
      }

      // Commit suggested prompt to sidebar store (no partials)
      const suggested = analysisResult.generation_guidance?.suggested_prompt?.trim();
      if (suggested) {
        await addSuggestion({
          text: suggested,
          sourceModel: "gpt-4.1",
          origin: "vision-analysis",
          sessionId: selectedIds.join(","),
          tags: analysisResult.generation_guidance?.style_keywords || [],
        });
      }

      showToast(`Analysis completed with ${analysisResult.metadata.confidence} confidence`, "success");
    } catch (err: any) {
      const errorMessage = err.message || "Analysis failed";
      setError(errorMessage);
      showToast(errorMessage, "error");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedIds, params, mode, addSuggestion, showToast]);

  // Quick action functions
  const quickSoraAnalysis = async () => {
    try {
      const soraPrompt = await generateSoraPrompt(selectedIds, {
        detail: "detailed",
        tone: "creative",
      });
      await addSuggestion({
        text: soraPrompt,
        sourceModel: "gpt-4.1",
        origin: "vision-analysis",
        sessionId: selectedIds.join(","),
        tags: [],
      });
      showToast("Sora prompt suggestion added to sidebar", "success");
    } catch (err: any) {
      setError(err.message || "Failed to generate Sora prompt");
      showToast(err.message || "Failed to generate Sora prompt", "error");
    }
  };

  const quickAccessibilityCheck = async () => {
    try {
      const accessibilityData = await analyzeImagesForAccessibility(selectedIds);
      setAccessibilityResult(accessibilityData);
      setDisplayMode("accessibility");
      showToast("Accessibility analysis completed", "success");
    } catch (err: any) {
      setError(err.message);
      showToast(err.message, "error");
    }
  };

  const quickSafetyCheck = async () => {
    try {
      const safetyData = await analyzeImageSafety(selectedIds);
      setWarnings(safetyData.warnings);

      if (!safetyData.safe) {
        setError("Content safety concerns detected");
        showToast("Content flagged by safety filters", "warning" as any);
      } else {
        showToast("Content passed safety checks", "success");
      }
    } catch (err: any) {
      setError(err.message);
      showToast(err.message, "error");
    }
  };

  // Clear results when selection changes
  useEffect(() => {
    setResult(null);
    setAccessibilityResult(null);
    setError(null);
    setWarnings([]);
  }, [selectedIds]);

  if (!selectedIds.length) {
    return (
      <div className="text-center text-neutral-400 py-8">
        <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p>Select images to analyze with enhanced vision AI</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">Enhanced Vision Analysis</h3>
        <div className="flex gap-2">
          <button className="btn btn-sm text-xs" onClick={quickSoraAnalysis} disabled={analyzing}>
            Quick Sora Prompt
          </button>
          <button className="btn btn-sm text-xs" onClick={quickAccessibilityCheck} disabled={analyzing}>
            Accessibility Check
          </button>
          <button className="btn btn-sm text-xs" onClick={quickSafetyCheck} disabled={analyzing}>
            Safety Check
          </button>
        </div>
      </div>

      {/* Basic Controls */}
      <div className="border border-neutral-700 rounded-lg">
        <button
          className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 rounded-t-lg"
          onClick={() => toggleSection("basic")}
          aria-expanded={expandedSections.basic}
          aria-controls="basic-settings-panel"
        >
          <span className="font-medium">Basic Settings</span>
          <svg
            className={`w-4 h-4 transform transition-transform ${expandedSections.basic ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.basic && (
          <div id="basic-settings-panel" className="p-3 border-t border-neutral-700 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Purpose</label>
                <select
                  className="input"
                  value={params.purpose}
                  onChange={(e) => setParams((prev) => ({ ...prev, purpose: e.target.value }))}
                >
                  <option value="Sora video prompt creation">Sora Video Prompts</option>
                  <option value="general description">General Description</option>
                  <option value="accessibility compliance">Accessibility</option>
                  <option value="content safety analysis">Safety Analysis</option>
                  <option value="e-commerce product description">Product Description</option>
                  <option value="social media content">Social Media</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Audience</label>
                <select
                  className="input"
                  value={params.audience}
                  onChange={(e) => setParams((prev) => ({ ...prev, audience: e.target.value as any }))}
                >
                  <option value="general">General Public</option>
                  <option value="technical">Technical Users</option>
                  <option value="child">Children</option>
                  <option value="academic">Academic/Research</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Detail Level</label>
                <select
                  className="input"
                  value={params.detail}
                  onChange={(e) => setParams((prev) => ({ ...prev, detail: e.target.value as any }))}
                >
                  <option value="brief">Brief</option>
                  <option value="standard">Standard</option>
                  <option value="detailed">Detailed</option>
                  <option value="comprehensive">Comprehensive</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2">Tone</label>
                <select
                  className="input"
                  value={params.tone}
                  onChange={(e) => setParams((prev) => ({ ...prev, tone: e.target.value as any }))}
                >
                  <option value="casual">Casual</option>
                  <option value="formal">Formal</option>
                  <option value="technical">Technical</option>
                  <option value="creative">Creative</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Language</label>
                <select
                  className="input"
                  value={params.language}
                  onChange={(e) => setParams((prev) => ({ ...prev, language: e.target.value }))}
                >
                  {languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Advanced Controls */}
      <div className="border border-neutral-700 rounded-lg">
        <button
          className="w-full flex items-center justify-between p-3 hover:bg-neutral-800/50 rounded-t-lg"
          onClick={() => toggleSection("advanced")}
          aria-expanded={expandedSections.advanced}
          aria-controls="advanced-settings-panel"
        >
          <span className="font-medium">Advanced Options</span>
          <svg
            className={`w-4 h-4 transform transition-transform ${expandedSections.advanced ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {expandedSections.advanced && (
          <div id="advanced-settings-panel" className="p-3 border-t border-neutral-700 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Focus Areas</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {focusAreas[mode as keyof typeof focusAreas].map((area) => (
                  <label key={area} className="flex items-center space-x-2 text-sm">
                    <input
                      type="checkbox"
                      checked={params.focus?.includes(area) || false}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setParams((prev) => ({
                            ...prev,
                            focus: [...(prev.focus || []), area],
                          }));
                        } else {
                          setParams((prev) => ({
                            ...prev,
                            focus: prev.focus?.filter((f) => f !== area),
                          }));
                        }
                      }}
                      className="rounded border-neutral-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="capitalize">{area.replace(/_/g, " ")}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Specific Questions</label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Ask specific questions about the images..."
                value={params.specific_questions || ""}
                onChange={(e) =>
                  setParams((prev) => ({
                    ...prev,
                    specific_questions: e.target.value || undefined,
                  }))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={params.enable_moderation}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        enable_moderation: e.target.checked,
                      }))
                    }
                    className="rounded border-neutral-600 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm">Enable content moderation</span>
                </label>

                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={params.force_refresh}
                    onChange={(e) =>
                      setParams((prev) => ({
                        ...prev,
                        force_refresh: e.target.checked,
                      }))
                    }
                    className="rounded border-neutral-600 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="text-sm">Force refresh (skip cache)</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Analysis Actions */}
      <div className="flex flex-wrap gap-2">
        <button className={`btn flex-1 min-w-[200px] ${analyzing ? "pulse" : ""}`} onClick={runAnalysis} disabled={analyzing}>
          {analyzing ? (
            <span className="flex items-center gap-2" role="status" aria-live="polite">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing {selectedIds.length} image{selectedIds.length > 1 ? "s" : ""}...
            </span>
          ) : (
            `Analyze ${selectedIds.length} image${selectedIds.length > 1 ? "s" : ""}`
          )}
        </button>
      </div>

      {/* Analysis Results */}
      {(result || accessibilityResult || error || warnings.length > 0) && (
        <div className="space-y-4" aria-live="polite" aria-atomic="true">
          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-600/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
                <span className="font-medium text-amber-300">Content Advisories</span>
              </div>
              <ul className="text-sm space-y-1">
                {warnings.map((warning, index) => (
                  <li key={index} className="text-amber-200">
                    • {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Errors */}
          {error && (
            <div className="bg-red-900/20 border border-red-600/50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="font-medium text-red-300">Analysis Error</span>
              </div>
              <p className="text-sm text-red-200">{error}</p>
            </div>
          )}

          {/* Results Display */}
          {(result || accessibilityResult) && (
            <div className="border border-neutral-700 rounded-lg">
              {/* Display Mode Tabs */}
              <div className="flex border-b border-neutral-700">
                {result && (
                  <button
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      displayMode === "structured" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                    }`}
                    onClick={() => setDisplayMode("structured")}
                  >
                    Structured Data
                  </button>
                )}
                {accessibilityResult && (
                  <button
                    className={`px-4 py-2 text-sm font-medium transition-colors ${
                      displayMode === "accessibility" ? "bg-blue-600 text-white" : "text-neutral-400 hover:text-white hover:bg-neutral-800"
                    }`}
                    onClick={() => setDisplayMode("accessibility")}
                  >
                    Accessibility
                  </button>
                )}
              </div>

              <div className="p-4">
                {displayMode === "structured" && result && <StructuredResultDisplay result={result} />}
                {displayMode === "accessibility" && accessibilityResult && (
                  <AccessibilityDisplay result={accessibilityResult} />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Sub-components for displaying different result types
function StructuredResultDisplay({ result }: { result: StructuredVisionResult }) {
  return (
    <div className="space-y-4">
      {/* Metadata */}
      <div>
        <h4 className="font-medium mb-2">Analysis Metadata</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3 text-sm space-y-1">
          <div className="flex justify-between">
            <span>Confidence:</span>
            <span
              className={`font-medium ${
                result.metadata.confidence === "high"
                  ? "text-green-400"
                  : result.metadata.confidence === "medium"
                  ? "text-yellow-400"
                  : "text-red-400"
              }`}
            >
              {result.metadata.confidence}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Content Type:</span>
            <span className="font-medium capitalize">{result.metadata.content_type}</span>
          </div>
          <div className="flex justify-between">
            <span>Language:</span>
            <span className="font-medium uppercase">{result.metadata.language}</span>
          </div>
        </div>
      </div>

      {/* Scene Description */}
      <div>
        <h4 className="font-medium mb-2">Scene Description</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3">
          <p className="text-sm">{result.content.scene_description}</p>
        </div>
      </div>

      {/* Primary Subjects */}
      {result.content.primary_subjects.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Primary Subjects</h4>
          <div className="flex flex-wrap gap-2">
            {result.content.primary_subjects.map((subject, index) => (
              <span key={index} className="px-2 py-1 bg-blue-600/20 text-blue-300 text-sm rounded-md">
                {subject}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Visual Elements */}
      <div>
        <h4 className="font-medium mb-2">Visual Elements</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3 space-y-2 text-sm">
          <div>
            <strong>Composition:</strong> {result.content.visual_elements.composition}
          </div>
          <div>
            <strong>Lighting:</strong> {result.content.visual_elements.lighting}
          </div>
          <div>
            <strong>Style:</strong> {result.content.visual_elements.style}
          </div>
          <div>
            <strong>Mood:</strong> {result.content.visual_elements.mood}
          </div>
          {result.content.visual_elements.colors.length > 0 && (
            <div className="flex items-center gap-2">
              <strong>Colors:</strong>
              <div className="flex gap-1">
                {result.content.visual_elements.colors.map((color, index) => (
                  <span key={index} className="px-2 py-1 bg-neutral-700 text-xs rounded-md">
                    {color}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AccessibilityDisplay({ result }: { result: AccessibilityAnalysisResult }) {
  const { showToast } = useToast();

  const copyAltText = () => {
    navigator.clipboard.writeText(result.alt_text);
    showToast("Alt text copied to clipboard", "success");
  };

  return (
    <div className="space-y-4">
      {/* Alt Text */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="font-medium">Alt Text</h4>
          <button className="btn btn-sm text-xs" onClick={copyAltText}>
            Copy Alt Text
          </button>
        </div>
        <div className="bg-neutral-800/50 rounded-lg p-3">
          <p className="text-sm">{result.alt_text}</p>
          <div className="text-xs text-neutral-400 mt-2">{result.alt_text.length}/125 characters</div>
        </div>
      </div>

      {/* Long Description */}
      <div>
        <h4 className="font-medium mb-2">Detailed Description</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3">
          <p className="text-sm">{result.long_description}</p>
        </div>
      </div>

      {/* Accessibility Metrics */}
      <div>
        <h4 className="font-medium mb-2">Accessibility Metrics</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Reading Level:</span>
            <span className="font-medium">Grade {result.reading_level}</span>
          </div>
          <div className="flex justify-between">
            <span>Relies on Color:</span>
            <span
              className={`font-medium ${
                result.color_accessibility.relies_on_color ? "text-yellow-400" : "text-green-400"
              }`}
            >
              {result.color_accessibility.relies_on_color ? "Yes" : "No"}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Color Blind Safe:</span>
            <span
              className={`font-medium ${
                result.color_accessibility.color_blind_safe ? "text-green-400" : "text-red-400"
              }`}
            >
              {result.color_accessibility.color_blind_safe ? "Yes" : "No"}
            </span>
          </div>
        </div>
      </div>

      {/* Text Content */}
      {result.text_content.length > 0 && (
        <div>
          <h4 className="font-medium mb-2">Visible Text</h4>
          <div className="bg-neutral-800/50 rounded-lg p-3">
            <ul className="text-sm space-y-1">
              {result.text_content.map((text, index) => (
                <li key={index}>• {text}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Spatial Layout */}
      <div>
        <h4 className="font-medium mb-2">Spatial Layout</h4>
        <div className="bg-neutral-800/50 rounded-lg p-3">
          <p className="text-sm">{result.spatial_layout}</p>
        </div>
      </div>
    </div>
  );
}