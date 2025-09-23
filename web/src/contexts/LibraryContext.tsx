import React, { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef, useDeferredValue, useTransition } from 'react';
import { listLibrary, type LibraryItem, isVideoItem } from '../lib/api';
import { useToast } from './ToastContext';

// Types
export type LibraryView = 'grid' | 'list';
export type LibraryType = 'all' | 'images' | 'videos';
export type LibrarySort = 'newest' | 'oldest' | 'name-asc' | 'name-desc';

interface LibraryContextType {
  // Core library state
  library: LibraryItem[];
  loading: boolean;
  error: Error | null;

  // Selection state
  selectedIds: string[];
  visibleIds: string[];

  // Filter and view state
  searchQuery: string;
  libraryType: LibraryType;
  librarySort: LibrarySort;
  viewMode: LibraryView;

  // Pagination
  page: number;
  itemsPerPage: number;

  // Computed values
  filteredLibrary: LibraryItem[];
  sortedFilteredLibrary: LibraryItem[];
  selectedItems: LibraryItem[];

  // Actions
  refreshLibrary: () => Promise<void>;
  setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>;
  setVisibleIds: React.Dispatch<React.SetStateAction<string[]>>;
  setSearchQuery: (query: string) => void;
  setLibraryType: (type: LibraryType) => void;
  setLibrarySort: (sort: LibrarySort) => void;
  setViewMode: (mode: LibraryView) => void;
  setPage: (page: number) => void;

  // Selection helpers
  selectAll: () => void;
  selectNone: () => void;
  selectVisible: () => void;
  toggleSelection: (id: string) => void;
  isSelected: (id: string) => boolean;
}

const LibraryContext = createContext<LibraryContextType | undefined>(undefined);

const STORAGE_KEYS = {
  VIEW_MODE: 'library:viewMode',
  SORT: 'library:sort',
  TYPE: 'library:type'
} as const;

// Use a module-level constant so it's not part of callback dependencies
const ITEMS_PER_PAGE = 12;

