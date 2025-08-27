import React, { useCallback, useEffect, useRef, useState } from 'react';
import { usePromptSuggestions } from '../contexts/PromptSuggestionsContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { recordEvent } from '../lib/analytics';
import { Card } from './ui/card';
import { Input } from './ui/input';
import { Button } from './ui/button';

interface PromptSuggestionsProps {
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}

export default function PromptSuggestions({ onInsert, onReplace }: PromptSuggestionsProps) {
  const {
    suggestions,
    deleteSuggestion,
    pin,
    unpin,
    pinnedIds,
    frequencyByKey
  } = usePromptSuggestions();
  const { prefs, setInsertSeparator, setAutoPinLastUsed } = usePreferences();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  // Accessibility: allow Alt+L to focus panel (App may also set a global shortcut)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.altKey && (e.key === 'l' || e.key === 'L')) {
        panelRef.current?.focus();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const insertSelected = () => {
    const items = suggestions.filter(s => selectedIds.has(s.id));
    if (!items.length) return;
    const sep = typeof prefs.insertSeparator === 'string' ? prefs.insertSeparator : '\n\n';
    const text = items.map(s => s.text).join(sep);
    onInsert(text);
    recordEvent('suggestion_multi_insert', { count: items.length });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const onCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      recordEvent('suggestion_copy');
    } catch {
      // ignore
    }
  };

  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds]);

  // Keyboard interactions for list items
  const onItemKeyDown = (e: React.KeyboardEvent, id: string, text: string) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      onInsert(text);
      recordEvent('suggestion_insert', { id });
      e.preventDefault();
    } else if (e.key === 'Enter' && e.shiftKey) {
      onReplace(text);
      recordEvent('suggestion_replace', { id });
      e.preventDefault();
    } else if (e.key === ' ' || e.key === 'Spacebar') {
      toggleSelect(id);
      e.preventDefault();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      deleteSuggestion(id);
      e.preventDefault();
    }
  };

  // Drag & drop
  const onDragStart = (e: React.DragEvent, text: string) => {
    // Plain text only, let the editor textarea handle default drop
    e.dataTransfer.setData('text/plain', text);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // Settings popover (simple inline)
  const [showPrefs, setShowPrefs] = useState(false);

  // Derived: filtered suggestions by query (text, tags, model)
  const filtered = suggestions.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = `${s.text} ${(s.tags || []).join(' ')} ${s.sourceModel}`.toLowerCase();
    return hay.includes(q);
  });

  // Render
  return (
    <div
      id="suggestions-panel"
      ref={panelRef}
      className="mt-4 pt-4 border-t border-neutral-800 outline-none"
      role="region"
      aria-label="Prompt Suggestions"
      tabIndex={-1}
    >
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-lg font-semibold">Prompt Suggestions</h4>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={insertSelected}
                aria-label={`Insert ${selectedIds.size} selected suggestions`}
              >
                Insert Selected ({selectedIds.size})
              </Button>
              <Button size="sm" variant="outline" onClick={clearSelection} aria-label="Clear selection">Clear</Button>
            </>
          )}
          <Button size="sm" variant="ghost" onClick={() => setShowPrefs(v => !v)} aria-expanded={showPrefs} aria-controls="suggestions-settings" aria-label="Settings">
            ⚙
          </Button>
        </div>
      </div>
      <div className="flex gap-2 mb-2 items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search suggestions…"
          aria-label="Search suggestions"
          className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500/30"
        />
      </div>
      <p className="text-xs text-neutral-500 mb-2">Tip: Enter to insert • Shift+Enter to replace • Space to select • Drag into the prompt box</p>

      {showPrefs && (
        <Card id="suggestions-settings" className="mb-2 p-3 space-y-2">
          <label className="block text-sm">
            Insert separator
            <Input
              className="mt-1"
              value={prefs.insertSeparator}
              onChange={(e) => setInsertSeparator(e.target.value)}
              aria-label="Insert separator"
            />
          </label>
          <label className="block text-sm">
            <input
              type="checkbox"
              className="mr-2"
              checked={prefs.autoPinLastUsed}
              onChange={(e) => setAutoPinLastUsed(e.target.checked)}
              aria-label="Auto-pin last used suggestions"
            />
            Auto-pin last used suggestions
          </label>
        </Card>
      )}

      {filtered.length === 0 ? (
        <p className="text-xs text-neutral-500">No suggestions yet. Analyze images to generate some.</p>
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto" role="listbox" aria-label="Prompt suggestion list">
          {filtered.map(s => (
            <li
              key={s.id}
              role="option"
              aria-selected={selectedIds.has(s.id)}
              className="bg-neutral-800/50 rounded-lg group hover:bg-neutral-800 focus-within:ring-2 focus-within:ring-blue-500/30"
              style={{ minHeight: 44 }}
            >
              <div
                className="flex items-start gap-2 p-2 overflow-hidden"
                draggable
                onDragStart={(e) => onDragStart(e, s.text)}
              >
                <input
                  type="checkbox"
                  className="mt-1 flex-shrink-0"
                  checked={selectedIds.has(s.id)}
                  onChange={() => toggleSelect(s.id)}
                  aria-label="Select suggestion"
                />
                <button
                  className="text-left flex-1 min-w-0"
                  onClick={() => { onInsert(s.text); recordEvent('suggestion_insert', { id: s.id }); }}
                  onKeyDown={(e) => onItemKeyDown(e, s.id, s.text)}
                  title={s.text} // full text tooltip
                  aria-label={`Suggestion: ${s.text.slice(0, 100)}`}
                >
                  <span className="text-sm truncate">{s.text}</span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-neutral-500 flex-shrink-0">
                      {new Date(s.createdAt).toLocaleTimeString()} • {s.sourceModel}
                      {frequencyByKey[s.dedupeKey] ? ` • ${frequencyByKey[s.dedupeKey]}×` : ''}
                    </span>
                    <div className="flex gap-1 overflow-hidden">
                      {s.tags?.slice(0, 2).map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-accent/20 text-accent-foreground whitespace-nowrap flex-shrink-0">{t}</span>
                      ))}
                    </div>
                  </div>
                </button>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Button size="sm" variant="ghost" onClick={() => { onInsert(s.text); recordEvent('suggestion_insert', { id: s.id }); }} title="Insert" aria-label="Insert suggestion">
                    Insert
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { onReplace(s.text); recordEvent('suggestion_replace', { id: s.id }); }} title="Replace" aria-label="Replace prompt">
                    Replace
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onCopy(s.text)} title="Copy" aria-label="Copy">
                    📋
                  </Button>
                  {isPinned(s.id) ? (
                    <Button size="sm" variant="ghost" onClick={() => unpin(s.id)} title="Unpin" aria-label="Unpin">
                      📌
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => pin(s.id)} title="Pin" aria-label="Pin">
                      📍
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => deleteSuggestion(s.id)} title="Delete" aria-label="Delete suggestion">
                    🗑
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
