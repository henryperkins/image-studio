import { useState, useEffect, useRef, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import ImageCreator from './ImageCreator';
import SoraCreator from './SoraCreator';
import { listLibrary, type LibraryItem, API_BASE_URL, isVideoItem } from '../lib/api';
import ImageEditor from './ImageEditor';
import VideoEditor from './VideoEditor';
import ImageViewerModal from './ImageViewerModal';
import VideoViewerModal from './VideoViewerModal';
import LibraryItemCard from '../components/LibraryItemCard';
import { useMediaActions } from '../hooks/useMediaActions';
import { PromptSuggestionsProvider } from '../contexts/PromptSuggestionsContext';
import { PreferencesProvider } from '../contexts/PreferencesContext';
import PromptSuggestions from './PromptSuggestions';
import LibraryPromptSuggestions from '../components/LibraryPromptSuggestions';
import { usePromptSuggestions } from '../contexts/PromptSuggestionsContext';
import { useToast } from '../contexts/ToastContext';
import ConnectionStatus from './ConnectionStatus';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

function AppContent() {
  const location = useLocation();
  const navigate = useNavigate();

  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editVideoId, setEditVideoId] = useState<string | null>(null);
  const [viewImageId, setViewImageId] = useState<string | null>(null);
  const [viewVideoId, setViewVideoId] = useState<string | null>(null);
  const [libraryPage, setLibraryPage] = useState(0);
  const itemsPerPage = 12;
  // Library filters/search
  const [libraryQuery, setLibraryQuery] = useState('');
  const [libraryType, setLibraryType] = useState<'all' | 'images' | 'videos'>('all');

  // Prompt state (shared between creators)
  const [prompt, setPrompt] = useState('');
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  const { showToast } = useToast();
  const { suggestions } = usePromptSuggestions();
  const prevCountRef = useRef<number>(0);

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

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true);
    try {
      const items = await listLibrary();
      setLibrary(items);
      if (libraryPage * itemsPerPage >= items.length && libraryPage > 0) {
        setLibraryPage(0);
      }
    } finally {
      setLibraryLoading(false);
    }
  }, [libraryPage, itemsPerPage]);

  useEffect(() => {
    refreshLibrary().catch(() => {});
  }, [refreshLibrary]);

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

  // Optional: move focus to prompt when route changes
  useEffect(() => {
    requestAnimationFrame(() => {
      promptInputRef.current?.focus();
    });
  }, [location.pathname]);

  const imgToEdit = editImageId ? (library.find((i) => i.id === editImageId && !isVideoItem(i)) as any) : null;
  const vidToEdit = editVideoId ? (library.find((i) => i.id === editVideoId && isVideoItem(i)) as any) : null;

  const tabsValue = location.pathname === '/sora' ? '/sora' : '/';

  // Derived: filtered library by type + query (case-insensitive)
  const filteredLibrary = library.filter((item) => {
    if (libraryType === 'images' && isVideoItem(item)) return false;
    if (libraryType === 'videos' && !isVideoItem(item)) return false;
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return true;
    const hay = `${item.prompt || ''} ${item.filename || ''}`.toLowerCase();
    return hay.includes(q);
  });

  // Reset page on filter/search change
  useEffect(() => { setLibraryPage(0); }, [libraryQuery, libraryType]);

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="!text-2xl font-sans font-semibold">AI Media Studio</h1>
        <Tabs value={tabsValue} onValueChange={(v) => navigate(v)}>
          <TabsList className="inline-flex rounded-2xl border border-neutral-800">
            <TabsTrigger value="/">Images</TabsTrigger>
            <TabsTrigger value="/sora">Sora</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
        {/* Left column (main content) */}
        <div className="md:col-span-2">
          <Card className="transition-opacity duration-200 p-6 md:p-8 space-y-4">
            <div className="relative min-h-[600px]">
              <Routes>
                <Route
                  path="/"
                  element={
                    <ImageCreator
                      onSaved={onImagesSaved}
                      promptInputRef={promptInputRef}
                      prompt={prompt}
                      setPrompt={setPrompt}
                    />
                  }
                />
                <Route
                  path="/sora"
                  element={
                    <SoraCreator
                      selectedIds={selected}
                      selectedUrls={library
                        .filter((i) => !isVideoItem(i) && selected.includes(i.id))
                        .map((i) => `${API_BASE_URL}${i.url}`)}
                      onRemoveImage={(id) => setSelected((prev) => prev.filter((x) => x !== id))}
                      prompt={prompt}
                      setPrompt={setPrompt}
                      promptInputRef={promptInputRef}
                    />
                  }
                />
              </Routes>
            </div>
          </Card>
        </div>

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
            <svg
              className={cn('w-5 h-5 transition-transform', mobileLibraryOpen && 'rotate-180')}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </Button>

        {/* Library panel */}
        <Card
          id="library-panel"
          className={cn('transition-opacity duration-200 p-3', mobileLibraryOpen ? 'block' : 'hidden md:block')}
        >
          <h4 className="mb-2 text-xl font-medium">Media Library</h4>
          <p className="text-xs text-neutral-400 mb-2">
            Your generated images and videos. Select images to use as references for Sora. Tip: Shift/Ctrl click to multi‑select.
          </p>

          {/* Filters + Search */}
          <div className="flex flex-col sm:flex-row gap-2 mb-2 items-stretch sm:items-center">
            <div className="inline-flex rounded-md overflow-hidden border border-neutral-700">
              <Button size="sm" variant={libraryType === 'all' ? 'default' : 'outline'} onClick={() => setLibraryType('all')}>All</Button>
              <Button size="sm" variant={libraryType === 'images' ? 'default' : 'outline'} onClick={() => setLibraryType('images')}>Images</Button>
              <Button size="sm" variant={libraryType === 'videos' ? 'default' : 'outline'} onClick={() => setLibraryType('videos')}>Videos</Button>
            </div>
            <div className="flex-1">
              <input
                type="search"
                value={libraryQuery}
                onChange={(e) => setLibraryQuery(e.target.value)}
                placeholder="Search by prompt or filename…"
                className="w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
                aria-label="Search media library"
              />
            </div>
          </div>

          {libraryLoading ? (
            <div className="grid grid-cols-3 gap-2">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="aspect-square rounded-lg bg-neutral-800 animate-pulse" />
              ))}
            </div>
          ) : library.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <div className="text-neutral-500">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="font-medium text-sm">No media yet</p>
                <p className="text-xs text-neutral-400 mt-1">Generate your first image or video to get started</p>
              </div>
              <Button
                className="mx-auto"
                onClick={() => {
                  navigate('/');
                  setTimeout(() => promptInputRef.current?.focus(), 100);
                }}
              >
                Create your first image
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 fade-in">
                {filteredLibrary
                  .slice(libraryPage * itemsPerPage, (libraryPage + 1) * itemsPerPage)
                  .map((item, index) => (
                    <LibraryItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      selected={selected.includes(item.id)}
                      onSelect={(id, isSelected) => {
                        if (!isVideoItem(item)) {
                          setSelected((prev) => (isSelected ? [...prev, id] : prev.filter((x) => x !== id)));
                        }
                      }}
                      onAction={handleAction}
                      onView={(item) => {
                        if (isVideoItem(item)) {
                          setViewVideoId(item.id);
                        } else {
                          setViewImageId(item.id);
                        }
                      }}
                      baseUrl={API_BASE_URL}
                    />
                  ))}
              </div>

              {/* Pagination controls */}
              {filteredLibrary.length > itemsPerPage && (
                <div className="flex flex-col sm:flex-row items-center gap-2 sm:justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() => setLibraryPage(Math.max(0, libraryPage - 1))}
                    disabled={libraryPage === 0}
                  >
                    ← Previous
                  </Button>
                  <span className="text-xs text-neutral-400 flex-1 text-center min-w-[100px]">
                    Page {libraryPage + 1} of {Math.ceil(filteredLibrary.length / itemsPerPage)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full sm:w-auto"
                    onClick={() =>
                      setLibraryPage(Math.min(Math.ceil(filteredLibrary.length / itemsPerPage) - 1, libraryPage + 1))
                    }
                    disabled={(libraryPage + 1) * itemsPerPage >= filteredLibrary.length}
                  >
                    Next →
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <Button
              variant="outline"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
              title={selected.length === 0 ? 'Select at least one image' : 'Clear selection'}
            >
              Clear
            </Button>
            <Button
              onClick={() => {
                navigate('/sora');
                setMobileLibraryOpen(false);
              }}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
              title={selected.length === 0 ? 'Select at least one image' : 'Use selected images in Sora'}
            >
              Use in Sora
            </Button>
          </div>

          {/* Prompt Suggestions panel under the Library panel */}
          <PromptSuggestions onInsert={handleInsertPrompt} onReplace={handleReplacePrompt} />

          {/* Library-based prompt generation */}
          <LibraryPromptSuggestions
            library={library}
            onInsert={handleInsertPrompt}
            onSelectItem={(id) => {
              const item = library.find((i) => i.id === id);
              if (item && !isVideoItem(item)) {
                setViewImageId(id);
              }
            }}
          />
        </Card>
      </div>

      <footer className="text-caption text-muted">
        Images: Azure OpenAI <code>gpt-image-1</code>. Vision: Azure OpenAI <code>gpt-4.1</code>. Videos: Azure OpenAI
        Sora (preview).
      </footer>

      {/* Modals */}
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

      {/* Connection status indicator for debugging mobile issues */}
      <ConnectionStatus />
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <PreferencesProvider>
        <PromptSuggestionsProvider>
          <AppContent />
        </PromptSuggestionsProvider>
      </PreferencesProvider>
    </Router>
  );
}
