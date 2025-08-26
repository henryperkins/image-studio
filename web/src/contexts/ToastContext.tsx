import { createContext, useContext, useCallback, ReactNode } from 'react';
import { Toaster, ToastAction } from '@/components/ui/use-toast';
import { toast as shadcnToast } from '@/components/ui/use-toast';

export type ToastType = 'success' | 'error' | 'warning';

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

export function ToastProvider({ children }: ToastProviderProps) {
  const showToast = useCallback((message: string, type: ToastType = 'success', durationOrOptions?: number | ToastOptions) => {
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

    shadcnToast({
      description: message,
      variant: type === 'error' ? 'destructive' : 'default',
      duration,
      action: actionLabel ? (
        <ToastAction altText={actionLabel} onClick={onAction}>{actionLabel}</ToastAction>
      ) : undefined,
    });
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <Toaster />
    </ToastContext.Provider>
  );
}
