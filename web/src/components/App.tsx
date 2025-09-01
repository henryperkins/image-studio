import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
// Route-level code splitting
const ImagesPage = lazy(() => import('@/pages/ImagesPage'));
const SoraPage = lazy(() => import('@/pages/SoraPage'));
import { type LibraryItem, API_BASE_URL, isVideoItem } from '../lib/api';
const ImageEditor = lazy(() => import('./ImageEditor'));
const VideoEditor = lazy(() => import('./VideoEditor'));
const ImageViewerModal = lazy(() => import('./ImageViewerModal'));
const VideoViewerModal = lazy(() => import('./VideoViewerModal'));
import { useMediaActions } from '../hooks/useMediaActions';
import { useMobileDetection } from '../hooks/useMobileDetection';
import { PromptSuggestionsProvider } from '../contexts/PromptSuggestionsContext';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import SuggestionsPanel from './SuggestionsPanel';
import { usePromptSuggestions } from '../contexts/PromptSuggestionsContext';
import { useToast } from '../contexts/ToastContext';
import ConnectionStatus from './ConnectionStatus';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { cn } from '@/lib/utils';
import VirtualizedLibraryGrid from './VirtualizedLibraryGrid';
import { ChevronDown } from 'lucide-react';
import PlaybooksPanel from './PlaybooksPanel';
import LibraryBottomSheet from '@/modules/library/LibraryBottomSheet';
import CommandPalette from './CommandPalette';
import LibrarySelectionBar from '@/modules/library/LibrarySelectionBar';
import LibraryPanel from '@/modules/library/LibraryPanel';
import StudioLayout from '@/layout/StudioLayout';
import { LibraryProvider, useLibrary } from '@/contexts/LibraryContext';
//

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const {
    library,
    loading: libraryLoading,
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
    setVisibleIds
  } = useLibrary();
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editVideoId, setEditVideoId] = useState<string | null>(null);
  const [viewImageId, setViewImageId] = useState<string | null>(null);
  const [viewVideoId, setViewVideoId] = useState<string | null>(null);
  const [visibleIds, setVisibleIdsLocal] = useState<string[]>([]);
  // Library filters/search
  // searchQuery lives in LibraryContext; panel consumes directly.

  // Prompt state (shared between creators)
  const [prompt, setPrompt] = useState('');
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const { showToast } = useToast();
  const { suggestions } = usePromptSuggestions();
  const prevCountRef = useRef<number>(0);
  const { isMobile } = useMobileDetection();

  // Insert text at caret into prompt textarea
  const handleInsertPrompt = useCallback((textToInsert: string) => {
    const input = promptInputRef.current;
    if (!input) {
      setPrompt((p) => p + textToInsert);
      return;
    }
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? input.value.length;
    const currentText = input.value;
    const newText = currentText.slice(0, start) + textToInsert + currentText.slice(end);
    setPrompt(newText);
    requestAnimationFrame(() => {
      input.focus();
      const pos = start + textToInsert.length;
      input.setSelectionRange(pos, pos);
    });
  }, []);

  // Replace selected text (or insert) in prompt textarea
  const handleReplacePrompt = useCallback((newText: string) => {
    const input = promptInputRef.current;
    if (!input) {
      setPrompt(newText);
      return;
    }
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? input.value.length;
    const before = input.value.slice(0, start);
    const after = input.value.slice(end);
    const final = before + newText + after;
    setPrompt(final);
    requestAnimationFrame(() => {
      input.focus();
      const pos = before.length + newText.length;
      input.setSelectionRange(pos, pos);
    });
  }, []);

  useEffect(() => { refreshLibrary().catch(() => {}); }, [refreshLibrary]);

  // Navigate to Sora after image saved
  const onImagesSaved = async (id: string) => {
    await refreshLibrary();
    setSelected([id]);
    navigate('/sora');
  };

  // Centralized media actions
  const { handleAction } = useMediaActions({
    onRefresh: refreshLibrary,
    onViewImage: setViewImageId,
    onEditImage: setEditImageId,
    onEditVideo: setEditVideoId,
    onUseInSora: (ids) => {
      setSelected(ids);
      navigate('/sora');
    },
    baseUrl: API_BASE_URL
  });

  // Toast when new suggestions arrive while sidebar is collapsed (mobile)
  useEffect(() => {
    const prev = prevCountRef.current;
    if (suggestions.length > prev && !mobileLibraryOpen) {
      showToast('New prompt suggestions available', 'success', {
        actionLabel: 'View in Library',
        onAction: () => {
          setMobileLibraryOpen(true);
          setTimeout(() => {
            document.getElementById('suggestions-panel')?.focus();
          }, 50);
        }
      });
    }
    prevCountRef.current = suggestions.length;
  }, [suggestions.length, mobileLibraryOpen, showToast]);

  // Pull-to-refresh moved into LibraryPanel; bottom sheet remains separate.

  // Optional: move focus to prompt when route changes
  useEffect(() => {
    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  }, [location.pathname]);

  const imgToEdit = editImageId ? (library.find((i) => i.id === editImageId && !isVideoItem(i)) as any) : null;
  const vidToEdit = editVideoId ? (library.find((i) => i.id === editVideoId && isVideoItem(i)) as any) : null;

  const tabsValue = location.pathname === '/sora' ? '/sora' : '/';

  // Derived values handled in LibraryContext.

  // Theme: respect persisted preference and system setting
  const [isDark, setIsDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('THEME_DARK');
      if (saved != null) return saved === '1';
    } catch {}
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    try { localStorage.setItem('THEME_DARK', isDark ? '1' : '0'); } catch {}
  }, [isDark]);

  // Keyboard shortcuts: '/' focus library search; 's' to Sora; '?' help; Cmd/Ctrl+K command palette
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const el = document.getElementById('library-search') as HTMLInputElement | null;
        if (el) {
          e.preventDefault();
          el.focus();
        }
      } else if ((e.key === 's' || e.key === 'S') && (document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT')) {
        navigate('/sora');
      } else if (e.key === '?' && (document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT')) {
        showToast('Shortcuts: / focus search, s Sora, Esc close modals, Del delete selection', 'success', 4000);
      } else if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate, showToast]);

  return (
    <StudioLayout
      tab={tabsValue as '/' | '/sora'}
      onTabChange={(v) => navigate(v)}
      isDark={isDark}
      onToggleTheme={() => setIsDark((v)=>!v)}
    >
      <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
        {/* Left column (main content) */}
        <main id="main-content" className="md:col-span-2" aria-label="Main content">
          <Card className="transition-opacity duration-200 p-6 md:p-8 space-y-6 surface-1 backdrop-blur-lg shadow-2xl">
            <div className="relative min-h-[600px]">
              <Routes>
                <Route
                  path="/"
                  element={
                    <Suspense fallback={null}>
                      <ImagesPage
                        prompt={prompt}
                        setPrompt={setPrompt}
                        promptInputRef={promptInputRef}
                        selectedImageId={selected[0] || null}
                        onOpenEditor={(id) => setEditImageId(id)}
                        onGoToSora={() => navigate('/sora')}
                        onImagesSaved={onImagesSaved}
                      />
                    </Suspense>
                  }
                />
                <Route
                  path="/sora"
                  element={
                    <Suspense fallback={null}>
                      <SoraPage
                        selectedIds={selected}
                        selectedUrls={library
                          .filter((i) => !isVideoItem(i) && selected.includes(i.id))
                          .map((i) => `${API_BASE_URL}${i.url}`)}
                        onRemoveImage={(id) => setSelected((prev) => prev.filter((x) => x !== id))}
                        prompt={prompt}
                        setPrompt={setPrompt}
                        promptInputRef={promptInputRef}
                      />
                    </Suspense>
                  }
                />
              </Routes>
            </div>
          </Card>
        </main>

        {/* Right column (library + suggestions) */}
        <Button
          variant="outline"
          className="md:hidden w-full mb-2"
          onClick={() => setMobileLibraryOpen(!mobileLibraryOpen)}
          aria-expanded={mobileLibraryOpen}
          aria-controls="library-panel"
        >
            <span className="flex items-center justify-between w-full">
              <span>Media Library ({library.length})</span>
              <ChevronDown className={cn('w-5 h-5 transition-transform', mobileLibraryOpen && 'rotate-180')} />
            </span>
        </Button>

        {/* Library panel */}
        <aside aria-label="Media Library and suggestions" className="contents">
          <LibraryPanel
            handleAction={(action, item) => {
              if (action === 'view') {
                if (isVideoItem(item)) setViewVideoId(item.id); else setViewImageId(item.id);
                return;
              }
              return handleAction(action, item);
            }}
            onOpenEditor={(id) => setEditImageId(id)}
            promptInputRef={promptInputRef}
          />
          {/* Suggestions remain visible below the panel card for now */}
          <Card className="transition-opacity duration-200 p-4 surface-1 backdrop-blur-lg shadow-2xl md:sticky md:top-[560px] hidden md:block">
            <SuggestionsPanel
              library={library}
              onInsert={handleInsertPrompt}
              onReplace={handleReplacePrompt}
              onSelectLibraryItem={(id) => {
                const item = library.find((i) => i.id === id);
                if (item && !isVideoItem(item)) setViewImageId(id);
              }}
            />
          </Card>
        </aside>
      </div>

      <footer className="text-sm text-neutral-400 mt-6">
        Images: Azure OpenAI <code>gpt-image-1</code>. Vision: Azure OpenAI <code>gpt-4.1</code>. Videos: Azure OpenAI
        Sora (preview).
      </footer>

      {/* Modals */}
      <Suspense fallback={null}>
      {viewImageId && (
        <ImageViewerModal
          items={library}
          currentItemId={viewImageId}
          onClose={() => setViewImageId(null)}
          onEdit={(id: string) => {
            setViewImageId(null);
            setEditImageId(id);
          }}
          onNavigate={(id) => setViewImageId(id)}
          onRefresh={refreshLibrary}
          baseUrl={API_BASE_URL}
        />
      )}
      {viewVideoId && (
        <VideoViewerModal
          items={library}
          currentItemId={viewVideoId}
          onClose={() => setViewVideoId(null)}
          onEdit={(id: string) => {
            setViewVideoId(null);
            setEditVideoId(id);
          }}
          onNavigate={(id) => setViewVideoId(id)}
          onRefresh={refreshLibrary}
          baseUrl={API_BASE_URL}
        />
      )}
      {imgToEdit && (
        <ImageEditor
          item={imgToEdit}
          onClose={() => setEditImageId(null)}
          onEdited={async (newId) => {
            setEditImageId(null);
            await refreshLibrary();
            setSelected([newId]);
            navigate('/sora');
          }}
          baseUrl={API_BASE_URL}
        />
      )}
      {vidToEdit && (
        <VideoEditor
          item={vidToEdit}
          onClose={() => setEditVideoId(null)}
          onEdited={async () => {
            setEditVideoId(null);
            await refreshLibrary();
          }}
          baseUrl={API_BASE_URL}
        />
      )}
      </Suspense>

      {/* Connection status indicator for debugging mobile issues */}
      <ConnectionStatus />

      {/* Mobile bottom sheet mirror of the library panel */}
      <LibraryBottomSheet open={mobileLibraryOpen} onOpenChange={setMobileLibraryOpen}>
        {/* Reuse the same content by cloning library panel inner core in a lightweight way */}
        {/* For now, render a simplified entry point to the library controls and grid */}
        <div className="space-y-3">
          <h4 className="text-lg font-medium">Media Library</h4>
          <div className="text-xs text-muted-foreground">Use filters and search to find items. Tap to view or long-press for actions.</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <VirtualizedLibraryGrid
              items={sortedFilteredLibrary}
              selectedIds={selected}
              onSelect={(id, isSelected) => {
                const item = library.find(i => i.id === id);
                if (item && !isVideoItem(item)) {
                  setSelected(prev => (isSelected ? [...prev, id] : prev.filter(x => x !== id)));
                }
              }}
              onAction={handleAction}
              onView={(item) => {
                if (isVideoItem(item)) setViewVideoId(item.id); else setViewImageId(item.id);
              }}
              baseUrl={API_BASE_URL}
              onVisibleChange={setVisibleIds}
            />
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
            onUseInSora={() => { navigate('/sora'); setMobileLibraryOpen(false) }}
            onDeleteMany={async (items) => { for (const i of items) await handleAction('delete', i); }}
            onAnalyzeMany={async (items) => { for (const i of items) await handleAction('analyze', i); }}
            onDownloadMany={(items) => { for (const i of items) handleAction('download', i); }}
          />
        </div>
      </LibraryBottomSheet>

      {/* Command palette */}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} actions={[
        { id: 'new-image', label: 'New Image (focus prompt)', run: () => { setCommandOpen(false); navigate('/'); setTimeout(()=> promptInputRef.current?.focus(), 50); } },
        { id: 'goto-sora', label: 'Go to Sora', run: () => { setCommandOpen(false); navigate('/sora'); } },
        { id: 'toggle-theme', label: 'Toggle Dark/Light Theme', run: () => { setIsDark(v=>!v); setCommandOpen(false); } },
        { id: 'open-library', label: 'Open Library', run: () => { setMobileLibraryOpen(true); setCommandOpen(false); } },
        { id: 'refresh-library', label: 'Refresh Library', run: () => { refreshLibrary(); setCommandOpen(false); } },
        { id: 'help', label: 'Show Shortcuts Help', run: () => { showToast('Shortcuts: / search • g generate • s Sora • Cmd/Ctrl+K commands • ? help', 'success', 5000); setCommandOpen(false); } }
      ]} />
    </StudioLayout>
  );
}

export default function App() {
  return (
    <Router>
      <PreferencesProvider>
        <PromptSuggestionsProvider>
          <LibraryProvider>
            <AppContent />
          </LibraryProvider>
        </PromptSuggestionsProvider>
      </PreferencesProvider>
    </Router>
  );
}
