import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { generateImage } from "../lib/api";

type Resp = {
  image_base64: string;
  model: string;
  size: string;
  format: "png" | "jpeg";
  library_item: {
    id: string;
    url: string;
    filename: string;
    prompt: string;
    size: "1024x1024" | "1536x1024" | "1024x1536";
    format: "png" | "jpeg";
    createdAt: string;
  };
};

type ImageCreatorProps = {
  onSaved?: () => void;
  promptInputRef?: React.RefObject<HTMLTextAreaElement>;
};

export default function ImageCreator({ onSaved, promptInputRef }: ImageCreatorProps) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("high");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Resp | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const { showToast } = useToast();

  const generate = async () => {
    setBusy(true); setError(null); setResult(null); setIsImageLoading(true);
    try {
      const data = await generateImage(prompt, size, quality, format);
      setResult(data);
      showToast("Image generated successfully!", "success");
      onSaved && onSaved();
    } catch (e: any) {
      const errorMsg = e.message || "Failed";
      setError(errorMsg);
      showToast(errorMsg, "error");
    } finally {
      setBusy(false);
      setIsImageLoading(false);
    }
  };

  const download = () => {
    if (!result) return;
    const a = document.createElement("a");
    a.href = `data:image/${result.format};base64,${result.image_base64}`;
    a.download = `gpt-image-1_${Date.now()}.${result.format}`;
    a.click();
    showToast("Image downloaded!", "success");
  };

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-medium">Create Image (gpt-image-1)</h2>
      <textarea
        id="image-prompt"
        className="input h-32 resize-none"
        placeholder="Describe the image…"
        value={prompt}
        ref={promptInputRef}
        onChange={e=>setPrompt(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !busy && prompt.trim()) {
            e.preventDefault();
            generate();
          }
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="text-sm">Size
          <select className="input mt-1" value={size} onChange={e=>setSize(e.target.value)}>
            <option>1024x1024</option>
            <option>1536x1024</option>
            <option>1024x1536</option>
          </select>
        </label>
        <label className="text-sm">Quality
          <select className="input mt-1" value={quality} onChange={e=>setQuality(e.target.value)}>
            <option>low</option><option>medium</option><option>high</option>
          </select>
        </label>
        <label className="text-sm">Format
          <select className="input mt-1" value={format} onChange={e=>setFormat(e.target.value as any)}>
            <option>png</option><option>jpeg</option>
          </select>
        </label>
      </div>
      <div className="flex gap-2">
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
          ) : "Generate & Save"}
        </button>
        <button className="btn" disabled={!result} onClick={download}>Download</button>
      </div>
      {error && <div className="text-red-400 text-sm fade-in">{error}</div>}
      {(busy && !result) && (
        <div className="mt-2 space-y-2">
          <div className={`skeleton rounded-xl aspect-square w-full`} style={{ aspectRatio: size.replace('x', '/') }} />
          <div className="skeleton h-4 w-3/4 rounded" />
        </div>
      )}
      {result && (
        <div className="mt-2 fade-in">
          <img
            className="rounded-xl border border-neutral-800 image-hover"
            alt="result"
            src={`data:image/${result.format};base64,${result.image_base64}`}
            onLoad={() => setIsImageLoading(false)}
          />
          <div className="flex items-center justify-between mt-2">
            <div className="text-xs text-neutral-400">
              Saved to library: <code className="text-neutral-300">{result.library_item.filename}</code>
            </div>
            <button
              className="btn btn-primary text-xs px-4 py-2 ml-2"
              style={{ fontSize: "1rem", fontWeight: 600 }}
              autoFocus
              onClick={() => onSaved && onSaved()}
              aria-label="Switch to Sora and use this image"
            >
              Use in Sora →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
