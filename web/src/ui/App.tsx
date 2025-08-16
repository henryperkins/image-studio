import { useState, useEffect, useRef } from "react";
import ImageCreator from "./ImageCreator";
import SoraCreator from "./SoraCreator";
import { listLibrary, type LibraryItem, API_BASE_URL, isVideoItem } from "../lib/api";
import ImageEditor from "./ImageEditor";
import VideoEditor from "./VideoEditor";
import { Heading, Text } from "./typography";
import { TypographySpecimen } from "./TypographySpecimen";

type View = "images" | "sora" | "typography";

export default function App() {
  // Setup for accessible tabs + deep-linking
  function getViewFromURL(): View {
    const q = new URLSearchParams(window.location.search);
    const v = q.get("view");
    if (v === "sora") return "sora";
    if (v === "typography") return "typography";
    return "images";
  }
  const [view, setView] = useState<View>(() => getViewFromURL());
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // selected image library ids (videos not selectable for Sora)
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const [editImageId, setEditImageId] = useState<string|null>(null);
  const [editVideoId, setEditVideoId] = useState<string|null>(null);
  const promptInputRef = useRef<HTMLTextAreaElement>(null);

  async function refreshLibrary() {
    setLibraryLoading(true);
    try {
      const items = await listLibrary();
      setLibrary(items);
    } finally {
      setLibraryLoading(false);
    }
  }
  useEffect(() => { refreshLibrary().catch(() => {}); }, []);

  // Keep view <-> URL in sync
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const currentView = q.get("view");
    if (view !== currentView) {
      q.set("view", view);
      window.history.replaceState(null, '', `?${q}`);
    }
    // Focus management: Move focus to the active panel after view change
    requestAnimationFrame(() => {
      const panelId = view === "images" ? "panel-images" : view === "sora" ? "panel-sora" : "panel-typography";
      const panel = document.getElementById(panelId);
      if (panel) {
        // Find first focusable element in the panel
        const focusable = panel.querySelector<HTMLElement>('button:not([disabled]), textarea, input:not([disabled]), select');
        if (focusable) {
          focusable.focus();
        } else {
          panel.focus();
        }
      }
    });
    // eslint-disable-next-line
  }, [view]);

  const onImagesSaved = async (id: string) => {
    await refreshLibrary();
    setSelected([id]);
    setView("sora");
  };
  
  // Add check for typography view
  if (view === "typography") {
    return (
      <div className="mx-auto max-w-7xl p-4">
        <header className="flex items-center justify-between mb-4">
          <Heading level={1} serif={false} className="!text-2xl">Typography System</Heading>
          <button
            className="btn btn-primary"
            onClick={() => setView("images")}
          >
            Back to Studio
          </button>
        </header>
        <TypographySpecimen />
      </div>
    );
  }

  const imgToEdit = editImageId ? library.find(i => i.id === editImageId && !isVideoItem(i)) as any : null;
  const vidToEdit = editVideoId ? library.find(i => i.id === editVideoId && isVideoItem(i)) as any : null;

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <Heading level={1} serif={false} className="!text-2xl">AI Media Studio</Heading>
        <div
          className="inline-flex rounded-2xl border border-neutral-800 overflow-hidden relative"
          role="tablist"
          aria-label="Main sections"
        >
          <div
            className="absolute inset-y-0 bg-neutral-700 rounded-2xl transition-all duration-300 ease-out"
            style={{
              width: '50%',
              transform: `translateX(${view === 'images' ? '0%' : '100%'})`
            }}
            aria-hidden="true"
          />
          <button
            id="tab-images"
            role="tab"
            aria-selected={view === "images"}
            aria-controls="panel-images"
            tabIndex={view === "images" ? 0 : -1}
            className={`px-4 py-2 relative z-10 transition-colors duration-300 ${view === "images" ? "text-white" : "text-neutral-400 hover:text-white"}`}
            onClick={() => setView("images")}
            onKeyDown={(e) => {
              if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                e.preventDefault();
                setView('sora');
                setTimeout(() => document.getElementById('tab-sora')?.focus(), 0);
              }
              if (e.key === 'Home') {
                e.preventDefault();
                setView('images');
              }
              if (e.key === 'End') {
                e.preventDefault();
                setView('sora');
                setTimeout(() => document.getElementById('tab-sora')?.focus(), 0);
              }
            }}
          >Images</button>
          <button
            id="tab-sora"
            role="tab"
            aria-selected={view === "sora"}
            aria-controls="panel-sora"
            tabIndex={view === "sora" ? 0 : -1}
            className={`px-4 py-2 relative z-10 transition-colors duration-300 ${view === "sora" ? "text-white" : "text-neutral-400 hover:text-white"}`}
            onClick={() => setView("sora")}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                e.preventDefault();
                setView('images');
                setTimeout(() => document.getElementById('tab-images')?.focus(), 0);
              }
              if (e.key === 'Home') {
                e.preventDefault();
                setView('images');
                setTimeout(() => document.getElementById('tab-images')?.focus(), 0);
              }
              if (e.key === 'End') {
                e.preventDefault();
                setView('sora');
              }
            }}
          >Sora</button>
        </div>
      </header>

      <div className="flex flex-col md:grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="card transition-all duration-300">
            <div className="relative overflow-hidden">
              <div
                className="transition-all duration-500 ease-in-out"
                id="panel-images"
                role="tabpanel"
                aria-labelledby="tab-images"
                style={{
                  transform: view === "images" ? "translateX(0)" : "translateX(-100%)",
                  opacity: view === "images" ? 1 : 0,
                  display: view === "images" ? "block" : "none"
                }}
                tabIndex={0}
              >
                <ImageCreator onSaved={onImagesSaved} promptInputRef={promptInputRef} />
              </div>
              <div
                className="transition-all duration-500 ease-in-out"
                id="panel-sora"
                role="tabpanel"
                aria-labelledby="tab-sora"
                style={{
                  transform: view === "sora" ? "translateX(0)" : "translateX(100%)",
                  opacity: view === "sora" ? 1 : 0,
                  display: view === "sora" ? "block" : "none"
                }}
                tabIndex={0}
              >
                <SoraCreator
                  selectedIds={selected}
                  selectedUrls={library.filter(i => !isVideoItem(i) && selected.includes(i.id)).map(i => `${API_BASE_URL}${i.url}`)}
                  onRemoveImage={(id) => setSelected(prev => prev.filter(x => x !== id))}
                />
              </div>
            </div>
          </div>
        </div>

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
              className={`w-5 h-5 transition-transform ${mobileLibraryOpen ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        </button>

        {/* Library panel */}
        <div
          id="library-panel"
          className={`card transition-all duration-300 ${
            mobileLibraryOpen ? 'block' : 'hidden md:block'
          }`}
        >
          <Heading level={4} className="mb-2">Media Library</Heading>
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
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <Text weight="medium" size="sm">No media yet</Text>
                <Text size="xs" tone="muted" className="mt-1">Generate your first image or video to get started</Text>
              </div>
              <button
                className="btn-primary mx-auto"
                onClick={() => {
                  setView("images");
                  setTimeout(() => promptInputRef.current?.focus(), 100);
                }}
              >
                Create your first image
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[320px] md:max-h-[520px] overflow-auto fade-in">
            {library.map((item, index) => (
              <label
                key={item.id}
                className="relative cursor-pointer group"
                style={{
                  animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`
                }}
              >
                {!isVideoItem(item) && (
                  <input
                    type="checkbox"
                    className="absolute top-1 left-1 md:top-2 md:left-2 z-10 w-6 h-6 md:w-5 md:h-5 rounded cursor-pointer appearance-none bg-neutral-800/80 border-2 border-neutral-600 checked:bg-blue-500 checked:border-blue-500 transition-all duration-200 hover:border-neutral-400 checked:hover:bg-blue-400"
                    checked={selected.includes(item.id)}
                    onChange={e => {
                      setSelected(prev => e.target.checked ? [...prev, item.id] : prev.filter(x => x !== item.id));
                    }}
                    aria-label={`Select image: ${item.prompt || `Image ${index + 1}`}`}
                  />
                )}

                {/* Edit button */}
                <button
                  className="absolute top-1 right-1 md:top-2 md:right-2 z-10 bg-black/70 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100 transition"
                  onClick={() => isVideoItem(item) ? setEditVideoId(item.id) : setEditImageId(item.id)}
                  title="Edit"
                  aria-label="Edit"
                >✎ Edit</button>
                {!isVideoItem(item) && selected.includes(item.id) && (
                  <svg className="absolute top-1 left-1 md:top-2 md:left-2 w-6 h-6 md:w-5 md:h-5 text-white pointer-events-none z-20" viewBox="0 0 20 20">
                    <path fill="currentColor" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                  </svg>
                )}
                {isVideoItem(item) && (
                  <div className="absolute top-1 left-1 md:top-2 md:left-2 z-10 bg-neutral-800/90 backdrop-blur-sm rounded px-1 py-0.5 flex items-center gap-1">
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
                    </svg>
                    <span className="text-xs text-white font-medium">{item.duration}s</span>
                  </div>
                )}
                {isVideoItem(item) ? (
                  <video
                    src={`${API_BASE_URL}${item.url}`}
                    className={`rounded-lg border border-neutral-800 transition-all duration-200 hover:scale-105 w-full h-full object-cover`}
                    muted
                    loop
                    playsInline
                    onMouseEnter={(e) => e.currentTarget.play()}
                    onMouseLeave={(e) => {
                      e.currentTarget.pause();
                      e.currentTarget.currentTime = 0;
                    }}
                  />
                ) : (
                  <img
                    src={`${API_BASE_URL}${item.url}`}
                    alt={item.prompt || `Generated image ${index + 1}`}
                    loading="lazy"
                    className={`rounded-lg border border-neutral-800 transition-all duration-200 ${selected.includes(item.id) ? "outline outline-2 outline-blue-400 scale-95" : "hover:scale-105"}`}
                  />
                )}
              </label>
            ))}
          </div>
          )}
          <div className="flex gap-2 mt-3">
            <button
              className="btn group relative overflow-hidden min-w-[48px] min-h-[48px] md:min-h-0"
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
            >
              <span className="relative z-10">Clear</span>
              <span className="absolute inset-0 bg-neutral-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              {selected.length === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-max min-w-[150px] text-xs px-2 py-1 rounded bg-black/90 text-white shadow opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none z-30 transition-opacity duration-200 whitespace-nowrap">
                  Select at least one image
                </span>
              )}
            </button>
            <button
              className="btn group relative overflow-hidden min-w-[48px] min-h-[48px] md:min-h-0"
              onClick={() => {
                setView("sora");
                setMobileLibraryOpen(false);
              }}
              disabled={selected.length === 0}
              aria-disabled={selected.length === 0}
            >
              <span className="relative z-10">Use in Sora</span>
              <span className="absolute inset-0 bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
              {selected.length === 0 && (
                <span className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-max min-w-[150px] text-xs px-2 py-1 rounded bg-black/90 text-white shadow opacity-0 group-hover:opacity-100 group-focus:opacity-100 pointer-events-none z-30 transition-opacity duration-200 whitespace-nowrap">
                  Select at least one image
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <footer className="text-caption text-muted">
        Images: Azure OpenAI <code>gpt-image-1</code>. Vision: Azure OpenAI <code>gpt-4.1</code>. Videos: Azure OpenAI Sora (preview).
      </footer>

      {/* Modals */}
      {imgToEdit && (
        <ImageEditor
          item={imgToEdit}
          onClose={() => setEditImageId(null)}
          onEdited={async (newId) => { setEditImageId(null); await refreshLibrary(); setSelected([newId]); }}
          baseUrl={API_BASE_URL}
        />
      )}
      {vidToEdit && (
        <VideoEditor
          item={vidToEdit}
          onClose={() => setEditVideoId(null)}
          onEdited={async (newId) => { setEditVideoId(null); await refreshLibrary(); }}
          baseUrl={API_BASE_URL}
        />
      )}
    </div>
  );
}
