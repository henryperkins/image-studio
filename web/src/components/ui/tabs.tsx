import * as React from 'react';
import { cn } from '@/lib/utils';

type TabsContextValue = {
  value: string
  onValueChange?: (v: string) => void
}

const TabsContext = React.createContext<TabsContextValue | null>(null);

type TabsProps = React.HTMLAttributes<HTMLDivElement> & {
  value: string
  onValueChange?: (v: string) => void
}

const Tabs = ({ value, onValueChange, className, ...props }: TabsProps) => (
  <TabsContext.Provider value={{ value, onValueChange }}>
    <div className={className} {...props} />
  </TabsContext.Provider>
);

const TabsList = React.forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<'div'>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      role="tablist"
      className={cn('inline-flex h-10 items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground', className)}
      {...props}
    />
  )
);
TabsList.displayName = 'TabsList';

type TabsTriggerProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  value: string
}

const TabsTrigger = React.forwardRef<HTMLButtonElement, TabsTriggerProps>(({ className, value, onClick, ...props }, ref) => {
  const ctx = React.useContext(TabsContext);
  const active = ctx?.value === value;
  const triggerId = `tab-trigger-${value}`;
  const panelId = `tab-panel-${value}`;
  return (
    <button
      ref={ref}
      role="tab"
      id={triggerId}
      aria-controls={panelId}
      aria-selected={active}
      data-state={active ? 'active' : 'inactive'}
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium',
        'ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        active && 'bg-background text-foreground shadow',
        className
      )}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) ctx?.onValueChange?.(value);
      }}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

type TabsContentProps = React.ComponentPropsWithoutRef<'div'> & {
  'data-value'?: string;
};

// Kept for compatibility; currently unused in the app
const TabsContent = React.forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, id, 'data-value': dataValue, ...props }, ref) => {
    const derivedId = id || (typeof dataValue === 'string' ? `tab-panel-${dataValue}` : undefined);
    return (
      <div ref={ref} role="tabpanel" id={derivedId} className={cn('mt-2', className)} {...props} />
    );
  }
);
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsList, TabsTrigger, TabsContent };
