/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { PromptSuggestionsProvider, usePromptSuggestions } from "../contexts/PromptSuggestionsContext";
import { PreferencesProvider } from "../contexts/PreferencesContext";

// Mock crypto.subtle.digest for hashing (if not available in jsdom)
if (!globalThis.crypto?.subtle?.digest) {
  Object.defineProperty(globalThis, "crypto", {
    value: {
      subtle: {
        digest: async (algorithm: string, data: ArrayBuffer) => {
          // Simple mock that returns a consistent hash
          return new ArrayBuffer(32);
        }
      }
    },
    writable: false
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <PreferencesProvider>
      <PromptSuggestionsProvider>{children}</PromptSuggestionsProvider>
    </PreferencesProvider>
  );
}

describe("PromptSuggestionsContext normalization, dedupe, frequency", () => {
  it("deduplicates by normalized hash and tracks frequency", async () => {
    const { result } = renderHook(() => usePromptSuggestions(), { wrapper });

    await act(async () => {
      await result.current.addSuggestion({
        text: "  Hello World  ",
        sourceModel: "gpt-4.1",
        origin: "vision-analysis",
        tags: []
      });
      await result.current.addSuggestion({
        text: "hello world",
        sourceModel: "gpt-4.1",
        origin: "vision-analysis",
        tags: []
      });
    });

    // Only one suggestion should exist
    expect(result.current.suggestions.length).toBe(1);

    const one = result.current.suggestions[0];
    // Frequency should be 2 for its dedupeKey
    expect(result.current.frequencyByKey[one.dedupeKey]).toBe(2);
  });
});