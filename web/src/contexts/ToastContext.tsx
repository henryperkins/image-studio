import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Toast, { ToastType } from '../ui/Toast';

type ToastOptions = {
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
};

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextType {
  // Backward compatible signature:
  // showToast(message, type?, durationOrOptions?)
  showToast: (message: string, type?: ToastType, durationOrOptions?: number | ToastOptions) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

interface ToastProviderProps {
  children: ReactNode;
  maxToasts?: number;
}

export function ToastProvider({ children, maxToasts = 3 }: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success", durationOrOptions?: number | ToastOptions) => {
    const id = crypto.randomUUID?.() || Date.now().toString();

    let duration: number | undefined;
    let actionLabel: string | undefined;
    let onAction: (() => void) | undefined;

    if (typeof durationOrOptions === 'number') {
      duration = durationOrOptions;
    } else if (durationOrOptions && typeof durationOrOptions === 'object') {
      duration = durationOrOptions.duration;
      actionLabel = durationOrOptions.actionLabel;
      onAction = durationOrOptions.onAction;
    }

    setToasts(prev => {
      const newToasts = [...prev, { id, message, type, duration, actionLabel, onAction }];
      // Keep only the most recent toasts
      return newToasts.slice(-maxToasts);
    });
  }, [maxToasts]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toasts.length > 0 && createPortal(
        <div className="fixed bottom-4 right-4 space-y-2 z-50" role="region" aria-label="Notifications">
          {toasts.map(toast => (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              duration={toast.duration}
              actionLabel={toast.actionLabel}
              onAction={toast.onAction}
              onClose={() => removeToast(toast.id)}
            />
          ))}
        </div>,
        document.body
      )}
    </ToastContext.Provider>
  );
}