import { useState, useEffect } from "react";
import ImageCreator from "./ImageCreator";
import SoraCreator from "./SoraCreator";
import { listLibrary, type LibraryItem } from "../lib/api";

type View = "images" | "sora";

export default function App() {
  const [view, setView] = useState<View>("images");
  const [library, setLibrary] = useState<LibraryItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]); // selected library ids

  async function refreshLibrary() {
    const items = await listLibrary();
    setLibrary(items);
  }
  useEffect(() => { refreshLibrary().catch(() => {}); }, []);

  const onImagesSaved = async () => {
    await refreshLibrary();
    setView("sora");
  };

  return (
    <div className="mx-auto max-w-6xl p-4 space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">AI Media Studio</h1>
        <div className="inline-flex rounded-2xl border border-neutral-800 overflow-hidden relative">
          <div 
            className="absolute inset-y-0 bg-neutral-700 rounded-2xl transition-all duration-300 ease-out"
            style={{ 
              width: '50%',
              transform: `translateX(${view === 'images' ? '0%' : '100%'})`
            }}
          />
          <button
            className={`px-4 py-2 relative z-10 transition-colors duration-300 ${view === "images" ? "text-white" : "text-neutral-400 hover:text-white"}`}
            onClick={() => setView("images")}
          >Images</button>
          <button
            className={`px-4 py-2 relative z-10 transition-colors duration-300 ${view === "sora" ? "text-white" : "text-neutral-400 hover:text-white"}`}
            onClick={() => setView("sora")}
          >Sora</button>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="md:col-span-2">
          <div className="card transition-all duration-300">
            <div className="relative overflow-hidden">
              <div 
                className="transition-all duration-500 ease-in-out"
                style={{
                  transform: view === "images" ? "translateX(0)" : "translateX(-100%)",
                  opacity: view === "images" ? 1 : 0,
                  display: view === "images" ? "block" : "none"
                }}
              >
                <ImageCreator onSaved={onImagesSaved} />
              </div>
              <div 
                className="transition-all duration-500 ease-in-out"
                style={{
                  transform: view === "sora" ? "translateX(0)" : "translateX(100%)",
                  opacity: view === "sora" ? 1 : 0,
                  display: view === "sora" ? "block" : "none"
                }}
              >
                <SoraCreator
                  selectedIds={selected}
                  selectedUrls={library.filter(i => selected.includes(i.id)).map(i => `http://localhost:8787${i.url}`)}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Library panel */}
        <div className="card">
          <h2 className="text-lg font-medium mb-2">Image Library</h2>
          <p className="text-xs text-neutral-400 mb-2">
            Select images to use as references or analyze with GPT-4.1 to improve your Sora prompt.
          </p>
          <div className="grid grid-cols-3 gap-2 max-h-[520px] overflow-auto fade-in">
            {library.map((item, index) => (
              <label 
                key={item.id} 
                className="relative cursor-pointer group"
                style={{
                  animation: `fadeIn 0.3s ease-out ${index * 0.05}s both`
                }}
              >
                <input
                  type="checkbox"
                  className="absolute top-2 left-2 z-10 w-5 h-5 rounded cursor-pointer appearance-none bg-neutral-800/80 border-2 border-neutral-600 checked:bg-blue-500 checked:border-blue-500 transition-all duration-200 hover:border-neutral-400 checked:hover:bg-blue-400"
                  checked={selected.includes(item.id)}
                  onChange={e => {
                    setSelected(prev => e.target.checked ? [...prev, item.id] : prev.filter(x => x !== item.id));
                  }}
                />
                {selected.includes(item.id) && (
                  <svg className="absolute top-2 left-2 w-5 h-5 text-white pointer-events-none z-20" viewBox="0 0 20 20">
                    <path fill="currentColor" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/>
                  </svg>
                )}
                <img
                  src={`http://localhost:8787${item.url}`}
                  alt={item.prompt}
                  className={`rounded-lg border border-neutral-800 transition-all duration-200 ${selected.includes(item.id) ? "outline outline-2 outline-blue-400 scale-95" : "hover:scale-105"}`}
                />
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3">
            <button 
              className="btn group relative overflow-hidden" 
              onClick={() => setSelected([])}
              disabled={selected.length === 0}
            >
              <span className="relative z-10">Clear</span>
              <span className="absolute inset-0 bg-neutral-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </button>
            <button 
              className="btn group relative overflow-hidden" 
              onClick={() => setView("sora")}
              disabled={selected.length === 0}
            >
              <span className="relative z-10">Use in Sora</span>
              <span className="absolute inset-0 bg-blue-600 transform scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-left" />
            </button>
          </div>
        </div>
      </div>

      <footer className="text-xs text-neutral-400">
        Images: Azure OpenAI <code>gpt-image-1</code>. Vision: Azure OpenAI <code>gpt-4.1</code>. Videos: Azure OpenAI Sora (preview).
      </footer>
    </div>
  );
}