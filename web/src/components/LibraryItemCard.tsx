import type React from 'react';
import { useState, useRef, memo, useMemo } from 'react';
import { LibraryItem, isVideoItem, API_BASE_URL } from '../lib/api';
import { ResilientImage } from './ImageFallback';
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator
} from './ui/context-menu';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Eye, Pencil, Search, Clapperboard, Download as DownloadIcon, Clipboard, Trash2, MoreVertical, Film } from 'lucide-react';
import { Card } from './ui/card';
import { Tooltip, TooltipTrigger, TooltipContent } from './ui/tooltip';
import type { MediaAction } from '../hooks/useMediaActions';

interface LibraryItemCardProps {
  item: LibraryItem;
  index: number;
  selected: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onAction: (action: MediaAction, item: LibraryItem) => void;
  onView?: (item: LibraryItem) => void;
  baseUrl?: string;
  imgWidth?: number;
  imgHeight?: number;
}

const LibraryItemCard = memo(({
  item,
  index,
  selected,
  onSelect,
  onAction,
  onView,
  baseUrl = API_BASE_URL,
  imgWidth,
  imgHeight
}: LibraryItemCardProps) => {
  const [_showContextMenu, setShowContextMenu] = useState(false); // kept for hover/tooltip gating
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const isTouchDevice = useMemo(() => {
    try {
      // Prefer coarse pointer or maxTouchPoints for better accuracy on hybrids
      if (navigator && typeof (navigator as any).maxTouchPoints === 'number') {
        return (navigator as any).maxTouchPoints > 0;
      }
      if (window && 'matchMedia' in window) {
        return window.matchMedia('(pointer: coarse)').matches;
      }
    } catch {}
    return false;
  }, []);
  const [showControls, setShowControls] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const isVideo = isVideoItem(item);

  // Compute a stable aspect ratio for consistent grid heights
  // Use a uniform square aspect ratio for consistent grid rows
  const aspectRatio = '1 / 1';

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsHovered(false);
    setShowContextMenu(true);
  };

  // Ref that stores the pending timeout when hovering videos
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const handleMouseEnter = () => {
    setIsHovered(true);
    if (isVideo) setShowControls(true);
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
    if (isVideo) setShowControls(false);
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
    } else if (onView) {
      // Both images and videos can now be viewed
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
      <ContextMenu onOpenChange={(open)=>setShowContextMenu(open)}>
      <ContextMenuTrigger asChild>
      <Tooltip>
      <TooltipTrigger asChild>
      <Card
        ref={cardRef}
        className="relative cursor-pointer group overflow-hidden bg-neutral-800/40 border-neutral-700 hover:border-purple-500 transition-all duration-200 p-1"
        style={{
          animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`
        }}
        onContextMenu={handleContextMenu}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        role="button"
        aria-label={`${isVideo ? 'Video' : 'Image'}: ${item.prompt || 'Untitled'}`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            handleClick(e as any);
          } else if (e.key === ' ') {
            e.preventDefault();
            if (!isVideo) {
              onSelect(item.id, !selected);
            } else if (onView) {
              onView(item);
            }
          }
        }}
      >
        {/* Selection checkbox with proper touch target */}
        {!isVideo && (
          <label className="absolute top-1 left-1 md:top-2 md:left-2 z-20 min-w-[44px] min-h-[44px] md:min-w-0 md:min-h-0">
            <input
              type="checkbox"
              className="w-6 h-6 md:w-5 md:h-5 rounded cursor-pointer appearance-none bg-white/90 border-2 border-neutral-400 checked:bg-primary checked:border-primary transition-all duration-200 hover:border-neutral-300 checked:hover:bg-primary/90 shadow-sm"
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

        {/* Kebab menu (always visible) */}
        <div className="absolute top-1 right-1 md:top-2 md:right-2 z-30">
          <DropdownMenu>
            {/* Avoid asChild here to reduce composed ref churn under React 19 */}
            <DropdownMenuTrigger
              className="bg-black/80 hover:bg-black text-white text-xs min-w-[44px] min-h-[44px] px-2 py-1.5 rounded-md inline-flex items-center justify-center"
              onClick={(e) => { e.stopPropagation(); setIsHovered(false); }}
              aria-label="More actions"
              title="More actions"
            >
              <MoreVertical className="w-4 h-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('view', item);}}><Eye className="w-4 h-4 mr-2" /> View</DropdownMenuItem>
              <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('edit', item);}}><Pencil className="w-4 h-4 mr-2" /> Edit</DropdownMenuItem>
              {!isVideoItem(item) && (
                <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('analyze', item);}}><Search className="w-4 h-4 mr-2" /> Analyze</DropdownMenuItem>
              )}
              {!isVideoItem(item) && (
                <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('use-in-sora', item);}}><Clapperboard className="w-4 h-4 mr-2" /> Use in Sora</DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('download', item);}}><DownloadIcon className="w-4 h-4 mr-2" /> Download</DropdownMenuItem>
              <DropdownMenuItem onClick={(e)=>{e.stopPropagation(); onAction('copy-prompt', item);}}><Clipboard className="w-4 h-4 mr-2" /> Copy Prompt</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive data-[highlighted]:bg-destructive/10" onClick={(e)=>{e.stopPropagation(); onAction('delete', item);}}><Trash2 className="w-4 h-4 mr-2" /> Delete</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>


        {/* Video duration badge */}
        {isVideo && (
          <div className="absolute bottom-1 left-1 md:bottom-2 md:left-2 z-20 bg-neutral-800/90 backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1 pointer-events-none">
            <Film className="w-4 h-4 text-white" />
            <span className="text-xs text-white font-medium">{(item as any).duration}s</span>
          </div>
        )}

        {/* Primary action overlay (images): keep one visible */}
        {!isVideo && (
          <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 z-30 transition-opacity duration-200 ${ (isHovered || isTouchDevice) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100' }`}>
            <Button
              size="sm"
              className="min-h-[36px] px-3 bg-black/80 text-white hover:bg-black"
              onClick={(e)=>{ e.stopPropagation(); onAction('use-in-sora', item); }}
              aria-label="Use in Sora"
            >
              <Clapperboard className="w-4 h-4 mr-1" /> Use in Sora
            </Button>
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

        {/* Media content in fixed aspect-ratio wrapper */}
        <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio }}>
          {isVideo ? (
            <video
              ref={videoRef}
              src={`${baseUrl}${item.url}`}
              className={`absolute inset-0 rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-purple-500/20 w-full h-full object-cover ${hasError ? 'hidden' : ''}`}
              muted
              loop
              playsInline
              preload="metadata"
              controls={isTouchDevice || showControls}
              onLoadedMetadata={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          ) : (
            <ResilientImage
              src={`${baseUrl}${item.url}`}
              // Provide responsive hints to improve LCP/CLS
              sizes="(min-width: 640px) 33vw, 50vw"
              alt={item.prompt || `Generated image ${index + 1}`}
              className={`absolute inset-0 rounded-lg transition-all duration-200 w-full h-full object-cover ${
                selected ? 'ring-2 ring-purple-500' : 'hover:shadow-lg hover:shadow-purple-500/20'
              } ${hasError ? 'hidden' : ''}`}
              fallbackType="image"
              prompt={item.prompt}
              retryAttempts={3}
              retryDelay={1000}
              decoding="async"
              width={imgWidth}
              height={imgHeight}
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setHasError(true);
              }}
            />
          )}
        </div>

        
      </Card>
      </TooltipTrigger>
      {item.prompt && !isTouchDevice && (
        <TooltipContent side="top" className="w-[240px]">
          <div className="font-medium mb-1 line-clamp-2">{item.prompt}</div>
          <div className="text-neutral-400 text-[10px]">
            {formatDate(item.createdAt)} • {!isVideo && item.size}
            {isVideo && `${(item as any).duration}s`}
          </div>
        </TooltipContent>
      )}
      </Tooltip>
      </ContextMenuTrigger>

      {/* Context menu content (right-click) */}
      <ContextMenuContent>
        <ContextMenuItem onClick={()=>onAction('view', item)}><Eye className="w-4 h-4 mr-2" /> View</ContextMenuItem>
        <ContextMenuItem onClick={()=>onAction('edit', item)}><Pencil className="w-4 h-4 mr-2" /> Edit</ContextMenuItem>
        {!isVideo && (<ContextMenuItem onClick={()=>onAction('analyze', item)}><Search className="w-4 h-4 mr-2" /> Analyze</ContextMenuItem>)}
        {!isVideo && (<ContextMenuItem onClick={()=>onAction('use-in-sora', item)}><Clapperboard className="w-4 h-4 mr-2" /> Use in Sora</ContextMenuItem>)}
        <ContextMenuSeparator />
        <ContextMenuItem onClick={()=>onAction('download', item)}><DownloadIcon className="w-4 h-4 mr-2" /> Download</ContextMenuItem>
        <ContextMenuItem onClick={()=>onAction('copy-prompt', item)}><Clipboard className="w-4 h-4 mr-2" /> Copy Prompt</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem className="text-destructive data-[highlighted]:bg-destructive/10" onClick={()=>onAction('delete', item)}><Trash2 className="w-4 h-4 mr-2" /> Delete</ContextMenuItem>
      </ContextMenuContent>
      </ContextMenu>
    </>
  );
});

LibraryItemCard.displayName = 'LibraryItemCard';

export default LibraryItemCard;
