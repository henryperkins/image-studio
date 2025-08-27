import * as React from 'react';
import { cn } from '@/lib/utils';

const TooltipContext = React.createContext<{ id: string } | null>(null);

export function Tooltip({ children }: { children: React.ReactNode }) {
  const id = React.useId();
  return (
    <TooltipContext.Provider value={{ id }}>
      <div className="relative inline-block group">{children}</div>
    </TooltipContext.Provider>
  );
}

export function TooltipTrigger({ asChild = false, children, className, ...props }: React.HTMLAttributes<HTMLElement> & { asChild?: boolean }) {
  const ctx = React.useContext(TooltipContext);
  const Comp: any = asChild ? React.Fragment : 'button';
  if (asChild) {
    // When asChild, we expect a single element child; augment it with aria-describedby
    const only = React.Children.only(children) as any;
    return React.cloneElement(only, {
      ...props,
      className: cn(only.props?.className, className),
      'aria-describedby': ctx?.id
    });
  }
  return (
    <Comp aria-describedby={ctx?.id} className={className} {...props}>
      {children}
    </Comp>
  );
}

export function TooltipContent({
  children,
  side = 'top',
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { side?: 'top' | 'bottom' | 'left' | 'right' }) {
  const ctx = React.useContext(TooltipContext);
  const basePos =
    side === 'top'
      ? 'bottom-full mb-2 left-1/2 -translate-x-1/2'
      : side === 'bottom'
      ? 'top-full mt-2 left-1/2 -translate-x-1/2'
      : side === 'left'
      ? 'right-full mr-2 top-1/2 -translate-y-1/2'
      : 'left-full ml-2 top-1/2 -translate-y-1/2';
  return (
    <div
      id={ctx?.id}
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-50 w-max max-w-[min(240px,90vw)] rounded-md bg-black/95 px-2 py-1 text-xs text-white opacity-0 shadow-sm ring-1 ring-white/10 transition-opacity group-hover:opacity-100',
        basePos,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

