/**
 * Cloud configuration (Supabase).
 *
 * The project URL and the *publishable (anon)* key are baked in at build time from
 * VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. That key is designed to be public: it grants nothing on
 * its own - Row-Level Security in supabase/quiz_schema.sql keeps every user's rows private.
 * NEVER put a `service_role` key here.
 */
import { env, isNative } from '../native';

export class CloudConfigError extends Error {
  code = 'not_configured';
  constructor(message: string) {
    super(message);
    this.name = 'CloudConfigError';
  }
}

export const isNativePlatform = isNative;

export function getSupabaseUrl(): string {
  return env('VITE_SUPABASE_URL').replace(/\/+$/, '');
}

export function getSupabaseAnonKey(): string {
  return env('VITE_SUPABASE_ANON_KEY');
}

export function getCloudEndpoint(): string {
  return getSupabaseUrl();
}

export function isCloudConfigured(): boolean {
  return /^https:\/\//i.test(getSupabaseUrl()) && getSupabaseAnonKey().length > 20;
}

export interface ServerProbe { ok: boolean; error?: string }

/** Lightweight reachability check (also detects a paused free-tier project). */
export async function probeServer(timeoutMs = 8000): Promise<ServerProbe> {
  if (!isCloudConfigured()) return { ok: false, error: 'This build has no Supabase project configured.' };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${getSupabaseUrl()}/auth/v1/health`, {
      signal: controller.signal,
      headers: { apikey: getSupabaseAnonKey() },
    });
    return res.ok ? { ok: true } : { ok: false, error: `Cloud answered ${res.status}.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: /abort/i.test(message) ? 'Cloud did not respond in time.' : 'Could not reach the cloud.' };
  } finally {
    clearTimeout(timer);
  }
}
