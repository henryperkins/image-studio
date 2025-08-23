import { useState, useRef, useEffect } from "react";
import { type LibraryItem, API_BASE_URL, isVideoItem } from "../lib/api";
import Modal from "../components/Modal";
import { useMediaActions } from "../hooks/useMediaActions";

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
  
  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' && currentIndex > 0) {
        onNavigate(images[currentIndex - 1].id);
      } else if (e.key === 'ArrowRight' && currentIndex < images.length - 1) {
        onNavigate(images[currentIndex + 1].id);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && item) {
        handleDeleteWithConfirm();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, images]);
  
  const handleDeleteWithConfirm = async () => {
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
  };
  
  if (!item) return null;
 
  return (
    <Modal
      onClose={onClose}
      ariaLabel="Image viewer"
      initialFocusRef={closeButtonRef as React.RefObject<HTMLElement>}
      overlayClassName="fixed inset-0 bg-black/90 z-40 flex items-center justify-center p-4"
      panelClassName="relative max-w-[90vw] max-h-[90vh] flex flex-col"
    >
        {/* Navigation and close buttons */}
        <div className="absolute top-2 left-2 right-2 z-50 flex justify-between">
          <div className="flex gap-2">
            {currentIndex > 0 && (
              <button
                className="bg-black/70 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200"
                onClick={() => onNavigate(images[currentIndex - 1].id)}
                aria-label="Previous image"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            {currentIndex < images.length - 1 && (
              <button
                className="bg-black/70 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200"
                onClick={() => onNavigate(images[currentIndex + 1].id)}
                aria-label="Next image"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            )}
          </div>
          
          <div className="flex gap-2">
            <span className="bg-black/70 text-white rounded-full px-3 py-2 flex items-center text-sm">
              {currentIndex + 1} / {images.length}
            </span>
            <button
              ref={closeButtonRef}
              className="bg-black/70 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200"
              onClick={onClose}
              aria-label="Close viewer"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main image */}
        <div className="relative flex-1 flex items-center justify-center">
          {imageError ? (
            <div className="text-center text-neutral-400">
              <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p>Failed to load image</p>
            </div>
          ) : (
            <img
              src={`${baseUrl}${item.url}`}
              alt={item.prompt || "Generated image"}
              className="max-w-full max-h-full object-contain rounded-lg"
              style={{ maxHeight: "calc(90vh - 100px)" }}
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
              <button
                className="bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
                onClick={() => setShowControls(true)}
              >
                ✎ Edit
              </button>
              <button
                className="bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
                onClick={() => item && handleAnalyze(item)}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? '🔄 Analyzing...' : '🔍 Analyze'}
              </button>
              <button
                className={`${confirmDelete ? 'bg-red-600/90' : 'bg-black/70'} hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10`}
                onClick={handleDeleteWithConfirm}
                disabled={isDeleting}
              >
                {confirmDelete ? '⚠️ Confirm?' : '🗑️ Delete'}
              </button>
              <button
                className="bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
                onClick={() => item && handleDownload(item)}
              >
                ⬇️ Download
              </button>
              <button
                className="bg-black/70 hover:bg-black/90 text-white px-4 py-2 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
                onClick={() => item && handleCopyPrompt(item)}
              >
                📋 Copy Prompt
              </button>
            </div>
          ) : (
            <div className="bg-black/90 backdrop-blur-md rounded-lg p-4 border border-white/10 animate-slide-up">
              <div className="flex items-center gap-3">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all duration-200"
                  onClick={() => onEdit(item.id)}
                >
                  Open Editor
                </button>
                <button
                  className="bg-neutral-700 hover:bg-neutral-600 text-white px-4 py-2 rounded-lg transition-all duration-200"
                  onClick={() => setShowControls(false)}
                >
                  Cancel
                </button>
              </div>
              <div className="mt-3 text-xs text-neutral-400 max-w-xs">
                Click "Open Editor" to edit this image with mask painting and AI-powered inpainting
              </div>
            </div>
          )}
        </div>

        {/* Image metadata */}
        {item.prompt && (
          <div className="absolute top-4 left-4 max-w-md bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-sm">
            <div className="font-medium mb-1">Prompt:</div>
            <div className="text-neutral-300">{item.prompt}</div>
            {item.size && (
              <div className="text-xs text-neutral-400 mt-2">
                {item.size} • {item.format?.toUpperCase()}
              </div>
            )}
          </div>
        )}
    </Modal>
  );
}
