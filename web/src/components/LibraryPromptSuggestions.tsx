import { useState, useCallback } from 'react';
import { LibraryItem, isVideoItem, analyzeImages, API_BASE_URL } from '../lib/api';
import { usePromptSuggestions } from '../contexts/PromptSuggestionsContext';
import { useToast } from '../contexts/ToastContext';
import { Heading, Text } from '../ui/typography';

interface LibraryPromptSuggestionsProps {
  library: LibraryItem[];
  onInsert: (text: string) => void;
  onSelectItem: (id: string) => void;
}

export default function LibraryPromptSuggestions({ 
  library, 
  onInsert,
  onSelectItem 
}: LibraryPromptSuggestionsProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedForAnalysis, setSelectedForAnalysis] = useState<Set<string>>(new Set());
  const { addSuggestion, suggestions } = usePromptSuggestions();
  const { showToast } = useToast();

  // Group suggestions by source image
  const suggestionsByImage = suggestions.reduce((acc, s) => {
    const sourceId = s.videoId || 'general';
    if (!acc[sourceId]) acc[sourceId] = [];
    acc[sourceId].push(s);
    return acc;
  }, {} as Record<string, typeof suggestions>);

  const handleAnalyzeSelected = useCallback(async () => {
    if (selectedForAnalysis.size === 0) {
      showToast('Select images to analyze', 'error');
      return;
    }

    setAnalyzing(true);
    try {
      const imageIds = Array.from(selectedForAnalysis);
      const result = await analyzeImages(imageIds, {
        purpose: 'creative prompt variations',
        detail: 'comprehensive',
        tone: 'creative'
      });

      // Add main suggestion
      if (result.generation_guidance?.suggested_prompt) {
        await addSuggestion({
          text: result.generation_guidance.suggested_prompt,
          sourceModel: 'gpt-4.1',
          origin: 'vision-analysis',
          tags: result.content?.primary_subjects || [],
          videoId: imageIds[0] // Link to first image
        });
      }

      // Add variations if available (not part of typed schema; access via narrowed any)
      {
        const raw = (result as any)?.generation_guidance?.variations as unknown;
        const rawVariations = Array.isArray(raw) ? (raw as any[]) : [];
        for (const v of rawVariations) {
          const text =
            typeof v === 'string'
              ? v
              : (v && typeof v === 'object' && 'text' in v ? (v as any).text : '');
          if (!text) continue;
          await addSuggestion({
            text,
            sourceModel: 'gpt-4.1',
            origin: 'remix',
            tags: result.content?.primary_subjects || [],
            videoId: imageIds[0]
          });
        }
      }

      {
        const raw = (result as any)?.generation_guidance?.variations as unknown;
        const variationCount = Array.isArray(raw) ? (raw as any[]).length : 0;
        const mainCount = result.generation_guidance?.suggested_prompt ? 1 : 0;
        const count = Math.max(mainCount + variationCount, 1);
        showToast(`Generated ${count} suggestions`, 'success');
      }
      setSelectedForAnalysis(new Set());
    } catch (error) {
      showToast('Analysis failed', 'error');
    } finally {
      setAnalyzing(false);
    }
  }, [selectedForAnalysis, addSuggestion, showToast]);

  const handleRemixPrompts = useCallback(() => {
    const selectedPrompts = library
      .filter(item => selectedForAnalysis.has(item.id))
      .map(item => item.prompt)
      .filter(Boolean);

    if (selectedPrompts.length < 2) {
      showToast('Select at least 2 items to remix', 'error');
      return;
    }

    // Simple remix: combine key phrases
    const words = selectedPrompts.flatMap(p => p!.split(/[,\s]+/));
    const uniqueWords = [...new Set(words)].filter(w => w.length > 3);
    const remixed = uniqueWords.slice(0, 10).join(', ');

    addSuggestion({
      text: remixed,
      sourceModel: 'remix-engine',
      origin: 'remix',
      tags: ['remixed']
    });

    onInsert(remixed);
    showToast('Remix created and inserted', 'success');
    setSelectedForAnalysis(new Set());
  }, [library, selectedForAnalysis, addSuggestion, onInsert, showToast]);

  const images = library.filter(i => !isVideoItem(i));

  return (
    <div className="mt-4 pt-4 border-t border-neutral-800">
      <div className="flex items-center justify-between mb-3">
        <Heading level={4}>Generate from Library</Heading>
        {selectedForAnalysis.size > 0 && (
          <span className="text-xs text-neutral-400">
            {selectedForAnalysis.size} selected
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-3">
        <button
          className="btn btn-sm flex-1"
          onClick={handleAnalyzeSelected}
          disabled={analyzing || selectedForAnalysis.size === 0}
        >
          {analyzing ? '🔄 Analyzing...' : '🔍 Analyze Selected'}
        </button>
        <button
          className="btn btn-sm flex-1"
          onClick={handleRemixPrompts}
          disabled={selectedForAnalysis.size < 2}
        >
          🎨 Remix Prompts
        </button>
      </div>

      {/* Image selector grid - show first 8 images without scroll */}
      <div className="grid grid-cols-4 gap-1 mb-3">
        {images.slice(0, 8).map(item => (
          <div
            key={item.id}
            className={`relative cursor-pointer rounded border-2 transition-all ${
              selectedForAnalysis.has(item.id)
                ? 'border-blue-400 scale-95'
                : 'border-transparent hover:border-neutral-600'
            }`}
            onClick={() => {
              setSelectedForAnalysis(prev => {
                const next = new Set(prev);
                if (next.has(item.id)) {
                  next.delete(item.id);
                } else {
                  next.add(item.id);
                }
                return next;
              });
            }}
            title={item.prompt}
          >
            <img
              src={`${API_BASE_URL}${item.url}`}
              alt={item.prompt || 'Library image'}
              className="w-full h-full object-cover rounded"
              loading="lazy"
            />
            {selectedForAnalysis.has(item.id) && (
              <div className="absolute inset-0 bg-blue-500/20 rounded flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                </svg>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Suggestions grouped by source */}
      {Object.entries(suggestionsByImage).length > 0 && (
        <div className="space-y-2">
          <Text size="xs" tone="muted">Suggestions by source:</Text>
          {Object.entries(suggestionsByImage).map(([sourceId, items]) => {
            const sourceItem = library.find(i => i.id === sourceId);
            return (
              <div key={sourceId} className="bg-neutral-800/30 rounded-lg p-2">
                {sourceItem && (
                  <div className="flex items-center gap-2 mb-2">
                    <img
                      src={`${API_BASE_URL}${sourceItem.url}`}
                      alt=""
                      className="w-8 h-8 rounded object-cover cursor-pointer hover:scale-110 transition-transform"
                      onClick={() => onSelectItem(sourceItem.id)}
                    />
                    <Text size="xs" tone="muted" className="truncate flex-1">
                      From: {sourceItem.prompt?.slice(0, 50)}...
                    </Text>
                  </div>
                )}
                <div className="space-y-1">
                  {items.slice(0, 3).map(s => (
                    <button
                      key={s.id}
                      className="w-full text-left text-xs p-2 bg-neutral-800/50 rounded hover:bg-neutral-700/50 transition-colors truncate"
                      onClick={() => onInsert(s.text)}
                      title={s.text}
                    >
                      {s.text}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}