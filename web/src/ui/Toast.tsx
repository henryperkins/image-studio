import { useEffect, useState, useRef } from "react";

export type ToastType = "success" | "error";

interface ToastProps {
  message: string;
  type: ToastType;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type, onClose, duration = 3000 }: ToastProps) {
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
      className={`toast ${type === "success" ? "toast-success" : "toast-error"} transition-all duration-300 ease-out animate-slide-in-right`}
      role="alert"
      aria-live="assertive"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="flex items-center gap-3">
        <span className="text-sm">{message}</span>
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
