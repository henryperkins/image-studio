import { useState } from "react";
import { useToast } from "../contexts/ToastContext";
import { generateImage } from "../lib/api";
import { processApiError } from "../lib/errorUtils";
import { Heading, Text, Label, Mono } from "./typography";
import { PromptTextarea } from "../components/PromptTextarea";
import { LoadingButton } from "../components/LoadingButton";
import { MediaSkeleton } from "../components/SkeletonLoader";

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
      const { detailedMessage } = processApiError(e);
      setError(detailedMessage);
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      showToast(detailedMessage, "error");
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
      <PromptTextarea
        ref={promptInputRef}
        id="image-prompt"
        value={prompt}
        onChange={setPrompt}
        onSubmit={generate}
        placeholder="Describe the image…"
        maxLength={1000}
        disabled={busy}
        busy={busy}
        error={error}
        ariaLabel="Image description prompt"
      />
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
        <LoadingButton
          variant="primary"
          loading={busy}
          loadingText="Generating…"
          disabled={!prompt.trim()}
          onClick={() => generate()}
          aria-describedby={!prompt.trim() ? "prompt-required" : undefined}
        >
          Generate & Save
        </LoadingButton>
        {!prompt.trim() && (
          <span id="prompt-required" className="sr-only">Enter a prompt to generate an image</span>
        )}
        <LoadingButton variant="secondary" disabled={!result} onClick={download}>
          Download
        </LoadingButton>
      </div>

      {busy && !result && (
        <div className="space-y-1 mt-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Generating image…</span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden relative">
            <div className="progress-bar progress-bar-indeterminate h-full" />
          </div>
        </div>
      )}
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
        <MediaSkeleton mediaType="image" size={size} />
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
