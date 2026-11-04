/** Minimal browser shims so the platform modules run under plain Node. Import this FIRST in every test. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  getItem(k: string) { return this.map.has(k) ? this.map.get(k)! : null; }
  setItem(k: string, v: string) { this.map.set(k, String(v)); }
  removeItem(k: string) { this.map.delete(k); }
  clear() { this.map.clear(); }
}

const g = globalThis as Record<string, unknown>;
g.Storage = MemoryStorage;
g.localStorage = new MemoryStorage();
g.sessionStorage = new MemoryStorage();
const events = new EventTarget();
g.addEventListener = events.addEventListener.bind(events);
g.removeEventListener = events.removeEventListener.bind(events);
g.dispatchEvent = events.dispatchEvent.bind(events);
g.window = globalThis;
if (!g.document) g.document = { visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };

export function freshLocalStorage(): Storage {
  const s = new MemoryStorage() as unknown as Storage;
  g.localStorage = s;
  return s;
}
export function currentLocalStorage(): Storage { return g.localStorage as Storage; }
