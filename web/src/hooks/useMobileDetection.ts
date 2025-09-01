import { useEffect, useState } from 'react';

interface MobileDetection {
  isMobile: boolean;
  isTouch: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  isPWA: boolean;
  hasReducedMotion: boolean;
  screenSize: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
}

export function useMobileDetection(): MobileDetection {
  const [detection, setDetection] = useState<MobileDetection>(() => {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    const isAndroid = /Android/.test(userAgent);
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || 
                  (window.navigator as any).standalone === true;
    const hasReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    
    return {
      isMobile,
      isTouch,
      isIOS,
      isAndroid,
      isPWA,
      hasReducedMotion,
      screenSize: getScreenSize()
    };
  });

  useEffect(() => {
    const handleResize = () => {
      setDetection(prev => ({
        ...prev,
        screenSize: getScreenSize()
      }));
    };

    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMotionChange = (e: MediaQueryListEvent) => {
      setDetection(prev => ({
        ...prev,
        hasReducedMotion: e.matches
      }));
    };

    window.addEventListener('resize', handleResize);
    motionQuery.addEventListener('change', handleMotionChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      motionQuery.removeEventListener('change', handleMotionChange);
    };
  }, []);

  return detection;
}

function getScreenSize(): 'xs' | 'sm' | 'md' | 'lg' | 'xl' {
  const width = window.innerWidth;
  if (width < 640) return 'xs';
  if (width < 768) return 'sm';
  if (width < 1024) return 'md';
  if (width < 1280) return 'lg';
  return 'xl';
}

// Haptic feedback utility
export function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light') {
  if ('vibrate' in navigator) {
    const durations = {
      light: 10,
      medium: 20,
      heavy: 30
    };
    navigator.vibrate(durations[type]);
  }
  
  // iOS Haptic Feedback API (if available in WebKit)
  if ((window as any).webkit?.messageHandlers?.haptic) {
    (window as any).webkit.messageHandlers.haptic.postMessage(type);
  }
}