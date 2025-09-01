import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Command = {
  id: string
  label: string
  keywords?: string
  run: () => void
}

export default function CommandPalette({ open, onOpenChange, actions }: { open: boolean; onOpenChange: (v: boolean)=>void; actions: Command[] }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(()=> inputRef.current?.focus(), 10);
    } else {
      setQuery('');
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return actions;
    return actions
      .map(a => ({ a, score: fuzzyScore(a.label + ' ' + (a.keywords||''), q) }))
      .filter(x => x.score > -Infinity)
      .sort((x,y)=> y.score - x.score)
      .map(x => x.a);
  }, [actions, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 overflow-hidden max-w-xl">
        <DialogTitle className="sr-only">Command Palette</DialogTitle>
        <div className="border-b border-border/60 p-2">
          <Input
            ref={inputRef}
            placeholder="Type a command or search…"
            value={query}
            onChange={(e)=> setQuery(e.target.value)}
            className="h-11 text-base"
            aria-label="Command palette search"
          />
        </div>
        <ul className="max-h-[50vh] overflow-auto">
          {results.map((cmd, i) => (
            <li key={cmd.id}>
              <button
                className={cn('w-full text-left px-4 py-3 hover:bg-accent/30', i===0 && 'border-t border-border/40')}
                onClick={cmd.run}
              >
                {cmd.label}
              </button>
            </li>
          ))}
          {results.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted-foreground">No matches</li>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

// Lightweight fuzzy score: sums contiguous character matches in order
function fuzzyScore(text: string, query: string): number {
  text = text.toLowerCase();
  let score = 0, ti = 0;
  for (let qi = 0; qi < query.length; qi++) {
    const qc = query[qi];
    let found = false;
    while (ti < text.length) {
      if (text[ti] === qc) { score += 2; ti++; found = true; break; }
      ti++;
    }
    if (!found) score -= 1;
  }
  return score;
}
