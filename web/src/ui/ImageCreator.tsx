import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { generateImage } from "../lib/api";
import { Heading, Text, Label, Mono } from "./typography";

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
  onSaved?: (id: string) => void;
  promptInputRef?: React.RefObject<HTMLTextAreaElement>;
};

export default function ImageCreator({ onSaved, promptInputRef }: ImageCreatorProps) {
  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("1024x1024");
  const [quality, setQuality] = useState("high");
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<Resp | null>(null);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const { showToast } = useToast();

  const generate = async (isRetry = false) => {
    setBusy(true); setError(null); setResult(null); setIsImageLoading(true);
    try {
      const data = await generateImage(prompt, size, quality, format);
      setResult(data);
      setRetryCount(0);
      showToast("Image generated successfully!", "success");
      onSaved && onSaved(data.library_item.id);
    } catch (e: any) {
      const errorMsg = e.message || "Failed to generate image";
      const isRateLimit = errorMsg.toLowerCase().includes('rate') || errorMsg.toLowerCase().includes('limit');
      const isNetworkError = errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('fetch');
      
      let detailedError = errorMsg;
      if (isRateLimit) {
        detailedError = `${errorMsg}. Please wait a moment before retrying.`;
      } else if (isNetworkError) {
        detailedError = `Network error: ${errorMsg}. Check your connection and try again.`;
      }
      
      setError(detailedError);
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      showToast(detailedError, "error");
    } finally {
      setBusy(false);
      setIsImageLoading(false);
    }
  };

  const retry = async () => {
    if (retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      await generate(true);
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
      <Heading level={4}>Create Image (gpt-image-1)</Heading>
      <div className="relative">
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
          aria-label="Image description prompt"
          aria-required="true"
          aria-invalid={error ? "true" : undefined}
          aria-describedby="prompt-help"
        />
        <Text size="xs" tone="muted" className="mt-1" id="prompt-help">
          {prompt.length === 0 && "Prompt is required"}
          {prompt.length > 0 && prompt.length < 10 && "Consider adding more detail for better results"}
          {prompt.length >= 10 && "Press Ctrl+Enter to generate"}
        </Text>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        <Label size="sm">Size
          <select className="input mt-1" value={size} onChange={e=>setSize(e.target.value)}>
            <option>1024x1024</option>
            <option>1536x1024</option>
            <option>1024x1536</option>
          </select>
        </Label>
        <Label size="sm">Quality
          <select className="input mt-1" value={quality} onChange={e=>setQuality(e.target.value)}>
            <option>low</option><option>medium</option><option>high</option>
          </select>
        </Label>
        <Label size="sm">Format
          <select className="input mt-1" value={format} onChange={e=>setFormat(e.target.value as any)}>
            <option>png</option><option>jpeg</option>
          </select>
        </Label>
      </div>
      <div className="flex gap-2">
        <button
          className={`btn min-w-[48px] min-h-[48px] md:min-h-0 ${busy ? 'pulse' : ''}`}
          disabled={busy || !prompt.trim()}
          onClick={() => generate()}
          aria-describedby={!prompt.trim() ? "prompt-required" : undefined}
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
        {!prompt.trim() && (
          <span id="prompt-required" className="sr-only">Enter a prompt to generate an image</span>
        )}
        <button className="btn min-w-[48px] min-h-[48px] md:min-h-0" disabled={!result} onClick={download}>Download</button>
      </div>
      {error && (
        <div className="fade-in space-y-2">
          <Text size="sm" tone="danger">{error}</Text>
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
            alt={result.library_item.prompt}
            src={`data:image/${result.format};base64,${result.image_base64}`}
            onLoad={() => setIsImageLoading(false)}
          />
          <div className="flex items-center justify-between mt-2">
            <Text size="xs" tone="muted">
              Saved to library: <Mono tone="default">{result.library_item.filename}</Mono>
            </Text>
            <button
              className="btn btn-primary text-xs px-4 py-2 ml-2"
              autoFocus
              onClick={() => onSaved && result && onSaved(result.library_item.id)}
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
