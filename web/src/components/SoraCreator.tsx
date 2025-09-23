import { useMemo, useState, useRef, useEffect } from 'react';
import { analyzeImages, generateVideoWithProgress, getSoraVideoContent } from '../lib/api';
import { base64ToBlob } from '@/lib/base64';
import { X } from 'lucide-react';
import SoraJobsPanel from './SoraJobsPanel';
import { processApiError } from '../lib/errorUtils';
import { useToast } from '../contexts/ToastContext';
import EnhancedVisionAnalysis from './EnhancedVisionAnalysis';
import { Skeleton } from './ui/skeleton';
import { Progress } from './ui/progress';
import { Button } from './ui/button';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { Input } from './ui/input';
import { Card, CardContent } from './ui/card';
import { Switch } from './ui/switch';
import { ScrollArea } from './ui/scroll-area';
import { Checkbox } from './ui/checkbox';
import AnalysisViewer from './AnalysisViewer';
import SoraPromptDisplay from './SoraPromptDisplay';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select';

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
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState<'idle'|'submitting'|'generating'|'downloading'|'finalizing'>('idle');
  const [analyzingImages, setAnalyzingImages] = useState(false);
  const [showEnhancedAnalysis, setShowEnhancedAnalysis] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoDataRef = useRef<string|null>(null);
  const { showToast } = useToast();

  // Simple stepper state
  const currentStep = useMemo(() => {
    if (videoUrl) return 4;
    if (busy) return 3;
    if (prompt.trim() || analysisData) return 2;
    return 1;
  }, [videoUrl, busy, prompt, analysisData]);

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
      
      // Store structured data for new display component
      setAnalysisData({
        suggested_prompt: result.generation_guidance.suggested_prompt,
        style_keywords: result.generation_guidance.style_keywords,
        scene_description: result.content.scene_description,
        // Extract additional fields if available from metadata or technical params
        motion_elements: result.metadata.processing_notes
          .filter((note: string) => note.includes('motion') || note.includes('movement'))
          .slice(0, 3),
        camera_technique: (result.generation_guidance.technical_parameters as any)?.camera_movement,
        duration_recommendation: (result.generation_guidance.technical_parameters as any)?.recommended_duration
      });
      
      // Keep legacy format for backward compatibility
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
      const result = await analyzeImages(selectedIds, {
        purpose: 'Sora video prompt creation',
        detail: 'detailed',
        tone: 'creative',
        audience: 'technical'
      });
      
      // Store enhanced structured data
      setAnalysisData({
        suggested_prompt: result.generation_guidance.suggested_prompt,
        style_keywords: result.generation_guidance.style_keywords,
        motion_elements: result.metadata.processing_notes
          .filter((note: string) => note.includes('motion') || note.includes('movement'))
          .slice(0, 5),
        camera_technique: (result.generation_guidance.technical_parameters as any)?.camera_movement ||
                         'Slow push in with shallow depth of field',
        style_notes: result.generation_guidance.style_keywords?.join(', '),
        duration_recommendation: (result.generation_guidance.technical_parameters as any)?.recommended_duration ||
                                '10-15 seconds'
      });
      
      // Auto-insert the prompt
      setPrompt(prev => prev + (prev ? '\n\n' : '') + result.generation_guidance.suggested_prompt);
      showToast('Advanced Sora prompt generated!', 'success');
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

      // Convert large base64 payload to Blob without blocking the main thread
      const blob = await base64ToBlob(data.video_base64, 'video/mp4');
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

  // Open an existing generation (from jobs panel)
  async function openGeneration(generationId: string) {
    try {
      const r = await getSoraVideoContent(generationId, 'high');
      const blob = await base64ToBlob(r.video_base64, r.content_type || 'video/mp4');
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

      {/* Stepper */}
      <ol className="grid grid-cols-4 gap-2 text-xs">
        {[{ n: 1, l: 'Analyze' }, { n: 2, l: 'Prompt' }, { n: 3, l: 'Generate' }, { n: 4, l: 'Review' }].map((s) => (
          <li key={s.n} className={`flex items-center gap-2 rounded-md px-2 py-1 border ${currentStep > s.n ? 'bg-neutral-800/60 border-neutral-700 text-neutral-200' : currentStep === s.n ? 'bg-accent/20 border-accent text-accent-foreground' : 'bg-neutral-900/40 border-neutral-800 text-neutral-400'}`}>
            <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-semibold ${currentStep >= s.n ? 'bg-primary text-white' : 'bg-neutral-700 text-neutral-300'}`}>{s.n}</span>
            <span className="truncate">{s.l}</span>
          </li>
        ))}
      </ol>

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
            {analyzingImages ? 'Generating advanced prompt…' : `Generate Sora Prompt (advanced) for ${selectedIds.length} image${selectedIds.length > 1 ? 's' : ''}`}
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

  {!!analysisData && !analyzingImages && (
    <SoraPromptDisplay 
      data={analysisData}
      onInsertPrompt={(prompt) => {
        setPrompt(p => p + (p ? '\n\n' : '') + prompt);
        showToast('Prompt inserted', 'success');
      }}
      className="fade-in"
    />
  )}
  
  {/* Fallback to legacy viewer if no structured data */}
  {!analysisData && !!analysis && !analyzingImages && (
    <AnalysisViewer summaryText={analysis} className="fade-in" />
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
                      <X className="w-3 h-3" />
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
                    <X className="w-3 h-3" />
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

      {/* Sticky action bar to keep the primary CTA visible */}
      <div className="sticky bottom-0 z-30 bg-background/80 supports-[backdrop-filter]:bg-background/60 backdrop-blur border-t border-neutral-800 py-2">
        <div className="flex items-center gap-2">
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
        </div>
      </div>

      {busy && (
        <div className="space-y-1" role="status" aria-live="polite">
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
                      const blob = await base64ToBlob(r.video_base64, r.content_type || 'video/mp4');
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
                      const blob = await base64ToBlob(r.video_base64, r.content_type || 'video/mp4');
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
    </div>
  );
}
