import { useEffect, useRef, useState } from "react";
import { editImage, type LibraryItem } from "../lib/api";
import { useToast } from "../contexts/ToastContext";
import Modal from "../components/Modal";
import { LoadingButton } from "../components/LoadingButton";
import { PromptTextarea } from "../components/PromptTextarea";

type Props = {
  item: LibraryItem & { kind: "image" };
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

export default function ImageEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [brush, setBrush] = useState(30);
  const [drawing, setDrawing] = useState(false);
  const [prompt, setPrompt] = useState(``);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(item.size);
  const [format, setFormat] = useState<"png"|"jpeg">(item.format);
  // Added: track whether user has drawn and last pointer position for smooth strokes
  const [hasMask, setHasMask] = useState(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const { showToast } = useToast();

  // Initialize mask canvas as opaque (white). Transparent pixels will be areas to change.
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    const p = previewRef.current!;
    const pctx = p.getContext("2d")!;
    pctx.clearRect(0, 0, p.width, p.height);
    setHasMask(false);
    lastPt.current = null;
  }, [item.id]);

  // Sync canvas size to image; after sizing, reinitialize to opaque
  useEffect(() => {
    const img = imgRef.current!;
    const c = canvasRef.current!;
    const p = previewRef.current!;
    const sync = () => {
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      p.width = img.naturalWidth;
      p.height = img.naturalHeight;
      const ctx = c.getContext("2d")!;
      ctx.globalCompositeOperation = "source-over";
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, c.width, c.height);
      const pctx = p.getContext("2d")!;
      pctx.clearRect(0, 0, p.width, p.height);
      setHasMask(false);
      lastPt.current = null;
    };
    if (img.complete) sync(); else img.onload = sync;
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
    const ctx = c.getContext("2d")!;
    const { x, y } = getCanvasCoords(e);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
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
    const pctx = p.getContext("2d")!;
    pctx.globalCompositeOperation = "source-over";
    pctx.strokeStyle = "rgba(255,0,0,0.35)";
    pctx.fillStyle = "rgba(255,0,0,0.35)";
    pctx.lineCap = "round";
    pctx.lineJoin = "round";
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
      const maskPng = hasMask ? canvasRef.current!.toDataURL("image/png") : undefined;
      const res = await editImage(item.id, prompt || "Apply the painted mask changes", maskPng, size, format);
      onEdited(res.library_item.id);
      showToast("Image edited and saved", "success");
    } catch (e) {
      showToast((e as any).message || "Edit failed", "error");
    } finally { setBusy(false); }
  }

  return (
    <Modal onClose={onClose} ariaLabel="Image editor">
      <div>
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="font-medium">Edit Image</div>
          <button className="btn" onClick={onClose}>Close</button>
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
              style={{ touchAction: "none" }}
              onPointerDown={(e) => { setDrawing(true); (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId); e.preventDefault(); drawFromEvent(e, true); }}
              onPointerMove={(e) => { if (drawing) { e.preventDefault(); drawFromEvent(e); } }}
              onPointerUp={(e) => { setDrawing(false); lastPt.current = null; try { (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {} }}
              onPointerCancel={(e) => { setDrawing(false); lastPt.current = null; try { (e.currentTarget as HTMLCanvasElement).releasePointerCapture(e.pointerId); } catch {} }}
            />
          </div>

          <div className="space-y-3">
            <PromptTextarea
              id="image-edit-prompt"
              ariaLabel="Describe the edit you want"
              className="h-40"
              placeholder="Describe the edit you want…"
              value={prompt}
              onChange={setPrompt}
              onSubmit={runEdit}
              maxLength={2000}
              minLength={0}
              busy={busy}
            />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Brush size
                <input className="w-full" type="range" min={5} max={200} value={brush} onChange={e=>setBrush(+e.target.value)} />
              </label>
              <label className="text-sm">Format
                <select className="input mt-1" value={format} onChange={e=>setFormat(e.target.value as any)}>
                  <option>png</option><option>jpeg</option>
                </select>
              </label>
              <label className="text-sm">Size
                <select className="input mt-1" value={size} onChange={e=>setSize(e.target.value as any)}>
                  <option>1024x1024</option>
                  <option>1536x1024</option>
                  <option>1024x1536</option>
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <LoadingButton loading={busy} loadingText="Editing…" onClick={runEdit}>
                Apply Edit & Save
              </LoadingButton>
              <button className="btn" onClick={()=>{
                const c = canvasRef.current!; const ctx = c.getContext("2d")!;
                ctx.globalCompositeOperation = "source-over";
                ctx.clearRect(0,0,c.width,c.height);
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0,0,c.width,c.height);
                const p = previewRef.current!; const pctx = p.getContext("2d")!;
                pctx.clearRect(0,0,p.width,p.height);
                setHasMask(false);
                lastPt.current = null;
              }}>Clear Mask</button>
            </div>
            <p className="text-xs text-neutral-500">Paint areas to change; red tint shows your mask. Leave prompt empty for a global transform.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