export const LibraryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isPending, startTransition] = useTransition();
  // Core state
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // Selection state
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);

  // Filter and view state with localStorage persistence
  const [searchQuery, setSearchQuery] = useState('');
  const [libraryType, setLibraryType] = useState<LibraryType>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.TYPE);
      return (saved as LibraryType) || 'all';
    } catch {
      return 'all';
    }
  });

  const [librarySort, setLibrarySort] = useState<LibrarySort>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.SORT);
      return (saved as LibrarySort) || 'newest';
    } catch {
      return 'newest';
    }
  });

  const [viewMode, setViewMode] = useState<LibraryView>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.VIEW_MODE);
      return (saved as LibraryView) || 'grid';
    } catch {
      return 'grid';
    }
  });

  // Pagination
  const [page, setPage] = useState(0);
  const itemsPerPage = ITEMS_PER_PAGE;

  const { showToast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persist preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.VIEW_MODE, viewMode);
    } catch { }
  }, [viewMode]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.SORT, librarySort);
    } catch { }
  }, [librarySort]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.TYPE, libraryType);
    } catch { }
  }, [libraryType]);

  // Refresh library with debouncing and caching
  const refreshLibrary = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const items = await listLibrary({ signal: controller.signal, timeoutMs: 15000 });

      // Check if request was aborted
      if (controller.signal.aborted) return;

      startTransition(() => {
        setLibrary(items);

        // Reset page if current page is out of bounds, without capturing `page`
        setPage(prev =>
          prev > 0 && prev * ITEMS_PER_PAGE >= items.length ? 0 : prev
        );
      });
    } catch (err) {
      if (controller.signal.aborted) return;

      const error = err as Error;
      setError(error);
      showToast(`Failed to load library: ${error.message}`, 'error');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, [showToast]);

  // Initial load with delay to prevent blocking
  useEffect(() => {
    const timer = setTimeout(() => {
      refreshLibrary();
    }, 100); // Small delay to allow initial render

    return () => {
      clearTimeout(timer);
      // Cleanup on unmount
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [refreshLibrary]);

  // Smoother filtering while typing: defer the search input value
  const deferredQuery = useDeferredValue(searchQuery);

  // Filtered library (by type and search query) - optimized with memoization
  const filteredLibrary = useMemo(() => {
    // Early return if empty library
    if (!library.length) return [];

    return library.filter((item) => {
      // Filter by type
      if (libraryType === 'images' && isVideoItem(item)) return false;
      if (libraryType === 'videos' && !isVideoItem(item)) return false;

      // Filter by search query (deferred)
      const query = deferredQuery.trim().toLowerCase();
      if (!query) return true;

      const searchableText = `${item.prompt || ''} ${item.filename || ''}`.toLowerCase();
      return searchableText.includes(query);
    });
  }, [library, libraryType, deferredQuery]);

  // Sorted and filtered library
  const sortedFilteredLibrary = useMemo(() => {
    return [...filteredLibrary].sort((a, b) => {
      if (librarySort === 'newest' || librarySort === 'oldest') {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return librarySort === 'newest' ? dateB - dateA : dateA - dateB;
      }

      // Name sorting
      const nameA = (a.filename || a.prompt || '').toLowerCase();
      const nameB = (b.filename || b.prompt || '').toLowerCase();
      const comparison = nameA.localeCompare(nameB);
      return librarySort === 'name-asc' ? comparison : -comparison;
    });
  }, [filteredLibrary, librarySort]);

  // Selected items
  const selectedItems = useMemo(() => {
    return library.filter(item => selectedIds.includes(item.id));
  }, [library, selectedIds]);

  // Reset page when filters change - use transition for smoother UI
  useEffect(() => {
    startTransition(() => {
      setPage(0);
    });
  }, [searchQuery, libraryType, librarySort]);

  // Selection helpers
  const selectAll = useCallback(() => {
    setSelectedIds(sortedFilteredLibrary.map(item => item.id));
  }, [sortedFilteredLibrary]);

  const selectNone = useCallback(() => {
    setSelectedIds([]);
  }, []);

  const selectVisible = useCallback(() => {
    const newIds = visibleIds.filter(id => !selectedIds.includes(id));
    setSelectedIds(prev => [...prev, ...newIds]);
  }, [visibleIds, selectedIds]);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const isCurrentlySelected = prev.includes(id);
      if (isCurrentlySelected) {
        return prev.filter(x => x !== id);
      } else {
        return [...prev, id];
      }
    });
  }, []);

  const isSelected = useCallback((id: string) => {
    return selectedIds.includes(id);
  }, [selectedIds]);

  // Memoize the entire context value to prevent unnecessary re-renders
  const value: LibraryContextType = useMemo(() => ({
    // State
    library,
    loading,
    error,
    selectedIds,
    visibleIds,
    searchQuery,
    libraryType,
    librarySort,
    viewMode,
    page,
    itemsPerPage,

    // Computed
    filteredLibrary,
    sortedFilteredLibrary,
    selectedItems,

    // Actions
    refreshLibrary,
    setSelectedIds,
    setVisibleIds,
    setSearchQuery,
    setLibraryType,
    setLibrarySort,
    setViewMode,
    setPage,

    // Selection helpers
    selectAll,
    selectNone,
    selectVisible,
    toggleSelection,
    isSelected
  }), [library, loading, error, selectedIds, visibleIds, searchQuery, libraryType, librarySort, viewMode, page, itemsPerPage, filteredLibrary, sortedFilteredLibrary, selectedItems, refreshLibrary, setSelectedIds, setVisibleIds, setSearchQuery, setLibraryType, setLibrarySort, setViewMode, setPage, selectAll, selectNone, selectVisible, toggleSelection, isSelected]);

  return (
    <LibraryContext.Provider value={value}>
      {children}
    </LibraryContext.Provider>
  );
};

export const useLibrary = () => {
  const context = useContext(LibraryContext);
  if (!context) {
    throw new Error('useLibrary must be used within a LibraryProvider');
  }
  return context;
};
