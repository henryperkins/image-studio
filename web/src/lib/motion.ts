import { cn } from './utils';

/**
 * Returns motion-safe animation classes based on user preferences
 * Falls back to static styles when reduced motion is preferred
 */
export function motionSafe(
  motionClasses: string,
  reducedMotionClasses: string = ''
): string {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return prefersReducedMotion ? reducedMotionClasses : motionClasses;
}

/**
 * Conditionally applies animation classes based on device capabilities
 */
export function performantAnimation(
  className: string,
  options?: {
    mobileOptimized?: boolean;
    gpuAccelerated?: boolean;
  }
): string {
  const classes = [className];
  
  if (options?.mobileOptimized) {
    classes.push('mobile-optimized');
  }
  
  if (options?.gpuAccelerated) {
    classes.push('transform-gpu');
  }
  
  return cn(...classes);
}

/**
 * Check if device supports complex animations
 */
export function supportsComplexAnimations(): boolean {
  // Check for reduced motion preference
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false;
  }
  
  // Check for low-end device indicators
  const connection = (navigator as any).connection;
  if (connection?.saveData || connection?.effectiveType === 'slow-2g') {
    return false;
  }
  
  // Check device memory (if available)
  const deviceMemory = (navigator as any).deviceMemory;
  if (deviceMemory && deviceMemory < 4) {
    return false;
  }
  
  return true;
}

/**
 * Get appropriate transition duration based on device capabilities
 */
export function getTransitionDuration(): number {
  if (!supportsComplexAnimations()) {
    return 0; // Instant transitions for low-end devices
  }
  
  // Return standard duration in milliseconds
  return 200;
}