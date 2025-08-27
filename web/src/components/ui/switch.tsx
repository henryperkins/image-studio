import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SwitchProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked?: boolean
  onCheckedChange?: (checked: boolean) => void
}

export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked = false, onCheckedChange, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        role="switch"
        aria-checked={checked}
        data-state={checked ? 'checked' : 'unchecked'}
        onClick={(e) => {
          props.onClick?.(e);
          onCheckedChange?.(!checked);
        }}
        className={cn(
          'inline-flex h-5 w-9 items-center rounded-full border border-neutral-700 bg-neutral-900 transition-colors data-[state=checked]:bg-primary',
          className
        )}
        {...props}
      >
        <span
          className={cn(
            'ml-0.5 h-4 w-4 translate-x-0 rounded-full bg-white shadow transition-transform',
            checked && 'translate-x-4'
          )}
        />
      </button>
    );
  }
);
Switch.displayName = 'Switch';

