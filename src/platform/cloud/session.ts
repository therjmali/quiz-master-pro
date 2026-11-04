/**
 * "Keep me signed in" preference. supabase-js owns the session itself (storage, refresh); this only
 * decides *where* it is stored: localStorage (persistent) or sessionStorage (until the tab closes).
 */
const EPHEMERAL_KEY = 'qm-session-ephemeral';

export function setEphemeralSession(ephemeral: boolean): void {
  try {
    if (ephemeral) localStorage.setItem(EPHEMERAL_KEY, '1');
    else localStorage.removeItem(EPHEMERAL_KEY);
  } catch { /* ignore */ }
}

export function isEphemeral(): boolean {
  try { return localStorage.getItem(EPHEMERAL_KEY) === '1'; } catch { return false; }
}
