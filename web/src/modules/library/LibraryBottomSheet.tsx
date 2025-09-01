import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronUp, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSwipeGesture } from '@/hooks/useSwipeGesture';
import { useMobileDetection } from '@/hooks/useMobileDetection';

interface LibraryBottomSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

export default function LibraryBottomSheet({
  open,
  onOpenChange,
  title = 'Media Library',
  children,
  className
}: LibraryBottomSheetProps) {
  const { isMobile } = useMobileDetection();
  const [isExpanded, setIsExpanded] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  
  // Use swipe gesture for dismissal
  useSwipeGesture(sheetRef, {
    onSwipeDown: () => {
      if (isExpanded) {
        setIsExpanded(false);
      } else {
        onOpenChange(false);
      }
    },
    onSwipeUp: () => {
      if (!isExpanded) {
        setIsExpanded(true);
      }
    },
    threshold: 50
  });
  
  // Reset expansion state when closed
  useEffect(() => {
    if (!open) {
      setIsExpanded(false);
    }
  }, [open]);
  
  // On desktop, use regular dialog
  if (!isMobile) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-auto">
            {children}
          </div>
        </DialogContent>
      </Dialog>
    );
  }
  
  // Mobile bottom sheet
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm z-40 md:hidden"
          onClick={() => onOpenChange(false)}
          aria-hidden="true"
        />
      )}
      
      {/* Bottom sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 md:hidden',
          'bg-background border-t border-border shadow-2xl',
          'transition-transform duration-300 ease-out',
          'rounded-t-2xl',
          open ? 'translate-y-0' : 'translate-y-full',
          className
        )}
        style={{
          maxHeight: isExpanded ? '90vh' : '60vh',
          transition: 'max-height 0.3s ease-out, transform 0.3s ease-out'
        }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        {/* Drag handle */}
        <div className="flex items-center justify-center py-2">
          <div className="w-12 h-1 bg-muted-foreground/30 rounded-full" />
        </div>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 pb-2 border-b border-border/40">
          <h2 className="text-lg font-semibold">{title}</h2>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-label={isExpanded ? 'Collapse' : 'Expand'}
              className="h-8 w-8"
            >
              <ChevronUp className={cn('w-4 h-4 transition-transform', isExpanded && 'rotate-180')} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
              className="h-8 w-8"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>
        
        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 overflow-auto overscroll-contain"
          style={{
            height: isExpanded ? 'calc(90vh - 5rem)' : 'calc(60vh - 5rem)',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          <div className="p-4">
            {children}
          </div>
        </div>
      </div>
    </>
  );
}