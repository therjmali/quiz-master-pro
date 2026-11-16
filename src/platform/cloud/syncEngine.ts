/**
 * Cloud sync engine (SyncEngine Service).
 *
 * Offline-first architecture:
 * - Device IndexedDB & localStorage are the local source of truth for offline speed and reliability.
 * - Cloud (Supabase) acts as the synchronized remote replica.
 * - Bidirectional synchronization:
 *   1. Foreground lifecycle sync (appStateChange / visibilitychange / online) pulls remote changes.
 *   2. Supabase Realtime WebSockets push remote updates across devices authenticated under the same user.
 *   3. Outbox sync queue with exponential backoff guarantees mutations are never dropped during network drops.
 *   4. Last-Write-Wins (LWW) conflict resolution using timestamps + 3-way merge.
 *   5. Client-generated UUIDv4 prevents primary key collisions across devices.
 *
 * Safety rules:
 * - First contact with an account that already has data prompts the user (merge / cloud / device);
 * - Untouched copy of local data is backed up before first merge;
 * - Mid-sync writes on the local device are never overwritten;
 * - Account separation ensures switching users clears state.
 */
import { useSyncExternalStore } from 'react';
import { STORE, idbGet, idbPut } from '../idb';
import { CloudError, toCloudError } from './http';
import { getCloudEndpoint } from './config';
import { getDeviceIdentity } from './device';
import { getCloudUser } from './cloudUser';
import { onLocalChange, setSyncWriteGuard, isSyncWriteGuarded } from './changeBus';
import {
  describeSection,
  applySectionsToDevice,
  readAllLocalSections,
  clearBase,
  clearMeta,
  fingerprint,
  isSyncKey,
  loadBase,
  loadMeta,
  saveBase,
  saveMeta,
  type SyncMeta,
} from './sections';
import { mergeSections, onlySyncable, planPush, remoteFromDoc, type Sections } from './syncCore';
import type { MergeConflict } from './merge3';
import * as remoteApi from './remote';
import type { RemoteDoc, RevisionRow } from './remote';
import { subscribeToRealtime, unsubscribeFromRealtime } from './realtimeSync';
import {
  enqueueMutation,
  dequeueMultiple,
  getEligibleItems,
  getPendingQueueCount,
  recordFailure,
  clearOutbox,
} from './syncQueue';
import { generateUUID } from './uuid';

export type SyncPhase =
  | 'disabled'
  | 'idle'
  | 'syncing'
  | 'synced'
  | 'paused'
  | 'pending'
  | 'offline'
  | 'error'
  | 'needs-choice'
  | 'not-set-up';

export interface SyncConflictRecord {
  id: string;
  at: string;
  key: string;
  label: string;
  path: string;
  resolution: 'local' | 'remote';
  localPreview: string;
  remotePreview: string;
  basePreview: string;
}

export interface PendingChoice {
  localSections: number;
  remoteSections: number;
  remoteVersion: number;
  remoteUpdatedAt: string | null;
}

export interface SyncState {
  phase: SyncPhase;
  deviceId: string;
  lastSyncAt: string | null;
  lastPushAt: string | null;
  lastReason: string | null;
  version: number;
  pendingCount: number;
  conflicts: SyncConflictRecord[];
  error: string | null;
  online: boolean;
  autoSync: boolean;
  needsChoice: PendingChoice | null;
  dataAppliedAt: string | null;
  appliedKeys: string[];
}

export interface SyncResult {
  ok: boolean;
  reason: string;
  version?: number;
  pushed?: string[];
  pulled?: string[];
  conflicts?: number;
  error?: string;
  skipped?: boolean;
}

export const DATA_APPLIED_EVENT = 'qm:cloud-data-applied';

const CONFLICTS_KEY = 'qm-sync-conflicts-v1';
const AUTOSYNC_KEY = 'qm-cloud-autosync-v1';
const POLL_MS = 45_000;
const LOCAL_DEBOUNCE_MS = 2500;
const QUEUE_WORKER_INTERVAL_MS = 5000;
const MAX_CONFLICTS = 40;
const MAX_PUSH_ATTEMPTS = 4;

/* ---- dependency seam (production defaults, replaceable in tests) --------------------------- */

