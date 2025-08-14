import { useMemo, useState } from "react";
import { describeImagesByIds, generateVideo } from "../lib/api";
import { useToast } from "../contexts/ToastContext";

export default function SoraCreator({
  selectedIds = [] as string[],
  selectedUrls = [] as string[],
  onRemoveImage
}: { 
  selectedIds?: string[]; 
  selectedUrls?: string[];
  onRemoveImage?: (id: string) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [seconds, setSeconds] = useState(10);
  const [aspectLocked, setAspectLocked] = useState(true);
  const [aspectRatio, setAspectRatio] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [videoUrl, setVideoUrl] = useState<string|null>(null);
  const [analysis, setAnalysis] = useState<string>("");
  const [progress, setProgress] = useState(0);
  const { showToast } = useToast();

  const finalPrompt = useMemo(() => {
    const base = prompt;
    const refs = selectedUrls.length ? `\n\n[Reference images]\n${selectedUrls.join("\n")}` : "";
    return `${base}${refs}`;
  }, [prompt, selectedUrls]);

  async function analyze() {
    if (!selectedIds.length) return;
    setBusy(true); setError(null); setProgress(0);
    try {
      const { description } = await describeImagesByIds(selectedIds, "high");
      setAnalysis(description);
      showToast("Images analyzed successfully!", "success");
    } catch (e:any) {
      const errorMsg = e.message || "Analyze failed";
      setError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function generate() {
    setBusy(true); setError(null); setVideoUrl(null); setProgress(0);

    // Simulate progress for long operations
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 1000);

    try {
      const data = await generateVideo(finalPrompt, width, height, seconds, selectedUrls);
      setVideoUrl(`data:video/mp4;base64,${data.video_base64}`);
      setProgress(100);
      showToast("Video generated successfully!", "success");
    } catch (e:any) {
      const errorMsg = e.message || "Failed";
      setError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      clearInterval(progressInterval);
      setBusy(false);
      setTimeout(() => setProgress(0), 500);
    }
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Create Video (Sora on Azure)</h2>

      <div className="flex gap-2">
        <button
          className={`btn ${busy ? 'pulse' : ''}`}
          disabled={!selectedIds.length || busy}
          onClick={analyze}
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Analyzing…
            </span>
          ) : `Analyze ${selectedIds.length || ""} image${selectedIds.length>1?"s":""} (GPT-4.1)`}
        </button>
        <button className="btn" onClick={() => setPrompt(p => p + (p ? "\n\n" : "") + (analysis || "").replace(/^Suggested prompt:\s*/i, ""))} disabled={!analysis}>
          Insert analysis into prompt
        </button>
      </div>

      {!!analysis && (
        <pre className="rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-xs whitespace-pre-wrap fade-in">
{analysis}
        </pre>
      )}

      <textarea
        className="input h-28 resize-none"
        placeholder="Describe your video…"
        value={prompt}
        onChange={e=>setPrompt(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy && prompt.trim()) {
            e.preventDefault();
            generate();
          }
        }}
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
        <div className="flex gap-2">
          <button
            type="button"
            className="btn text-xs"
            onClick={() => { setWidth(1080); setHeight(1080); setAspectRatio(1); }}
          >Square 1080×1080</button>
          <button
            type="button"
            className="btn text-xs"
            onClick={() => { setWidth(1080); setHeight(1920); setAspectRatio(9/16); }}
          >Portrait 1080×1920</button>
          <button
            type="button"
            className="btn text-xs"
            onClick={() => { setWidth(1920); setHeight(1080); setAspectRatio(16/9); }}
          >Landscape 1920×1080</button>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm">Width
            <input 
              className="input mt-1" 
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
          <label className="text-sm">Height
            <div className="flex items-center gap-2 mt-1">
              <input 
                className="input flex-1" 
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
                className={`p-2 rounded border ${aspectLocked ? 'bg-blue-500 border-blue-500 text-white' : 'border-neutral-700 text-neutral-400 hover:text-white'} transition-colors`}
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
          <label className="text-sm">Duration (s)
            <input className="input mt-1" type="number" min={1} max={20} value={seconds} onChange={e=>setSeconds(+e.target.value||10)} />
            <span className="text-xs text-neutral-500">Max 20s, up to 1920×1920</span>
          </label>
        </div>
      </div>

      <button
        className={`btn ${busy ? 'pulse' : ''}`}
        disabled={busy || !prompt.trim()}
        onClick={generate}
      >
        {busy ? (
          <span className="flex items-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating…
          </span>
        ) : "Generate"}
      </button>

      {busy && progress > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Generating video...</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden">
            <div
              className="progress-bar h-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
      {error && <div className="text-red-400 text-sm fade-in">{error}</div>}
      {busy && !videoUrl && (
        <div className="space-y-2">
          <div className="skeleton rounded-xl aspect-square w-full" />
          <div className="skeleton h-10 w-32 rounded-2xl" />
        </div>
      )}

      {videoUrl && (
        <div className="space-y-2 fade-in">
          <video
            className="w-full rounded-xl border border-neutral-800 image-hover"
            src={videoUrl}
            controls
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
