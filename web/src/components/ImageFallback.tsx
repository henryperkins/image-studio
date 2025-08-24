import React, { useState, useEffect, useRef, memo } from 'react';

// ---------- Types ----------
export interface ImageFallbackProps {
  type?: 'image' | 'video' | 'loading' | 'error';
  className?: string;
  prompt?: string;
  size?: 'small' | 'medium' | 'large';
  style?: React.CSSProperties;
}

export interface ResilientImageProps {
  src: string;
  alt: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
  fallbackType?: 'image' | 'video';
  prompt?: string;
  retryAttempts?: number;
  retryDelay?: number;
}

// ---------- ImageFallback ----------
export const ImageFallback = memo(({ 
  type = 'image', 
  className = '',
  prompt = '',
  size = 'medium',
  style
}: ImageFallbackProps) => {
  const iconSize =
    size === 'small' ? 'w-8 h-8' : size === 'large' ? 'w-16 h-16' : 'w-12 h-12';

  return (
    <div
      className={`flex flex-col items-center justify-center bg-gradient-to-br from-neutral-900 to-neutral-800 rounded-lg ${className}`}
      style={style}
    >
      {type === 'loading' ? (
        <>
          <div className="relative">
            <div
              className={`${iconSize} rounded-full border-4 border-neutral-700 border-t-blue-500 animate-spin`}
            />
          </div>
          <p className="text-xs text-neutral-400 mt-2">Loading...</p>
        </>
      ) : type === 'error' ? (
        <>
          <svg
            className={`${iconSize} text-red-400 opacity-60`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
          <p className="text-xs text-red-400 mt-2">Failed to load</p>
          {prompt && (
            <p className="text-xs text-neutral-500 mt-1 px-2 text-center line-clamp-2">
              {prompt}
            </p>
          )}
        </>
      ) : type === 'video' ? (
        <>
          <svg
            className={`${iconSize} text-neutral-500`}
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
          </svg>
          <p className="text-xs text-neutral-500 mt-2">Video unavailable</p>
        </>
      ) : (
        <>
          <svg
            className={`${iconSize} text-neutral-500`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-xs text-neutral-500 mt-2">Image unavailable</p>
        </>
      )}
    </div>
  );
});
ImageFallback.displayName = 'ImageFallback';

// ---------- ResilientImage ----------
export const ResilientImage = memo(({
  src,
  alt,
  className = '',
  onLoad,
  onError,
  fallbackType = 'image',
  prompt = '',
  retryAttempts = 3,
  retryDelay = 1000
}: ResilientImageProps) => {
  const [loadState, setLoadState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [currentSrc, setCurrentSrc] = useState(src);
  const [retryCount, setRetryCount] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset when src changes
  useEffect(() => {
    setLoadState('loading');
    setCurrentSrc(src);
    setRetryCount(0);
  }, [src]);

  // Auto-retry with exponential backoff
  useEffect(() => {
    if (loadState === 'error' && retryCount < retryAttempts) {
      const timeout = setTimeout(() => {
        console.log(`Retrying image load (attempt ${retryCount + 1}/${retryAttempts}): ${src}`);
        setLoadState('loading');
        const separator = src.includes('?') ? '&' : '?';
        setCurrentSrc(`${src}${separator}_retry=${Date.now()}`);
        setRetryCount(prev => prev + 1);
      }, retryDelay * Math.pow(2, retryCount));

      return () => clearTimeout(timeout);
    }
  }, [loadState, retryCount, retryAttempts, retryDelay, src]);

  const handleLoad = () => {
    setLoadState('loaded');
    onLoad?.();
  };

  const handleError = () => {
    if (retryCount >= retryAttempts - 1) {
      console.error(`Failed to load image after ${retryAttempts} attempts: ${src}`);
      setLoadState('error');
      onError?.();
    } else {
      setLoadState('error');
    }
  };

  if (loadState === 'error' && retryCount >= retryAttempts) {
    return <ImageFallback type={fallbackType} className={className} prompt={prompt} />;
  }

  return (
    <div className={`relative ${className}`}>
      {loadState === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <ImageFallback type="loading" className="w-full h-full" />
        </div>
      )}
      <img
        ref={imgRef}
        src={currentSrc}
        alt={alt}
        className={`${className} ${loadState === 'loading' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-300`}
        onLoad={handleLoad}
        onError={handleError}
        loading="lazy"
      />
    </div>
  );
});
ResilientImage.displayName = 'ResilientImage';

// ---------- Global Config (optional) ----------
export const ImageLoadingConfig = {
  maxRetries: 3,
  retryDelay: 1000,
  enableCacheBusting: true,
  showPromptInError: true,
  animationDuration: 300,
  onError: (src: string, attempts: number) => {
    // eslint-disable-next-line no-console
    console.error(`Image load failed after ${attempts} attempts:`, src);
  }
};