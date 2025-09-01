import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { 
  Film, 
  Camera, 
  Sparkles, 
  Clock, 
  Copy,
  CheckCircle,
  Info
} from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';

interface SoraPromptData {
  suggested_prompt?: string;
  motion_elements?: string[];
  camera_technique?: string;
  style_notes?: string;
  duration_recommendation?: string;
  // Legacy format support
  scene_description?: string;
  style_keywords?: string[];
}

interface SoraPromptDisplayProps {
  data: SoraPromptData;
  onInsertPrompt?: (prompt: string) => void;
  className?: string;
}

export default function SoraPromptDisplay({ 
  data, 
  onInsertPrompt,
  className = '' 
}: SoraPromptDisplayProps) {
  const [copied, setCopied] = React.useState(false);
  const { showToast } = useToast();

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast('Copied to clipboard', 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Failed to copy', 'error');
    }
  };

  const handleInsert = () => {
    if (onInsertPrompt && data.suggested_prompt) {
      onInsertPrompt(data.suggested_prompt);
      showToast('Prompt inserted', 'success');
    }
  };

  // Parse style notes/keywords
  const styleItems = React.useMemo(() => {
    if (data.style_notes) {
      return data.style_notes.split(',').map(s => s.trim());
    }
    if (data.style_keywords) {
      return data.style_keywords;
    }
    return [];
  }, [data.style_notes, data.style_keywords]);

  return (
  <Card className={`bg-card border-border ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Film className="w-4 h-4" />
          Sora Video Prompt
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Main Prompt */}
        {data.suggested_prompt && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">Generated Prompt</span>
              <div className="flex gap-1">
                <button
                  onClick={() => handleCopy(data.suggested_prompt!)}
                  className="h-6 px-2 inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {copied ? (
                    <CheckCircle className="w-3 h-3" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </button>
                {onInsertPrompt && (
                  <button
                    onClick={handleInsert}
                    className="h-6 px-2 text-xs inline-flex items-center justify-center rounded-md border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    Insert
                  </button>
                )}
              </div>
            </div>
            <div className="bg-card rounded-lg p-3 text-sm leading-relaxed text-card-foreground border border-border/60">
              {data.suggested_prompt}
            </div>
            <div className="text-xs text-muted-foreground">
              {data.suggested_prompt.split(' ').length} words • {data.suggested_prompt.length} characters
            </div>
          </div>
        )}

        {/* Motion Elements */}
        {data.motion_elements && data.motion_elements.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Sparkles className="w-3 h-3" />
              Key Motion Elements
            </div>
            <div className="flex flex-wrap gap-2">
              {data.motion_elements.map((element, i) => (
                <Badge 
                  key={i} 
                  variant="secondary" 
                  className="bg-card text-card-foreground border-border"
                >
                  {element}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Camera Technique */}
        {data.camera_technique && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Camera className="w-3 h-3" />
              Camera Movement
            </div>
            <div className="bg-card rounded-lg p-2 px-3 text-sm text-card-foreground border border-border/60">
              {data.camera_technique}
            </div>
          </div>
        )}

        {/* Style Notes */}
        {styleItems.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wide">
              <Info className="w-3 h-3" />
              Style Keywords
            </div>
            <div className="flex flex-wrap gap-1">
              {styleItems.map((style, i) => (
                <span 
                  key={i}
                  className="px-2 py-1 bg-card rounded text-xs text-card-foreground border border-border/60"
                >
                  {style}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Duration Recommendation */}
        {data.duration_recommendation && (
          <div className="flex items-center gap-2 pt-2 border-t border-border">
            <Clock className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Recommended duration: <span className="text-foreground">{data.duration_recommendation}</span>
            </span>
          </div>
        )}

        {/* Fallback for scene description (legacy) */}
        {!data.suggested_prompt && data.scene_description && (
          <div className="bg-card rounded-lg p-3 text-sm text-card-foreground border border-border/60">
            {data.scene_description}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
