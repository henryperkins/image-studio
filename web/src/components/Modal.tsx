import React, { ReactNode, useEffect, useRef } from "react";
function getFocusable(container: HTMLElement | null): HTMLElement[] {
  if (!container) return [];
  const nodes = container.querySelectorAll<HTMLElement>(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );
  return Array.from(nodes).filter(el => !el.hasAttribute("disabled") && !el.getAttribute("aria-hidden"));
}
 
export interface ModalProps {
  onClose: () => void;
  children: ReactNode;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  initialFocusRef?: React.RefObject<HTMLElement>;
  overlayClassName?: string;
  panelClassName?: string;
  closeOnBackdrop?: boolean;
  closeOnEsc?: boolean;
}
 
export default function Modal({
  onClose,
  children,
  ariaLabel,
  ariaLabelledBy,
  initialFocusRef,
  overlayClassName = "fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4",
  panelClassName,
  closeOnBackdrop = true,
  closeOnEsc = true,
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevFocusRef = useRef<HTMLElement | null>(null);
 
  useEffect(() => {
    prevFocusRef.current = document.activeElement as HTMLElement;
 
    const toFocus = initialFocusRef?.current || getFocusable(panelRef.current)[0];
    if (toFocus) {
      setTimeout(() => toFocus.focus(), 0);
    } else {
      setTimeout(() => panelRef.current?.focus(), 0);
    }
 
    const handleKeyDown = (e: KeyboardEvent) => {
      if (closeOnEsc && e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        const focusables = getFocusable(panelRef.current);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };
 
    const currentOverlay = overlayRef.current;
    currentOverlay?.addEventListener("keydown", handleKeyDown as any);
    return () => {
      currentOverlay?.removeEventListener("keydown", handleKeyDown as any);
      // Restore focus
      prevFocusRef.current?.focus();
    };
  }, [closeOnEsc, initialFocusRef, onClose]);
 
  const onOverlayClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    if (!closeOnBackdrop) return;
    if (e.target === overlayRef.current) {
      onClose();
    }
  };
 
  return (
    <div
      ref={overlayRef}
      className={overlayClassName}
      onClick={onOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      <div
        ref={panelRef}
        className={panelClassName || "bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-4xl"}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
