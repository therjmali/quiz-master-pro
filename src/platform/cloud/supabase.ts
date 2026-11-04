/**
 * The single Supabase client. supabase-js stores the session, refreshes the access token before it
 * expires and attaches it to every request; we only customise *where* the session is kept so the
 * "Keep me signed in" switch (sessionStorage vs localStorage) works.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CloudConfigError, getSupabaseAnonKey, getSupabaseUrl, isCloudConfigured } from './config';
import { isEphemeral } from './session';

export const AUTH_STORAGE_KEY = 'qm-supabase-auth-v1';

const authStorage = {
  getItem(key: string): string | null {
    try { return sessionStorage.getItem(key) ?? localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string): void {
    try {
      if (isEphemeral()) { localStorage.removeItem(key); sessionStorage.setItem(key, value); }
      else { sessionStorage.removeItem(key); localStorage.setItem(key, value); }
    } catch { /* storage blocked: the in-memory session still works */ }
  },
  removeItem(key: string): void {
    try { sessionStorage.removeItem(key); localStorage.removeItem(key); } catch { /* ignore */ }
  },
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  if (!isCloudConfigured()) throw new CloudConfigError('Cloud sync is not set up in this build.');
  client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
      storage: authStorage,
    },
  });
  return client;
}

/** Test hook. */
export function __setSupabaseForTests(c: SupabaseClient | null): void { client = c; }
