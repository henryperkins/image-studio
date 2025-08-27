import * as React from 'react';
import { cn } from '@/lib/utils';

type ProgressProps = React.HTMLAttributes<HTMLDivElement> & {
  value?: number | null
}

export function Progress({ value, className, ...props }: ProgressProps) {
  const isIndeterminate = value == null;
  const pct = Math.max(0, Math.min(100, Number(value ?? 0)));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={isIndeterminate ? undefined : Math.round(pct)}
      className={cn('relative h-1 w-full overflow-hidden rounded-full bg-neutral-800', className)}
      {...props}
    >
      <div
        className={cn(
          'h-full rounded-full bg-primary transition-all',
          isIndeterminate && 'animate-progress-indeterminate w-1/3'
        )}
        style={isIndeterminate ? undefined : { width: `${pct}%` }}
      />
    </div>
  );
}

// Minimal keyframes via injected style tag (avoids adding global CSS file)
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.dataset.component = 'ui-progress';
  style.textContent = '@keyframes progress-indeterminate {0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}.animate-progress-indeterminate{animation:progress-indeterminate 1.2s ease-in-out infinite}';
  if (!document.head.querySelector('style[data-component="ui-progress"]')) {
    document.head.appendChild(style);
  }
}
