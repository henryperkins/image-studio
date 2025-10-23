import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { triggerHaptic } from '@/hooks/useMobileDetection';
import { cn } from '@/lib/utils';
import { setRef } from '@/lib/composeRefs';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline:
          'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary:
          'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        overlay: 'border border-border/40 bg-popover/70 text-popover-foreground hover:bg-popover/90'
      },
      size: {
        default: 'h-9 md:h-9 min-h-[44px] md:min-h-0 px-4 py-2',
        sm: 'h-8 md:h-8 min-h-[44px] md:min-h-0 rounded-md px-3 text-xs',
        lg: 'h-10 md:h-10 min-h-[44px] md:min-h-0 rounded-md px-8',
        icon: 'h-9 w-9 md:h-9 md:w-9 min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, onClick, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    // Attach an internal object ref to the DOM element and propagate to the
    // public ref in a microtask to avoid commit-phase updates.
    const domRef = React.useRef<HTMLButtonElement | null>(null);
    const lastRef = React.useRef<typeof ref>(undefined);
    const lastNode = React.useRef<HTMLButtonElement | null>(null);
    const scheduled = React.useRef(false);

    const flushRefSync = React.useCallback(() => {
      scheduled.current = false;
      const node = domRef.current;
      // If the consumer ref changed, detach the previous one
      if (lastRef.current && lastRef.current !== ref) {
        setRef(lastRef.current, null);
      }
      // Attach current ref if identity or target changed
      if (ref && (lastRef.current !== ref || lastNode.current !== node)) {
        setRef(ref, node);
      }
      lastRef.current = ref;
      lastNode.current = node;
    }, [ref]);

    const scheduleFlush = React.useCallback(() => {
      if (scheduled.current) return;
      scheduled.current = true;
      // microtask (after commit)
      Promise.resolve().then(flushRefSync);
    }, [flushRefSync]);

    const assignDom = React.useCallback((node: HTMLButtonElement | null) => {
      domRef.current = node;
      scheduleFlush();
    }, [scheduleFlush]);

    // If only the ref identity changes without the node changing, ensure we sync.
    React.useLayoutEffect(() => {
      scheduleFlush();
    }, [scheduleFlush]);

    const handleClick = React.useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
      // Trigger haptic feedback on mobile devices
      if ('ontouchstart' in window) {
        triggerHaptic('light');
      }
      onClick?.(e);
    }, [onClick]);

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={assignDom}
        onClick={handleClick}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
