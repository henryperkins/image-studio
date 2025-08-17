import { CSSProperties } from "react";

interface SkeletonLoaderProps {
  type?: "image" | "video" | "text" | "custom";
  aspectRatio?: string;
  width?: string | number;
  height?: string | number;
  className?: string;
  lines?: number;
}

export function SkeletonLoader({
  type = "custom",
  aspectRatio,
  width = "100%",
  height,
  className = "",
  lines = 3,
}: SkeletonLoaderProps) {
  const baseClass = "skeleton rounded";
  
  if (type === "image" || type === "video") {
    const style: CSSProperties = aspectRatio 
      ? { aspectRatio: aspectRatio.replace('x', '/') }
      : { width, height: height || "auto" };
    
    return (
      <div className="space-y-2">
        <div 
          className={`${baseClass}-xl aspect-square w-full ${className}`} 
          style={style}
        />
        {type === "video" && (
          <div className={`${baseClass}-2xl h-10 w-32`} />
        )}
      </div>
    );
  }
  
  if (type === "text") {
    return (
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`${baseClass} h-4 ${className}`}
            style={{ width: i === lines - 1 ? "66%" : i === 0 ? "75%" : "100%" }}
          />
        ))}
      </div>
    );
  }
  
  // Custom type
  return (
    <div 
      className={`${baseClass} ${className}`}
      style={{ width, height }}
    />
  );
}

interface MediaSkeletonProps {
  mediaType: "image" | "video";
  size?: string;
  showMetadata?: boolean;
}

export function MediaSkeleton({ 
  mediaType, 
  size = "1024x1024",
  showMetadata = true 
}: MediaSkeletonProps) {
  return (
    <div className="mt-2 space-y-2">
      <SkeletonLoader 
        type={mediaType}
        aspectRatio={size}
      />
      {showMetadata && (
        <SkeletonLoader 
          type="text"
          lines={1}
          className="w-3/4"
        />
      )}
    </div>
  );
}