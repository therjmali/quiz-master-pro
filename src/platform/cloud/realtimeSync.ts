/**
 * Supabase Realtime Subscription Manager.
 *
 * Implements real-time WebSocket subscriptions over Supabase Realtime channels.
 * Listens for remote Postgres changes on tables (`quiz_sync_sections`, `quiz_sync_docs`,
 * and logical entity tables `quiz_attempts`, `reports`, `notes`, `bookmarks`) filtered by `user_id`.
 * When a remote insert/update/delete occurs on another device, an immediate, non-blocking
 * incremental pull is triggered so local IndexedDB state updates in real time.
 *
 * Automatically manages subscription lifecycle: subscribes when signed in and cleanly
 * unsubscribes on sign-out/logout or component unmount to prevent memory leaks or data bleeding.
 */

import { getSupabase } from './supabase';
import { isCloudConfigured } from './config';
import type { RealtimeChannel } from '@supabase/supabase-js';

let activeChannel: RealtimeChannel | null = null;
let activeUserId: string | null = null;
let connectionStatus: 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR' = 'DISCONNECTED';

export type RealtimeStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED' | 'ERROR';

export interface RealtimeSyncCallbacks {
  onRemoteChange: (table: string, payload: unknown) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
}

/**
 * Subscribe to Supabase Realtime WebSockets for the authenticated user.
 * Returns an unsubscribe teardown function.
 */
export function subscribeToRealtime(
  userId: string,
  callbacks: RealtimeSyncCallbacks
): () => void {
  if (!isCloudConfigured() || !userId) {
    return () => {};
  }

  // Already subscribed for this exact user
  if (activeChannel && activeUserId === userId) {
    return () => unsubscribeFromRealtime();
  }

  // Clean up any stale subscription first
  unsubscribeFromRealtime();
  activeUserId = userId;
  connectionStatus = 'CONNECTING';
  callbacks.onStatusChange?.(connectionStatus);

  try {
    const supabase = getSupabase();
    const channelName = `realtime-sync:${userId}`;

    activeChannel = supabase
      .channel(channelName)
      // 1. Core sync sections table (where sharded history, details, notes, bookmarks live)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_sync_sections', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('quiz_sync_sections', payload);
        }
      )
      // 2. Document version tracker table
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_sync_docs', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('quiz_sync_docs', payload);
        }
      )
      // 3. Logical quiz_attempts table
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'quiz_attempts', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('quiz_attempts', payload);
        }
      )
      // 4. Logical reports table
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reports', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('reports', payload);
        }
      )
      // 5. Logical notes table
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notes', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('notes', payload);
        }
      )
      // 6. Logical bookmarks table
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookmarks', filter: `user_id=eq.${userId}` },
        (payload) => {
          callbacks.onRemoteChange('bookmarks', payload);
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          connectionStatus = 'CONNECTED';
          callbacks.onStatusChange?.('CONNECTED');
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          connectionStatus = 'ERROR';
          callbacks.onStatusChange?.('ERROR');
        } else if (status === 'CLOSED') {
          connectionStatus = 'DISCONNECTED';
          callbacks.onStatusChange?.('DISCONNECTED');
        }
      });

    return () => {
      unsubscribeFromRealtime();
    };
  } catch (err) {
    connectionStatus = 'ERROR';
    callbacks.onStatusChange?.('ERROR');
    return () => {};
  }
}

/**
 * Cleanly unsubscribe from Supabase Realtime channel.
 * Must be invoked on user logout or engine detachment to prevent leaks.
 */
export function unsubscribeFromRealtime(): void {
  if (activeChannel) {
    try {
      const supabase = getSupabase();
      supabase.removeChannel(activeChannel);
    } catch {
      /* ignore channel removal errors during teardown */
    }
    activeChannel = null;
  }
  activeUserId = null;
  connectionStatus = 'DISCONNECTED';
}

/** Get current realtime connection status */
export function getRealtimeStatus(): RealtimeStatus {
  return connectionStatus;
}

/** Check if realtime channel is currently active */
export function isRealtimeConnected(): boolean {
  return connectionStatus === 'CONNECTED' && activeChannel !== null;
}
