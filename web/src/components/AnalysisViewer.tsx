import React from 'react';
import { Tabs, TabsList, TabsTrigger } from './ui/tabs';
import { Button } from './ui/button';

type Props = {
  summaryText?: string
  raw?: unknown
  tokensText?: string
  className?: string
}

export default function AnalysisViewer({ summaryText, raw, tokensText, className }: Props) {
  const hasPretty = !!summaryText;
  const hasRaw = raw !== undefined || !!summaryText;
  const hasTokens = !!tokensText;
  const defaultTab = hasPretty ? 'pretty' : hasRaw ? 'raw' : 'tokens';

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div className={className}>
      <Tabs value={defaultTab} onValueChange={() => {}}>
        <div className="flex items-center justify-between">
          <TabsList>
            {hasPretty && <TabsTrigger value="pretty">Pretty</TabsTrigger>}
            {hasRaw && <TabsTrigger value="raw">Raw</TabsTrigger>}
            {hasTokens && <TabsTrigger value="tokens">Tokens</TabsTrigger>}
          </TabsList>
          {hasPretty && (
            <Button size="sm" variant="outline" onClick={() => copy(summaryText || '')}>Copy</Button>
          )}
        </div>
        {/* Pretty */}
        {hasPretty && (
          <div className="mt-2 rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-sm whitespace-pre-wrap">
            {summaryText}
          </div>
        )}
        {/* Raw */}
        {hasRaw && (
          <div className="mt-2 rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-xs overflow-auto max-h-80">
            <pre>
              {raw === undefined ? (summaryText || '') : JSON.stringify(raw, null, 2)}
            </pre>
          </div>
        )}
        {/* Tokens */}
        {hasTokens && (
          <div className="mt-2 rounded-xl bg-neutral-950 border border-neutral-800 p-3 text-xs whitespace-pre-wrap">
            {tokensText}
          </div>
        )}
      </Tabs>
    </div>
  );
}

