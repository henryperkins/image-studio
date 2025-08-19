import { useState, useEffect, useRef } from "react";
import { type LibraryItem, API_BASE_URL } from "../lib/api";

type Props = {
  item: LibraryItem & { kind: "image" };
  onClose: () => void;
  onEdit: () => void;
  baseUrl?: string;
};

export default function ImageViewerModal({ item, onClose, onEdit, baseUrl = API_BASE_URL }: Props) {
  const [showControls, setShowControls] = useState(false);
  const [imageError, setImageError] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Keyboard navigation and focus management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    // Store current focus to restore later
    const previouslyFocused = document.activeElement as HTMLElement;
    
    // Focus the close button on mount
    setTimeout(() => closeButtonRef.current?.focus(), 0);

    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      // Restore focus to previously focused element
      previouslyFocused?.focus();
    };
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const modalElement = modalRef.current;
    if (!modalElement) return;

    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    modalElement.addEventListener('keydown', handleTabKey);
    return () => modalElement.removeEventListener('keydown', handleTabKey);
  }, [showControls]);

  return (
    <div 
      ref={modalRef}
      className="fixed inset-0 bg-black/90 z-40 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
    >
      <div 
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          className="absolute top-2 right-2 z-50 bg-black/70 hover:bg-black/90 text-white rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200"
          onClick={onClose}
          aria-label="Close viewer"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

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
            <button
              className="bg-black/70 hover:bg-black/90 text-white px-6 py-3 rounded-lg transition-all duration-200 backdrop-blur-sm border border-white/10"
              onClick={() => setShowControls(true)}
            >
              ✎ Edit
            </button>
          ) : (
            <div className="bg-black/90 backdrop-blur-md rounded-lg p-4 border border-white/10 animate-slide-up">
              <div className="flex items-center gap-3">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-all duration-200"
                  onClick={onEdit}
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
      </div>
    </div>
  );
}