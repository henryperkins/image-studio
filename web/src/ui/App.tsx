import { useState, useEffect, useRef, useCallback } from "react";
import ImageCreator from "./ImageCreator";
import SoraCreator from "./SoraCreator";
import { listLibrary, type LibraryItem, API_BASE_URL, isVideoItem } from "../lib/api";
import ImageEditor from "./ImageEditor";
import VideoEditor from "./VideoEditor";
import ImageViewerModal from "./ImageViewerModal";
import LibraryItemCard from "../components/LibraryItemCard";
import { useMediaActions } from "../hooks/useMediaActions";
import { Heading, Text } from "./typography";
import { PromptSuggestionsProvider } from "../contexts/PromptSuggestionsContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";
import PromptSuggestions from "./PromptSuggestions";
import LibraryPromptSuggestions from "../components/LibraryPromptSuggestions";
import { usePromptSuggestions } from "../contexts/PromptSuggestionsContext";
import { useToast } from "../contexts/ToastContext";
import ConnectionStatus from "./ConnectionStatus";
import Tabs from "../components/Tabs";

type View = "images" | "sora";

function AppContent() {
  // Setup for accessible tabs + deep-linking
  function getViewFromURL(): View {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view");
    if (v === "sora") return "sora";
    return "images";
  }

  const [view, setView] = useState<View>(() => getViewFromURL());
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // selected image library ids (videos not selectable for Sora)
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [editImageId, setEditImageId] = useState<string | null>(null);
  const [editVideoId, setEditVideoId] = useState<string | null>(null);
  const [viewImageId, setViewImageId] = useState<string | null>(null);
  const [libraryPage, setLibraryPage] = useState(0);
  const itemsPerPage = 12;

  // Lifted state for the prompt (used by visible creator panel)
  const [prompt, setPrompt] = useState("");
  const promptInputRef = useRef<HTMLTextAreaElement>(null);
  const { showToast } = useToast();
  const { suggestions } = usePromptSuggestions();
  const prevCountRef = useRef<number>(0);
  
  // Centralized media actions
  const { handleAction } = useMediaActions({
    onRefresh: refreshLibrary,
    onViewImage: setViewImageId,
    onEditImage: setEditImageId,
    onEditVideo: setEditVideoId,
    onUseInSora: (ids) => {
      setSelected(ids);
      setView('sora');
    },
    baseUrl: API_BASE_URL
  });

  async function refreshLibrary() {
    setLibraryLoading(true);
    try {
      const items = await listLibrary();
      setLibrary(items);
      // Reset to first page if current page is out of bounds
      if (libraryPage * itemsPerPage >= items.length && libraryPage > 0) {
        setLibraryPage(0);
      }
    } finally {
      setLibraryLoading(false);
    }
  }
  useEffect(() => {
    refreshLibrary().catch(() => {});
  }, []);

  // Keep view <-> URL in sync + focus management
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const currentView = q.get("view");
    if (view !== currentView) {
      q.set("view", view);
      window.history.replaceState(null, "", `?${q}`);
    }
    // Focus management: Move focus to the active panel after view change
    requestAnimationFrame(() => {
      const panelId = view === "images" ? "panel-images" : "panel-sora";
      const panel = document.getElementById(panelId);
      if (panel) {
        // Find first focusable element in the panel
        const focusable = panel.querySelector<HTMLElement>(
          "button:not([disabled]), textarea, input:not([disabled]), select"
        );
        if (focusable) {
          focusable.focus();
        } else {
          (panel as HTMLElement).focus();
        }
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const onImagesSaved = async (id: string) => {
    await refreshLibrary();
    setSelected([id]);
    setView("sora");
  };

  // Caret-aware insert/replace into the active prompt textarea
  const handleInsertPrompt = useCallback(
    (textToInsert: string) => {
      const input = promptInputRef.current;
      if (!input) return;

      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      const currentText = input.value;
      const newText = currentText.substring(0, start) + textToInsert + currentText.substring(end);

      setPrompt(newText);

      // Move cursor to the end of the inserted text
      requestAnimationFrame(() => {
        input.focus();
        input.setSelectionRange(start + textToInsert.length, start + textToInsert.length);
      });
    },
    [promptInputRef]
  );

  const handleReplacePrompt = useCallback(
    (newText: string) => {
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
        input.setSelectionRange(before.length + newText.length, before.length + newText.length);
      });
    },
    [promptInputRef]
  );

// Toast when new suggestions arrive while sidebar is collapsed (mobile)
useEffect(() => {
  const prev = prevCountRef.current;
  if (suggestions.length > prev && !mobileLibraryOpen) {
    showToast("New prompt suggestions available", "success", {
      actionLabel: "View in Library",
      onAction: () => {
        setMobileLibraryOpen(true);
        setTimeout(() => {
          document.getElementById("suggestions-panel")?.focus();
        }, 50);
      },
    });
  }
  prevCountRef.current = suggestions.length;
}, [suggestions.length, mobileLibraryOpen, showToast]);

  const imgToEdit = editImageId ? (library.find((i) => i.id === editImageId && !isVideoItem(i)) as any) : null;
  const vidToEdit = editVideoId ? (library.find((i) => i.id === editVideoId && isVideoItem(i)) as any) : null;

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <Heading level={1} serif={false} className="!text-2xl">
          AI Media Studio
        </Heading>
        <div className="inline-flex rounded-2xl border border-neutral-800 overflow-hidden relative">
          <div
            className="absolute inset-y-0 bg-neutral-700 rounded-2xl transition-transform duration-200 ease-out"
            style={{
              width: "50%",
              transform: `translateX(${view === "images" ? "0%" : "100%"})`,
            }}
            aria-hidden="true"
          />
          <Tabs
            tabs={[
              { id: "images", label: "Images", ariaControls: "panel-images" },
              { id: "sora", label: "Sora", ariaControls: "panel-sora" },
            ]}
            selected={view}
            onChange={(id) => setView(id as View)}
            listClassName="inline-flex relative z-10"
            getTabClassName={(_, isSelected) =>
              `px-4 py-2 relative z-10 transition-colors duration-200 ${
                isSelected ? "text-white" : "text-neutral-400 hover:text-white"
              }`
            }
          />
        </div>
      </header>

      {/* ARIA live region for announcing tab changes */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {view === "images" ? "Images panel selected" : view === "sora" ? "Sora panel selected" : "Typography panel selected"}
      </div>

      <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
        {/* Left column (main content) */}
        <div className="md:col-span-2">
          <div className="card transition-opacity duration-200">
            <div className="relative overflow-hidden">
              <div
                className="transition-all duration-200 ease-in-out"
                id="panel-images"
                role="tabpanel"
                aria-labelledby="tab-images"
                style={{
                  transform: view === "images" ? "translateX(0)" : "translateX(-100%)",
                  opacity: view === "images" ? 1 : 0,
                  display: view === "images" ? "block" : "none",
                }}
                tabIndex={0}
              >
                <ImageCreator onSaved={onImagesSaved} promptInputRef={promptInputRef} prompt={prompt} setPrompt={setPrompt} />
              </div>

              <div
                className="transition-all duration-200 ease-in-out"
                id="panel-sora"
                role="tabpanel"
                aria-labelledby="tab-sora"
                style={{
                  transform: view === "sora" ? "translateX(0)" : "translateX(100%)",
                  opacity: view === "sora" ? 1 : 0,
                  display: view === "sora" ? "block" : "none",
                }}
                tabIndex={0}
              >
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
              </div>
            </div>
          </div>
        </div>

        {/* Right column (library + suggestions) */}
        {/* Mobile library toggle button */}
        <button
          className="md:hidden btn w-full mb-2"
          onClick={() => setMobileLibraryOpen(!mobileLibraryOpen)}
          aria-expanded={mobileLibraryOpen}
          aria-controls="library-panel"
        >
          <span className="flex items-center justify-between w-full">
            <span>Media Library ({library.length})</span>
            <svg
              className={`w-5 h-5 transition-transform ${mobileLibraryOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {/* Library panel */}
        <div id="library-panel" className={`card transition-opacity duration-200 ${mobileLibraryOpen ? "block" : "hidden md:block"}`}>
          <Heading level={4} className="mb-2">
            Media Library
          </Heading>
          <Text size="xs" tone="muted" className="mb-2">
            Your generated images and videos. Select images to use as references for Sora.
          </Text>

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
                <Text weight="medium" size="sm">No media yet</Text>
                <Text size="xs" tone="muted" className="mt-1">
                  Generate your first image or video to get started
                </Text>
              </div>
              <button
                className="btn btn-primary mx-auto"
                onClick={() => {
                  setView("images");
                  setTimeout(() => promptInputRef.current?.focus(), 100);
                }}
              >
                Create your first image
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 fade-in">
                {library
                  .slice(libraryPage * itemsPerPage, (libraryPage + 1) * itemsPerPage)
                  .map((item, index) => (
                    <LibraryItemCard
                      key={item.id}
                      item={item}
                      index={index}
                      selected={selected.includes(item.id)}
                      onSelect={(id, isSelected) => {
                        if (!isVideoItem(item)) {
                          setSelected(prev => isSelected ? [...prev, id] : prev.filter(x => x !== id));
                        }
                      }}
                      onAction={handleAction}
                      onView={(item) => setViewImageId(item.id)}
                      baseUrl={API_BASE_URL}
                    />
                  ))}
              </div>
              
              {/* Pagination controls */}
              {library.length > itemsPerPage && (
                <div className="flex items-center justify-between">
                  <button
                    className="btn btn-xs"
                    onClick={() => setLibraryPage(Math.max(0, libraryPage - 1))}
                    disabled={libraryPage === 0}
                  >
                    ← Previous
                  </button>
                  <span className="text-xs text-neutral-400">
                    Page {libraryPage + 1} of {Math.ceil(library.length / itemsPerPage)}
                  </span>
                  <button
                    className="btn btn-xs"
                    onClick={() => setLibraryPage(Math.min(Math.ceil(library.length / itemsPerPage) - 1, libraryPage + 1))}
                    disabled={(libraryPage + 1) * itemsPerPage >= library.length}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 mt-3">
            <button
              className="btn group relative overflow-hidden min-w-[48px] min-h-[48px] md:min-h-0"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
              title={selected.length === 0 ? "Select at least one image" : "Clear selection"}
            >
              <span className="relative z-10">Clear</span>
              <span className="absolute inset-0 bg-neutral-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
            </button>
            <button
              className="btn group relative overflow-hidden min-w-[48px] min-h-[48px] md:min-h-0"
              onClick={() => {
                setView("sora");
                setMobileLibraryOpen(false);
              }}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
              title={selected.length === 0 ? "Select at least one image" : "Use selected images in Sora"}
            >
              <span className="relative z-10">Use in Sora</span>
              <span className="absolute inset-0 bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-200 origin-left" />
            </button>
          </div>

          {/* Prompt Suggestions panel under the Library panel */}
          <PromptSuggestions onInsert={handleInsertPrompt} onReplace={handleReplacePrompt} />
          
          {/* Library-based prompt generation */}
          <LibraryPromptSuggestions 
            library={library}
            onInsert={handleInsertPrompt}
            onSelectItem={(id) => {
              const item = library.find(i => i.id === id);
              if (item && !isVideoItem(item)) {
                setViewImageId(id);
              }
            }}
          />
        </div>
      </div>

      <footer className="text-caption text-muted">
        Images: Azure OpenAI <code>gpt-image-1</code>. Vision: Azure OpenAI <code>gpt-4.1</code>. Videos: Azure OpenAI Sora (preview).
      </footer>

      {/* Modals */}
      {viewImageId && (
        <ImageViewerModal
          items={library}
          currentItemId={viewImageId}
          onClose={() => setViewImageId(null)}
          onEdit={() => {
            setViewImageId(null);
            if (viewImageId) setEditImageId(viewImageId);
          }}
          onNavigate={(id) => setViewImageId(id)}
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
    <PreferencesProvider>
      <PromptSuggestionsProvider>
        <AppContent />
      </PromptSuggestionsProvider>
    </PreferencesProvider>
  );
}
