import React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import LibraryItemCard from './LibraryItemCard';
import type { LibraryItem } from '@/lib/api';
import type { MediaAction } from '@/hooks/useMediaActions';

type Props = {
  items: LibraryItem[]
  selectedIds: string[]
  onSelect: (id: string, selected: boolean) => void
  onAction: (action: MediaAction, item: LibraryItem) => void
  onView: (item: LibraryItem) => void
  baseUrl?: string
  onVisibleChange?: (ids: string[]) => void
};

const VirtualizedLibraryGrid = React.memo(function VirtualizedLibraryGrid({ items, selectedIds, onSelect, onAction, onView, baseUrl, onVisibleChange }: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [columnGap, setColumnGap] = useState(12); // px; Tailwind gap-3 default
  const [isSmUp, setIsSmUp] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return false;
    return window.matchMedia('(min-width: 640px)').matches;
  });

  // Columns follow the CSS: 2 by default, 3 at `sm` (viewport ≥ 640px)
  const columns = isSmUp ? 3 : 2;

  // Debounced resize observer to prevent layout thrashing
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    let rafId: number;
    const ro = new ResizeObserver((entries) => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        for (const entry of entries) {
          const next = Math.floor(entry.contentRect.width);
          setContainerWidth((prev) => (prev !== next ? next : prev));
        }
      });
    });
    ro.observe(el);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!('matchMedia' in window)) return;
    const mql = window.matchMedia('(min-width: 640px)');
    const handler = () => setIsSmUp(mql.matches);
    handler();
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    // Measure the column gap once; `gap-3` is static regardless of width
    const el = rowRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const gap = parseFloat(style.columnGap || '12');
    if (!Number.isNaN(gap)) setColumnGap(gap);
  }, []);

  const cellWidth = useMemo(() => {
    if (!containerWidth || columns <= 0) return 0;
    const totalGap = columnGap * (columns - 1);
    return Math.max(80, Math.floor((containerWidth - totalGap) / columns));
  }, [containerWidth, columns, columnGap]);

  // Row height must match actual rendered card height to avoid overlap.
  // Include a bit of extra space for card padding/border so rows don't collapse/stack.
  const EXTRA_VERTICAL = 10; // px: approx padding+border inside each card
  const rowHeight = Math.max(1, Math.ceil(cellWidth + EXTRA_VERTICAL + columnGap)); // square tiles + gap + extra
  const rowCount = Math.ceil(items.length / columns);


  const dm = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  const lowMem = typeof dm === 'number' ? dm < 4 : false;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: lowMem ? 2 : 4
  });

  // Notify parent of currently visible item ids — only when they actually change.
  const virtualRows = rowVirtualizer.getVirtualItems();
  const lastIdsRef = useRef<string[] | null>(null);
  useEffect(() => {
    if (!onVisibleChange) return;
    const next: string[] = [];
    for (const r of virtualRows) {
      const start = r.index * columns;
      const end = Math.min(start + columns, items.length);
      for (let i = start; i < end; i++) next.push(items[i].id);
    }
    const prev = lastIdsRef.current;
    let changed = !prev || prev.length !== next.length;
    if (!changed && prev) {
      for (let i = 0; i < prev.length; i++) {
        if (prev[i] !== next[i]) { changed = true; break; }
      }
    }
    if (changed) {
      lastIdsRef.current = next;
      onVisibleChange(next);
    }
  }, [virtualRows, items, columns, onVisibleChange]);

  return (
    <div ref={parentRef} className="max-h-[60vh] overflow-auto overscroll-y-contain">
      {/* Measure gap using a dummy grid row that mirrors production layout */}
      <div ref={rowRef} className="grid grid-cols-2 sm:grid-cols-3 gap-3 absolute -top-[9999px] opacity-0 pointer-events-none" aria-hidden />

      {cellWidth === 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((item, i) => (
            <LibraryItemCard
              key={item.id}
              item={item}
              index={i}
              selected={selectedIds.includes(item.id)}
              onSelect={onSelect}
              onAction={onAction}
              onView={onView}
              baseUrl={baseUrl}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            height: Math.max(0, rowVirtualizer.getTotalSize()),
            position: 'relative'
          }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            const end = Math.min(start + columns, items.length);
            const rowItems = items.slice(start, end);
            return (
              <div
                key={virtualRow.key}
                className="grid grid-cols-2 sm:grid-cols-3 gap-3 absolute left-0 right-0 transform-gpu"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  willChange: 'transform'
                }}
              >
                {rowItems.map((item, colIndex) => {
                  const i = start + colIndex;
                  return (
                    <LibraryItemCard
                      key={item.id}
                      item={item}
                      index={i}
                      selected={selectedIds.includes(item.id)}
                      onSelect={onSelect}
                      onAction={onAction}
                      onView={onView}
                      baseUrl={baseUrl}
                      imgWidth={Math.round(cellWidth)}
                      imgHeight={Math.round(cellWidth)}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

export default VirtualizedLibraryGrid;
