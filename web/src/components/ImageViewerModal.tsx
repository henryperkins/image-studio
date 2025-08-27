import { useState, useRef, useEffect, useCallback } from 'react';
import { type LibraryItem, API_BASE_URL, isVideoItem } from '../lib/api';
import { useMediaActions } from '../hooks/useMediaActions';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, AlertCircle, Pencil, Search, Trash2, Download as DownloadIcon, Clipboard, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

type Props = {
  items: LibraryItem[];
  currentItemId: string;
  onClose: () => void;
  onEdit: (id: string) => void;
  onNavigate: (id: string) => void;
  onRefresh: () => Promise<void>;
  baseUrl?: string;
};

export default function ImageViewerModal({ 
  items, 
  currentItemId, 
  onClose, 
  onEdit, 
  onNavigate,
  onRefresh,
  baseUrl = API_BASE_URL 
}: Props) {
  const images = items.filter(i => !isVideoItem(i));
  const currentIndex = images.findIndex(i => i.id === currentItemId);
  const item = images[currentIndex];
  
  const [showControls, setShowControls] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  
  const { handleDelete, handleAnalyze, handleCopyPrompt, handleDownload, analyzingIds, deletingIds } = useMediaActions({
    onRefresh,
    onViewImage: () => {},
    onEditImage: onEdit,
    onEditVideo: () => {},
    onUseInSora: () => {},
    baseUrl
  });
  
  const isDeleting = item ? deletingIds.has(item.id) : false;
  const isAnalyzing = item ? analyzingIds.has(item.id) : false;
  
  // Keyboard navigation and focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(images[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        onNavigate(images[currentIndex + 1].id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
        handleDeleteWithConfirm();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    // Focus management and body scroll lock
    const previousActiveElement = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
      previousActiveElement?.focus();
    };
  }, [currentIndex, images, onClose, onNavigate, item, handleDeleteWithConfirm]);
  
  const handleDeleteWithConfirm = useCallback(async () => {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    
    const success = await handleDelete(item);
    if (success) {
      // Navigate to next/prev image or close
      if (images.length > 1) {
        const nextIndex = currentIndex < images.length - 1 ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex >= 0 && nextIndex < images.length) {
          onNavigate(images[nextIndex].id);
        }
      } else {
        onClose();
      }
    }
  }, [confirmDelete, item, handleDelete, images, currentIndex, onNavigate, onClose]);
  
  if (!item) return null;
 
  // Use portal to render outside of any parent constraints
  return createPortal(
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/95 backdrop-blur-sm z-50"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal Content */}
      <div 
        className="fixed inset-0 z-50 overflow-hidden"
        onClick={(e) => {
          // Only close if clicking the background, not content
          if (e.target === e.currentTarget) onClose();
        }}
      >
        {/* Navigation and close buttons */}
        <div className="absolute top-4 left-4 right-4 z-50 flex justify-between">
          <div className="flex gap-2">
            {currentIndex > 0 && (
              <Button
                size="icon"
                className="rounded-full w-10 h-10 bg-black/70 hover:bg-black/90 text-white border border-white/10"
                onClick={() => onNavigate(images[currentIndex - 1].id)}
                aria-label="Previous image"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            {currentIndex < images.length - 1 && (
              <Button
                size="icon"
                className="rounded-full w-10 h-10 bg-black/70 hover:bg-black/90 text-white border border-white/10"
                onClick={() => onNavigate(images[currentIndex + 1].id)}
                aria-label="Next image"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            )}
          </div>
          
          <div className="flex gap-2">
            <span className="bg-black/70 text-white rounded-full px-3 py-2 flex items-center text-sm">
              {currentIndex + 1} / {images.length}
            </span>
            <Button
              ref={closeButtonRef}
              size="icon"
              className="rounded-full w-10 h-10 bg-black/70 hover:bg-black/90 text-white border border-white/10"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <X className="w-6 h-6" />
            </Button>
          </div>
        </div>

        {/* Main image */}
        <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          {imageError ? (
            <div className="text-center text-neutral-400">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <p>Failed to load image</p>
            </div>
          ) : (
            <img
              src={`${baseUrl}${item.url}`}
              alt={item.prompt || 'Generated image'}
              className="max-w-full max-h-full object-contain rounded-lg"
              loading="lazy"
              decoding="async"
              onError={() => setImageError(true)}
            />
          )}
        </div>

        {/* Controls area */}
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50">
          {!showControls ? (
            <div className="flex gap-2">
              <Button
                className="bg-black/70 hover:bg-black/90 text-white rounded-lg border border-white/10"
                onClick={() => setShowControls(true)}
              >
                <Pencil className="w-4 h-4 mr-1" /> Edit
              </Button>
              <Button
                className="bg-black/70 hover:bg-black/90 text-white rounded-lg border border-white/10"
                onClick={() => item && handleAnalyze(item)}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Analyzing…</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><Search className="w-4 h-4" /> Analyze</span>
                )}
              </Button>
              <Button
                variant="destructive"
                className={cn(!confirmDelete && 'bg-black/70 hover:bg-black/90 text-white border border-white/10')}
                onClick={handleDeleteWithConfirm}
                disabled={isDeleting}
              >
                {confirmDelete ? (
                  <span className="inline-flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Confirm?</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><Trash2 className="w-4 h-4" /> Delete</span>
                )}
              </Button>
              <Button
                className="bg-black/70 hover:bg-black/90 text-white rounded-lg border border-white/10"
                onClick={() => item && handleDownload(item)}
              >
                <DownloadIcon className="w-4 h-4 mr-1" /> Download
              </Button>
              <Button
                className="bg-black/70 hover:bg-black/90 text-white rounded-lg border border-white/10"
                onClick={() => item && handleCopyPrompt(item)}
              >
                <Clipboard className="w-4 h-4 mr-1" /> Copy Prompt
              </Button>
            </div>
          ) : (
            <div className="bg-black/90 backdrop-blur-md rounded-lg p-4 border border-white/10 animate-slide-up">
              <div className="flex items-center gap-3">
                <Button onClick={() => onEdit(item.id)}>Open Editor</Button>
                <Button variant="secondary" onClick={() => setShowControls(false)}>Cancel</Button>
              </div>
              <div className="mt-3 text-xs text-neutral-400 max-w-xs">
                Click &quot;Open Editor&quot; to edit this image with mask painting and AI-powered inpainting
              </div>
            </div>
          )}
        </div>

        {/* Image metadata */}
        {item.prompt && (
          <div className="absolute top-20 left-4 max-w-md bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-sm">
            <div className="font-medium mb-1">Prompt:</div>
            <div className="text-neutral-300">{item.prompt}</div>
            {item.size && (
              <div className="text-xs text-neutral-400 mt-2">
                {item.size} • {item.format?.toUpperCase()}
              </div>
            )}
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
