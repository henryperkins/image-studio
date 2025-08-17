import { ButtonHTMLAttributes, ReactNode } from "react";

interface LoadingButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  variant?: "primary" | "secondary" | "default";
  size?: "default" | "sm";
  children: ReactNode;
}

export function LoadingButton({
  loading = false,
  loadingText = "Processing…",
  variant = "default",
  size = "default",
  disabled,
  children,
  className = "",
  ...props
}: LoadingButtonProps) {
  const baseClass = "btn";
  const variantClass = variant === "primary" ? "btn-primary" : variant === "secondary" ? "btn-secondary" : "";
  const sizeClass = size === "sm" ? "btn-sm text-xs" : "min-w-[48px] min-h-[48px] md:min-h-0";
  const loadingClass = loading ? "loading" : "";
  
  const finalClassName = `${baseClass} ${variantClass} ${sizeClass} ${loadingClass} ${className}`.trim();
  
  return (
    <button
      className={finalClassName}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="flex items-center gap-2">
          <LoadingSpinner />
          {loadingText}
        </span>
      ) : (
        children
      )}
    </button>
  );
}

export function LoadingSpinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg 
      className={`animate-spin ${className}`} 
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4" 
        fill="none" 
      />
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" 
      />
    </svg>
  );
}