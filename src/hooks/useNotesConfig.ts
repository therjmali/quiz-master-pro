import { useState, useCallback } from 'react';

const KEY = 'rjquiz:notes:config';

export interface NotesConfig {
  style: 'detailed' | 'concise' | 'exam';
  includeExplanation: boolean;
  includeMnemonic: boolean;
  includeRelated: boolean;
  includeDifficulty: boolean;
  format: 'markdown' | 'structured' | 'qa';
  groupBy: 'subject' | 'type' | 'difficulty';
}

const DEFAULTS: NotesConfig = {
  style: 'concise',
  includeExplanation: true,
  includeMnemonic: true,
  includeRelated: false,
  includeDifficulty: false,
  format: 'structured',
  groupBy: 'subject',
};

export function useNotesConfig() {
  const [config, setConfig] = useState<NotesConfig>(() => {
    try {
      const s = localStorage.getItem(KEY);
      return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS;
    } catch { return DEFAULTS; }
  });

  const update = useCallback((updates: Partial<NotesConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...updates };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setConfig(DEFAULTS);
    try { localStorage.removeItem(KEY); } catch {}
  }, []);

  return { config, update, reset };
}
