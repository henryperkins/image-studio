import { useMemo, useState, useRef, useEffect } from 'react';
import { analyzeImages, generateVideoWithProgress, generateSoraPrompt, getSoraVideoContent } from '../lib/api';
import SoraJobsPanel from './SoraJobsPanel';
import { processApiError } from '../lib/errorUtils';
import { useToast } from '../contexts/ToastContext';
import EnhancedVisionAnalysis from './EnhancedVisionAnalysis';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';

export default function SoraCreator({
  selectedIds = [] as string[],
  selectedUrls = [] as string[],
  onRemoveImage,
  prompt,
  setPrompt,
  promptInputRef
}: {
  selectedIds?: string[];
  selectedUrls?: string[];
  onRemoveImage?: (id: string) => void;
  prompt: string;
  setPrompt: React.Dispatch<React.SetStateAction<string>>;
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const [width, setWidth] = useState(1080);
  const [height, setHeight] = useState(1080);
  const [seconds, setSeconds] = useState(10);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [aspectLocked, setAspectLocked] = useState(true);
  const [_aspectRatio, setAspectRatio] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [videoUrl, setVideoUrl] = useState<string|null>(null);
  const [generationId, setGenerationId] = useState<string|null>(null);
  const [currentQuality, setCurrentQuality] = useState<'high' | 'low'>('high');
  const [fetchingQuality, setFetchingQuality] = useState(false);
  const [analysis, setAnalysis] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'idle'|'submitting'|'generating'|'downloading'|'finalizing'>('idle');
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const [showEnhancedAnalysis, setShowEnhancedAnalysis] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoDataRef = useRef<string|null>(null);
  const { showToast } = useToast();

  const finalPrompt = useMemo(() => {
    const base = prompt;
    const refs = selectedUrls.length ? `\n\n[Reference images]\n${selectedUrls.join('\n')}` : '';
    return `${base}${refs}`;
  }, [prompt, selectedUrls]);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      if (videoDataRef.current) {
        URL.revokeObjectURL(videoDataRef.current);
      }
    };
  }, []);

  async function analyze() {
    if (!selectedIds.length) return;
    setAnalyzingImages(true); setError(null);
    try {
      // Use enhanced analysis but with standard parameters for basic mode
      const result = await analyzeImages(selectedIds, {
        purpose: 'Sora video prompt creation',
        detail: 'standard',
        tone: 'casual',
        audience: 'general'
      });
      
      const description = `${result.content.scene_description}\n\nSuggested prompt: ${result.generation_guidance.suggested_prompt}`;
      setAnalysis(description);
      showToast('Images analyzed successfully!', 'success');
    } catch (e:any) {
      const errorMsg = e.message || 'Analyze failed';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setAnalyzingImages(false);
    }
  }

  // Enhanced Sora prompt generation (now uses GPT-5 automatically when available)
  async function generateEnhancedPrompt() {
    if (!selectedIds.length) return;
    setAnalyzingImages(true); setError(null);
    try {
      const soraPrompt = await generateSoraPrompt(selectedIds, {
        detail: 'detailed',
        tone: 'creative',
        audience: 'technical'
      });
      setPrompt(prev => prev + (prev ? '\n\n' : '') + soraPrompt);
      showToast('Advanced Sora prompt generated with GPT-5!', 'success');
    } catch (e: any) {
      const errorMsg = e.message || 'Enhanced analysis failed';
      setError(errorMsg);
      showToast(errorMsg, 'error');
    } finally {
      setAnalyzingImages(false);
    }
  }

  const handleEnhancedPromptGenerated = (generatedPrompt: string) => {
    setPrompt(prev => prev + (prev ? '\n\n' : '') + generatedPrompt);
    showToast('Prompt added from enhanced analysis!', 'success');
  };

  async function generate(isRetry = false) {
    setBusy(true); setError(null);
    setProgress(1);
    setStage('submitting');
    
    // Clean up previous video URL to prevent memory leaks
    if (videoDataRef.current) {
      URL.revokeObjectURL(videoDataRef.current);
      videoDataRef.current = null;
    }
    setVideoUrl(null);

    // Smooth simulated progress up to ~85% while Azure job runs
    // Eases as it approaches the cap so it feels natural.
    setTimeout(() => setStage('generating'), 250);
    const simInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 85) return prev;
        const remaining = 85 - prev;
        const step = Math.max(0.5, remaining * 0.06); // ease toward 85
        return Math.min(85, +(prev + step).toFixed(1));
      });
      return;
    }, 350);

    try {
      const { data } = await generateVideoWithProgress(finalPrompt, width, height, seconds, selectedUrls, { quality }, (loaded, total) => {
        setStage('downloading');
        if (total > 0) {
          const pct = 85 + Math.min(14, Math.floor((loaded / total) * 14));
          setProgress(Math.min(99, pct));
        } else {
          // Unknown size: nudge toward 99% slowly
          setProgress(prev => Math.min(99, prev + 0.5));
        }
      });

      // Create a blob from the base64 data to avoid issues with large data URLs
      const byteCharacters = atob(data.video_base64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      
      setStage('finalizing');
      setGenerationId(data.generation_id || null);
      setCurrentQuality((quality));
      videoDataRef.current = blobUrl;
      setVideoUrl(blobUrl);
      setProgress(100);
      setRetryCount(0);
      showToast('Video generated successfully!', 'success');
    } catch (e:any) {
      const { detailedMessage } = processApiError(e);
      setError(detailedMessage);
      if (isRetry) {
        setRetryCount(prev => prev + 1);
      }
      showToast(detailedMessage, 'error');
    } finally {
      clearInterval(simInterval);
      setStage('idle');
      setBusy(false);
      setTimeout(() => setProgress(0), 800);
    }
  }

  const retry = async () => {
    if (retryCount < 3) {
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      await generate(true);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Create Video (Sora on Azure)</h2>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-neutral-400">Enhanced Analysis</span>
          <Switch
            checked={showEnhancedAnalysis}
            onCheckedChange={setShowEnhancedAnalysis}
            aria-label="Toggle enhanced analysis"
          />
        </div>
      </div>

      {/* Enhanced Vision Analysis */}
      {showEnhancedAnalysis && selectedIds.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <EnhancedVisionAnalysis
              selectedIds={selectedIds}
              onPromptGenerated={handleEnhancedPromptGenerated}
              mode="sora"
            />
          </CardContent>
        </Card>
      )}

      {/* Simplified Analysis Controls */}
      {!showEnhancedAnalysis && selectedIds.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            disabled={!selectedIds.length || busy || analyzingImages}
            onClick={generateEnhancedPrompt}
            className="flex-1"
          >
            {analyzingImages ? 'Generating advanced prompt…' : `Generate Sora Prompt (GPT-5) for ${selectedIds.length} image${selectedIds.length > 1 ? 's' : ''}`}
          </Button>
          <Button
            variant="outline"
            disabled={!selectedIds.length || busy || analyzingImages}
            onClick={analyze}
          >
            {analyzingImages ? 'Analyzing…' : 'Basic Analysis'}
          </Button>
          {analysis && (
            <Button
              variant="outline"
              onClick={() => {
                const promptToInsert = analysis.replace(/^Suggested.*?prompt:\s*/im, '');
                setPrompt(p => p + (p ? '\n\n' : '') + promptToInsert);
                showToast('Analysis inserted into prompt', 'success');
              }}
              disabled={analyzingImages}
            >
              Insert Analysis
            </Button>
          )}
        </div>
      )}

      {analyzingImages && !analysis && (
        <Card className="bg-neutral-950">
          <CardContent className="p-3 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </CardContent>
        </Card>
      )}

      {!!analysis && !analyzingImages && (
        <pre className="rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-xs whitespace-pre-wrap fade-in">
{analysis}
        </pre>
      )}

      <div className="space-y-2">
        <Label htmlFor="video-prompt">Video Description</Label>
        <Textarea
          ref={promptInputRef}
          id="video-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              generate();
            }
          }}
          placeholder="Describe your video…"
          maxLength={2000}
          disabled={busy}
          className="min-h-[112px] resize-y"
          aria-label="Video description prompt"
        />
        <p className="text-xs text-muted-foreground">{prompt.length} / 2000</p>
      </div>

      {selectedUrls.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-neutral-300">
            Using {selectedUrls.length} reference image{selectedUrls.length>1?'s':''}.
          </div>
          {selectedUrls.length >= 8 ? (
            <ScrollArea className="max-h-28 pr-2">
              <div className="flex gap-2 flex-wrap">
                {selectedUrls.map((url, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={url}
                      alt={`Reference ${index + 1}`}
                      className="w-12 h-12 rounded border border-neutral-700 object-cover"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute -top-1 -right-1 w-5 h-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                      onClick={() => {
                        const idToRemove = selectedIds[index];
                        if (idToRemove && onRemoveImage) {
                          onRemoveImage(idToRemove);
                        }
                      }}
                      aria-label={`Remove reference image ${index + 1}`}
                    >
                      ✕
                    </Button>
                  </div>
                ))}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex gap-2 flex-wrap">
              {selectedUrls.map((url, index) => (
                <div key={index} className="relative group">
                  <img
                    src={url}
                    alt={`Reference ${index + 1}`}
                    className="w-12 h-12 rounded border border-neutral-700 object-cover"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute -top-1 -right-1 w-5 h-5 p-0 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    onClick={() => {
                      const idToRemove = selectedIds[index];
                      if (idToRemove && onRemoveImage) {
                        onRemoveImage(idToRemove);
                      }
                    }}
                    aria-label={`Remove reference image ${index + 1}`}
                  >
                    ✕
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setWidth(1080); setHeight(1080); setAspectRatio(1); }}
          >Square 1080×1080</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setWidth(1920); setHeight(1080); setAspectRatio(16/9); }}
          >Landscape 1920×1080</Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setWidth(1280); setHeight(720); setAspectRatio(16/9); }}
          >HD 1280×720</Button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="resolution-select">Resolution</Label>
            <Select 
              value={`${width}x${height}`}
              onValueChange={v => {
                const [w, h] = v.split('x').map(Number);
                setWidth(w);
                setHeight(h);
                setAspectRatio(w / h);
              }} 
            >
              <SelectTrigger id="resolution-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="480x480">480×480 (Square)</SelectItem>
                <SelectItem value="854x480">854×480 (Wide)</SelectItem>
                <SelectItem value="720x720">720×720 (Square)</SelectItem>
                <SelectItem value="1280x720">1280×720 (HD)</SelectItem>
                <SelectItem value="1080x1080">1080×1080 (Square HD)</SelectItem>
                <SelectItem value="1920x1080">1920×1080 (Full HD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
            <Checkbox id="aspect-lock" checked={aspectLocked} onCheckedChange={(v)=>setAspectLocked(!!v)} />
            <Label htmlFor="aspect-lock" className="text-xs text-muted-foreground">Lock aspect ratio</Label>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-1">
            <Label htmlFor="duration-input">Duration (s)</Label>
            <Input 
              id="duration-input"
              type="number" 
              min={1} 
              max={20} 
              value={seconds} 
              onChange={e=>setSeconds(+e.target.value||10)} 
            />
            <p className="text-xs text-muted-foreground">Max 20s, up to 1920×1920</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="quality-select">Quality</Label>
            <Select
              value={quality}
              onValueChange={v => setQuality(v as 'high' | 'low')}
            >
              <SelectTrigger id="quality-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="low">Low</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <Button
        variant="default"
        disabled={!prompt.trim() || busy}
        onClick={() => generate()}
        aria-describedby={!prompt.trim() ? 'video-prompt-required' : undefined}
      >
        {busy ? 'Generating…' : 'Generate'}
      </Button>
      {!prompt.trim() && (
        <span id="video-prompt-required" className="sr-only">Enter a prompt to generate a video</span>
      )}

      {busy && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-neutral-400">
            <span>
              {stage === 'submitting' && 'Submitting job…'}
              {stage === 'generating' && 'Generating on Azure…'}
              {stage === 'downloading' && 'Downloading result…'}
              {stage === 'finalizing' && 'Finalizing…'}
              {stage === 'idle' && 'Working…'}
            </span>
            {progress > 0 ? <span>{Math.round(progress)}%</span> : null}
          </div>
          {progress > 0 ? (
            <Progress value={progress} />
          ) : (
            <Progress />
          )}
        </div>
      )}
      {error && (
        <div className="text-destructive-foreground text-sm fade-in space-y-2">
          <div>{error}</div>
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
      {busy && !videoUrl && (
        <Skeleton className="w-full h-[360px] rounded-xl border border-neutral-800" />
      )}

      {videoUrl && (
        <div className="space-y-2 fade-in">
          {/* Post-generation quality toggle without re-running */}
          {generationId && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-neutral-400">View quality:</span>
              <div className="inline-flex rounded-md overflow-hidden">
                <Button
                  size="sm"
                  variant={currentQuality === 'high' ? 'default' : 'outline'}
                  className="rounded-none rounded-l-md"
                  disabled={fetchingQuality || currentQuality === 'high'}
                  onClick={async () => {
                    if (!generationId) return;
                    setFetchingQuality(true);
                    try {
                      const r = await getSoraVideoContent(generationId, 'high');
                      const bytes = atob(r.video_base64);
                      const arr = new Uint8Array(bytes.length);
                      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                      const blob = new Blob([arr], { type: r.content_type || 'video/mp4' });
                      const url = URL.createObjectURL(blob);
                      if (videoDataRef.current) URL.revokeObjectURL(videoDataRef.current);
                      videoDataRef.current = url;
                      setVideoUrl(url);
                      setCurrentQuality('high');
                    } catch (e:any) {
                      showToast(e.message || 'Failed to fetch high quality', 'error');
                    } finally {
                      setFetchingQuality(false);
                    }
                  }}
                >
                  High
                </Button>
                <Button
                  size="sm"
                  variant={currentQuality === 'low' ? 'default' : 'outline'}
                  className="rounded-none rounded-r-md"
                  disabled={fetchingQuality || currentQuality === 'low'}
                  onClick={async () => {
                    if (!generationId) return;
                    setFetchingQuality(true);
                    try {
                      const r = await getSoraVideoContent(generationId, 'low');
                      const bytes = atob(r.video_base64);
                      const arr = new Uint8Array(bytes.length);
                      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                      const blob = new Blob([arr], { type: r.content_type || 'video/mp4' });
                      const url = URL.createObjectURL(blob);
                      if (videoDataRef.current) URL.revokeObjectURL(videoDataRef.current);
                      videoDataRef.current = url;
                      setVideoUrl(url);
                      setCurrentQuality('low');
                    } catch (e:any) {
                      showToast(e.message || 'Failed to fetch low quality', 'error');
                    } finally {
                      setFetchingQuality(false);
                    }
                  }}
                >
                  Low
                </Button>
              </div>
              {fetchingQuality && <span className="text-neutral-500">Loading…</span>}
            </div>
          )}
          <video
            key={videoUrl}
            ref={videoRef}
            className="w-full h-auto max-h-[80vh] rounded-xl border border-neutral-800 image-hover object-contain"
            src={videoUrl}
            controls
            preload="metadata"
            onError={(e) => {
              console.error('Video playback error:', e);
              setError('Video playback failed. The file may be corrupted.');
            }}
          />
          <Button asChild>
            <a
              href={videoUrl}
              download={`sora_${currentQuality}_${Date.now()}.mp4`}
              onClick={() => showToast('Video downloaded!', 'success')}
            >
              Download MP4
            </a>
          </Button>
        </div>
      )}

      {/* Recent jobs panel */}
      <SoraJobsPanel onOpenGeneration={openGeneration} />
  // Open an existing generation (from jobs panel)
  async function openGeneration(generationId: string) {
    try {
      const r = await getSoraVideoContent(generationId, 'high');
      const bytes = atob(r.video_base64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob = new Blob([arr], { type: r.content_type || 'video/mp4' });
      const url = URL.createObjectURL(blob);
      if (videoDataRef.current) URL.revokeObjectURL(videoDataRef.current);
      videoDataRef.current = url;
      setVideoUrl(url);
      setGenerationId(generationId);
      setCurrentQuality('high');
      showToast('Opened generation', 'success');
    } catch (e: any) {
      showToast(e.message || 'Failed to open generation', 'error');
    }
  }
    </div>
  );
}
