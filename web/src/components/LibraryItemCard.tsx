import type React from 'react';
import { useState, useRef, memo } from 'react';
import { LibraryItem, isVideoItem, API_BASE_URL } from '../lib/api';
import MediaContextMenu from './MediaContextMenu';
import type { MediaAction } from '../hooks/useMediaActions';

interface LibraryItemCardProps {
  item: LibraryItem;
  index: number;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onAction: (action: MediaAction, item: LibraryItem) => void;
  onView?: (item: LibraryItem) => void;
  baseUrl?: string;
}

const LibraryItemCard = memo(({
  item,
  index,
  selected,
  onSelect,
  onAction,
  onView,
  baseUrl = API_BASE_URL
}: LibraryItemCardProps) => {
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isTouchDevice] = useState(() => 'ontouchstart' in window);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isVideo = isVideoItem(item);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsHovered(false); // Hide tooltip when context menu opens
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const hoverTimeoutRef = useRef<NodeJS.Timeout>();
  
  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isVideo && videoRef.current && !hasError) {
      // Add delay before playing video to reduce flicker
      hoverTimeoutRef.current = setTimeout(() => {
        if (videoRef.current) {
          const playPromise = videoRef.current.play();
          if (playPromise) {
            playPromise.catch(() => {});
          }
        }
      }, 300);
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
    }
    if (isVideo && videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      onSelect(item.id, !selected);
    } else if (!isVideo && onView) {
      onView(item);
    }
  };

  const formatDate = (date: string) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return d.toLocaleDateString();
  };

  return (
    <>
      <div
        ref={cardRef}
        className="relative cursor-pointer group"
        style={{
          animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`,
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="button"
        aria-label={`${isVideo ? 'Video' : 'Image'}: ${item.prompt || 'Untitled'}`}
        tabIndex={0}
      >
        {/* Selection checkbox with proper touch target */}
        {!isVideo && (
          <label className="absolute top-1 left-1 md:top-2 md:left-2 z-20 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0">
            <input
              type="checkbox"
              className="w-6 h-6 md:w-5 md:h-5 rounded cursor-pointer appearance-none bg-white/90 border-2 border-neutral-400 checked:bg-blue-500 checked:border-blue-500 transition-all duration-200 hover:border-neutral-300 checked:hover:bg-blue-400 shadow-sm"
              checked={selected}
              onChange={(e) => {
                e.stopPropagation();
                onSelect(item.id, e.target.checked);
              }}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select ${item.prompt || 'image'}`}
            />
            {selected && (
              <svg
                className="absolute top-0 left-0 w-6 h-6 md:w-5 md:h-5 text-white pointer-events-none"
                viewBox="0 0 20 20"
              >
                <path
                  fill="currentColor"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                />
              </svg>
            )}
          </label>
        )}

        {/* Quick actions (visible on hover or touch devices) */}
        <div className={`absolute top-1 right-1 md:top-2 md:right-2 z-30 flex gap-1 transition-opacity duration-200 ${(isHovered || isTouchDevice) && !showContextMenu ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <button
            className="bg-black/80 hover:bg-black text-white text-xs rounded-md min-w-[32px] min-h-[32px] md:min-w-[28px] md:min-h-[28px] px-1.5 py-1 flex items-center justify-center transition-colors duration-200 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              onAction('edit', item);
            }}
            title="Edit"
            aria-label="Edit"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            className="bg-black/80 hover:bg-black text-white text-xs rounded-md min-w-[32px] min-h-[32px] md:min-w-[28px] md:min-h-[28px] px-1.5 py-1 flex items-center justify-center transition-colors duration-200 shadow-md"
            onClick={(e) => {
              e.stopPropagation();
              setIsHovered(false);
              setContextMenuPos({ x: e.clientX, y: e.clientY });
              setShowContextMenu(true);
            }}
            title="More actions"
            aria-label="More actions"
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="12" cy="18" r="2" />
            </svg>
          </button>
        </div>


        {/* Video duration badge */}
        {isVideo && (
          <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 z-20 bg-neutral-800/90 backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1 pointer-events-none">
            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            <span className="text-xs text-white font-medium">{(item as any).duration}s</span>
          </div>
        )}

        {/* Loading skeleton */}
        {isLoading && (
          <div className="absolute inset-0 bg-neutral-800 rounded-lg animate-pulse" />
        )}

        {/* Error state - lighter weight for small cards */}
        {hasError && (
          <div className="absolute inset-0 bg-neutral-900/90 rounded-lg flex items-center justify-center z-30 p-2">
            <button
              className="flex flex-col items-center gap-1 hover:bg-neutral-800/50 rounded p-2 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setHasError(false);
                setIsLoading(true);
              }}
              title="Failed to load - Click to retry"
            >
              <svg className="w-6 h-6 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="text-xs text-neutral-400">Retry</span>
            </button>
          </div>
        )}

        {/* Media content */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={`${baseUrl}${item.url}`}
            className={`rounded-lg border border-neutral-800 transition-all duration-200 hover:shadow-lg hover:shadow-blue-500/20 w-full h-full object-cover ${hasError ? 'hidden' : ''}`}
            muted
            loop
            playsInline
            preload="metadata"
            onLoadedMetadata={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : (
          <img
            src={`${baseUrl}${item.url}`}
            alt={item.prompt || `Generated image ${index + 1}`}
            loading="lazy"
            className={`rounded-lg border border-neutral-800 transition-all duration-200 ${
              selected ? 'ring-2 ring-blue-400' : 'hover:shadow-lg hover:shadow-blue-500/20'
            } ${hasError ? 'hidden' : ''}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Hover tooltip with better positioning */}
        {isHovered && !showContextMenu && !isTouchDevice && item.prompt && (
          <div 
            className="absolute left-1/2 -translate-x-1/2 p-2 bg-black/95 backdrop-blur-sm rounded-lg text-xs text-white pointer-events-none z-40 w-max max-w-[min(200px,90vw)] whitespace-normal"
            style={{
              bottom: '100%',
              marginBottom: '8px'
            }}
          >
            <div className="font-medium mb-1 line-clamp-2">{item.prompt}</div>
            <div className="text-neutral-400 text-[10px]">
              {formatDate(item.createdAt)} • {!isVideo && item.size}
              {isVideo && `${(item as any).duration}s`}
            </div>
          </div>
        )}
      </div>

      {/* Context menu */}
      {showContextMenu && (
        <MediaContextMenu
          item={item}
          position={contextMenuPos}
          onClose={() => setShowContextMenu(false)}
          onAction={(action, item) => {
            onAction(action, item);
            if (action === 'delete') {
              // Trigger refresh is handled by parent
            }
          }}
          availableActions={
            isVideo
              ? ['edit', 'delete', 'download', 'copy-prompt']
              : ['view', 'edit', 'delete', 'analyze', 'use-in-sora', 'download', 'copy-prompt']
          }
        />
      )}
    </>
  );
});

LibraryItemCard.displayName = 'LibraryItemCard';

export default LibraryItemCard;