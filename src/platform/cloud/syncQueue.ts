/**
 * Outbox Sync Queue with Exponential Backoff.
 *
 * Stores local mutations in a persistent queue (localStorage / IndexedDB) when offline
 * or when Supabase calls fail. A background worker periodically processes the queue with
 * exponential backoff (2s, 4s, 8s, 16s, up to 60s) and automatic immediate retry upon
 * network reconnection or app resume.
 */

import { generateUUID } from './uuid';

export interface OutboxItem {
  id: string;               // UUIDv4
  sectionKey: string;       // Store/Section key (e.g. 'hist:2026-11', 'qd:2026-11', 'bookmarks')
  operation: 'upsert' | 'delete';
  value?: unknown;          // Payload data
  updatedAt: string;        // ISO timestamp for Last-Write-Wins comparison
  retryCount: number;       // Number of failed attempts
  nextRetryAt: number;      // Epoch ms when item is eligible for next attempt
  lastError?: string;       // Description of last failure
}

const OUTBOX_STORAGE_KEY = 'qm_sync_outbox_v2';
const BASE_BACKOFF_MS = 2000;   // 2 seconds base delay
const MAX_BACKOFF_MS = 60000;   // 60 seconds max delay
const MAX_RETRIES = 12;         // Maximum retry attempts before flagging permanent error

// In-memory cache of outbox
let cachedQueue: OutboxItem[] | null = null;
const listeners = new Set<(queue: OutboxItem[]) => void>();

function emit(): void {
  const current = getOutbox();
  listeners.forEach(cb => { try { cb(current); } catch {} });
}

export function subscribeOutbox(cb: (queue: OutboxItem[]) => void): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/** Load outbox from storage into memory */
export function getOutbox(): OutboxItem[] {
  if (cachedQueue !== null) return cachedQueue;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(OUTBOX_STORAGE_KEY) : null;
    cachedQueue = raw ? JSON.parse(raw) : [];
  } catch {
    cachedQueue = [];
  }
  return cachedQueue!;
}

/** Persist outbox to storage */
function saveOutbox(queue: OutboxItem[]): void {
  cachedQueue = queue;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(OUTBOX_STORAGE_KEY, JSON.stringify(queue));
    }
  } catch {
    /* storage quota fallback */
  }
  emit();
}

/**
 * Calculate exponential backoff with jitter:
 * delay = min(BASE * 2^retryCount, MAX) + random_jitter
 */
export function calculateBackoffMs(retryCount: number): number {
  const expDelay = Math.min(BASE_BACKOFF_MS * Math.pow(2, retryCount), MAX_BACKOFF_MS);
  const jitter = Math.floor(Math.random() * 500); // 0-500ms jitter to prevent thundering herd
  return expDelay + jitter;
}

/**
 * Enqueue a mutation to the persistent outbox.
 * If an item for the same sectionKey already exists, update it with the newer value (LWW).
 */
export function enqueueMutation(
  sectionKey: string,
  value: unknown,
  operation: 'upsert' | 'delete' = 'upsert',
  updatedAt: string = new Date().toISOString()
): OutboxItem {
  const queue = getOutbox();
  const existingIdx = queue.findIndex(item => item.sectionKey === sectionKey);

  const item: OutboxItem = {
    id: existingIdx >= 0 ? queue[existingIdx].id : generateUUID(),
    sectionKey,
    operation,
    value,
    updatedAt,
    retryCount: 0,
    nextRetryAt: Date.now(), // eligible immediately
  };

  if (existingIdx >= 0) {
    // Replace existing queued item with the newer mutation
    queue[existingIdx] = item;
  } else {
    queue.push(item);
  }

  saveOutbox([...queue]);
  return item;
}

/** Remove an item from the outbox upon successful push */
export function dequeueMutation(id: string): void {
  const queue = getOutbox().filter(item => item.id !== id);
  saveOutbox(queue);
}

/** Remove multiple items by IDs */
export function dequeueMultiple(ids: string[]): void {
  const set = new Set(ids);
  const queue = getOutbox().filter(item => !set.has(item.id));
  saveOutbox(queue);
}

/** Record a failure for an item, applying exponential backoff */
export function recordFailure(id: string, error: string): void {
  const queue = getOutbox();
  const idx = queue.findIndex(item => item.id === id);
  if (idx < 0) return;

  const current = queue[idx];
  const nextRetries = current.retryCount + 1;
  const backoffMs = calculateBackoffMs(nextRetries);

  queue[idx] = {
    ...current,
    retryCount: nextRetries,
    nextRetryAt: Date.now() + backoffMs,
    lastError: error,
  };

  saveOutbox([...queue]);
}

/** Get items that are currently eligible for retry */
export function getEligibleItems(now: number = Date.now()): OutboxItem[] {
  return getOutbox().filter(item => item.nextRetryAt <= now && item.retryCount < MAX_RETRIES);
}

/** Total count of pending items in outbox */
export function getPendingQueueCount(): number {
  return getOutbox().length;
}

/** Clear all items in outbox (e.g. on account sign-out or reset) */
export function clearOutbox(): void {
  saveOutbox([]);
}

/** Test reset helper */
export function __resetOutboxForTests(): void {
  cachedQueue = [];
  try { if (typeof localStorage !== 'undefined') localStorage.removeItem(OUTBOX_STORAGE_KEY); } catch {}
  listeners.clear();
}
