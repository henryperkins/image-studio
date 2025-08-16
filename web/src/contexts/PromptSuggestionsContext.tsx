
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { type PromptSuggestion } from '../lib/api';

// Define the shape of the context state
interface PromptSuggestionsContextType {
  suggestions: PromptSuggestion[];
  addSuggestion: (suggestion: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>) => Promise<void>;
  deleteSuggestion: (id: string) => void;
  clearSuggestions: () => void;
  isLoading: boolean;
}

// Create the context with a default value
const PromptSuggestionsContext = createContext<PromptSuggestionsContextType | undefined>(undefined);

// Create a provider component
export const PromptSuggestionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [suggestions, setSuggestions] = useState<PromptSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Load suggestions from localStorage on initial render
  useEffect(() => {
    try {
      const storedSuggestions = localStorage.getItem('promptSuggestions');
      if (storedSuggestions) {
        setSuggestions(JSON.parse(storedSuggestions));
      }
    } catch (error) {
      console.error("Failed to load suggestions from localStorage", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Persist suggestions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem('promptSuggestions', JSON.stringify(suggestions));
    } catch (error) {
      console.error("Failed to save suggestions to localStorage", error);
    }
  }, [suggestions]);

  const addSuggestion = useCallback(async (newSuggestionData: Omit<PromptSuggestion, 'id' | 'createdAt' | 'dedupeKey'>) => {
    const text = newSuggestionData.text.trim();
    if (!text) return;

    const dedupeKey = await hashText(text.toLowerCase());

    setSuggestions(prev => {
      // Deduplicate by key
      if (prev.some(s => s.dedupeKey === dedupeKey)) {
        // Optionally, you could update a frequency counter here
        return prev;
      }
      const newSuggestion: PromptSuggestion = {
        ...newSuggestionData,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        dedupeKey,
        text,
      };
      // Add to the top of the list
      return [newSuggestion, ...prev];
    });
  }, []);

  const deleteSuggestion = useCallback((id: string) => {
    setSuggestions(prev => prev.filter(s => s.id !== id));
  }, []);

  const clearSuggestions = useCallback(() => {
    setSuggestions([]);
  }, []);

  // Helper to generate dedupeKey client-side
  async function hashText(text: string) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const value = {
    suggestions,
    addSuggestion,
    deleteSuggestion,
    clearSuggestions,
    isLoading,
  };

  return (
    <PromptSuggestionsContext.Provider value={value}>
      {children}
    </PromptSuggestionsContext.Provider>
  );
};

// Create a custom hook for using the context
export const usePromptSuggestions = () => {
  const context = useContext(PromptSuggestionsContext);
  if (context === undefined) {
    throw new Error('usePromptSuggestions must be used within a PromptSuggestionsProvider');
  }
  return context;
};
