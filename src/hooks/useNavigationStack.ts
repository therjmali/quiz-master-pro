import { useRef, useCallback, useEffect } from 'react';
import { Screen } from '../types/quiz';

export interface NavEntry {
  screen: Screen;
  scrollY: number;
  /** Sub-state like profile tab, library folder, etc. */
  meta?: Record<string, string>;
  timestamp: number;
}

const MAX_STACK = 40;
const STORAGE_KEY = 'qmp_nav_stack';

function loadStack(): NavEntry[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(-MAX_STACK);
    }
  } catch {}
  return [];
}

function saveStack(stack: NavEntry[]) {
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stack.slice(-MAX_STACK))); } catch {}
}

/**
 * Maintains a navigation stack so the back button always returns
 * to the exact previous screen + scroll position + sub-tab state.
 * Persisted to sessionStorage so it survives chunk reloads.
 */
export function useNavigationStack() {
  const stackRef = useRef<NavEntry[]>(loadStack());

  // Sync to sessionStorage on unmount
  useEffect(() => {
    return () => { saveStack(stackRef.current); };
  }, []);

  /** Push current screen onto the stack before navigating away */
  const push = useCallback((entry: Omit<NavEntry, 'timestamp'>) => {
    const stack = stackRef.current;
    // Deduplicate consecutive same-screen pushes
    const last = stack[stack.length - 1];
    if (last && last.screen === entry.screen) {
      // Update in-place (scroll/meta may have changed)
      last.scrollY = entry.scrollY;
      last.meta = entry.meta;
      last.timestamp = Date.now();
      saveStack(stack);
      return;
    }
    stack.push({ ...entry, timestamp: Date.now() });
    if (stack.length > MAX_STACK) stack.shift();
    saveStack(stack);
  }, []);

  /** Pop the most recent entry (returns undefined if stack is empty) */
  const pop = useCallback((): NavEntry | undefined => {
    const entry = stackRef.current.pop();
    saveStack(stackRef.current);
    return entry;
  }, []);

  /** Peek at the top without removing */
  const peek = useCallback((): NavEntry | undefined => {
    const s = stackRef.current;
    return s.length > 0 ? s[s.length - 1] : undefined;
  }, []);

  /** Clear the stack */
  const clear = useCallback(() => {
    stackRef.current = [];
    saveStack([]);
  }, []);

  /** Current stack depth */
  const depth = useCallback(() => stackRef.current.length, []);

  return { push, pop, peek, clear, depth };
}
