import { useEffect, useRef, useState } from "react";
import { trimVideo, type LibraryItem } from "../lib/api";

type Props = {
  item: LibraryItem & { kind: "video" };
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

export default function VideoEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(0);
  const [duration, setDuration] = useState(Math.min(5, item.duration));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const v = videoRef.current!;
    const onMeta = () => setDuration(Math.min(5, v.duration || item.duration));
    v.addEventListener("loadedmetadata", onMeta);
    return () => v.removeEventListener("loadedmetadata", onMeta);
  }, [item.id]);

  async function runTrim() {
    setBusy(true);
    try {
      const res = await trimVideo(item.id, start, duration);
      onEdited(res.library_item.id);
    } catch (e) {
      alert((e as any).message || "Trim failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl">
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="font-medium">Edit Video</div>
          <button className="btn" onClick={onClose}>Close</button>
        </div>

        <div className="grid md:grid-cols-2 gap-4 p-4">
          <video ref={videoRef} className="w-full rounded-lg border border-neutral-800" src={`${baseUrl}${item.url}`} controls preload="metadata" />
          <div className="space-y-3">
            <label className="text-sm">Start (s)
              <input className="input mt-1" type="number" min={0} step={0.1} value={start} onChange={e=>setStart(Math.max(0, +e.target.value || 0))} />
            </label>
            <label className="text-sm">Duration (s)
              <input className="input mt-1" type="number" min={0.1} step={0.1} value={duration} onChange={e=>setDuration(Math.max(0.1, +e.target.value || 1))} />
            </label>
            <div className="flex gap-2">
              <button className="btn" disabled={busy} onClick={runTrim}>{busy ? "Processing…" : "Trim & Save"}</button>
            </div>
            <p className="text-xs text-neutral-500">Creates a new clip saved to your library (lossless where possible).</p>
          </div>
        </div>
      </div>
    </div>
  );
}