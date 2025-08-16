import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { generateImage, API_BASE_URL } from "../lib/api";
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
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
};

export default function ImageCreator({ onSaved, promptInputRef, prompt, setPrompt }: ImageCreatorProps) {
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
      const isNetworkError = errorMsg.toLowerCase().includes('network') || errorMsg.toLowerCase().includes('fetch') || errorMsg.toLowerCase().includes('failed');
      const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      let detailedError = errorMsg;
      if (isRateLimit) {
        detailedError = `${errorMsg}. Please wait a moment before retrying.`;
      } else if (isNetworkError) {
        if (isMobileDevice && window.location.hostname !== 'localhost') {
          detailedError = `Connection failed. On mobile? Make sure:\n1. You're on the same WiFi as the server\n2. The server is running\n3. Using correct IP: ${API_BASE_URL}`;
        } else {
          detailedError = `Network error: ${errorMsg}. Check your connection and try again.`;
        }
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
          onDragOver={(e) => {
            if (e.dataTransfer?.types.includes('text/plain')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }
          }}
          onDrop={(e) => {
            const data = e.dataTransfer?.getData('text/plain');
            if (!data) return;
            e.preventDefault();
            const target = e.currentTarget;
            const start = target.selectionStart ?? 0;
            const end = target.selectionEnd ?? 0;
            const before = prompt.slice(0, start);
            const after = prompt.slice(end);
            const next = before + data + after;
            setPrompt(next);
            requestAnimationFrame(() => {
              target.focus();
              const pos = before.length + data.length;
              target.setSelectionRange(pos, pos);
            });
          }}
          aria-label="Image description prompt"
          aria-required="true"
          aria-invalid={error ? "true" : undefined}
          aria-describedby="prompt-help"
        />
        <div className="flex justify-between items-center mt-1">
          <Text size="xs" tone="muted" id="prompt-help">
            {prompt.length === 0 && "Prompt is required"}
            {prompt.length > 0 && prompt.length < 10 && "Consider adding more detail for better results"}
            {prompt.length >= 10 && "Press Ctrl+Enter to generate"}
          </Text>
          <Text size="xs" tone="muted" className={prompt.length > 1000 ? "text-amber-400" : ""}>
            {prompt.length}/1000
          </Text>
        </div>
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
          className={`btn btn-primary min-w-[48px] min-h-[48px] md:min-h-0 ${busy ? 'loading' : ''}`}
          disabled={busy || !prompt.trim()}
          onClick={() => generate()}
          aria-describedby={!prompt.trim() ? "prompt-required" : undefined}
        >
          {busy ? (
            <span className="flex items-center gap-2">
              <span className="loading-spinner" />
              Generating…
            </span>
          ) : "Generate & Save"}
        </button>
        {!prompt.trim() && (
          <span id="prompt-required" className="sr-only">Enter a prompt to generate an image</span>
        )}
        <button className="btn btn-secondary min-w-[48px] min-h-[48px] md:min-h-0" disabled={!result} onClick={download}>Download</button>
      </div>
      {error && (
        <div className="fade-in space-y-2">
          <Text size="sm" tone="danger">{error}</Text>
          {retryCount < 3 && (
            <button
              className="btn btn-sm btn-secondary text-xs"
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
