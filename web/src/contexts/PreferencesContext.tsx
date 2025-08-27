import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

type Preferences = {
  insertSeparator: string;        // default: "\n\n"
  autoPinLastUsed: boolean;       // default: false
};

type PreferencesContextType = {
  prefs: Preferences;
  setInsertSeparator: (sep: string) => void;
  setAutoPinLastUsed: (v: boolean) => void;
};

const DEFAULTS: Preferences = {
  insertSeparator: '\n\n',
  autoPinLastUsed: false
};

const STORAGE_KEY = 'promptSuggestionPrefs:v1';

const PreferencesContext = createContext<PreferencesContextType | undefined>(undefined);

export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs({ ...DEFAULTS, ...parsed });
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {}
  }, [prefs]);

  const setInsertSeparator = (sep: string) => setPrefs(p => ({ ...p, insertSeparator: sep }));
  const setAutoPinLastUsed = (v: boolean) => setPrefs(p => ({ ...p, autoPinLastUsed: v }));

  const value = useMemo(() => ({ prefs, setInsertSeparator, setAutoPinLastUsed }), [prefs]);

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
};

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error('usePreferences must be used within PreferencesProvider');
  return ctx;
}