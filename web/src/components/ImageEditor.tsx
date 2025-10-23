import { useEffect, useRef, useState } from 'react';
import { editImage, type LibraryItem } from '../lib/api';
import { blobToDataURL } from '@/lib/base64';
import { useToast } from '../contexts/ToastContext';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

const FALLBACK_IMAGE_SIZE = '1024x1024';

type ImageLibraryItem = Extract<LibraryItem, { kind: 'image' }>;
type ImageFormat = ImageLibraryItem['format'];
type ImageSize = ImageLibraryItem['size'];
type ImageQuality = 'auto' | 'low' | 'medium' | 'high';
type ImageBackground = 'transparent' | 'opaque' | 'auto';

interface ImageEditorPreset {
  prompt?: string;
  size?: ImageSize;
  format?: ImageFormat;
  background?: ImageBackground;
  quality?: ImageQuality;
  brush?: number;
  outputCompression?: number;
}

const formatOptions: readonly ImageFormat[] = ['png', 'jpeg', 'webp'];
const sizeOptions: readonly ImageSize[] = ['auto', '1024x1024', '1536x1024', '1024x1536', '1792x1024', '1024x1792'];
const qualityOptions: readonly ImageQuality[] = ['auto', 'low', 'medium', 'high'];
const backgroundOptions: readonly ImageBackground[] = ['transparent', 'opaque', 'auto'];

type Props = {
  item: ImageLibraryItem;
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

const isImageFormat = (value: string): value is ImageFormat =>
  formatOptions.includes(value as ImageFormat);

const isImageSize = (value: string): value is ImageSize =>
  sizeOptions.includes(value as ImageSize);

const isImageQuality = (value: string): value is ImageQuality =>
  qualityOptions.includes(value as ImageQuality);

const isImageBackground = (value: string): value is ImageBackground =>
  backgroundOptions.includes(value as ImageBackground);

const parsePreset = (raw: string): ImageEditorPreset | null => {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') {
      return null;
    }

    const preset: ImageEditorPreset = {};
    const record = value as Record<string, unknown>;

    if (typeof record.prompt === 'string') preset.prompt = record.prompt;
    if (typeof record.brush === 'number') preset.brush = record.brush;
    if (typeof record.outputCompression === 'number') preset.outputCompression = record.outputCompression;
    if (typeof record.size === 'string' && isImageSize(record.size)) preset.size = record.size;
    if (typeof record.format === 'string' && isImageFormat(record.format)) preset.format = record.format;
    if (typeof record.background === 'string' && isImageBackground(record.background)) preset.background = record.background;
    if (typeof record.quality === 'string' && isImageQuality(record.quality)) preset.quality = record.quality;

    return preset;
  } catch {
    return null;
  }
};

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Edit failed';
};

