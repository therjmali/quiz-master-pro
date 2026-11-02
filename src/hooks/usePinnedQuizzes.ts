import { useState, useCallback } from 'react';

const KEY = 'rjquiz:pinnedIds';

export function usePinnedQuizzes() {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => {
    try {
      const s = localStorage.getItem(KEY);
      return s ? new Set<string>(JSON.parse(s)) : new Set<string>();
    } catch { return new Set<string>(); }
  });

  const togglePin = useCallback((id: string) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try { localStorage.setItem(KEY, JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);

  const isPinned = useCallback((id: string) => pinnedIds.has(id), [pinnedIds]);

  return { pinnedIds, togglePin, isPinned };
}
