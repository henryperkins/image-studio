import { useEffect, useRef, useState } from "react";
import { editImage, type LibraryItem } from "../lib/api";

type Props = {
  item: LibraryItem & { kind: "image" };
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

export default function ImageEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [brush, setBrush] = useState(30);
  const [drawing, setDrawing] = useState(false);
  const [prompt, setPrompt] = useState(``);
  const [busy, setBusy] = useState(false);
  const [size, setSize] = useState(item.size);
  const [format, setFormat] = useState<"png"|"jpeg">(item.format);

  // draw transparent strokes on a transparent canvas -> used as "mask"
  useEffect(() => {
    const c = canvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0,0,c.width,c.height);
  }, [item.id]);

  useEffect(() => {
    const img = imgRef.current!;
    const c = canvasRef.current!;
    const sync = () => { c.width = img.naturalWidth; c.height = img.naturalHeight; };
    if (img.complete) sync(); else img.onload = sync;
  }, []);

  function handleDraw(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (c.width / rect.width);
    const y = (e.clientY - rect.top) * (c.height / rect.height);
    const ctx = c.getContext("2d")!;
    ctx.globalCompositeOperation = "destination-out"; // make transparent
    ctx.beginPath();
    ctx.arc(x, y, brush/2, 0, Math.PI*2);
    ctx.fill();
  }

  async function runEdit() {
    setBusy(true);
    try {
      // export mask PNG (transparent where edited)
      const maskPng = canvasRef.current!.toDataURL("image/png");
      const res = await editImage(item.id, prompt || "Apply the painted mask changes", maskPng, size, format);
      onEdited(res.library_item.id);
    } catch (e) {
      alert((e as any).message || "Edit failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl">
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="font-medium">Edit Image</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4">
          <div className="relative">
            <img ref={imgRef} src={`${baseUrl}${item.url}`} alt="" className="w-full rounded-lg border border-neutral-800 select-none pointer-events-none" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={() => setDrawing(true)}
              onMouseUp={() => setDrawing(false)}
              onMouseLeave={() => setDrawing(false)}
              onMouseMove={(e) => drawing && handleDraw(e)}
            />
          </div>

          <div className="space-y-3">
            <textarea className="input h-40 resize-none" placeholder="Describe the edit you want…" value={prompt} onChange={e=>setPrompt(e.target.value)} />
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
              <button className="btn" disabled={busy || !prompt.trim()} onClick={runEdit}>{busy ? "Editing…" : "Apply Edit & Save"}</button>
              <button className="btn" onClick={()=>{
                const c = canvasRef.current!; const ctx = c.getContext("2d")!; ctx.clearRect(0,0,c.width,c.height);
              }}>Clear Mask</button>
            </div>
            <p className="text-xs text-neutral-500">Paint the areas to change; transparent pixels become the edit mask. The edited image is saved back to your library.</p>
          </div>
        </div>
      </div>
    </div>
  );
}