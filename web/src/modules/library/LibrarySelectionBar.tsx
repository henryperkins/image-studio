import React from 'react'
import { Button } from '@/components/ui/button'
import type { LibraryItem } from '@/lib/api'

type Props = {
  selectedIds: string[]
  visibleCount: number
  items: LibraryItem[]
  onSelectVisible: () => void
  onClear: () => void
  onUseInSora: () => void
  onDeleteMany: (items: LibraryItem[]) => Promise<void>
  onAnalyzeMany: (items: LibraryItem[]) => Promise<void>
  onDownloadMany: (items: LibraryItem[]) => void
  busy?: boolean
}

export default function LibrarySelectionBar({
  selectedIds,
  visibleCount,
  items,
  onSelectVisible,
  onClear,
  onUseInSora,
  onDeleteMany,
  onAnalyzeMany,
  onDownloadMany,
  busy
}: Props) {
  const selectedItems = React.useMemo(
    () => items.filter(i => selectedIds.includes(i.id)),
    [items, selectedIds]
  )

  if (selectedIds.length === 0) return null

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 mt-3 border-t border-border/40 bg-background/85 backdrop-blur p-2 rounded-b-md"
      role="region"
      aria-label="Bulk actions toolbar"
    >
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
        <Button variant="outline" onClick={onSelectVisible} disabled={visibleCount === 0} title={visibleCount ? `Select Visible (${visibleCount})` : 'No visible items'}>
          Select Visible ({visibleCount})
        </Button>
        <Button variant="outline" onClick={onClear}>
          Clear
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={() => onDownloadMany(selectedItems)} disabled={busy}>
          Download
        </Button>
        <Button variant="outline" onClick={() => onAnalyzeMany(selectedItems)} disabled={busy}>
          Analyze
        </Button>
        <Button variant="destructive" onClick={() => onDeleteMany(selectedItems)} disabled={busy}>
          Delete
        </Button>
        <Button onClick={onUseInSora} disabled={selectedIds.length === 0}>
          Use in Sora ({selectedIds.length})
        </Button>
      </div>
    </div>
  )
}

