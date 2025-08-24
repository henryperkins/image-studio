import { useMemo, useState, useRef, useEffect } from "react";
import { analyzeImages, generateVideoWithProgress, generateSoraPrompt } from "../lib/api";
import { processApiError } from "../lib/errorUtils";
import { useToast } from "../contexts/ToastContext";
import EnhancedVisionAnalysis from "./EnhancedVisionAnalysis";
import { PromptTextarea } from "../components/PromptTextarea";
import { LoadingButton } from "../components/LoadingButton";
import { SkeletonLoader, MediaSkeleton } from "../components/SkeletonLoader";

export default function SoraCreator({
  selectedIds = [] as string[],
  selectedUrls = [] as string[],
  onRemoveImage,
  prompt,
  setPrompt,
  promptInputRef
}: {
  selectedIds?: string[];
  selectedUrls?: string[];
  onRemoveImage?: (id: string) => void;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [seconds, setSeconds] = useState(10);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string|null>(null);
  const [analysis, setAnalysis] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<"idle"|"submitting"|"generating"|"downloading"|"finalizing">("idle");
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const [showEnhancedAnalysis, setShowEnhancedAnalysis] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoDataRef = useRef<string|null>(null);
  const { showToast } = useToast();

  const finalPrompt = useMemo(() => {
    const base = prompt;
    const refs = selectedUrls.length ? `\n\n[Reference images]\n${selectedUrls.join("\n")}` : "";
    return `${base}${refs}`;
  }, [prompt, selectedUrls]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (videoDataRef.current) {
        URL.revokeObjectURL(videoDataRef.current);
      }
    };
  }, []);

  async function analyze() {
    if (!selectedIds.length) return;
    setAnalyzingImages(true); setError(null);
    try {
      // Use enhanced analysis but with standard parameters for basic mode
      const result = await analyzeImages(selectedIds, {
        purpose: 'Sora video prompt creation',
        detail: 'standard',
        tone: 'casual',
        audience: 'general'
      });
      
      const description = `${result.content.scene_description}\n\nSuggested prompt: ${result.generation_guidance.suggested_prompt}`;
      setAnalysis(description);
      showToast("Images analyzed successfully!", "success");
    } catch (e:any) {
      const errorMsg = e.message || "Analyze failed";
      setError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setAnalyzingImages(false);
    }
  }

  // Enhanced Sora prompt generation (now uses GPT-5 automatically when available)
  async function generateEnhancedPrompt() {
    if (!selectedIds.length) return;
    setAnalyzingImages(true); setError(null);
    try {
      const soraPrompt = await generateSoraPrompt(selectedIds, {
        detail: 'detailed',
        tone: 'creative',
        audience: 'technical'
      });
      setPrompt(prev => prev + (prev ? '\n\n' : '') + soraPrompt);
      showToast("Advanced Sora prompt generated with GPT-5!", "success");
    } catch (e: any) {
      const errorMsg = e.message || "Enhanced analysis failed";
      setError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setAnalyzingImages(false);
    }
  }

  const handleEnhancedPromptGenerated = (generatedPrompt: string) => {
    setPrompt(prev => prev + (prev ? '\n\n' : '') + generatedPrompt);
    showToast("Prompt added from enhanced analysis!", "success");
  };

  async function generate(isRetry = false) {
    setBusy(true); setError(null);
    setProgress(1);
    setStage("submitting");
    
    // Clean up previous video URL to prevent memory leaks
    if (videoDataRef.current) {
      URL.revokeObjectURL(videoDataRef.current);
      videoDataRef.current = null;
    }
    setVideoUrl(null);

    // Smooth simulated progress up to ~85% while Azure job runs
    // Eases as it approaches the cap so it feels natural.
    setTimeout(() => setStage("generating"), 250);
    const simInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) return prev;
        const remaining = 85 - prev;
        const step = Math.max(0.5, remaining * 0.06); // ease toward 85
        return Math.min(85, +(prev + step).toFixed(1));
      });
      return;
    }, 350);

    try {
      const { data } = await generateVideoWithProgress(finalPrompt, width, height, seconds, selectedUrls, (loaded, total) => {
        setStage("downloading");
        if (total > 0) {
          const pct = 85 + Math.min(14, Math.floor((loaded / total) * 14));
          setProgress(Math.min(99, pct));
        } else {
          // Unknown size: nudge toward 99% slowly
          setProgress(prev => Math.min(99, prev + 0.5));
        }
      });

      // Create a blob from the base64 data to avoid issues with large data URLs
      const byteCharacters = atob(data.video_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      
      setStage("finalizing");
      videoDataRef.current = blobUrl;
      setVideoUrl(blobUrl);
      setProgress(100);
      setRetryCount(0);
      showToast("Video generated successfully!", "success");
    } catch (e:any) {
      const { detailedMessage } = processApiError(e);
      setError(detailedMessage);
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      showToast(detailedMessage, "error");
    } finally {
      clearInterval(simInterval);
      setStage("idle");
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  const retry = async () => {
    if (retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      await generate(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Create Video (Sora on Azure)</h2>
        <button
          className="btn btn-sm text-xs"
          onClick={() => setShowEnhancedAnalysis(!showEnhancedAnalysis)}
        >
          {showEnhancedAnalysis ? 'Simple Analysis' : 'Enhanced Analysis'}
        </button>
      </div>

      {/* Enhanced Vision Analysis */}
      {showEnhancedAnalysis && selectedIds.length > 0 && (
        <div className="border border-neutral-700 rounded-lg p-4">
          <EnhancedVisionAnalysis
            selectedIds={selectedIds}
            onPromptGenerated={handleEnhancedPromptGenerated}
            mode="sora"
          />
        </div>
      )}

      {/* Simplified Analysis Controls */}
      {!showEnhancedAnalysis && selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <LoadingButton
            variant="secondary"
            loading={analyzingImages}
            loadingText="Generating advanced prompt…"
            disabled={!selectedIds.length || busy}
            onClick={generateEnhancedPrompt}
            className="flex-1"
          >
            Generate Sora Prompt (GPT-5) for {selectedIds.length} image{selectedIds.length > 1 ? "s" : ""}
          </LoadingButton>
          <LoadingButton
            variant="secondary"
            loading={analyzingImages}
            loadingText="Analyzing…"
            disabled={!selectedIds.length || busy}
            onClick={analyze}
          >
            Basic Analysis
          </LoadingButton>
          {analysis && (
            <button
              className="btn min-h-[48px] sm:min-h-0"
              onClick={() => {
                const promptToInsert = analysis.replace(/^Suggested.*?prompt:\s*/im, "");
                setPrompt(p => p + (p ? "\n\n" : "") + promptToInsert);
                showToast("Analysis inserted into prompt", "success");
              }}
              disabled={analyzingImages}
            >
              Insert Analysis
            </button>
          )}
        </div>
      )}

      {analyzingImages && !analysis && (
        <div className="rounded-xl bg-neutral-950 border border-neutral-800 p-3">
          <SkeletonLoader type="text" lines={4} />
        </div>
      )}

      {!!analysis && !analyzingImages && (
        <pre className="rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-xs whitespace-pre-wrap fade-in">
{analysis}
        </pre>
      )}

      <PromptTextarea
        ref={promptInputRef}
        id="video-prompt"
        value={prompt}
        onChange={setPrompt}
        onSubmit={generate}
        placeholder="Describe your video…"
        maxLength={2000}
        disabled={busy}
        busy={busy}
        error={error}
        ariaLabel="Video description prompt"
        className="h-28"
      />

      {selectedUrls.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-neutral-300">
            Using {selectedUrls.length} reference image{selectedUrls.length>1?"s":""}.
          </div>
          <div className="flex gap-2 flex-wrap">
            {selectedUrls.map((url, index) => (
              <div key={index} className="relative group">
                <img
                  src={url}
                  alt={`Reference ${index + 1}`}
                  className="w-12 h-12 rounded border border-neutral-700 object-cover"
                />
                <button
                  className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center hover:bg-red-600"
                  onClick={() => {
                    const idToRemove = selectedIds[index];
                    if (idToRemove && onRemoveImage) {
                      onRemoveImage(idToRemove);
                    }
                  }}
                  aria-label={`Remove reference image ${index + 1}`}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            className="btn text-xs min-h-[48px] sm:min-h-0"
            onClick={() => { setWidth(1080); setHeight(1080); setAspectRatio(1); }}
          >Square 1080×1080</button>
          <button
            type="button"
            className="btn text-xs min-h-[48px] sm:min-h-0"
            onClick={() => { setWidth(1080); setHeight(1920); setAspectRatio(9/16); }}
          >Portrait 1080×1920</button>
          <button
            type="button"
            className="btn text-xs min-h-[48px] sm:min-h-0"
            onClick={() => { setWidth(1920); setHeight(1080); setAspectRatio(16/9); }}
          >Landscape 1920×1080</button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <label className="text-sm min-w-0">Width
            <input 
              className="input mt-1 w-full" 
              type="number" 
              min={256} 
              max={1920} 
              value={width} 
              onChange={e => {
                const newWidth = +e.target.value || 1080;
                setWidth(newWidth);
                if (aspectLocked && newWidth > 0) {
                  setHeight(Math.round(newWidth / aspectRatio));
                }
              }} 
            />
          </label>
          <label className="text-sm min-w-0">Height
            <div className="flex items-center gap-2 mt-1">
              <input 
                className="input flex-1 min-w-0" 
                type="number" 
                min={256} 
                max={1920} 
                value={height} 
                onChange={e => {
                  const newHeight = +e.target.value || 1080;
                  setHeight(newHeight);
                  if (aspectLocked && newHeight > 0) {
                    setWidth(Math.round(newHeight * aspectRatio));
                  }
                }} 
              />
              <button
                type="button"
                className={`flex-shrink-0 p-2 rounded border min-h-[48px] sm:min-h-0 ${aspectLocked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-700 text-neutral-400 hover:text-white'} transition-colors`}
                onClick={() => {
                  setAspectLocked(!aspectLocked);
                  if (!aspectLocked && width > 0 && height > 0) {
                    setAspectRatio(width / height);
                  }
                }}
                aria-label={aspectLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                title={aspectLocked ? "Aspect ratio locked" : "Aspect ratio unlocked"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {aspectLocked ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                  )}
                </svg>
              </button>
            </div>
          </label>
          <label className="text-sm min-w-0 sm:col-span-2 lg:col-span-1">Duration (s)
            <input className="input mt-1 w-full" type="number" min={1} max={20} value={seconds} onChange={e=>setSeconds(+e.target.value||10)} />
            <span className="text-xs text-neutral-500 block mt-1">Max 20s, up to 1920×1920</span>
          </label>
        </div>
      </div>

      <LoadingButton
        variant="primary"
        loading={busy}
        loadingText="Generating…"
        disabled={!prompt.trim()}
        onClick={() => generate()}
        aria-describedby={!prompt.trim() ? "video-prompt-required" : undefined}
      >
        Generate
      </LoadingButton>
      {!prompt.trim() && (
        <span id="video-prompt-required" className="sr-only">Enter a prompt to generate a video</span>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>
              {stage === "submitting" && "Submitting job…"}
              {stage === "generating" && "Generating on Azure…"}
              {stage === "downloading" && "Downloading result…"}
              {stage === "finalizing" && "Finalizing…"}
              {stage === "idle" && "Working…"}
            </span>
            {progress > 0 ? <span>{Math.round(progress)}%</span> : null}
          </div>
          {progress > 0 ? (
            <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden">
              <div
                className="progress-bar h-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          ) : (
            <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden relative">
              <div className="progress-bar progress-bar-indeterminate h-full" />
            </div>
          )}
        </div>
      )}
      {error && (
        <div className="text-red-400 text-sm fade-in space-y-2">
          <div>{error}</div>
          {retryCount < 3 && (
            <button
              className="btn btn-sm text-xs"
              onClick={retry}
              disabled={busy}
            >
              Retry {retryCount > 0 && `(${retryCount}/3)`}
            </button>
          )}
        </div>
      )}
      {busy && !videoUrl && (
        <MediaSkeleton mediaType="video" size="1080x1080" />
      )}

      {videoUrl && (
        <div className="space-y-2 fade-in">
          <video
            key={videoUrl}
            ref={videoRef}
            className="w-full h-auto max-h-[80vh] rounded-xl border border-neutral-800 image-hover object-contain"
            src={videoUrl}
            controls
            preload="metadata"
            onError={(e) => {
              console.error("Video playback error:", e);
              setError("Video playback failed. The file may be corrupted.");
            }}
          />
          <a
            className="btn inline-block"
            href={videoUrl}
            download={`sora_${Date.now()}.mp4`}
            onClick={() => showToast("Video downloaded!", "success")}
          >
            Download MP4
          </a>
        </div>
      )}
    </div>
  );
}