export default function ImageEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [brush, setBrush] = useState(30);
  const [drawing, setDrawing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState<ImageSize>(item.size);
  const [format, setFormat] = useState<ImageFormat>(item.format);
  // API enhancements
  const [quality, setQuality] = useState<ImageQuality>('high');
  const [background, setBackground] = useState<ImageBackground>('opaque');
  const [outputCompression, setOutputCompression] = useState<number>(100);
  // Added: track whether user has drawn and last pointer position for smooth strokes
  const [hasMask, setHasMask] = useState(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const { showToast } = useToast();

  const handleFormatChange = (value: string) => {
    if (isImageFormat(value)) {
      setFormat(value);
    }
  };

  const handleSizeChange = (value: string) => {
    if (isImageSize(value)) {
      setSize(value);
    }
  };

  const handleQualityChange = (value: string) => {
    if (isImageQuality(value)) {
      setQuality(value);
    }
  };

  const handleBackgroundChange = (value: string) => {
    if (isImageBackground(value)) {
      setBackground(value);
    }
  };

  // Initialize mask canvas as opaque (white). Transparent pixels will be areas to change.
  useEffect(() => {
    // Apply preset if present (from Playbooks)
    const raw = localStorage.getItem('IMAGE_EDITOR_PRESET');
    if (raw) {
      const preset = parsePreset(raw);
      if (preset) {
        const presetPrompt = preset.prompt;
        if (presetPrompt) setPrompt(prev => prev || presetPrompt);
        if (preset.size) setSize(preset.size);
        if (preset.format) setFormat(preset.format);
        if (preset.background) setBackground(preset.background);
        if (preset.quality) setQuality(preset.quality);
        if (typeof preset.outputCompression === 'number') setOutputCompression(preset.outputCompression);
        if (typeof preset.brush === 'number') setBrush(preset.brush);
      }
      localStorage.removeItem('IMAGE_EDITOR_PRESET');
    }
    // In Dialog portal, canvases may not be mounted on the very first effect tick
    const c = canvasRef.current;
    const p = previewRef.current;
    if (!c || !p) return;
    const ctx = c.getContext('2d');
    const pctx = p.getContext('2d');
    if (!ctx || !pctx) return;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    pctx.clearRect(0, 0, p.width, p.height);
    setHasMask(false);
    lastPt.current = null;
  }, [item.id]);

  // Sync canvas size to image; after sizing, reinitialize to opaque
  useEffect(() => {
    const img = imgRef.current;
    const c = canvasRef.current;
    const p = previewRef.current;
    if (!img || !c || !p) return; // wait until refs are mounted
    const sync = () => {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      p.width = img.naturalWidth;
      p.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      const pctx = p.getContext('2d');
      if (!ctx || !pctx) return;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, c.width, c.height);
      pctx.clearRect(0, 0, p.width, p.height);
      setHasMask(false);
      lastPt.current = null;
    };
    if (img.complete) sync(); else img.onload = sync;
    return () => { img.onload = null; };
  }, []);

  // Compute canvas-space coordinates from a pointer event
  function getCanvasCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (c.width / rect.width);
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    return { x, y };
  }

  // Draw continuous stroke in destination-out to erase to transparent
  function drawFromEvent(e: React.PointerEvent<HTMLCanvasElement>, initial = false) {
    const c = canvasRef.current!;
    const ctx = c.getContext('2d')!;
    const { x, y } = getCanvasCoords(e);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brush;

    if (!lastPt.current || initial) {
      ctx.beginPath();
      ctx.arc(x, y, brush / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    // Visual preview stroke (tinted mask overlay)
    const p = previewRef.current!;
    const pctx = p.getContext('2d')!;
    pctx.globalCompositeOperation = 'source-over';
    pctx.strokeStyle = 'rgba(255,0,0,0.35)';
    pctx.fillStyle = 'rgba(255,0,0,0.35)';
    pctx.lineCap = 'round';
    pctx.lineJoin = 'round';
    pctx.lineWidth = brush;
    if (!lastPt.current || initial) {
      pctx.beginPath();
      pctx.arc(x, y, brush / 2, 0, Math.PI * 2);
      pctx.fill();
    } else {
      pctx.beginPath();
      pctx.moveTo(lastPt.current.x, lastPt.current.y);
      pctx.lineTo(x, y);
      pctx.stroke();
    }
    lastPt.current = { x, y };
    setHasMask(true);
  }

  async function runEdit() {
    setBusy(true);
    try {
      // Only send a mask if the user has painted; otherwise request a global transform by omitting mask
      // Use toBlob (async, off-main-thread) rather than toDataURL (sync, can freeze)
      let maskPng: string | undefined = undefined;
      if (hasMask) {
        const blob: Blob | null = await new Promise(resolve => canvasRef.current!.toBlob(resolve, 'image/png'));
        if (blob) {
          maskPng = await blobToDataURL(blob)
        }
      }
      // Normalize unsupported 'auto' size to a concrete value for edits
      const normalizedSize = size === 'auto' ? FALLBACK_IMAGE_SIZE : size;
      const res = await editImage(item.id, prompt || 'Apply the painted mask changes', maskPng, normalizedSize, format, {
        quality,
        background: (format === 'png' || format === 'webp') ? background : undefined,
        output_compression: (format === 'jpeg' || format === 'webp') ? outputCompression : undefined
      });
      onEdited(res.library_item.id);
      showToast('Image edited and saved', 'success');
    } catch (error: unknown) {
      showToast(getErrorMessage(error), 'error');
    } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl p-0">
        <DialogTitle className="sr-only">Edit Image</DialogTitle>
        <div>
          <div className="flex items-center justify-between p-3 border-b border-neutral-800">
            <div className="font-medium">Edit Image</div>
            <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          </div>

          <div className="grid md:grid-cols-2 gap-4 p-4">
            <div className="relative">
              <img ref={imgRef} src={`${baseUrl}${item.url}`} alt="" className="w-full rounded-lg border border-neutral-800 select-none pointer-events-none" />
              <canvas
                ref={previewRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full cursor-crosshair"
                // Prevent touch scrolling while drawing
                style={{ touchAction: 'none' }}
                onPointerDown={(e) => { setDrawing(true); e.currentTarget.setPointerCapture(e.pointerId); e.preventDefault(); drawFromEvent(e, true); }}
                onPointerMove={(e) => { if (drawing) { e.preventDefault(); drawFromEvent(e); } }}
                onPointerUp={(e) => { setDrawing(false); lastPt.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { } }}
                onPointerCancel={(e) => { setDrawing(false); lastPt.current = null; try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { } }}
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="image-edit-prompt">Describe the edit</Label>
                <Textarea
                  id="image-edit-prompt"
                  className="min-h-[160px] resize-y"
                  placeholder="Describe the edit you want…"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      runEdit();
                    }
                  }}
                  maxLength={32000}
                  disabled={busy}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="brush-size">Brush size ({brush}px)</Label>
                  <Slider
                    id="brush-size"
                    min={5}
                    max={200}
                    step={1}
                    value={[brush]}
                    onValueChange={(v) => setBrush(v[0])}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="format-select">Format</Label>
                  <Select value={format} onValueChange={handleFormatChange}>
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
                <div className="space-y-2">
                  <Label htmlFor="size-select">Size</Label>
                  <Select value={size} onValueChange={handleSizeChange}>
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
                  <Select value={quality} onValueChange={handleQualityChange}>
                    <SelectTrigger id="quality-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">auto</SelectItem>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {(format === 'png' || format === 'webp') && (
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="background-select">Background (PNG/WEBP)</Label>
                    <Select value={background} onValueChange={handleBackgroundChange}>
                      <SelectTrigger id="background-select">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="opaque">opaque</SelectItem>
                        <SelectItem value="transparent">transparent</SelectItem>
                        <SelectItem value="auto">auto</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {(format === 'jpeg' || format === 'webp') && (
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="compression-slider">Compression ({outputCompression}%)</Label>
                    <Slider
                      id="compression-slider"
                      min={0}
                      max={100}
                      step={1}
                      value={[outputCompression]}
                      onValueChange={(v) => setOutputCompression(v[0])}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  disabled={busy}
                  onClick={runEdit}
                >
                  {busy ? 'Editing…' : 'Apply Edit & Save'}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    const c = canvasRef.current; const p = previewRef.current;
                    if (c) {
                      const ctx = c.getContext('2d');
                      if (ctx) {
                        ctx.globalCompositeOperation = 'source-over';
                        ctx.clearRect(0, 0, c.width, c.height);
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, c.width, c.height);
                      }
                    }
                    if (p) {
                      const pctx = p.getContext('2d');
                      if (pctx) pctx.clearRect(0, 0, p.width, p.height);
                    }
                    setHasMask(false);
                    lastPt.current = null;
                  }}
                >
                  Clear Mask
                </Button>
              </div>
              <p className="text-xs text-neutral-500">Paint areas to change; red tint shows your mask. Leave prompt empty for a global transform.</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
