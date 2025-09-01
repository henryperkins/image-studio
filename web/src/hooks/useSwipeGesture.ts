import { useEffect, useRef } from 'react';

interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  preventScroll?: boolean;
}

export function useSwipeGesture(
  elementRef: React.RefObject<HTMLElement>,
  handlers: SwipeHandlers
) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const isSwiping = useRef<boolean>(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const threshold = handlers.threshold || 50;
    const preventScroll = handlers.preventScroll ?? true;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isSwiping.current = true;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isSwiping.current) return;
      
      touchEndX.current = e.touches[0].clientX;
      touchEndY.current = e.touches[0].clientY;

      // Prevent scrolling while swiping if enabled
      if (preventScroll) {
        const deltaX = Math.abs(touchEndX.current - touchStartX.current);
        const deltaY = Math.abs(touchEndY.current - touchStartY.current);
        
        // If horizontal swipe is dominant, prevent vertical scroll
        if (deltaX > deltaY && deltaX > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = () => {
      if (!isSwiping.current) return;
      isSwiping.current = false;

      const deltaX = touchEndX.current - touchStartX.current;
      const deltaY = touchEndY.current - touchStartY.current;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);

      // Determine if it's a horizontal or vertical swipe
      if (absDeltaX > absDeltaY && absDeltaX > threshold) {
        // Horizontal swipe
        if (deltaX > 0) {
          handlers.onSwipeRight?.();
        } else {
          handlers.onSwipeLeft?.();
        }
      } else if (absDeltaY > absDeltaX && absDeltaY > threshold) {
        // Vertical swipe
        if (deltaY > 0) {
          handlers.onSwipeDown?.();
        } else {
          handlers.onSwipeUp?.();
        }
      }

      // Reset values
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
    };

    const handleTouchCancel = () => {
      isSwiping.current = false;
      touchStartX.current = 0;
      touchStartY.current = 0;
      touchEndX.current = 0;
      touchEndY.current = 0;
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: !preventScroll });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });
    element.addEventListener('touchcancel', handleTouchCancel, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
      element.removeEventListener('touchcancel', handleTouchCancel);
    };
  }, [elementRef, handlers]);
}