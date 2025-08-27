import { useState, useCallback, useRef, useEffect } from 'react';
import { LibraryItem, deleteLibraryItem, analyzeImages, isVideoItem } from '../lib/api';
import { useToast } from '../contexts/ToastContext';
import { usePromptSuggestions } from '../contexts/PromptSuggestionsContext';

export type MediaAction = 'view' | 'edit' | 'delete' | 'analyze' | 'download' | 'use-in-sora' | 'copy-prompt';

// Constants
const FILE_EXTENSIONS = {
  video: 'mp4',
  image: 'png'
} as const;

const ERROR_MESSAGES = {
  delete: 'Failed to delete item',
  analyze: 'Analysis failed',
  copyPrompt: 'Failed to copy prompt',
  duplicate: 'Duplicate feature coming soon'
} as const;

interface UseMediaActionsProps {
  onRefresh: () => Promise<void>;
  onViewImage: (id: string) => void;
  onEditImage: (id: string) => void;
  onEditVideo: (id: string) => void;
  onUseInSora?: (ids: string[]) => void;
  baseUrl: string;
}

export function useMediaActions({
  onRefresh,
  onViewImage,
  onEditImage,
  onEditVideo,
  onUseInSora,
  baseUrl
}: UseMediaActionsProps) {
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();
  const { addSuggestion } = usePromptSuggestions();
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Abort any in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clear state
      setDeletingIds(new Set());
      setAnalyzingIds(new Set());
    };
  }, []);

  const handleDelete = useCallback(async (item: LibraryItem): Promise<boolean> => {
    // Check and add in one atomic operation
    let wasAdded = false;
    setDeletingIds(prev => {
      if (prev.has(item.id)) {
        return prev;
      }
      wasAdded = true;
      return new Set(prev).add(item.id);
    });
    
    if (!wasAdded) return false;
    
    try {
      await deleteLibraryItem(item.id);
      showToast(`${isVideoItem(item) ? 'Video' : 'Image'} deleted successfully`, 'success');
      await onRefresh();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : ERROR_MESSAGES.delete;
      showToast(`Delete failed: ${message}`, 'error');
      console.error('Delete operation failed:', error);
      return false;
    } finally {
      setDeletingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  }, [onRefresh, showToast]);

  const handleAnalyze = useCallback(async (item: LibraryItem): Promise<void> => {
    if (isVideoItem(item)) return;
    
    // Check and add in one atomic operation
    let wasAdded = false;
    setAnalyzingIds(prev => {
      if (prev.has(item.id)) {
        return prev;
      }
      wasAdded = true;
      return new Set(prev).add(item.id);
    });
    
    if (!wasAdded) return;
    
    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;
    
    try {
      const result = await analyzeImages([item.id], {
        purpose: 'creative prompt generation',
        detail: 'detailed',
        tone: 'creative',
        signal: controller.signal
      } as any);
      
      if (result.generation_guidance?.suggested_prompt) {
        await addSuggestion({
          text: result.generation_guidance.suggested_prompt,
          sourceModel: 'gpt-4.1',
          origin: 'vision-analysis',
          tags: result.content.primary_subjects || [],
          videoId: item.id
        });
        
        // Add variations if available
        if (result.generation_guidance.variations) {
          for (const variation of result.generation_guidance.variations) {
            await addSuggestion({
              text: variation,
              sourceModel: 'gpt-4.1',
              origin: 'remix',
              tags: result.content.primary_subjects || [],
              videoId: item.id
            });
          }
        }
        
        showToast(`Analysis complete! ${result.generation_guidance.variations?.length || 1} suggestions added`, 'success');
      }
    } catch (error) {
      // Don't show error if request was aborted
      if (error instanceof Error && error.name === 'AbortError') {
        console.warn('Analysis aborted');
      } else {
        const message = error instanceof Error ? error.message : ERROR_MESSAGES.analyze;
        showToast(`Analysis failed: ${message}`, 'error');
        console.error('Analysis failed:', error);
      }
    } finally {
      setAnalyzingIds(prev => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
      // Clear abort controller reference
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  }, [addSuggestion, showToast]);

  const handleCopyPrompt = useCallback(async (item: LibraryItem): Promise<void> => {
    if (!item.prompt) {
      showToast('No prompt available to copy', 'error');
      return;
    }
    
    try {
      await navigator.clipboard.writeText(item.prompt);
      showToast('Prompt copied to clipboard', 'success');
    } catch (error) {
      showToast(ERROR_MESSAGES.copyPrompt, 'error');
      console.error('Clipboard operation failed:', error);
    }
  }, [showToast]);

  const handleDownload = useCallback((item: LibraryItem): void => {
    const link = document.createElement('a');
    link.href = `${baseUrl}${item.url}`;
    
    // Use actual format from item if available, otherwise use defaults
    const extension = item.format || (isVideoItem(item) ? FILE_EXTENSIONS.video : FILE_EXTENSIONS.image);
    link.download = item.filename || `${item.id}.${extension}`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('Download started', 'success');
  }, [baseUrl, showToast]);

  const handleAction = useCallback(async (
    action: MediaAction,
    item: LibraryItem
  ): Promise<void> => {
    switch (action) {
      case 'view':
        if (!isVideoItem(item)) {
          onViewImage(item.id);
        }
        break;
        
      case 'edit':
        if (isVideoItem(item)) {
          onEditVideo(item.id);
        } else {
          onEditImage(item.id);
        }
        break;
        
      case 'delete':
        await handleDelete(item);
        break;
        
      case 'analyze':
        await handleAnalyze(item);
        break;
        
      case 'use-in-sora':
        if (!isVideoItem(item) && onUseInSora) {
          onUseInSora([item.id]);
        }
        break;
        
      case 'download':
        handleDownload(item);
        break;
        
      case 'copy-prompt':
        await handleCopyPrompt(item);
        break;
        
      // Removed duplicate case - not implemented
    }
  }, [
    onViewImage,
    onEditImage,
    onEditVideo,
    onUseInSora,
    handleDelete,
    handleAnalyze,
    handleDownload,
    handleCopyPrompt
  ]);

  return {
    handleAction,
    handleDelete,
    handleAnalyze,
    handleCopyPrompt,
    handleDownload,
    deletingIds,
    analyzingIds
  };
}