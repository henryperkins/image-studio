import React from 'react';
import { LibraryItem, isVideoItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { X, ArrowLeftRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDuration, formatRelativeDate } from '@/lib/format';

interface LibraryCompareViewProps {
  itemA: LibraryItem;
  itemB: LibraryItem;
  onClose: () => void;
  onSwap?: () => void;
  baseUrl: string;
  className?: string;
}

export default function LibraryCompareView({
  itemA,
  itemB,
  onClose,
  onSwap,
  baseUrl,
  className
}: LibraryCompareViewProps) {
  const isVideoA = isVideoItem(itemA);
  const isVideoB = isVideoItem(itemB);

  return (
    <div className={cn('fixed inset-0 z-50 bg-background/95 backdrop-blur', className)}>
      {/* Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between p-4 border-b border-border/40 bg-background/80 backdrop-blur">
        <h2 className="text-lg font-semibold">Compare Media</h2>
        <div className="flex items-center gap-2">
          {onSwap && (
            <Button
              variant="outline"
              size="sm"
              onClick={onSwap}
              title="Swap items"
            >
              <ArrowLeftRight className="w-4 h-4 mr-2" />
              Swap
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close compare view"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Compare grid */}
      <div className="grid md:grid-cols-2 h-[calc(100vh-4rem)]">
        {/* Item A */}
        <div className="border-r border-border/40 flex flex-col">
          <CompareItem
            item={itemA}
            isVideo={isVideoA}
            baseUrl={baseUrl}
            label="A"
          />
        </div>

        {/* Item B */}
        <div className="flex flex-col">
          <CompareItem
            item={itemB}
            isVideo={isVideoB}
            baseUrl={baseUrl}
            label="B"
          />
        </div>
      </div>
    </div>
  );
}

interface CompareItemProps {
  item: LibraryItem;
  isVideo: boolean;
  baseUrl: string;
  label: string;
}

const isImageLibraryItem = (item: LibraryItem): item is Extract<LibraryItem, { kind: 'image' }> => item.kind === 'image';

function CompareItem({ item, isVideo, baseUrl, label }: CompareItemProps) {
  const mediaUrl = `${baseUrl.replace(/\/+$/, '')}/${item.url.replace(/^\/+/, '')}`;
  const imageItem = isImageLibraryItem(item) ? item : null;

  return (
    <div className="flex flex-col h-full">
      {/* Label badge */}
      <div className="p-4">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary/20 text-primary">
          {label}
        </span>
      </div>

      {/* Media viewer */}
      <div className="flex-1 min-h-0 p-4">
        <div className="h-full flex items-center justify-center bg-muted/20 rounded-lg overflow-hidden">
          {isVideo ? (
            <video
              src={mediaUrl}
              controls
              className="max-w-full max-h-full object-contain"
              playsInline
            />
          ) : (
            <img
              src={mediaUrl}
              alt={item.prompt || 'Generated image'}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </div>

      {/* Metadata */}
      <div className="p-4 space-y-2 border-t border-border/40">
        <div className="space-y-1">
          {item.filename && (
            <div className="text-sm">
              <span className="text-muted-foreground">Name:</span>{' '}
              <span className="font-medium">{item.filename}</span>
            </div>
          )}

          {item.prompt && (
            <div className="text-sm">
              <span className="text-muted-foreground">Prompt:</span>{' '}
              <span className="line-clamp-2">{item.prompt}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span>
              Created: {formatRelativeDate(item.createdAt)}
            </span>

            {isVideoItem(item) && item.duration && (
              <span>
                Duration: {formatDuration(item.duration)}
              </span>
            )}

            {isVideo && 'width' in item && 'height' in item && (
              <span>
                Resolution: {item.width}×{item.height}
              </span>
            )}

            {imageItem && (
              <span>
                Size: {imageItem.size}
              </span>
            )}

            {imageItem && (
              <span>
                Format: {imageItem.format.toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
