import * as React from 'react';
import { cn } from '@/lib/utils';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'secondary' | 'destructive' | 'outline'
}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', ...props }, ref) => {
    const variants: Record<string, string> = {
      default: 'bg-primary/15 text-primary ring-1 ring-primary/30',
      secondary: 'bg-muted text-muted-foreground ring-1 ring-border',
      destructive: 'bg-red-500/10 text-red-400 ring-1 ring-red-400/30',
      outline: 'bg-transparent text-current ring-1 ring-border'
    };
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
          variants[variant],
          className
        )}
        {...props}
      />
    );
  }
);
Badge.displayName = 'Badge';
