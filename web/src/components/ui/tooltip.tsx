import * as React from 'react';
import * as RTooltip from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

// Radix Tooltip wrapper with portal rendering and keyboard support.
// API mirrors previous local Tooltip exports for drop-in replacement.

export function Tooltip({ children, delayDuration = 250 }: { children: React.ReactNode; delayDuration?: number }) {
  return (
    <RTooltip.Provider delayDuration={delayDuration}>
      <RTooltip.Root>{children}</RTooltip.Root>
    </RTooltip.Provider>
  );
}

export function TooltipTrigger({ asChild = true, children, ...props }: { asChild?: boolean; children: React.ReactNode } & React.ComponentPropsWithoutRef<typeof RTooltip.Trigger>) {
  return (
    <RTooltip.Trigger asChild={asChild} {...props}>
      {children}
    </RTooltip.Trigger>
  );
}

export function TooltipContent({
  children,
  side = 'top',
  className,
  sideOffset = 6,
  ...props
}: { children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right'; sideOffset?: number } & React.ComponentPropsWithoutRef<typeof RTooltip.Content>) {
  return (
    <RTooltip.Portal>
      <RTooltip.Content
        side={side}
        sideOffset={sideOffset}
        className={cn(
          'z-[120] max-w-[min(280px,90vw)] rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-xl backdrop-blur-0 data-[state=open]:animate-in data-[state=closed]:animate-out',
          className
        )}
        {...props}
      >
        {children}
        <RTooltip.Arrow className="fill-border" />
      </RTooltip.Content>
    </RTooltip.Portal>
  );
}
