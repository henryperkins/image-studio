import React from 'react';
import { LibraryItem, isVideoItem, API_BASE_URL } from '@/lib/api';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  MoreVertical, 
  Eye, 
  Pencil, 
  Search, 
  Clapperboard, 
  Download as DownloadIcon, 
  Clipboard, 
  Trash2,
  Film,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatBytes, formatDuration, formatRelativeDate } from '@/lib/format';
import type { MediaAction } from '@/hooks/useMediaActions';

interface LibraryListViewProps {
  items: LibraryItem[];
  selectedIds: string[];
  onSelect: (id: string, isSelected: boolean) => void;
  onAction: (action: MediaAction, item: LibraryItem) => void;
  onView: (item: LibraryItem) => void;
  baseUrl: string;
  className?: string;
}

export default function LibraryListView({
  items,
  selectedIds,
  onSelect,
  onAction,
  onView,
  baseUrl,
  className
}: LibraryListViewProps) {
  
  if (items.length === 0) {
    return null;
  }
  
  return (
    <div className={cn('space-y-1', className)}>
      {/* Header row */}
      <div className="hidden md:grid md:grid-cols-[auto_2fr_1fr_120px_120px_80px] gap-4 px-3 py-2 text-xs font-medium text-muted-foreground border-b border-border/40">
        <div className="w-10"></div>
        <div>Name / Prompt</div>
        <div>Type</div>
        <div>Size</div>
        <div>Created</div>
        <div></div>
      </div>
      
      {/* Item rows */}
      <div className="space-y-1">
        {items.map((item) => {
          const isVideo = isVideoItem(item);
          const isSelected = selectedIds.includes(item.id);
          const thumbnailUrl = `${baseUrl}${item.url}`;
          
          return (
            <div
              key={item.id}
              className={cn(
                'group relative flex flex-col md:grid md:grid-cols-[auto_2fr_1fr_120px_120px_80px] gap-2 md:gap-4 p-3 rounded-lg transition-colors',
                'hover:bg-accent/50 cursor-pointer',
                isSelected && 'bg-accent/70 hover:bg-accent/80'
              )}
              onClick={() => onView(item)}
            >
              {/* Checkbox and Thumbnail */}
              <div className="flex items-start md:items-center gap-3" onClick={(e) => e.stopPropagation()}>
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(checked) => onSelect(item.id, !!checked)}
                  aria-label={`Select ${item.filename || item.prompt}`}
                  className="mt-1 md:mt-0"
                />
                <div className="relative w-12 h-12 rounded overflow-hidden bg-muted flex-shrink-0">
                  {isVideo ? (
                    <>
                      <video
                        src={thumbnailUrl}
                        className="w-full h-full object-cover"
                        muted
                        playsInline
                      />
                      <Film className="absolute bottom-1 right-1 w-3 h-3 text-white drop-shadow" />
                    </>
                  ) : (
                    <img
                      src={thumbnailUrl}
                      alt={item.prompt || 'Generated image'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  )}
                </div>
              </div>
              
              {/* Name/Prompt */}
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">
                  {item.filename || 'Untitled'}
                </div>
                {item.prompt && (
                  <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                    {item.prompt}
                  </div>
                )}
              </div>
              
              {/* Type and badges (mobile: inline, desktop: column) */}
              <div className="flex md:flex-col gap-2 text-xs">
                <span className={cn(
                  'inline-flex items-center gap-1 px-2 py-1 rounded-full',
                  isVideo ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'
                )}>
                  {isVideo ? <Film className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
                  {isVideo ? 'Video' : 'Image'}
                </span>
                {isVideo && item.duration && (
                  <span className="text-muted-foreground">
                    {formatDuration(item.duration)}
                  </span>
                )}
                {!isVideo && item.size && (
                  <span className="text-muted-foreground">
                    {item.size.width}×{item.size.height}
                  </span>
                )}
              </div>
              
              {/* File size */}
              <div className="text-xs text-muted-foreground">
                {item.fileSize ? formatBytes(item.fileSize) : '—'}
              </div>
              
              {/* Created date */}
              <div className="text-xs text-muted-foreground">
                {formatRelativeDate(item.createdAt)}
              </div>
              
              {/* Actions dropdown */}
              <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onView(item)}>
                      <Eye className="mr-2 h-4 w-4" />
                      View
                    </DropdownMenuItem>
                    
                    {isVideo ? (
                      <DropdownMenuItem onClick={() => onAction('edit', item)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit / Trim
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuItem onClick={() => onAction('edit', item)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction('analyze', item)}>
                          <Search className="mr-2 h-4 w-4" />
                          Analyze
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onAction('use-in-sora', item)}>
                          <Clapperboard className="mr-2 h-4 w-4" />
                          Use in Sora
                        </DropdownMenuItem>
                      </>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem onClick={() => onAction('download', item)}>
                      <DownloadIcon className="mr-2 h-4 w-4" />
                      Download
                    </DropdownMenuItem>
                    
                    {item.prompt && (
                      <DropdownMenuItem onClick={() => onAction('copy-prompt', item)}>
                        <Clipboard className="mr-2 h-4 w-4" />
                        Copy Prompt
                      </DropdownMenuItem>
                    )}
                    
                    <DropdownMenuSeparator />
                    
                    <DropdownMenuItem 
                      onClick={() => onAction('delete', item)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}