import React from 'react';
import type { LibraryItem } from '@/lib/api';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Card } from './ui/card';
import PromptSuggestions from './PromptSuggestions';
import LibraryPromptSuggestions from './LibraryPromptSuggestions';

type Props = {
  library: LibraryItem[]
  onInsert: (text: string) => void
  onReplace: (text: string) => void
  onSelectLibraryItem: (id: string) => void
};

const SuggestionsPanel = React.memo(function SuggestionsPanel({ library, onInsert, onReplace, onSelectLibraryItem }: Props) {
  const [tab, setTab] = React.useState(() => localStorage.getItem('SUG_TAB') || 'general');
  const onValueChange = (v: string) => {
    setTab(v);
    try { localStorage.setItem('SUG_TAB', v); } catch {}
  };

  return (
    <Card className="mt-4 p-3">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-lg font-semibold">Suggestions</h4>
        <Tabs value={tab} onValueChange={onValueChange}>
          <TabsList>
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="library">From Library</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {tab === 'general' ? (
        <PromptSuggestions onInsert={onInsert} onReplace={onReplace} />
      ) : (
        <LibraryPromptSuggestions library={library} onInsert={onInsert} onSelectItem={onSelectLibraryItem} />
      )}
    </Card>
  );
});

export default SuggestionsPanel;
