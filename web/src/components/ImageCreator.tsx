import { useState } from 'react';
import { useToast } from '../contexts/ToastContext';
import { generateImage } from '../lib/api';
import { processApiError } from '../lib/errorUtils';
import { Skeleton } from './ui/skeleton';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Slider } from './ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';

type Resp = {
  image_base64: string;
  model: string;
  size: string;
  format: 'png' | 'jpeg' | 'webp';
  library_item: {
    id: string;
    url: string;
    filename: string;
    prompt: string;
    size: 'auto' | '1024x1024' | '1536x1024' | '1024x1536';
    format: 'png' | 'jpeg' | 'webp';
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
  const [size, setSize] = useState('auto');
  const [quality, setQuality] = useState('high');
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [result, setResult] = useState<Resp | null>(null);
  const [_isImageLoading, setIsImageLoading] = useState(false);
  const [outputCompression, setOutputCompression] = useState(100);
  const [background, setBackground] = useState<'transparent' | 'opaque' | 'auto'>('auto');
  const { showToast } = useToast();
  // Persist user preferences for seamless UX
  // Load saved settings on mount
  useState(() => {
    try {
      const saved = localStorage.getItem('IMG_CREATOR_SETTINGS');
      if (saved) {
        const s = JSON.parse(saved);
        if (s.size) setSize(s.size);
        if (s.quality) setQuality(s.quality);
        if (s.format) setFormat(s.format);
        if (typeof s.outputCompression === 'number') setOutputCompression(s.outputCompression);
        if (s.background) setBackground(s.background);
      }
    } catch {}
  });
  // Save on change
  useState(() => {
    const settings = { size, quality, format, outputCompression, background };
    try { localStorage.setItem('IMG_CREATOR_SETTINGS', JSON.stringify(settings)); } catch {}
    return settings;
  });
  // Keep background/format coherent for transparent output
  function onBackgroundChange(next: 'transparent' | 'opaque' | 'auto') {
    if (next === 'transparent' && format === 'jpeg') {
      setFormat('png');
      showToast('Format set to PNG for transparent background', 'info');
    }
    setBackground(next);
  }
  function onFormatChange(next: 'png' | 'jpeg' | 'webp') {
    if (next === 'jpeg' && background === 'transparent') {
      setBackground('opaque');
      showToast('Background set to opaque for JPEG', 'info');
    }
    setFormat(next);
  }

  const generate = async (isRetry = false) => {
    setBusy(true); setError(null); setResult(null); setIsImageLoading(true);
    try {
      const data = await generateImage(prompt, size, quality, format, {
        output_compression: (format === 'jpeg' || format === 'webp') ? outputCompression : undefined,
        background: (format === 'png' || format === 'webp') ? background : undefined
      });
      setResult(data);
      setRetryCount(0);
      showToast('Image generated successfully!', 'success');
      if (onSaved) onSaved(data.library_item.id);
    } catch (e: any) {
      const { detailedMessage } = processApiError(e);
      setError(detailedMessage);
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      showToast(detailedMessage, 'error');
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
    const a = document.createElement('a');
    a.href = `data:image/${result.format};base64,${result.image_base64}`;
    a.download = `${(result.model || 'image').replace(/\W+/g,'_')}_${Date.now()}.${result.format}`;
    a.click();
    showToast('Image downloaded!', 'success');
  };

  return (
    <div className="space-y-4">
      <h3 className="text-xl font-semibold text-neutral-100">Create Image (gpt-image-1)</h3>
      <div className="space-y-2">
        <Label htmlFor="image-prompt" className="text-sm font-medium text-neutral-200">Image Description</Label>
        <Textarea
          ref={promptInputRef}
          id="image-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              generate();
            }
          }}
          placeholder="Describe the image…"
          maxLength={32000}
          disabled={busy}
          className="min-h-[100px] resize-y bg-neutral-800/80 border-neutral-600 text-neutral-100 placeholder-neutral-500 focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20"
          aria-label="Image description prompt"
        />
        <p className="text-xs text-neutral-500">{prompt.length} / 32000</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="space-y-2">
          <Label htmlFor="size-select">Size</Label>
          <Select value={size} onValueChange={setSize}>
            <SelectTrigger id="size-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">auto</SelectItem>
              <SelectItem value="1024x1024">1024x1024</SelectItem>
              <SelectItem value="1536x1024">1536x1024</SelectItem>
              <SelectItem value="1024x1536">1024x1536</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="quality-select">Quality</Label>
          <Select value={quality} onValueChange={setQuality}>
            <SelectTrigger id="quality-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">low</SelectItem>
              <SelectItem value="medium">medium</SelectItem>
              <SelectItem value="high">high</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="format-select">Format</Label>
          <Select value={format} onValueChange={(v) => onFormatChange(v as any)}>
            <SelectTrigger id="format-select">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="png">png</SelectItem>
              <SelectItem value="jpeg">jpeg</SelectItem>
              <SelectItem value="webp">webp</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(format === 'png' || format === 'webp') && (
          <div className="space-y-2">
            <Label htmlFor="background-select">Background</Label>
            <Select value={background} onValueChange={(v) => onBackgroundChange(v as any)}>
              <SelectTrigger id="background-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">auto</SelectItem>
                <SelectItem value="opaque">opaque</SelectItem>
                <SelectItem value="transparent">transparent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
        {(format === 'jpeg' || format === 'webp') && (
          <div className="space-y-2">
            <Label htmlFor="compression-slider" className="text-sm font-medium text-neutral-200">Compression ({outputCompression}%)</Label>
            <Slider
              id="compression-slider"
              min={0}
              max={100}
              step={1}
              value={[outputCompression]}
              onValueChange={(v) => setOutputCompression(v[0])}
              className="mt-2"
            />
          </div>
        )}
      </div>
      <div className="flex gap-3 mt-6">
        <Button
          variant="default"
          disabled={!prompt.trim() || busy}
          onClick={() => generate()}
          aria-describedby={!prompt.trim() ? 'prompt-required' : undefined}
          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium px-6 py-2.5 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
        >
          {busy ? 'Generating…' : 'Generate & Save'}
        </Button>
        {!prompt.trim() && (
          <span id="prompt-required" className="sr-only">Enter a prompt to generate an image</span>
        )}
        <Button variant="outline" disabled={!result} onClick={download} className="border-neutral-600 hover:border-purple-500 text-neutral-200 hover:text-white">
          Download
        </Button>
      </div>

      {busy && !result && (
        <div className="space-y-1 mt-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>Generating image…</span>
          </div>
          <Progress />
        </div>
      )}
      {error && (
        <div className="fade-in space-y-2">
          <p className="text-sm text-destructive">{error}</p>
          {retryCount < 3 && (
            <Button
              size="sm"
              variant="outline"
              onClick={retry}
              disabled={busy}
            >
              Retry {retryCount > 0 && `(${retryCount}/3)`}
            </Button>
          )}
        </div>
      )}
      {(busy && !result) && (
        <Skeleton className="w-full h-[320px] rounded-xl border border-neutral-800" />
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
            <p className="text-xs text-muted-foreground">
              Saved to library: <code className="font-mono">{result.library_item.filename}</code>
            </p>
            <Button
              size="sm"
              variant="default"
              autoFocus
              onClick={() => onSaved && result && onSaved(result.library_item.id)}
              aria-label="Switch to Sora and use this image"
            >
              Use in Sora →
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
