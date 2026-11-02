import { useState, useEffect, useCallback, useMemo } from 'react';

const PREFIX = 'qmp_pref_';

export function usePersistedState<T>(key: string, defaultValue: T): [T, (val: T | ((prev: T) => T)) => void] {
  const fullKey = `${PREFIX}${key}`;

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(fullKey);
      if (stored !== null) return JSON.parse(stored);
    } catch {}
    return defaultValue;
  });

  useEffect(() => {
    try { localStorage.setItem(fullKey, JSON.stringify(value)); } catch {}
  }, [fullKey, value]);

  return [value, setValue];
}

/**
 * A persisted map — stores a Record<string, T> in localStorage.
 * `usePersistedMap('fm_sort')` returns a getter/setter keyed by an arbitrary sub-key (e.g. folder ID).
 * Each sub-key has its own independent value; changing one doesn't affect others.
 */
export function usePersistedMap<T>(mapKey: string, defaultValue: T): {
  get: (subKey: string) => T;
  set: (subKey: string, val: T) => void;
} {
  const fullKey = `${PREFIX}${mapKey}`;

  const [map, setMap] = useState<Record<string, T>>(() => {
    try {
      const stored = localStorage.getItem(fullKey);
      if (stored !== null) return JSON.parse(stored);
    } catch {}
    return {};
  });

  useEffect(() => {
    try { localStorage.setItem(fullKey, JSON.stringify(map)); } catch {}
  }, [fullKey, map]);

  const get = useCallback((subKey: string): T => {
    return map[subKey] ?? defaultValue;
  }, [map, defaultValue]);

  const set = useCallback((subKey: string, val: T) => {
    setMap(prev => ({ ...prev, [subKey]: val }));
  }, []);

  return { get, set };
}

export function clearAllPreferences() {
  const keys = Object.keys(localStorage).filter(k => k.startsWith(PREFIX));
  keys.forEach(k => localStorage.removeItem(k));
}
