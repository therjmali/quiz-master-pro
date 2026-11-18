/**
 * Realtime between devices of ONE account.
 *
 * Two independent channels, so a problem with one never takes the other down:
 *
 *  1. `qm-sync:<user>`  Broadcast "sync-ping". After a device pushes, it pings the account's other devices; they
 *     pull straight away. Needs no database setup, carries no data (only the pushing device id and the new
 *     version), and every pull still goes through the authenticated `quiz_sync_pull` function.
 *  2. `qm-db:<user>`    Postgres Changes on `quiz_sync_docs` (one row per account, bumped by every push, readable
 *     only by its owner through RLS). Works once `supabase/quiz_schema.sql` has put the table in the
 *     `supabase_realtime` publication; until then it is simply silent.
 *
 * If neither connects, the engine falls back to a short poll. Sign-out removes both channels, so nothing from the
 * previous account can arrive on the next one.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from './supabase';
import { isCloudConfigured } from './config';

export type RealtimeStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';
export type RealtimeSource = 'broadcast' | 'database';

export interface RealtimeSyncCallbacks {
  onRemoteChange: (source: RealtimeSource, payload: unknown) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}

export interface SyncPing { d: string; v: number }

let clientFactory: () => SupabaseClient = getSupabase;
/** Tests swap the Supabase client for a fake one. */
export function __setRealtimeClientForTests(factory: (() => SupabaseClient) | null): void {
  clientFactory = factory ?? getSupabase;
}

let pingChannel: RealtimeChannel | null = null;
let dbChannel: RealtimeChannel | null = null;
let activeUserId: string | null = null;
let status: RealtimeStatus = 'DISCONNECTED';
let pingReady = false;

function setStatus(next: RealtimeStatus, cb?: (s: RealtimeStatus) => void): void {
  if (status === next) return;
  status = next;
  cb?.(next);
}

/**
 * Subscribe for the signed-in user. Returns the teardown function. Calling it again for the same user is a
 * no-op; for another user it first removes the previous user's channels.
 */
export function subscribeToRealtime(userId: string, deviceId: string, callbacks: RealtimeSyncCallbacks): () => void {
  if (!isCloudConfigured() || !userId) return () => undefined;
  if (activeUserId === userId && pingChannel) return () => unsubscribeFromRealtime();
  unsubscribeFromRealtime();
  activeUserId = userId;
  setStatus('CONNECTING', callbacks.onStatusChange);

  try {
    const client = clientFactory();

    pingChannel = client
      .channel(`qm-sync:${userId}`, { config: { broadcast: { self: false, ack: false } } })
      .on('broadcast', { event: 'sync-ping' }, ({ payload }) => {
        const ping = (payload ?? {}) as Partial<SyncPing>;
        if (ping.d && ping.d === deviceId) return;   // our own echo
        callbacks.onRemoteChange('broadcast', ping);
      })
      .subscribe((s) => {
        if (activeUserId !== userId) return;           // a late callback from a removed channel
        if (s === 'SUBSCRIBED') { pingReady = true; setStatus('CONNECTED', callbacks.onStatusChange); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { pingReady = false; setStatus('ERROR', callbacks.onStatusChange); }
        else if (s === 'CLOSED') { pingReady = false; setStatus('DISCONNECTED', callbacks.onStatusChange); }
      });

    dbChannel = client
      .channel(`qm-db:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quiz_sync_docs', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = (payload as { new?: { device_id?: string | null } }).new;
        if (row?.device_id && row.device_id === deviceId) return;   // our own push
        callbacks.onRemoteChange('database', payload);
      })
      .subscribe();   // errors here (publication not set up yet) are expected and harmless: the ping channel carries on
  } catch {
    setStatus('ERROR', callbacks.onStatusChange);
  }
  return () => unsubscribeFromRealtime();
}

/** Tell the account's other devices that a push just landed (best effort, never throws). */
export function sendSyncPing(ping: SyncPing): boolean {
  if (!pingChannel || !pingReady) return false;
  try {
    void pingChannel.send({ type: 'broadcast', event: 'sync-ping', payload: ping });
    return true;
  } catch {
    return false;
  }
}

/** Remove both channels (sign-out, engine stop, account switch). Safe to call at any time. */
export function unsubscribeFromRealtime(): void {
  const channels = [pingChannel, dbChannel];
  pingChannel = null;
  dbChannel = null;
  activeUserId = null;
  pingReady = false;
  status = 'DISCONNECTED';
  for (const ch of channels) {
    if (!ch) continue;
    try { void clientFactory().removeChannel(ch); } catch { /* tearing down: ignore */ }
  }
}

export function getRealtimeStatus(): RealtimeStatus { return status; }
export function isRealtimeConnected(): boolean { return status === 'CONNECTED' && pingChannel !== null; }
