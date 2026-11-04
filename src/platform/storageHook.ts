/**
 * Detects "the user's data changed on this device" without touching any of the app's 60+ write sites.
 *
 * localStorage.setItem/removeItem are wrapped once; when a *synced* key actually changes value, the
 * sync engine is told (debounced there into a background upload). The hook is a no-op for every other
 * key and never throws into the app's own save path.
 */
import { LS_WATCH_KEYS } from './cloud/sections';
import { notifyLocalChange } from './cloud/changeBus';

let installed = false;

function isLocalStorage(target: unknown): boolean {
  try { return target === localStorage; } catch { return false; }
}

export function installStorageHook(): void {
  if (installed || typeof Storage === 'undefined') return;
  installed = true;
  const proto = Storage.prototype;
  const originalSet = proto.setItem;
  const originalRemove = proto.removeItem;
  const originalClear = proto.clear;

  proto.setItem = function (this: Storage, key: string, value: string) {
    const watched = isLocalStorage(this) && LS_WATCH_KEYS.has(key);
    let changed = true;
    if (watched) { try { changed = this.getItem(key) !== String(value); } catch { /* assume changed */ } }
    originalSet.call(this, key, value);
    if (watched && changed) notifyLocalChange(key);
  };

  proto.removeItem = function (this: Storage, key: string) {
    const watched = isLocalStorage(this) && LS_WATCH_KEYS.has(key);
    let existed = false;
    if (watched) { try { existed = this.getItem(key) !== null; } catch { /* ignore */ } }
    originalRemove.call(this, key);
    if (watched && existed) notifyLocalChange(key);
  };

  proto.clear = function (this: Storage) {
    let touched = false;
    if (isLocalStorage(this)) {
      try { touched = [...LS_WATCH_KEYS].some(k => this.getItem(k) !== null); } catch { /* ignore */ }
    }
    originalClear.call(this);
    if (touched) notifyLocalChange();
  };
}
