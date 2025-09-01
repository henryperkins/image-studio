import { useEffect, useRef, useState } from 'react';

interface PullToRefreshOptions {
  onRefresh: () => void | Promise<void>;
  threshold?: number;
  disabled?: boolean;
}

export function usePullToRefresh<T extends HTMLElement>(
  containerRef: React.RefObject<T | null>,
  options: PullToRefreshOptions
) {
  const [isPulling, setIsPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startY = useRef(0);
  const currentY = useRef(0);
  const threshold = options.threshold || 80;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || options.disabled) return;

    let rafId: number | null = null;

    const handleTouchStart = (e: TouchEvent) => {
      // Only trigger if we're at the top of the scrollable area
      if (container.scrollTop > 0) return;

      startY.current = e.touches[0].clientY;
      setIsPulling(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling || isRefreshing) return;
      if (container.scrollTop > 0) {
        setIsPulling(false);
        setPullDistance(0);
        return;
      }

      currentY.current = e.touches[0].clientY;
      const distance = Math.max(0, currentY.current - startY.current);

      // Apply resistance as we pull further
      const resistance = Math.min(1, distance / (threshold * 3));
      const adjustedDistance = distance * (1 - resistance * 0.5);

      if (distance > 10) {
        e.preventDefault(); // Prevent scroll when pulling

        // Use RAF for smooth animation
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          setPullDistance(adjustedDistance);
        });
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling || isRefreshing) return;

      setIsPulling(false);

      if (pullDistance >= threshold) {
        setIsRefreshing(true);

        try {
          // Trigger haptic feedback
          if ('vibrate' in navigator) {
            navigator.vibrate(20);
          }

          await options.onRefresh();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          setIsRefreshing(false);
        }
      }

      setPullDistance(0);
      startY.current = 0;
      currentY.current = 0;
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef, isPulling, pullDistance, isRefreshing, threshold, options]);

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    pullProgress: Math.min(1, pullDistance / threshold)
  };
}
