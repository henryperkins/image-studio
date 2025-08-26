import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { type PromptSuggestion } from '../lib/api';
import { hashText, safeRandomUUID } from '../lib/hash';
import { recordEvent } from '../lib/analytics';

// Constants
const MAX_SUGGESTIONS = 100;
const MAX_TEXT_LENGTH = 5000;
const DEBOUNCE_DELAY = 500;

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

// Validation helper
function isValidSuggestion(item: any): item is PromptSuggestion {
  return (
    item &&
    typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.text === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.dedupeKey === 'string'
  );
}

const PromptSuggestionsContext = createContext<PromptSuggestionsContextType | undefined>(undefined);

// Hash helper imported from ../lib/hash (includes secure-context fallback)

export const PromptSuggestionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [frequencyByKey, setFrequencyByKey] = useState<Record<string, number>>({});
  const [error, setError] = useState<Error | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load persisted data with validation
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const pins = localStorage.getItem(PIN_KEY);
      const freqs = localStorage.getItem(FREQ_KEY);
      
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Validate and filter out invalid entries
          const valid = parsed.filter(isValidSuggestion).slice(0, MAX_SUGGESTIONS);
          setSuggestions(valid);
        } else {
          console.warn('Invalid suggestions format, clearing storage');
          localStorage.removeItem(STORAGE_KEY);
        }
      }
      
      if (pins) {
        try {
          const parsedPins = JSON.parse(pins);
          if (Array.isArray(parsedPins)) {
            setPinnedIds(new Set(parsedPins.filter(id => typeof id === 'string')));
          }
        } catch {
          localStorage.removeItem(PIN_KEY);
        }
      }
      
      if (freqs) {
        try {
          const parsedFreqs = JSON.parse(freqs);
          if (typeof parsedFreqs === 'object') {
            setFrequencyByKey(parsedFreqs);
          }
        } catch {
          localStorage.removeItem(FREQ_KEY);
        }
      }
    } catch (e) {
      console.error("Failed to load prompt suggestions", e);
      setError(e as Error);
      // Clear corrupted data
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PIN_KEY);
      localStorage.removeItem(FREQ_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Debounced save function
  const debouncedSave = useCallback((key: string, data: any) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {
        console.error(`Failed to save ${key}:`, e);
        // Check if quota exceeded
        if (e instanceof Error && e.name === 'QuotaExceededError') {
          setError(new Error('Storage quota exceeded. Please clear some data.'));
        }
      }
    }, DEBOUNCE_DELAY);
  }, []);
  
  // Persist changes with debouncing
  useEffect(() => {
    debouncedSave(STORAGE_KEY, suggestions);
  }, [suggestions, debouncedSave]);
  
  useEffect(() => {
    debouncedSave(PIN_KEY, Array.from(pinnedIds));
  }, [pinnedIds, debouncedSave]);
  
  useEffect(() => {
    debouncedSave(FREQ_KEY, frequencyByKey);
  }, [frequencyByKey, debouncedSave]);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  const upsertSuggestion = useCallback((s: PromptSuggestion) => {
    setSuggestions(prev => {
      const existsIdx = prev.findIndex(x => x.dedupeKey === s.dedupeKey);
      if (existsIdx >= 0) {
        // Already present, keep original item (stable id); do not duplicate visually
        return prev;
      }
      // New suggestions at the top, enforce max limit
      const updated = [s, ...prev];
      return updated.slice(0, MAX_SUGGESTIONS);
    });
  }, []);

  const addSuggestion = useCallback(async (data: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>) => {
    const text = data.text?.trim() || "";
    if (!text) return;
    
    // Enforce text length limit
    const sanitized = text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH);
    const dedupeKey = await hashText(sanitized.toLowerCase());
    
    const suggestion: PromptSuggestion = {
      ...data,
      id: safeRandomUUID(),
      createdAt: new Date().toISOString(),
      dedupeKey,
      text: sanitized
    };
    
    upsertSuggestion(suggestion);
    setFrequencyByKey(prev => ({ ...prev, [dedupeKey]: (prev[dedupeKey] || 0) + 1 }));
    recordEvent('suggestion_impression', { id: suggestion.id, dedupeKey, sourceModel: data.sourceModel, origin: data.origin });
  }, [upsertSuggestion]);

  const addSuggestionsBatch = useCallback(async (items: Array<Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>>) => {
    // Process all items in parallel for better performance
    const processed = await Promise.all(
      items.map(async (data) => {
        const text = data.text?.trim() || "";
        if (!text) return null;
        
        const sanitized = text.replace(/\u0000/g, '').slice(0, MAX_TEXT_LENGTH);
        const dedupeKey = await hashText(sanitized.toLowerCase());
        
        return {
          ...data,
          id: safeRandomUUID(),
          createdAt: new Date().toISOString(),
          dedupeKey,
          text: sanitized
        } as PromptSuggestion;
      })
    );
    
    const validSuggestions = processed.filter((s): s is PromptSuggestion => s !== null);
    
    if (validSuggestions.length === 0) return;
    
    // Update all at once
    setSuggestions(prev => {
      const keyMap = new Map(prev.map(s => [s.dedupeKey, s]));
      
      // Add new suggestions, avoiding duplicates
      validSuggestions.forEach(s => {
        if (!keyMap.has(s.dedupeKey)) {
          keyMap.set(s.dedupeKey, s);
        }
      });
      
      // Convert back to array, newest first, with size limit
      const updated = Array.from(keyMap.values())
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, MAX_SUGGESTIONS);
      
      return updated;
    });
    
    // Update frequencies
    const newFreqs: Record<string, number> = {};
    validSuggestions.forEach(s => {
      newFreqs[s.dedupeKey] = 1;
    });
    
    setFrequencyByKey(prev => {
      const updated = { ...prev };
      Object.entries(newFreqs).forEach(([key, count]) => {
        updated[key] = (updated[key] || 0) + count;
      });
      return updated;
    });
    
    // Record analytics
    validSuggestions.forEach(s => {
      recordEvent('suggestion_impression', { 
        id: s.id, 
        dedupeKey: s.dedupeKey, 
        sourceModel: s.sourceModel, 
        origin: s.origin 
      });
    });
  }, []);

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

  // Show error state if critical error occurred
  if (error && !isLoading) {
    return (
      <div className="p-4 bg-red-900/20 border border-red-800 rounded-lg">
        <p className="text-red-400">Error loading suggestions: {error.message}</p>
        <Button 
          className="mt-2"
          size="sm"
          variant="outline"
          onClick={() => {
            setError(null);
            setSuggestions([]);
            setPinnedIds(new Set());
            setFrequencyByKey({});
          }}
        >
          Reset
        </Button>
      </div>
    );
  }
  
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
