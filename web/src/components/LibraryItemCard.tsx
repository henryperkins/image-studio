import { useState, useRef, memo } from 'react';
import { LibraryItem, isVideoItem, API_BASE_URL } from '../lib/api';
import MediaContextMenu, { MediaAction } from './MediaContextMenu';

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = isVideoItem(item);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setShowContextMenu(true);
  };

  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isVideo && videoRef.current && !hasError) {
      const playPromise = videoRef.current.play();
      if (playPromise) {
        playPromise.catch(() => {});
      }
    }
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
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
        {/* Selection checkbox */}
        {!isVideo && (
          <input
            type="checkbox"
            className="absolute top-1 left-1 md:top-2 md:left-2 z-20 w-6 h-6 md:w-5 md:h-5 rounded cursor-pointer appearance-none bg-neutral-800/80 border-2 border-neutral-600 checked:bg-blue-500 checked:border-blue-500 transition-all duration-200 hover:border-neutral-400 checked:hover:bg-blue-400"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(item.id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            aria-label={`Select ${item.prompt || 'image'}`}
          />
        )}

        {/* Quick actions (visible on hover) */}
        <div className={`absolute top-1 right-1 md:top-2 md:right-2 z-20 flex gap-1 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
          <button
            className="bg-black/70 hover:bg-black/90 text-white text-xs rounded px-2 py-1 transition"
            onClick={(e) => {
              e.stopPropagation();
              onAction('edit', item);
            }}
            title="Edit"
            aria-label="Edit"
          >
            ✎
          </button>
          <button
            className="bg-black/70 hover:bg-black/90 text-white text-xs rounded px-2 py-1 transition"
            onClick={(e) => {
              e.stopPropagation();
              setContextMenuPos({ x: e.clientX, y: e.clientY });
              setShowContextMenu(true);
            }}
            title="More actions"
            aria-label="More actions"
          >
            ⋯
          </button>
        </div>

        {/* Selection checkmark overlay */}
        {!isVideo && selected && (
          <svg
            className="absolute top-1 left-1 md:top-2 md:left-2 w-6 h-6 md:w-5 md:h-5 text-white pointer-events-none z-30"
            viewBox="0 0 20 20"
          >
            <path
              fill="currentColor"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
            />
          </svg>
        )}

        {/* Video duration badge */}
        {isVideo && (
          <div className="absolute top-1 left-1 md:top-2 md:left-2 z-20 bg-neutral-800/90 backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1 pointer-events-none">
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

        {/* Error state */}
        {hasError && (
          <div className="absolute inset-0 bg-neutral-900 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <svg className="w-8 h-8 text-neutral-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-xs text-neutral-500">Failed to load</p>
              <button
                className="text-xs text-blue-400 hover:text-blue-300 mt-1"
                onClick={(e) => {
                  e.stopPropagation();
                  setHasError(false);
                  setIsLoading(true);
                }}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {/* Media content */}
        {isVideo ? (
          <video
            ref={videoRef}
            src={`${baseUrl}${item.url}`}
            className={`rounded-lg border border-neutral-800 transition-all duration-200 hover:scale-105 w-full h-full object-cover ${hasError ? 'hidden' : ''}`}
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
              selected ? 'ring-2 ring-blue-400 scale-95' : 'hover:scale-105'
            } ${hasError ? 'hidden' : ''}`}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        )}

        {/* Hover tooltip with metadata - positioned above/below based on position */}
        {isHovered && !showContextMenu && item.prompt && (
          <div className="absolute left-0 right-0 mb-2 p-2 bg-black/95 backdrop-blur-sm rounded-lg text-xs text-white pointer-events-none z-40 max-w-[200px]"
               style={{
                 bottom: index < 3 ? 'auto' : '100%',
                 top: index < 3 ? '100%' : 'auto',
                 marginTop: index < 3 ? '8px' : '0'
               }}>
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