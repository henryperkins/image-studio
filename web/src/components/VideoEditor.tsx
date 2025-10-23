import { useEffect, useMemo, useState, useCallback } from 'react';
import {
  LibraryItem, VideoItem, ImageItem, isVideoItem,
  trimVideo, cropVideo, resizeVideo, speedVideo, muteVideo, volumeVideo,
  overlayImageOnVideo, concatVideos, listLibrary
} from '../lib/api';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

type Props = {
  item: LibraryItem & { kind: 'video' };
  onClose: () => void;
  onEdited: (newId: string) => void;
  baseUrl: string;
};

// Simplified editing UI: three sections instead of seven tabs
type Tab = 'basic' | 'audio' | 'advanced';

export default function VideoEditor({ item, onClose, onEdited, baseUrl }: Props) {
  const [tab, setTab] = useState<Tab>('basic');
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
  const [fit, setFit] = useState<'contain'|'cover'|'stretch'>('contain');
  const [bg, setBg] = useState('black');

  // SPEED
  const [speed, setSpeed] = useState(1);

  // VOLUME
  const [gainDb, setGainDb] = useState(0);

  // OVERLAY
  const [overlayId, setOverlayId] = useState<string>('');
  const [ox, setOx] = useState<string>('W-w-20');
  const [oy, setOy] = useState<string>('H-h-20');
  const [ow, setOw] = useState<number>(Math.round(item.width/5));
  const [oh, setOh] = useState<number>(0);
  const [opacity, setOpacity] = useState(0.85);

  // CONCAT
  const [concatIds, setConcatIds] = useState<string[]>([item.id]);
  const [targetW, setTargetW] = useState<number|undefined>(undefined);
  const [targetH, setTargetH] = useState<number|undefined>(undefined);

  useEffect(() => { listLibrary({ timeoutMs: 15000 }).then(setLibrary).catch(()=>{}); }, []);

  async function run<T extends { library_item: { id: string } }>(fn: () => Promise<T>) {
    setBusy(true); 
    setErr(null);
    try {
      const result = await fn();
      onEdited(result.library_item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Edit failed';
      setErr(message);
    } finally { 
      setBusy(false); 
    }
  }

  const handleFitChange = useCallback((value: string) => {
    if (value === 'contain' || value === 'cover' || value === 'stretch') {
      setFit(value);
    }
  }, []);

  return (
    <Dialog open onOpenChange={(open)=>{ if(!open) onClose(); }}>
      <DialogContent className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto p-0">
      <DialogTitle className="sr-only">Edit Video</DialogTitle>
      <div>
        <div className="flex items-center justify-between p-3 border-b border-neutral-800">
          <div className="font-medium">Edit Video</div>
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        </div>

        {busy && (
          <div className="px-4">
            <div className="w-full bg-neutral-800 rounded-full h-1 overflow-hidden relative">
              <div className="progress-bar progress-bar-indeterminate h-full" />
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-4 p-4">
          <video 
            className="w-full rounded-lg border border-neutral-800" 
            src={`${baseUrl}${item.url}`} 
            controls 
            preload="metadata" 
          />

          <div className="space-y-3">
            {/* Tabs */}
            <Tabs value={tab} onValueChange={(v)=>setTab(v as Tab)}>
              <TabsList className="inline-flex rounded-xl overflow-hidden border border-neutral-700">
                <TabsTrigger value="basic">basic</TabsTrigger>
                <TabsTrigger value="audio">audio</TabsTrigger>
                <TabsTrigger value="advanced">advanced</TabsTrigger>
              </TabsList>
            </Tabs>

            {/* BASIC: Trim, Resize, Crop */}
            {tab === 'basic' && (
              <div className="space-y-4" id="panel-basic" role="tabpanel" aria-labelledby="tab-basic">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Trim</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="start-input">Start (s)</Label>
                      <Input id="start-input" type="number" min={0} step={0.1} value={start} onChange={e=>setStart(Math.max(0,+e.target.value||0))} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="duration-input">Duration (s)</Label>
                      <Input id="duration-input" type="number" min={0.1} step={0.1} value={dur} onChange={e=>setDur(Math.max(0.1,+e.target.value||0.1))} />
                    </div>
                  </div>
                  <Button disabled={busy} onClick={()=>run(()=>trimVideo(item.id,start,dur))}>
                    {busy ? 'Processing…' : 'Apply Trim'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Resize</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="width-input">Width</Label>
                      <Input id="width-input" type="number" value={rw} onChange={e=>setRw(+e.target.value||item.width)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height-input">Height</Label>
                      <Input id="height-input" type="number" value={rh} onChange={e=>setRh(+e.target.value||item.height)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fit-select">Fit</Label>
                      <Select value={fit} onValueChange={handleFitChange}>
                        <SelectTrigger id="fit-select">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="contain">contain (pad)</SelectItem>
                          <SelectItem value="cover">cover (crop)</SelectItem>
                          <SelectItem value="stretch">stretch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bg-color">Pad color (contain)</Label>
                      <Input id="bg-color" value={bg} onChange={e=>setBg(e.target.value)} placeholder="black"/>
                    </div>
                  </div>
                  <Button disabled={busy} onClick={()=>run(()=>resizeVideo(item.id,rw,rh,fit,bg))}>
                    {busy ? 'Processing…' : 'Apply Resize'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Crop</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="crop-x">X</Label>
                      <Input id="crop-x" type="number" value={cx} onChange={e=>setCx(+e.target.value||0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="crop-y">Y</Label>
                      <Input id="crop-y" type="number" value={cy} onChange={e=>setCy(+e.target.value||0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="crop-width">Width</Label>
                      <Input id="crop-width" type="number" value={cw} onChange={e=>setCw(+e.target.value||item.width)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="crop-height">Height</Label>
                      <Input id="crop-height" type="number" value={ch} onChange={e=>setCh(+e.target.value||item.height)} />
                    </div>
                  </div>
                  <Button disabled={busy} onClick={()=>run(()=>cropVideo(item.id,cx,cy,cw,ch))}>
                    {busy ? 'Processing…' : 'Apply Crop'}
                  </Button>
                </div>
              </div>
            )}

            {/* AUDIO: Mute, Volume, Speed */}
            {tab === 'audio' && (
              <div className="space-y-4" id="panel-audio" role="tabpanel" aria-labelledby="tab-audio">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Mute / Volume</div>
                  <div className="flex gap-2">
                    <Button disabled={busy} onClick={()=>run(()=>muteVideo(item.id))}>
                      {busy ? 'Processing…' : 'Mute'}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gain-input">Gain (dB, -30 to +30)</Label>
                    <Input id="gain-input" type="number" min={-30} max={30} step={0.5} value={gainDb} onChange={e=>setGainDb(+e.target.value||0)} />
                  </div>
                  <Button disabled={busy} onClick={()=>run(()=>volumeVideo(item.id,gainDb))}>
                    {busy ? 'Processing…' : 'Set Volume'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Speed</div>
                  <div className="space-y-2">
                    <Label htmlFor="speed-input">Speed factor (0.25–4)</Label>
                    <Input id="speed-input" type="number" min={0.25} max={4} step={0.05} value={speed} onChange={e=>setSpeed(+e.target.value||1)} />
                  </div>
                  <Button disabled={busy} onClick={()=>run(()=>speedVideo(item.id,speed))}>
                    {busy ? 'Processing…' : 'Apply Speed'}
                  </Button>
                </div>
              </div>
            )}

            {/* ADVANCED: Overlay, Concat */}
            {tab === 'advanced' && (
              <div className="space-y-6" id="panel-advanced" role="tabpanel" aria-labelledby="tab-advanced">
                <div className="space-y-2">
                  <div className="text-sm font-medium">Overlay Image</div>
                  <div className="space-y-2">
                    <Label htmlFor="overlay-select">Overlay image</Label>
                    <Select value={overlayId} onValueChange={setOverlayId}>
                      <SelectTrigger id="overlay-select">
                        <SelectValue placeholder="— choose image —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">— choose image —</SelectItem>
                        {images.map(img => <SelectItem key={img.id} value={img.id}>{img.filename}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="overlay-x">X (expr or px)</Label>
                      <Input id="overlay-x" value={ox} onChange={e=>setOx(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overlay-y">Y (expr or px)</Label>
                      <Input id="overlay-y" value={oy} onChange={e=>setOy(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overlay-width">Overlay width (px)</Label>
                      <Input id="overlay-width" type="number" value={ow} onChange={e=>setOw(+e.target.value||0)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="overlay-height">Overlay height (px)</Label>
                      <Input id="overlay-height" type="number" value={oh} onChange={e=>setOh(+e.target.value||0)} />
                    </div>
                    <div className="space-y-2 col-span-2">
                      <Label htmlFor="opacity-slider">Opacity ({opacity})</Label>
                      <Slider id="opacity-slider" min={0} max={1} step={0.01} value={[opacity]} onValueChange={(v) => setOpacity(v[0])} />
                    </div>
                  </div>
                  <Button disabled={busy || !overlayId || overlayId === '_none'} onClick={()=>run(()=>overlayImageOnVideo(item.id, overlayId, { x:ox, y:oy, overlay_width: ow||undefined, overlay_height: oh||undefined, opacity }))}>
                    {busy ? 'Processing…' : 'Apply Overlay'}
                  </Button>
                  <p className="text-xs text-neutral-500">Tips: Use W/H (video) and w/h (overlay) in expressions, e.g. W-w-20, H-h-20, (W-w)/2.</p>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Concat Clips</div>
                  <p className="text-xs text-neutral-400">Pick clips to stitch (current is pre-selected).</p>
                  <div className="grid grid-cols-3 gap-2 max-h-48 overflow-auto">
                    {videos.map(v => (
                      <div key={v.id} className="relative">
                        <Checkbox 
                          className="absolute top-1 left-1 z-10" 
                          checked={concatIds.includes(v.id)} 
                          onCheckedChange={(checked) => {
                            setConcatIds(prev => checked ? [...prev, v.id] : prev.filter(x=>x!==v.id));
                          }}
                        />
                        <video src={`${baseUrl}${v.url}`} className="rounded border border-neutral-800" muted />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="target-width">Target width (opt)</Label>
                      <Input id="target-width" type="number" value={targetW ?? ''} onChange={e=>setTargetW(e.target.value?+e.target.value:undefined)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="target-height">Target height (opt)</Label>
                      <Input id="target-height" type="number" value={targetH ?? ''} onChange={e=>setTargetH(e.target.value?+e.target.value:undefined)} />
                    </div>
                  </div>
                  <Button disabled={busy || concatIds.length<2} onClick={()=>run(()=>concatVideos(concatIds, targetW, targetH))}>
                    {busy ? 'Processing…' : 'Concat & Save'}
                  </Button>
                </div>
              </div>
            )}

            {err && <div className="text-destructive-foreground text-sm">{err}</div>}
          </div>
        </div>
      </div>
      </DialogContent>
    </Dialog>
  );
}
