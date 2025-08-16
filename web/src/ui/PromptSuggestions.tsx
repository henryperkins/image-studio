
import React from 'react';
import { usePromptSuggestions } from './PromptSuggestionsContext';
import { Heading, Text } from '../ui/typography';

interface PromptSuggestionsProps {
  // This will be used to interact with the main prompt editor
  onInsert: (text: string) => void;
  onReplace: (text: string) => void;
}

export default function PromptSuggestions({ onInsert, onReplace }: PromptSuggestionsProps) {
  const { suggestions, deleteSuggestion, isLoading } = usePromptSuggestions();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    // Maybe show a toast here?
  };

  if (isLoading) {
    return <div>Loading suggestions...</div>;
  }

  return (
    <div className="mt-4 pt-4 border-t border-neutral-800">
      <Heading level={4} className="mb-2">Prompt Suggestions</Heading>
      {suggestions.length === 0 ? (
        <Text size="xs" tone="muted">No suggestions yet. Analyze an image to generate some.</Text>
      ) : (
        <ul className="space-y-2 max-h-60 overflow-auto">
          {suggestions.map(suggestion => (
            <li key={suggestion.id} className="bg-neutral-800/50 p-2 rounded-lg group">
              <Text size="sm" className="truncate" title={suggestion.text}>
                {suggestion.text}
              </Text>
              <div className="flex items-center justify-between mt-2">
                <Text size="xs" tone="muted">
                  {new Date(suggestion.createdAt).toLocaleTimeString()} - {suggestion.sourceModel}
                </Text>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="btn btn-xs" onClick={() => onInsert(suggestion.text)} title="Insert">I</button>
                  <button className="btn btn-xs" onClick={() => onReplace(suggestion.text)} title="Replace">R</button>
                  <button className="btn btn-xs" onClick={() => handleCopy(suggestion.text)} title="Copy">C</button>
                  <button className="btn btn-xs" onClick={() => deleteSuggestion(suggestion.id)} title="Delete">X</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
