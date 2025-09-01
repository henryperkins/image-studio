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

  // Columns follow the grid used in App.tsx: 2 on small, 3 on >= sm (640px)
  const columns = containerWidth >= 640 ? 3 : 2;

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const cr = entry.contentRect;
        setContainerWidth(cr.width);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const el = rowRef.current;
    if (!el) return;
    const style = window.getComputedStyle(el);
    const gap = parseFloat(style.columnGap || '12');
    if (!Number.isNaN(gap)) setColumnGap(gap);
  }, [containerWidth]);

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


  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan: 4
  });

  // Notify parent of currently visible item ids
  useEffect(() => {
    if (!onVisibleChange) return;
    const rows = rowVirtualizer.getVirtualItems();
    const ids: string[] = [];
    for (const r of rows) {
      const start = r.index * columns;
      const end = Math.min(start + columns, items.length);
      for (let i = start; i < end; i++) ids.push(items[i].id);
    }
    onVisibleChange(ids);
  }, [rowVirtualizer, items, columns, onVisibleChange]);

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
          key={`${columns}-${cellWidth}`}
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
