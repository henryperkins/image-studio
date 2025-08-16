import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { type PromptSuggestion } from '../lib/api';
import { recordEvent } from '../lib/analytics';

// Context shape
interface PromptSuggestionsContextType {
  suggestions: PromptSuggestion[];                // newest first (pins sorted first)
  pinnedIds: Set<string>;
  frequencyByKey: Record<string, number>;
  isLoading: boolean;

  addSuggestion: (s: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>) => Promise<void>;
  addSuggestionsBatch: (items: Array<Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>>) => Promise<void>;
  deleteSuggestion: (id: string) => void;
  clearSuggestions: () => void;

  pin: (id: string) => void;
  unpin: (id: string) => void;
  incrementFrequency: (dedupeKey: string) => void;
}

const STORAGE_KEY = "promptSuggestions:v2";
const PIN_KEY = "promptSuggestions:pins:v1";
const FREQ_KEY = "promptSuggestions:freqs:v1";

const PromptSuggestionsContext = createContext<PromptSuggestionsContextType | undefined>(undefined);

// Helper for client-side dedupe key generation (normalized lowercase)
async function hashText(text: string) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export const PromptSuggestionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [frequencyByKey, setFrequencyByKey] = useState<Record<string, number>>({});

  // Load persisted
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const pins = localStorage.getItem(PIN_KEY);
      const freqs = localStorage.getItem(FREQ_KEY);
      if (raw) setSuggestions(JSON.parse(raw));
      if (pins) setPinnedIds(new Set(JSON.parse(pins)));
      if (freqs) setFrequencyByKey(JSON.parse(freqs));
    } catch (e) {
      console.error("Failed to load prompt suggestions", e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Persist changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(suggestions)); } catch {}
  }, [suggestions]);
  useEffect(() => {
    try { localStorage.setItem(PIN_KEY, JSON.stringify(Array.from(pinnedIds))); } catch {}
  }, [pinnedIds]);
  useEffect(() => {
    try { localStorage.setItem(FREQ_KEY, JSON.stringify(frequencyByKey)); } catch {}
  }, [frequencyByKey]);

  const upsertSuggestion = useCallback((s: PromptSuggestion) => {
    setSuggestions(prev => {
      const existsIdx = prev.findIndex(x => x.dedupeKey === s.dedupeKey);
      if (existsIdx >= 0) {
        // Already present, keep original item (stable id); do not duplicate visually
        return prev;
      }
      // New suggestions at the top
      return [s, ...prev];
    });
  }, []);

  const addSuggestion = useCallback(async (data: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>) => {
    const text = data.text?.trim() || "";
    if (!text) return;
    const sanitized = text.replace(/\u0000/g, '').slice(0, 10000); // guard extremes
    const dedupeKey = await hashText(sanitized.toLowerCase());
    const suggestion: PromptSuggestion = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      dedupeKey,
      text: sanitized
    };
    upsertSuggestion(suggestion);
    setFrequencyByKey(prev => ({ ...prev, [dedupeKey]: (prev[dedupeKey] || 0) + 1 }));
    recordEvent('suggestion_impression', { id: suggestion.id, dedupeKey, sourceModel: data.sourceModel, origin: data.origin });
  }, [upsertSuggestion]);

  const addSuggestionsBatch = useCallback(async (items: Array<Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>>) => {
    for (const it of items) {
      await addSuggestion(it);
    }
  }, [addSuggestion]);

  const deleteSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    recordEvent('suggestion_delete', { id });
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
    setPinnedIds(new Set());
    setFrequencyByKey({});
  }, []);

  const pin = useCallback((id: string) => {
    setPinnedIds(prev => new Set(prev).add(id));
    recordEvent('suggestion_pin', { id });
  }, []);
  const unpin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    recordEvent('suggestion_unpin', { id });
  }, []);

  const incrementFrequency = useCallback((dedupeKey: string) => {
    setFrequencyByKey(prev => ({ ...prev, [dedupeKey]: (prev[dedupeKey] || 0) + 1 }));
  }, []);

  // Sort suggestions with pins first, then by createdAt desc
  const sorted = useMemo(() => {
    return [...suggestions].sort((a, b) => {
      const ap = pinnedIds.has(a.id) ? 0 : 1;
      const bp = pinnedIds.has(b.id) ? 0 : 1;
      if (ap !== bp) return ap - bp;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [suggestions, pinnedIds]);

  const value: PromptSuggestionsContextType = {
    suggestions: sorted,
    pinnedIds,
    frequencyByKey,
    isLoading,
    addSuggestion,
    addSuggestionsBatch,
    deleteSuggestion,
    clearSuggestions,
    pin,
    unpin,
    incrementFrequency
  };

  return (
    <PromptSuggestionsContext.Provider value={value}>
      {children}
    </PromptSuggestionsContext.Provider>
  );
};

export const usePromptSuggestions = () => {
  const context = useContext(PromptSuggestionsContext);
  if (context === undefined) {
    throw new Error('usePromptSuggestions must be used within a PromptSuggestionsProvider');
  }
  return context;
};