export interface EngineDeps {
  getUserId: () => string | null;
  getEndpoint: () => string;
  remote: Pick<typeof remoteApi, 'pullDoc' | 'pushDoc' | 'listRevisions' | 'restoreRevisionRemote' | 'wipeRemote'>;
  now: () => string;
  readLocal: () => Promise<Sections>;
  applyLocal: (target: Sections, skip: ReadonlySet<string>) => Promise<string[]>;
}

const defaultDeps: EngineDeps = {
  getUserId: () => getCloudUser()?.id ?? null,
  getEndpoint: getCloudEndpoint,
  remote: remoteApi,
  now: () => new Date().toISOString(),
  readLocal: readAllLocalSections,
  applyLocal: applySectionsToDevice,
};

let deps: EngineDeps = defaultDeps;
export function __setEngineDepsForTests(next: Partial<EngineDeps> | null): void {
  deps = next ? { ...defaultDeps, ...next } : defaultDeps;
}

/* ---- state management ---------------------------------------------------------------------- */

function readConflicts(): SyncConflictRecord[] {
  try {
    const v = JSON.parse(localStorage.getItem(CONFLICTS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function readAutoSync(): boolean {
  try {
    return localStorage.getItem(AUTOSYNC_KEY) !== 'off';
  } catch {
    return true;
  }
}

let state: SyncState = {
  phase: 'disabled',
  deviceId: '',
  lastSyncAt: null,
  lastPushAt: null,
  lastReason: null,
  version: 0,
  pendingCount: 0,
  conflicts: [],
  error: null,
  online: true,
  autoSync: true,
  needsChoice: null,
  dataAppliedAt: null,
  appliedKeys: [],
};

function initState(): void {
  const meta = loadMeta();
  const queueCount = getPendingQueueCount();
  state = {
    ...state,
    deviceId: getDeviceIdentity().id,
    conflicts: readConflicts(),
    autoSync: readAutoSync(),
    lastSyncAt: meta.lastSyncAt,
    version: meta.version,
    pendingCount: queueCount,
    online: typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  };
}

const listeners = new Set<() => void>();
function emit(): void {
  listeners.forEach((cb) => {
    try { cb(); } catch { /* ignore */ }
  });
}

function setState(patch: Partial<SyncState>): void {
  state = { ...state, ...patch };
  emit();
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, getSyncState);
}

function persistConflicts(list: SyncConflictRecord[]): void {
  try {
    localStorage.setItem(CONFLICTS_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export function clearConflicts(): void {
  persistConflicts([]);
  setState({ conflicts: [] });
}

function preview(value: unknown): string {
  if (value === undefined) return '(nothing)';
  let s: string;
  try {
    s = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    s = String(value);
  }
  return s.length > 140 ? `${s.slice(0, 137)}...` : s;
}

function recordConflicts(key: string, conflicts: MergeConflict[]): SyncConflictRecord[] {
  const at = deps.now();
  return conflicts.slice(0, 8).map((c, i) => ({
    id: `${at}-${key}-${i}`,
    at,
    key,
    label: describeSection(key).label,
    path: c.path,
    resolution: c.resolution,
    localPreview: preview(c.local),
    remotePreview: preview(c.remote),
    basePreview: preview(c.base),
  }));
}

/* ---- local change tracking & lifecycle ----------------------------------------------------- */

let dirty = true; // device may differ from last sync
let changeSeq = 0;
let started = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;
let queueWorkerTimer: ReturnType<typeof setInterval> | null = null;
let localTimer: ReturnType<typeof setTimeout> | null = null;
let settleTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribers: Array<() => void> = [];
let running: Promise<SyncResult> | null = null;
let queued = false;
let pendingChoice: { remote: Sections; local: Sections; base: Sections; doc: RemoteDoc } | null = null;

/** Remember local modifications and queue them for synchronization */
export function noteLocalChange(sectionKey?: string, value?: unknown): void {
  dirty = true;
  changeSeq++;

  if (sectionKey && isSyncKey(sectionKey)) {
    enqueueMutation(sectionKey, value, 'upsert', deps.now());
  }

  const count = Math.max(getPendingQueueCount(), 1);
  setState({
    pendingCount: count,
    phase: state.autoSync && state.phase !== 'needs-choice' && state.phase !== 'disabled' ? 'pending' : state.phase,
  });
}

/**
 * Start the synchronization engine:
 * 1. Hooks Capacitor native appStateChange and document.visibilitychange for foreground resume.
 * 2. Establishes Supabase Realtime WebSocket subscription for live multi-device syncing.
 * 3. Launches exponential-backoff queue worker to retry failed outbox items.
 */
export function startSyncEngine(): void {
  if (started) return;
  initState();
  const userId = deps.getUserId();
  if (!userId) {
    setState({ phase: 'disabled' });
    return;
  }

  started = true;
  dirty = true;
  setState({
    phase: state.autoSync ? 'idle' : 'paused',
    deviceId: getDeviceIdentity().id,
    error: null,
  });

  // ── 1. Foreground lifecycle listeners ──
  const onVisibility = () => {
    if (document.visibilityState === 'visible' && state.autoSync) {
      void syncFromCloud('foreground-resume');
    }
  };

  const onWindowFocus = () => {
    if (state.autoSync) {
      void syncFromCloud('window-focus');
    }
  };

  const onOnline = () => {
    setState({ online: true });
    if (state.autoSync) {
      void syncFromCloud('online-reconnect');
    }
  };

  const onOffline = () => {
    setState({
      online: false,
      phase: 'offline',
      pendingCount: getPendingQueueCount(),
    });
  };

  const onLocal = (key?: string) => {
    noteLocalChange(key);
    if (!state.autoSync) return;
    if (localTimer) clearTimeout(localTimer);
    localTimer = setTimeout(() => {
      void syncNow('local-change');
    }, LOCAL_DEBOUNCE_MS);
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    unsubscribers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    unsubscribers.push(() => window.removeEventListener('focus', onWindowFocus));
    unsubscribers.push(() => window.removeEventListener('online', onOnline));
    unsubscribers.push(() => window.removeEventListener('offline', onOffline));
  }

  // Capacitor native App resume listener (Android/iOS)
  try {
    import('@capacitor/app').then(({ App }) => {
      const handle = App.addListener('appStateChange', (appState) => {
        if (appState.isActive && state.autoSync) {
          void syncFromCloud('capacitor-app-resume');
        }
      });
      unsubscribers.push(() => {
        handle.then(h => h.remove()).catch(() => {});
      });
    }).catch(() => {});
  } catch {}

  unsubscribers.push(onLocalChange(onLocal));

  // ── 2. Supabase Realtime WebSocket subscription ──
  try {
    const unsubRealtime = subscribeToRealtime(userId, {
      onRemoteChange: (table) => {
        if (state.autoSync && state.phase !== 'disabled') {
          void syncFromCloud(`realtime:${table}`);
        }
      },
      onStatusChange: (status) => {
        if (status === 'ERROR') {
          // Fall back gracefully to background polling if WebSockets fail
        }
      },
    });
    unsubscribers.push(unsubRealtime);
  } catch {}

  // ── 3. Periodic poll & Queue worker with exponential backoff ──
  pollTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
    if (state.autoSync) void syncNow('poll');
  }, POLL_MS);

  queueWorkerTimer = setInterval(() => {
    const eligible = getEligibleItems();
    if (eligible.length > 0 && state.online && state.autoSync && !running) {
      void syncNow('queue-backoff-retry');
    }
  }, QUEUE_WORKER_INTERVAL_MS);

  // Initial sync on startup
  void syncFromCloud('boot');
}

/** Stop the synchronization engine and clean up all listeners/subscriptions */
export function stopSyncEngine(): void {
  started = false;
  if (pollTimer) clearInterval(pollTimer);
  if (queueWorkerTimer) clearInterval(queueWorkerTimer);
  if (localTimer) clearTimeout(localTimer);
  if (settleTimer) clearTimeout(settleTimer);
  pollTimer = null;
  queueWorkerTimer = null;
  localTimer = null;
  settleTimer = null;

  unsubscribers.forEach((u) => u());
  unsubscribers = [];
  unsubscribeFromRealtime();

  pendingChoice = null;
  setState({
    phase: 'disabled',
    needsChoice: null,
    pendingCount: 0,
    error: null,
  });
}

export function setAutoSync(enabled: boolean): void {
  try {
    localStorage.setItem(AUTOSYNC_KEY, enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  setState({ autoSync: enabled, phase: enabled ? 'idle' : 'paused' });
  if (enabled) void syncNow('autosync-on');
}

/**
 * Foreground Lifecycle Sync:
 * Non-blocking sync called on app resume, visibility change, or Realtime notification.
 * Pulls all records from Supabase where updated_at > last_local_sync_timestamp,
 * reconciles with local IndexedDB/localStorage, and dispatches DATA_APPLIED_EVENT.
 */
export async function syncFromCloud(reason = 'cloud-sync'): Promise<SyncResult> {
  if (!deps.getUserId()) {
    return { ok: false, reason, skipped: true, error: 'Not signed in' };
  }
  return syncNow(reason);
}

/** Trigger synchronization immediately */
export function syncNow(reason = 'manual'): Promise<SyncResult> {
  if (!deps.getUserId()) {
    return Promise.resolve({ ok: false, reason, skipped: true, error: 'Not signed in' });
  }
  if (running) {
    queued = true;
    return running;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setState({ phase: 'offline', online: false, pendingCount: getPendingQueueCount() });
    return Promise.resolve({ ok: false, reason, skipped: true, error: 'Offline' });
  }

  running = (async () => {
    try {
      return await performSync(reason);
    } catch (err) {
      const e = toCloudError(err);
      const notSetUp = e.code === 'not_set_up';
      const isNetwork = e.code === 'network';

      // Record failure for pending outbox items so exponential backoff engages
      const pendingItems = getEligibleItems();
      pendingItems.forEach((item) => recordFailure(item.id, e.message));

      setState({
        phase: notSetUp ? 'not-set-up' : isNetwork ? 'offline' : 'error',
        error: e.message,
        online: isNetwork ? false : state.online,
        pendingCount: getPendingQueueCount(),
      });
      saveMeta({ ...loadMeta(), lastError: e.message });
      return { ok: false, reason, error: e.message };
    } finally {
      running = null;
      if (queued) {
        queued = false;
        setTimeout(() => {
          void syncNow('queued');
        }, 300);
      }
    }
  })();

  return running;
}

/* ---- Core Sync Execution ------------------------------------------------------------------- */

async function createPreMigrationBackup(userId: string, local: Sections): Promise<void> {
  const key = `premigration:${userId}`;
  if (await idbGet(STORE.kv, key)) return; // keep very first backup
  await idbPut(STORE.kv, { at: deps.now(), sections: local, verified: false }, key);
}

async function markMigrationVerified(userId: string): Promise<void> {
  const key = `premigration:${userId}`;
  const saved = await idbGet<{ at: string; sections: Sections; verified: boolean }>(STORE.kv, key);
  if (saved) await idbPut(STORE.kv, { ...saved, verified: true }, key);
}

function haveHeader(meta: SyncMeta): string {
  return Object.entries(meta.serverHashes)
    .map(([k, h]) => `${k}:${h}`)
    .join(',');
}

async function performSync(reason: string): Promise<SyncResult> {
  const userId = deps.getUserId();
  if (!userId) return { ok: false, reason, skipped: true, error: 'Not signed in' };
  const startSeq = changeSeq;
  setState({ phase: 'syncing', error: null, lastReason: reason });

  let meta = loadMeta();
  const endpoint = deps.getEndpoint();
  if ((meta.userId && meta.userId !== userId) || (meta.endpoint && meta.endpoint !== endpoint)) {
    // Different account or endpoint: clear previous base
    await clearBase();
    clearMeta();
    clearOutbox();
    meta = loadMeta();
  }
  const base = onlySyncable(await loadBase());

  // ── Pull remote state from Supabase ──
  const doc = await deps.remote.pullDoc(haveHeader(meta));
  const remote = onlySyncable(remoteFromDoc(doc, base));
  const remoteChanged =
    Object.keys(doc.data ?? {}).length > 0 ||
    (doc.changedKeys ?? []).length > 0 ||
    doc.version !== meta.version;

  // Check if remote updated_at is newer than our last sync timestamp
  const lastSyncTs = meta.lastSyncAt ? new Date(meta.lastSyncAt).getTime() : 0;
  const remoteUpdatedTs = doc.updatedAt ? new Date(doc.updatedAt).getTime() : 0;
  const isRemoteNewer = remoteUpdatedTs > lastSyncTs;

  // Fast path: nothing changed anywhere since the last sync
  const pendingQueueCount = getPendingQueueCount();
  if (!dirty && pendingQueueCount === 0 && !remoteChanged && !isRemoteNewer && meta.userId === userId && !meta.firstSyncDecision) {
    const nextMeta: SyncMeta = { ...meta, lastSyncAt: deps.now(), lastError: null, version: doc.version };
    saveMeta(nextMeta);
    setState({
      phase: 'synced',
      lastSyncAt: nextMeta.lastSyncAt,
      version: doc.version,
      error: null,
      pendingCount: 0,
    });
    return { ok: true, reason, version: doc.version, pushed: [], pulled: [], conflicts: 0 };
  }

  // Read local device data
  const local = onlySyncable(await deps.readLocal());
  const localCount = Object.keys(local).length;
  const remoteCount = Object.keys(remote).length;
  const localDiffers = [...new Set([...Object.keys(local), ...Object.keys(remote)])].some(
    (k) => fingerprint(local[k] ?? null) !== fingerprint(remote[k] ?? null)
  );

  // First contact conflict check: if account already has data, ask before overwriting
  if (!meta.userId && localCount > 0 && remoteCount > 0 && localDiffers && !meta.firstSyncDecision) {
    pendingChoice = { remote, local, base, doc };
    setState({
      phase: 'needs-choice',
      version: doc.version,
      lastReason: reason,
      needsChoice: {
        localSections: localCount,
        remoteSections: remoteCount,
        remoteVersion: doc.version,
        remoteUpdatedAt: doc.updatedAt ?? null,
      },
    });
    return { ok: false, reason, skipped: true, error: 'Choose how to combine this device with the cloud copy.' };
  }

  const firstContact = !meta.userId;
  if (firstContact && localCount > 0) await createPreMigrationBackup(userId, local);

  const decision = meta.firstSyncDecision ?? (remoteCount === 0 ? 'device' : 'merge');
  let merged: Sections;
  const newConflicts: SyncConflictRecord[] = [];

  if (decision === 'cloud') {
    merged = { ...remote };
  } else if (decision === 'device') {
    merged = { ...local };
  } else {
    // ── Last-Write-Wins (LWW) + 3-Way Merge ──
    const outcome = mergeSections(base, local, remote);
    merged = outcome.merged;
    for (const c of outcome.conflicts) {
      newConflicts.push(...recordConflicts(c.key, c.conflicts));
    }
  }

  // Plan push to Supabase
  let plan = planPush(merged, remote, { forceAll: decision === 'device', now: deps.now() });
  let version = doc.version;
  let serverSections = doc.sections ?? {};
  let appliedToServer: string[] = [];

  for (let attempt = 0; attempt < MAX_PUSH_ATTEMPTS; attempt++) {
    if (Object.keys(plan.sections).length === 0 && plan.deletions.length === 0) break;
    try {
      const res = await deps.remote.pushDoc({
        baseVersion: version,
        sections: plan.sections,
        deletions: plan.deletions,
      });
      version = res.version;
      serverSections = res.sections ?? serverSections;
      appliedToServer = res.applied ?? [];
      const rejected = res.rejected ?? [];
      if (rejected.length) {
        throw new CloudError(
          `The cloud rejected "${describeSection(rejected[0].key).label}" (${rejected[0].reason.replace(/_/g, ' ')}).`,
          'rejected',
          400
        );
      }
      break;
    } catch (err) {
      const e = toCloudError(err);
      if (e.status !== 409 || attempt === MAX_PUSH_ATTEMPTS - 1) throw e;

      // Optimistic concurrency: another device pushed first. Merge its document and retry push.
      const details = (e.details ?? {}) as Partial<RemoteDoc>;
      const retryRemote = onlySyncable({ ...(details.data ?? {}) });
      version = Number(details.version) || version + 1;
      serverSections = details.sections ?? serverSections;
      const outcome = mergeSections(base, local, retryRemote);
      merged = outcome.merged;
      for (const c of outcome.conflicts) {
        newConflicts.push(...recordConflicts(c.key, c.conflicts));
      }
      plan = planPush(merged, retryRemote, { now: deps.now() });
      Object.assign(remote, retryRemote);
    }
  }

  // Clear pushed items from outbox queue
  if (appliedToServer.length > 0) {
    dequeueMultiple(appliedToServer.map(k => k.replace(/^-/, '')));
  }

  if (firstContact && localCount > 0) {
    const missing = Object.keys(local).filter((k) => !(k in serverSections) && merged[k] !== undefined);
    if (missing.length) {
      throw new CloudError(
        `Upload check failed for: ${missing.map((k) => describeSection(k).label).join(', ')}. Local data preserved.`,
        'migration_unverified',
        0
      );
    }
    await markMigrationVerified(userId);
  }

  // Preserve any local edits made mid-sync
  const sig = (v: unknown): string => (v === undefined ? '\u2205' : fingerprint(v));
  const freshNow = onlySyncable(await deps.readLocal());
  const touched = new Set<string>();
  for (const key of new Set([...Object.keys(local), ...Object.keys(freshNow)])) {
    if (sig(freshNow[key]) !== sig(local[key])) touched.add(key);
  }

  let appliedKeys: string[] = [];
  setSyncWriteGuard(true);
  try {
    appliedKeys = await deps.applyLocal(merged, touched);
  } finally {
    setSyncWriteGuard(false);
  }

  const nextMeta: SyncMeta = {
    ...meta,
    userId,
    endpoint,
    version,
    serverHashes: Object.fromEntries(Object.entries(serverSections).map(([k, s]) => [k, s.hash])),
    localFingerprints: Object.fromEntries(
      Object.keys(merged).map((k) => [k, touched.has(k) ? sig(local[k]) : fingerprint(merged[k])])
    ),
    lastSyncAt: deps.now(),
    lastError: null,
    firstSyncDecision: null,
  };

  const baseToSave: Sections = { ...merged };
  for (const key of touched) {
    if (merged[key] === undefined || sig(merged[key]) === sig(local[key])) continue;
    if (base[key] === undefined) delete baseToSave[key];
    else baseToSave[key] = base[key];
  }
  await saveBase(baseToSave);
  saveMeta(nextMeta);

  dirty = changeSeq !== startSeq || touched.size > 0;
  const remainingOutbox = getPendingQueueCount();

  const allConflicts = [...newConflicts, ...state.conflicts].slice(0, MAX_CONFLICTS);
  if (newConflicts.length) persistConflicts(allConflicts);
  const pushed = appliedToServer.filter((k) => !k.startsWith('-'));

  setState({
    phase: 'synced',
    lastSyncAt: nextMeta.lastSyncAt,
    lastPushAt: pushed.length ? nextMeta.lastSyncAt : state.lastPushAt,
    version,
    error: null,
    needsChoice: null,
    pendingCount: remainingOutbox + (dirty ? 1 : 0),
    conflicts: allConflicts,
    dataAppliedAt: appliedKeys.length ? nextMeta.lastSyncAt : state.dataAppliedAt,
    appliedKeys,
  });

  if (appliedKeys.length && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(DATA_APPLIED_EVENT, { detail: { keys: appliedKeys, reason } }));
  } else if (touched.size > 0) {
    if (settleTimer) clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      settleTimer = null;
      void syncNow('settle');
    }, 700);
  }

  return { ok: true, reason, version, pushed, pulled: appliedKeys, conflicts: newConflicts.length };
}

/* ---- First-sync resolution & manual actions ------------------------------------------------ */

export async function resolveFirstSync(choice: 'merge' | 'cloud' | 'device'): Promise<SyncResult> {
  const meta = loadMeta();
  saveMeta({ ...meta, firstSyncDecision: choice, userId: meta.userId ?? null });
  pendingChoice = null;
  setState({ needsChoice: null, phase: 'syncing' });
  dirty = true;
  try {
    return await syncNow(`first-sync:${choice}`);
  } finally {
    saveMeta({ ...loadMeta(), firstSyncDecision: null });
  }
}

/** Replace everything on this device with the cloud copy */
export async function pullCloudOverDevice(): Promise<SyncResult> {
  await clearBase();
  clearOutbox();
  saveMeta({ ...loadMeta(), serverHashes: {}, firstSyncDecision: 'cloud' });
  dirty = true;
  try {
    return await syncNow('cloud-over-device');
  } finally {
    saveMeta({ ...loadMeta(), firstSyncDecision: null });
  }
}

/** Replace the cloud copy with this device's data */
export async function pushDeviceOverCloud(): Promise<SyncResult> {
  await clearBase();
  saveMeta({ ...loadMeta(), serverHashes: {}, firstSyncDecision: 'device' });
  dirty = true;
  try {
    return await syncNow('device-over-cloud');
  } finally {
    saveMeta({ ...loadMeta(), firstSyncDecision: null });
  }
}

export async function fetchRevisions(): Promise<RevisionRow[]> {
  return deps.remote.listRevisions();
}

export async function restoreRevision(version: number): Promise<SyncResult> {
  if (!deps.getUserId()) return { ok: false, reason: 'restore', skipped: true, error: 'Not signed in' };
  try {
    const doc = await deps.remote.restoreRevisionRemote(version);
    const remote = onlySyncable(doc.data ?? {});
    await clearBase();
    clearOutbox();
    let appliedKeys: string[] = [];
    setSyncWriteGuard(true);
    try {
      appliedKeys = await deps.applyLocal(remote, new Set());
    } finally {
      setSyncWriteGuard(false);
    }
    await saveBase(remote);
    saveMeta({
      ...loadMeta(),
      userId: deps.getUserId(),
      endpoint: deps.getEndpoint(),
      version: doc.version,
      serverHashes: Object.fromEntries(Object.entries(doc.sections ?? {}).map(([k, s]) => [k, s.hash])),
      lastSyncAt: deps.now(),
      lastError: null,
    });
    dirty = false;
    setState({
      phase: 'synced',
      version: doc.version,
      lastSyncAt: deps.now(),
      appliedKeys,
      dataAppliedAt: appliedKeys.length ? deps.now() : state.dataAppliedAt,
      pendingCount: 0,
    });
    if (appliedKeys.length && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(DATA_APPLIED_EVENT, { detail: { keys: appliedKeys, reason: 'restore' } }));
    }
    return { ok: true, reason: 'restore', version: doc.version, pulled: appliedKeys };
  } catch (err) {
    const e = toCloudError(err);
    setState({ error: e.message });
    return { ok: false, reason: 'restore', error: e.message };
  }
}

/** Delete cloud copy only; this device keeps its data */
export async function wipeCloudCopy(): Promise<void> {
  await deps.remote.wipeRemote();
  await clearBase();
  clearOutbox();
  saveMeta({ ...loadMeta(), serverHashes: {}, version: 0, lastSyncAt: null });
  dirty = true;
  setState({ version: 0, lastSyncAt: null, pendingCount: 0 });
}

export async function forgetCloudState(): Promise<void> {
  await clearBase();
  clearMeta();
  clearOutbox();
  dirty = true;
  setState({ lastSyncAt: null, lastPushAt: null, version: 0, pendingCount: 0 });
}

export async function detachCloudAccount(): Promise<void> {
  stopSyncEngine();
  await clearBase();
  clearMeta();
  clearOutbox();
  dirty = true;
  setSyncWriteGuard(false);
  setState({
    lastSyncAt: null,
    lastPushAt: null,
    version: 0,
    conflicts: state.conflicts,
    pendingCount: 0,
  });
}

export function refreshEngineForAccount(): void {
  stopSyncEngine();
  started = false;
  startSyncEngine();
}

/** Test reset hook */
export function __resetEngineForTests(): void {
  stopSyncEngine();
  started = false;
  running = null;
  queued = false;
  dirty = true;
  changeSeq = 0;
  pendingChoice = null;
  listeners.clear();
  setSyncWriteGuard(false);
  clearOutbox();
  state = {
    ...state,
    phase: 'disabled',
    error: null,
    conflicts: [],
    pendingCount: 0,
    needsChoice: null,
    appliedKeys: [],
    dataAppliedAt: null,
    lastSyncAt: null,
    lastPushAt: null,
    version: 0,
  };
  deps = defaultDeps;
}

export { isSyncWriteGuarded, isSyncKey, generateUUID };
