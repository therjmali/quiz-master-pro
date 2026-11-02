/**
 * One-shot bootstrap of every IndexedDB-backed local store.
 *
 * History and the folder tree are persisted in IndexedDB (full data, no 5 MB cap) with only a
 * trimmed mirror in localStorage. They MUST be hydrated before the UI reads them, otherwise
 * guests only see the 50-quiz question-less mirror and the folder tree can load stale.
 */
import { initHistoryStore } from './historyStore';
import { initFileTreeStore } from './fileTree';

let _ready: Promise<void> | null = null;

export function initLocalStores(): Promise<void> {
  if (_ready) return _ready;
  _ready = Promise.all([
    initHistoryStore().catch(() => {}),
    initFileTreeStore().catch(() => {}),
  ]).then(() => undefined);
  return _ready;
}
