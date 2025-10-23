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

  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const lastDistanceRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const startY = useRef(0);
  const currentY = useRef(0);
  const threshold = options.threshold ?? 80;
  const disabled = options.disabled ?? false;

  const onRefreshRef = useRef(options.onRefresh);
  useEffect(() => {
    onRefreshRef.current = options.onRefresh;
  }, [options.onRefresh]);

  useEffect(() => {
    isRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    if (disabled) {
      isPullingRef.current = false;
      lastDistanceRef.current = 0;
      setIsPulling(false);
      setPullDistance(0);
    }
  }, [disabled]);

  useEffect(() => {
    const cancelFrame = () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };

    const container = containerRef.current;
    if (!container || disabled) {
      cancelFrame();
      return;
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (container.scrollTop > 0 || isRefreshingRef.current) {
        return;
      }

      startY.current = e.touches[0].clientY;
      lastDistanceRef.current = 0;
      isPullingRef.current = true;
      setIsPulling(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) {
        return;
      }

      if (container.scrollTop > 0) {
        isPullingRef.current = false;
        setIsPulling(false);
        setPullDistance(0);
        lastDistanceRef.current = 0;
        return;
      }

      currentY.current = e.touches[0].clientY;
      const distance = Math.max(0, currentY.current - startY.current);

      // Apply resistance as we pull further
      const resistance = Math.min(1, distance / (threshold * 3));
      const adjustedDistance = distance * (1 - resistance * 0.5);

      if (distance > 10) {
        e.preventDefault();

        lastDistanceRef.current = adjustedDistance;
        if (rafIdRef.current != null) {
          cancelAnimationFrame(rafIdRef.current);
        }
        rafIdRef.current = requestAnimationFrame(() => {
          setPullDistance(adjustedDistance);
        });
      }
    };

    const handleTouchEnd = async () => {
      if (!isPullingRef.current) {
        return;
      }

      isPullingRef.current = false;
      setIsPulling(false);

      cancelFrame();

      const distance = lastDistanceRef.current;
      lastDistanceRef.current = 0;

      if (distance >= threshold && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);

        try {
          if ('vibrate' in navigator) {
            navigator.vibrate(20);
          }

          await onRefreshRef.current?.();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          isRefreshingRef.current = false;
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
      cancelFrame();
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [containerRef, disabled, threshold]);

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    pullProgress: Math.min(1, pullDistance / threshold)
  };
}
