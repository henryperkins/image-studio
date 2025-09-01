import React from 'react';
import { RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  pullProgress: number;
}

const PullToRefreshIndicator = React.memo(function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  pullProgress
}: PullToRefreshIndicatorProps) {
  if (pullDistance === 0 && !isRefreshing) return null;

  const opacity = Math.min(1, pullProgress);
  const scale = 0.5 + (pullProgress * 0.5);
  const rotation = pullProgress * 360;

  return (
    <div
      className="absolute top-0 left-1/2 -translate-x-1/2 z-50 pointer-events-none transition-transform"
      style={{
        transform: `translate(-50%, ${Math.min(pullDistance, 100)}px)`,
        opacity
      }}
    >
      <div className="bg-white dark:bg-neutral-800 rounded-full p-3 shadow-lg">
        <RefreshCw
          className={cn(
            'w-6 h-6 text-neutral-600 dark:text-neutral-300',
            isRefreshing && 'animate-spin'
          )}
          style={{
            transform: !isRefreshing ? `rotate(${rotation}deg) scale(${scale})` : undefined,
            transition: 'transform 0.1s ease-out'
          }}
        />
      </div>

      {isRefreshing && (
        <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
          Refreshing...
        </div>
      )}
    </div>
  );
});

export default PullToRefreshIndicator;
