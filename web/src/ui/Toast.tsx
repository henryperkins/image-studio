import { useEffect, useState, useRef } from "react";

export type ToastType = "success" | "error" | "warning";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

export default function Toast({ message, type, onClose, duration = 3000, actionLabel, onAction }: ToastProps) {
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();
  const startTimeRef = useRef<number>();
  const remainingTimeRef = useRef<number>(duration);
  const toastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Don't steal focus - use ARIA live regions instead

    const startTimer = () => {
      startTimeRef.current = Date.now();
      timerRef.current = setTimeout(handleClose, remainingTimeRef.current);
    };

    const pauseTimer = () => {
      if (timerRef.current && startTimeRef.current) {
        clearTimeout(timerRef.current);
        remainingTimeRef.current -= Date.now() - startTimeRef.current;
      }
    };

    if (isPaused) {
      pauseTimer();
    } else {
      startTimer();
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isPaused]);

  const handleClose = () => {
    onClose();
  };

  return (
    <div
      ref={toastRef}
      className={`toast ${type === "success" ? "toast-success" : type === "error" ? "toast-error" : "toast-warning"} transition-all duration-300 ease-out animate-slide-in-right`}
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm">{message}</span>
        {actionLabel && onAction && (
          <button
            onClick={() => { onAction(); handleClose(); }}
            className="text-white/90 bg-blue-600 hover:bg-blue-500 rounded px-2 py-1 text-xs"
            aria-label={actionLabel}
          >
            {actionLabel}
          </button>
        )}
        <button
          onClick={handleClose}
          className="text-white/70 hover:text-white transition-colors"
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {type === "success" ? "Success: " : "Error: "}{message}
      </div>
    </div>
  );
}
