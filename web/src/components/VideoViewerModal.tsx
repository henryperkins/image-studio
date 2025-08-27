import { useState, useRef, useEffect, useCallback } from 'react';
import { type LibraryItem, API_BASE_URL, isVideoItem } from '../lib/api';
import { useMediaActions } from '../hooks/useMediaActions';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, AlertCircle, Scissors, Trash2, Download as DownloadIcon, Clipboard } from 'lucide-react';
import { createPortal } from 'react-dom';

type Props = {
  items: LibraryItem[];
  currentItemId: string;
  onClose: () => void;
  onEdit: (id: string) => void;
  onNavigate: (id: string) => void;
  onRefresh: () => Promise<void>;
  baseUrl?: string;
};

export default function VideoViewerModal({
  items,
  currentItemId,
  onClose,
  onEdit,
  onNavigate,
  onRefresh,
  baseUrl = API_BASE_URL
}: Props) {
  const videos = items.filter(isVideoItem);
  const currentIndex = videos.findIndex(i => i.id === currentItemId);
  const item = videos[currentIndex];

  const [showControls, setShowControls] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const { handleDelete, handleDownload, handleCopyPrompt, deletingIds } = useMediaActions({
    onRefresh,
    onViewImage: () => {},
    onEditImage: () => {},
    onEditVideo: onEdit,
    onUseInSora: () => {},
    baseUrl
  });

  const isDeleting = item ? deletingIds.has(item.id) : false;

  // Auto-hide controls after 3 seconds of no mouse movement
  const resetControlsTimeout = useCallback(() => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    setShowControls(true);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  }, [isPlaying]);

  // Handle mouse movement
  useEffect(() => {
    const handleMouseMove = () => {
      resetControlsTimeout();
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [resetControlsTimeout]);

  // Delete handler with confirmation
  const handleDeleteWithConfirm = useCallback(async () => {
    if (!item) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }

    const success = await handleDelete(item);
    if (success) {
      // Navigate to next/prev video or close
      if (videos.length > 1) {
        const nextIndex = currentIndex < videos.length - 1 ? currentIndex + 1 : currentIndex - 1;
        if (nextIndex >= 0 && nextIndex < videos.length) {
          onNavigate(videos[nextIndex].id);
        }
      } else {
        onClose();
      }
    }
  }, [item, confirmDelete, handleDelete, videos, currentIndex, onNavigate, onClose]);

  // Keyboard navigation and focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(videos[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < videos.length - 1) {
        onNavigate(videos[currentIndex + 1].id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
        handleDeleteWithConfirm();
      } else if (e.key === ' ' && videoRef.current) {
        e.preventDefault();
        if (videoRef.current.paused) {
          videoRef.current.play();
        } else {
          videoRef.current.pause();
        }
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
  }, [currentIndex, videos, onClose, item, onNavigate, handleDeleteWithConfirm]);

  // Auto-play when video loads
  useEffect(() => {
    if (videoRef.current && !videoError) {
      videoRef.current.play().catch(() => {});
    }
  }, [currentItemId, videoError]);

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
        onMouseMove={resetControlsTimeout}
      >
        {/* Navigation and close buttons */}
        <div className={`absolute top-4 left-4 right-4 z-50 flex justify-between transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex gap-2">
            {currentIndex > 0 && (
              <Button
                size="icon"
                className="rounded-full w-10 h-10 bg-black/70 hover:bg-black/90 text-white border border-white/10"
                onClick={() => onNavigate(videos[currentIndex - 1].id)}
                aria-label="Previous video"
              >
                <ChevronLeft className="w-6 h-6" />
              </Button>
            )}
            {currentIndex < videos.length - 1 && (
              <Button
                size="icon"
                className="rounded-full w-10 h-10 bg-black/70 hover:bg-black/90 text-white border border-white/10"
                onClick={() => onNavigate(videos[currentIndex + 1].id)}
                aria-label="Next video"
              >
                <ChevronRight className="w-6 h-6" />
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <span className="bg-black/70 text-white rounded-full px-3 py-2 flex items-center text-sm">
              {currentIndex + 1} / {videos.length}
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

        {/* Main video */}
        <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          {videoError ? (
            <div className="text-center text-neutral-400">
              <AlertCircle className="w-16 h-16 mx-auto mb-4" />
              <p>Failed to load video</p>
            </div>
          ) : (
            <video
              ref={videoRef}
              src={`${baseUrl}${item.url}`}
              className="max-w-full max-h-full object-contain rounded-lg"
              controls
              autoPlay
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onError={() => setVideoError(true)}
            />
          )}
        </div>

        {/* Controls area */}
        <div className={`absolute bottom-4 left-1/2 transform -translate-x-1/2 z-50 transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="flex gap-2">
            <Button
              className="bg-black/70 hover:bg-black/90 text-white rounded-lg border border-white/10"
              onClick={() => onEdit(item.id)}
            >
              <Scissors className="w-4 h-4 mr-1" /> Trim
            </Button>
            <Button
              variant="destructive"
              className={`${confirmDelete ? '' : 'bg-black/70 hover:bg-black/90 text-white border border-white/10'}`}
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
        </div>

        {/* Video metadata */}
        {item.prompt && (
          <div className={`absolute top-20 left-4 max-w-md bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-sm transition-opacity duration-300 ${showControls ? 'opacity-100' : 'opacity-0'}`}>
            <div className="font-medium mb-1">Prompt:</div>
            <div className="text-neutral-300">{item.prompt}</div>
            <div className="text-xs text-neutral-400 mt-2">
              Duration: {item.duration}s • {item.width}×{item.height}
            </div>
          </div>
        )}
      </div>
    </>,
    document.body
  );
}
