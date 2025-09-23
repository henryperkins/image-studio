import React, { useRef, memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';
import { API_BASE_URL, isVideoItem, type LibraryItem } from '@/lib/api';
import { useLibrary } from '@/contexts/LibraryContext';
import VirtualizedLibraryGrid from '@/components/VirtualizedLibraryGrid';
import LibraryListView from '@/modules/library/LibraryListView';
import UploadButtons from '@/components/UploadButtons';
import LibrarySelectionBar from '@/modules/library/LibrarySelectionBar';
import LibraryControls from '@/modules/library/LibraryControls';
import PullToRefreshIndicator from '@/components/PullToRefreshIndicator';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

import type { MediaAction } from '@/hooks/useMediaActions';

type Props = {
  handleAction: (action: MediaAction, item: LibraryItem) => Promise<void> | void
  onOpenEditor: (id: string) => void
  promptInputRef?: React.RefObject<HTMLTextAreaElement | null>
}

const LibraryPanelComponent = function LibraryPanel({ handleAction, onOpenEditor, promptInputRef }: Props) {
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);

  const {
    library,
    loading: libraryLoading,
    error: libraryError,
    selectedIds: selected,
    setSelectedIds: setSelected,
    filteredLibrary,
    sortedFilteredLibrary,
    searchQuery,
    setSearchQuery,
    libraryType,
    setLibraryType,
    librarySort,
    setLibrarySort,
    viewMode,
    setViewMode,
    refreshLibrary,
    setVisibleIds,
    visibleIds
  } = useLibrary();

  // Pull to refresh (mobile-friendly though panel is desktop-visible)
  const { pullDistance, isRefreshing, pullProgress } = usePullToRefresh(panelRef, {
    onRefresh: refreshLibrary,
    disabled: false
  });

  return (
    <Card
      ref={panelRef}
      id="library-panel"
      className={cn(
        'transition-opacity duration-200 p-4 surface-1 backdrop-blur-lg shadow-2xl',
        'md:sticky md:top-16 relative overflow-hidden',
        'hidden md:block'
      )}
    >
      {/* Pull-to-refresh indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        pullProgress={pullProgress}
      />

      <h4 className="mb-3 text-xl font-medium text-neutral-100">Media Library</h4>
      <p className="text-xs text-neutral-400 mb-3">
        Your generated images and videos. Select images to use as references for Sora. Tip: tap the checkbox on mobile; use Shift/Ctrl click to multi‑select on desktop.
      </p>

      {/* Filters + Search */}
      <LibraryControls
        searchQuery={searchQuery}
        libraryType={libraryType}
        librarySort={librarySort}
        viewMode={viewMode}
        totalCount={library.length}
        filteredCount={filteredLibrary.length}
        onSearchChange={setSearchQuery}
        onTypeChange={setLibraryType}
        onSortChange={setLibrarySort}
        onViewModeChange={setViewMode}
        className="mb-2"
      />

      {libraryLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="aspect-square rounded-lg bg-neutral-800 animate-pulse" />
          ))}
        </div>
      ) : libraryError ? (
        <div className="py-8 text-center space-y-3">
          <p className="text-sm text-red-400">Failed to load media library</p>
          <p className="text-xs text-muted-foreground">{libraryError.message || 'Network error'}</p>
          <div className="flex items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={refreshLibrary}>Retry</Button>
          </div>
        </div>
      ) : library.length === 0 ? (
        <div className="py-12 text-center space-y-3">
          <div className="text-muted-foreground">
            <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium text-sm">No media yet</p>
            <p className="text-xs text-muted-foreground mt-1">Generate your first image or video to get started</p>
          </div>
          <Button
            className="mx-auto"
            onClick={() => {
              navigate('/');
              setTimeout(() => promptInputRef?.current?.focus(), 100);
            }}
          >
            Create your first image
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {viewMode === 'grid' ? (
            <VirtualizedLibraryGrid
              items={sortedFilteredLibrary}
              selectedIds={selected}
              onSelect={useCallback((id: string, isSelected: boolean) => {
                const item = library.find(i => i.id === id);
                if (item && !isVideoItem(item)) {
                  setSelected(prev => (isSelected ? [...prev, id] : prev.filter(x => x !== id)));
                }
              }, [library, setSelected])}
              onAction={handleAction}
              onView={useCallback((item: LibraryItem) => {
                if (isVideoItem(item)) return;
                handleAction('view', item);
              }, [handleAction])}
              baseUrl={API_BASE_URL}
              onVisibleChange={setVisibleIds}
            />
          ) : (
            <LibraryListView
              items={sortedFilteredLibrary}
              selectedIds={selected}
              onSelect={useCallback((id: string, isSelected: boolean) => {
                const item = library.find(i => i.id === id);
                if (item && !isVideoItem(item)) {
                  setSelected(prev => (isSelected ? [...prev, id] : prev.filter(x => x !== id)));
                }
              }, [library, setSelected])}
              onAction={handleAction}
              onView={useCallback((item: LibraryItem) => handleAction('view', item), [handleAction])}
              baseUrl={API_BASE_URL}
            />
          )}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <UploadButtons
          onUploaded={async (items)=>{
            await refreshLibrary();
            setSelected(items.map(i=>i.id));
          }}
          onOpenEditor={onOpenEditor}
        />
        <div className="flex-1" />
      </div>

      <LibrarySelectionBar
        selectedIds={selected}
        visibleCount={visibleIds.length}
        items={library}
        onSelectVisible={() => {
          const add = visibleIds.filter(id => !selected.includes(id));
          setSelected(prev => [...prev, ...add]);
        }}
        onClear={() => setSelected([])}
        onUseInSora={() => { navigate('/sora'); }}
        onDeleteMany={async (items) => { for (const i of items) await handleAction('delete', i); }}
        onAnalyzeMany={async (items) => { for (const i of items) await handleAction('analyze', i); }}
        onDownloadMany={(items) => { for (const i of items) handleAction('download', i); }}
      />
    </Card>
  );
};

export default memo(LibraryPanelComponent);
