import { useEffect, useMemo, useRef, useState } from "react";
import {
  API_BASE_URL,
  LibraryItem, VideoItem, ImageItem, isVideoItem,
  trimVideo, cropVideo, resizeVideo, speedVideo, muteVideo, volumeVideo,
  overlayImageOnVideo, concatVideos, listLibrary
} from "../lib/api";

type Props = {
  item: LibraryItem & { kind: "video" };
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

type Tab = "trim" | "crop" | "resize" | "speed" | "volume" | "overlay" | "concat";

export default function VideoEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const [tab, setTab] = useState<Tab>("trim");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const videos = useMemo(()=>library.filter(isVideoItem) as VideoItem[],[library]);
  const images = useMemo(()=>library.filter(i=>!isVideoItem(i)) as ImageItem[],[library]);

  // TRIM
  const [start, setStart] = useState(0);
  const [dur, setDur] = useState(Math.min(5, item.duration));

  // CROP
  const [cx, setCx] = useState(0); 
  const [cy, setCy] = useState(0);
  const [cw, setCw] = useState(item.width); 
  const [ch, setCh] = useState(item.height);

  // RESIZE
  const [rw, setRw] = useState(item.width); 
  const [rh, setRh] = useState(item.height);
  const [fit, setFit] = useState<"contain"|"cover"|"stretch">("contain");
  const [bg, setBg] = useState("black");

  // SPEED
  const [speed, setSpeed] = useState(1);

  // VOLUME
  const [gainDb, setGainDb] = useState(0);

  // OVERLAY
  const [overlayId, setOverlayId] = useState<string>("");
  const [ox, setOx] = useState<string>("W-w-20");
  const [oy, setOy] = useState<string>("H-h-20");
  const [ow, setOw] = useState<number>(Math.round(item.width/5));
  const [oh, setOh] = useState<number>(0);
  const [opacity, setOpacity] = useState(0.85);

  // CONCAT
  const [concatIds, setConcatIds] = useState<string[]>([item.id]);
  const [targetW, setTargetW] = useState<number|undefined>(undefined);
  const [targetH, setTargetH] = useState<number|undefined>(undefined);

  useEffect(() => { listLibrary().then(setLibrary).catch(()=>{}); }, []);

  async function run<T>(fn:()=>Promise<T>) {
    setBusy(true); 
    setErr(null);
    try {
      const res:any = await fn();
      onEdited(res.library_item.id);
    } catch (e:any) {
      setErr(e.message || "Edit failed");
    } finally { 
      setBusy(false); 
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="font-medium">Edit Video</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4">
          <video 
            className="w-full rounded-lg border border-neutral-800" 
            src={`${baseUrl}${item.url}`} 
            controls 
            preload="metadata" 
          />

          <div className="space-y-3">
            {/* Tabs */}
            <div 
              className="inline-flex rounded-xl overflow-hidden border border-neutral-700"
              role="tablist"
              aria-label="Video editing options"
            >
              {(["trim","crop","resize","speed","volume","overlay","concat"] as Tab[]).map((t, idx, arr) => (
                <button 
                  key={t}
                  id={`tab-${t}`}
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`panel-${t}`}
                  tabIndex={tab === t ? 0 : -1}
                  className={`px-3 py-1.5 text-sm ${tab===t?"bg-neutral-700":"bg-neutral-900 hover:bg-neutral-800"} focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:z-10`} 
                  onClick={()=>setTab(t)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const prevIdx = idx > 0 ? idx - 1 : arr.length - 1;
                      setTab(arr[prevIdx]);
                      setTimeout(() => document.getElementById(`tab-${arr[prevIdx]}`)?.focus(), 0);
                    }
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const nextIdx = idx < arr.length - 1 ? idx + 1 : 0;
                      setTab(arr[nextIdx]);
                      setTimeout(() => document.getElementById(`tab-${arr[nextIdx]}`)?.focus(), 0);
                    }
                    if (e.key === "Home") {
                      e.preventDefault();
                      setTab(arr[0]);
                      setTimeout(() => document.getElementById(`tab-${arr[0]}`)?.focus(), 0);
                    }
                    if (e.key === "End") {
                      e.preventDefault();
                      setTab(arr[arr.length - 1]);
                      setTimeout(() => document.getElementById(`tab-${arr[arr.length - 1]}`)?.focus(), 0);
                    }
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setTab(t);
                    }
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            {tab==="trim" && (
              <div className="space-y-2" id="panel-trim" role="tabpanel" aria-labelledby="tab-trim">
                <label className="text-sm">Start (s)
                  <input 
                    className="input mt-1" 
                    type="number" 
                    min={0} 
                    step={0.1} 
                    value={start} 
                    onChange={e=>setStart(Math.max(0,+e.target.value||0))}
                  />
                </label>
                <label className="text-sm">Duration (s)
                  <input 
                    className="input mt-1" 
                    type="number" 
                    min={0.1} 
                    step={0.1} 
                    value={dur} 
                    onChange={e=>setDur(Math.max(0.1,+e.target.value||1))}
                  />
                </label>
                <button 
                  className="btn" 
                  disabled={busy} 
                  onClick={()=>run(()=>trimVideo(item.id,start,dur))}
                >
                  {busy?"Processing…":"Trim & Save"}
                </button>
              </div>
            )}

            {tab==="crop" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">X
                  <input className="input mt-1" type="number" value={cx} onChange={e=>setCx(+e.target.value||0)} />
                </label>
                <label className="text-sm">Y
                  <input className="input mt-1" type="number" value={cy} onChange={e=>setCy(+e.target.value||0)} />
                </label>
                <label className="text-sm">Width
                  <input className="input mt-1" type="number" value={cw} onChange={e=>setCw(+e.target.value||item.width)} />
                </label>
                <label className="text-sm">Height
                  <input className="input mt-1" type="number" value={ch} onChange={e=>setCh(+e.target.value||item.height)} />
                </label>
                <button 
                  className="btn col-span-2" 
                  disabled={busy} 
                  onClick={()=>run(()=>cropVideo(item.id,cx,cy,cw,ch))}
                >
                  {busy?"Processing…":"Crop & Save"}
                </button>
              </div>
            )}

            {tab==="resize" && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">Width
                  <input className="input mt-1" type="number" value={rw} onChange={e=>setRw(+e.target.value||item.width)} />
                </label>
                <label className="text-sm">Height
                  <input className="input mt-1" type="number" value={rh} onChange={e=>setRh(+e.target.value||item.height)} />
                </label>
                <label className="text-sm">Fit
                  <select className="input mt-1" value={fit} onChange={e=>setFit(e.target.value as any)}>
                    <option value="contain">contain (pad)</option>
                    <option value="cover">cover (crop)</option>
                    <option value="stretch">stretch</option>
                  </select>
                </label>
                <label className="text-sm">Pad color (contain)
                  <input className="input mt-1" value={bg} onChange={e=>setBg(e.target.value)} placeholder="black"/>
                </label>
                <button 
                  className="btn col-span-2" 
                  disabled={busy} 
                  onClick={()=>run(()=>resizeVideo(item.id,rw,rh,fit,bg))}
                >
                  {busy?"Processing…":"Resize & Save"}
                </button>
              </div>
            )}

            {tab==="speed" && (
              <div className="space-y-2">
                <label className="text-sm">Speed factor (0.25–4)
                  <input 
                    className="input mt-1" 
                    type="number" 
                    min={0.25} 
                    max={4} 
                    step={0.05} 
                    value={speed} 
                    onChange={e=>setSpeed(+e.target.value||1)} 
                  />
                </label>
                <button 
                  className="btn" 
                  disabled={busy} 
                  onClick={()=>run(()=>speedVideo(item.id,speed))}
                >
                  {busy?"Processing…":"Apply Speed & Save"}
                </button>
              </div>
            )}

            {tab==="volume" && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button 
                    className="btn" 
                    disabled={busy} 
                    onClick={()=>run(()=>muteVideo(item.id))}
                  >
                    Mute
                  </button>
                </div>
                <label className="text-sm">Gain (dB, -30 to +30)
                  <input 
                    className="input mt-1" 
                    type="number" 
                    min={-30} 
                    max={30} 
                    step={0.5} 
                    value={gainDb} 
                    onChange={e=>setGainDb(+e.target.value||0)} 
                  />
                </label>
                <button 
                  className="btn" 
                  disabled={busy} 
                  onClick={()=>run(()=>volumeVideo(item.id,gainDb))}
                >
                  {busy?"Processing…":"Set Volume & Save"}
                </button>
              </div>
            )}

            {tab==="overlay" && (
              <div className="space-y-2">
                <label className="text-sm">Overlay image
                  <select className="input mt-1" value={overlayId} onChange={e=>setOverlayId(e.target.value)}>
                    <option value="">— choose image —</option>
                    {images.map(img => <option key={img.id} value={img.id}>{img.filename}</option>)}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">X (expr or px)
                    <input className="input mt-1" value={ox} onChange={e=>setOx(e.target.value)} />
                  </label>
                  <label className="text-sm">Y (expr or px)
                    <input className="input mt-1" value={oy} onChange={e=>setOy(e.target.value)} />
                  </label>
                  <label className="text-sm">Overlay width (px)
                    <input className="input mt-1" type="number" value={ow} onChange={e=>setOw(+e.target.value||0)} />
                  </label>
                  <label className="text-sm">Overlay height (px)
                    <input className="input mt-1" type="number" value={oh} onChange={e=>setOh(+e.target.value||0)} />
                  </label>
                  <label className="text-sm col-span-2">Opacity
                    <input 
                      className="w-full" 
                      type="range" 
                      min={0} 
                      max={1} 
                      step={0.01} 
                      value={opacity} 
                      onChange={e=>setOpacity(+e.target.value)} 
                    />
                  </label>
                </div>
                <button 
                  className="btn" 
                  disabled={busy || !overlayId} 
                  onClick={()=>run(()=>overlayImageOnVideo(item.id, overlayId, { 
                    x:ox, y:oy, 
                    overlay_width: ow||undefined, 
                    overlay_height: oh||undefined, 
                    opacity 
                  }))}
                >
                  {busy?"Processing…":"Overlay & Save"}
                </button>
                <p className="text-xs text-neutral-500">
                  Tips: Use <code>W</code>/<code>H</code> (video dims) and <code>w</code>/<code>h</code> (overlay) in expressions, e.g. <code>W-w-20</code>, <code>H-h-20</code>, <code>(W-w)/2</code>.
                </p>
              </div>
            )}

            {tab==="concat" && (
              <div className="space-y-2">
                <p className="text-xs text-neutral-400">Pick clips to stitch (current is pre-selected).</p>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-auto">
                  {videos.map(v => (
                    <label key={v.id} className="relative">
                      <input 
                        type="checkbox" 
                        className="absolute top-1 left-1 z-10" 
                        checked={concatIds.includes(v.id)} 
                        onChange={e=>{
                          setConcatIds(prev => e.target.checked ? [...prev, v.id] : prev.filter(x=>x!==v.id));
                        }}
                      />
                      <video 
                        src={`${API_BASE_URL}${v.url}`} 
                        className="rounded border border-neutral-800" 
                        muted 
                      />
                    </label>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-sm">Target width (opt)
                    <input 
                      className="input mt-1" 
                      type="number" 
                      value={targetW ?? ""} 
                      onChange={e=>setTargetW(e.target.value?+e.target.value:undefined)} 
                    />
                  </label>
                  <label className="text-sm">Target height (opt)
                    <input 
                      className="input mt-1" 
                      type="number" 
                      value={targetH ?? ""} 
                      onChange={e=>setTargetH(e.target.value?+e.target.value:undefined)} 
                    />
                  </label>
                </div>
                <button 
                  className="btn" 
                  disabled={busy || concatIds.length<2} 
                  onClick={()=>run(()=>concatVideos(concatIds, targetW, targetH))}
                >
                  {busy?"Processing…":"Concat & Save"}
                </button>
              </div>
            )}

            {err && <div className="text-red-400 text-sm">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}