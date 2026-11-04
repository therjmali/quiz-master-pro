/**
 * Automatic local backups.
 *
 * A snapshot of everything that matters (the same data that syncs: history, library, bookmarks,
 * mistakes, progress, preferences - never API keys) is stored in this device's IndexedDB, compressed
 * and checksummed. Snapshots are taken automatically (at most once per interval, only when the data
 * changed), before any risky operation (restore, import, "use cloud"), and on demand.
 *
 *   - rotation keeps the newest N automatic snapshots plus a few "safety" snapshots;
 *   - every snapshot is read back and verified right after it is written;
 *   - restoring first takes a safety snapshot, so a restore can itself be undone;
 *   - snapshots can be exported to a file (and files imported) to keep a copy OFF the device.
 *
 * Honest limit: snapshots live inside the app's storage, so uninstalling the app or clearing its data
 * deletes them. Cloud sync and exported files are the copies that survive that.
 */
import { STORE, idbDelete, idbGet, idbPut } from './idb';
import { applySectionsToDevice, fingerprint, readAllLocalSections } from './cloud/sections';
import { gunzipToString, gzipString, gzipSupported, looksGzipped } from './gzip';
import { appVersion } from './native';

export type BackupReason = 'auto' | 'manual' | 'before-restore' | 'before-import' | 'before-reset' | 'before-cloud';

export interface BackupSettings { enabled: boolean; intervalHours: number; keep: number }
export const DEFAULT_BACKUP_SETTINGS: BackupSettings = { enabled: true, intervalHours: 24, keep: 7 };
const SETTINGS_KEY = 'qm-autobackup-v1';
const INDEX_KEY = 'autobackup-index-v1';
const MAX_SAFETY = 5;
export const BACKUP_FORMAT = 'quiz-master-pro-backup';
export const BACKUP_SCHEMA = 1;

export interface BackupCounts { sections: number; history: number; folders: number; bookmarks: number }
export interface BackupMeta {
  id: string;
  createdAt: string;
  reason: BackupReason;
  appVersion: string;
  bytes: number;
  checksum: string;
  counts: BackupCounts;
  compressed: boolean;
}

interface StoredBackup { meta: BackupMeta; payload: Uint8Array | string }

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schema: number;
  createdAt: string;
  appVersion: string;
  checksum: string;
  sections: Record<string, unknown>;
}

export function getBackupSettings(): BackupSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      enabled: raw.enabled !== false,
      intervalHours: clamp(Number(raw.intervalHours) || DEFAULT_BACKUP_SETTINGS.intervalHours, 1, 24 * 14),
      keep: clamp(Math.floor(Number(raw.keep) || DEFAULT_BACKUP_SETTINGS.keep), 1, 30),
    };
  } catch { return { ...DEFAULT_BACKUP_SETTINGS }; }
}
export function saveBackupSettings(s: BackupSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
function clamp(n: number, lo: number, hi: number): number { return Math.min(hi, Math.max(lo, n)); }

/* ---- counting / checksum ------------------------------------------------------------------- */

export function countSections(sections: Record<string, unknown>): BackupCounts {
  let history = 0;
  for (const [k, v] of Object.entries(sections)) {
    if (k.startsWith('hist:')) history += Object.keys((v as { items?: object })?.items ?? {}).length;
  }
  const folders = Object.keys(((sections.bookmarks as { folders?: object })?.folders) ?? {}).length;
  const bookmarkCount = Object.values(((sections.bookmarks as { folders?: Record<string, { questions?: unknown[] }> })?.folders) ?? {})
    .reduce((n, f) => n + (f?.questions?.length ?? 0), 0);
  return { sections: Object.keys(sections).length, history, folders, bookmarks: bookmarkCount };
}

export function checksumOf(sections: Record<string, unknown>): string {
  return `${Object.keys(sections).length}-${fingerprint(sections)}`;
}

/* ---- index (metadata list, so listing never loads payloads) -------------------------------- */

async function readIndex(): Promise<BackupMeta[]> {
  const idx = await idbGet<BackupMeta[]>(STORE.kv, INDEX_KEY);
  return Array.isArray(idx) ? idx : [];
}
async function writeIndex(list: BackupMeta[]): Promise<void> {
  await idbPut(STORE.kv, list, INDEX_KEY);
}

export async function listBackups(): Promise<BackupMeta[]> {
  return (await readIndex()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/* ---- create / verify / rotate -------------------------------------------------------------- */

async function encodePayload(sections: Record<string, unknown>, createdAt: string, checksum: string): Promise<{ payload: Uint8Array | string; compressed: boolean; bytes: number }> {
  const file: BackupFile = { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, createdAt, appVersion: appVersion(), checksum, sections };
  const json = JSON.stringify(file);
  if (gzipSupported()) {
    const gz = await gzipString(json);
    return { payload: gz, compressed: true, bytes: gz.byteLength };
  }
  return { payload: json, compressed: false, bytes: json.length };
}

async function decodePayload(stored: StoredBackup): Promise<BackupFile> {
  const text = typeof stored.payload === 'string' ? stored.payload : await gunzipToString(stored.payload);
  return parseBackupText(text);
}

export function parseBackupText(text: string): BackupFile {
  let data: BackupFile;
  try { data = JSON.parse(text) as BackupFile; } catch { throw new Error('This file is not a valid backup (it could not be read).'); }
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('This file is not a Quiz Master Pro backup.');
  if (typeof data.schema !== 'number' || data.schema > BACKUP_SCHEMA) throw new Error('This backup was made by a newer version of the app. Update the app and try again.');
  if (!data.sections || typeof data.sections !== 'object') throw new Error('This backup has no data in it.');
  if (data.checksum !== checksumOf(data.sections)) throw new Error('This backup is damaged (its checksum does not match). It was not restored.');
  return data;
}

export async function parseBackupBytes(bytes: Uint8Array): Promise<BackupFile> {
  const text = looksGzipped(bytes) ? await gunzipToString(bytes) : new TextDecoder().decode(bytes);
  return parseBackupText(text);
}

export async function createBackup(reason: BackupReason = 'manual'): Promise<BackupMeta | null> {
  const sections = await readAllLocalSections();
  if (Object.keys(sections).length === 0) return null;                    // nothing worth saving yet
  const checksum = checksumOf(sections);
  const index = await readIndex();

  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`;
  const encoded = await encodePayload(sections, createdAt, checksum);
  const meta: BackupMeta = { id, createdAt, reason, appVersion: appVersion(), bytes: encoded.bytes, checksum, counts: countSections(sections), compressed: encoded.compressed };

  const ok = await idbPut(STORE.backups, { meta, payload: encoded.payload } satisfies StoredBackup, id);
  if (!ok) throw new Error('The device refused to store the backup (storage full?).');
  // Read it back: a backup that cannot be read is worse than none.
  const back = await idbGet<StoredBackup>(STORE.backups, id);
  if (!back) throw new Error('The backup could not be verified after saving.');
  await decodePayload(back);

  await writeIndex([...index, meta]);
  await rotate();
  return meta;
}

async function rotate(): Promise<void> {
  const { keep } = getBackupSettings();
  const list = (await readIndex()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const routine = list.filter(m => m.reason === 'auto' || m.reason === 'manual');
  const safety = list.filter(m => m.reason !== 'auto' && m.reason !== 'manual');
  const drop = [...routine.slice(keep), ...safety.slice(MAX_SAFETY)];
  if (drop.length === 0) return;
  for (const m of drop) await idbDelete(STORE.backups, m.id);
  const dropped = new Set(drop.map(m => m.id));
  await writeIndex(list.filter(m => !dropped.has(m.id)));
}

export async function deleteBackup(id: string): Promise<void> {
  await idbDelete(STORE.backups, id);
  await writeIndex((await readIndex()).filter(m => m.id !== id));
}

export async function deleteAllBackups(): Promise<void> {
  for (const m of await readIndex()) await idbDelete(STORE.backups, m.id);
  await writeIndex([]);
}

export async function verifyBackup(id: string): Promise<{ ok: boolean; message: string }> {
  try {
    const stored = await idbGet<StoredBackup>(STORE.backups, id);
    if (!stored) return { ok: false, message: 'Backup not found.' };
    const file = await decodePayload(stored);
    return { ok: true, message: `Backup is intact (${countSections(file.sections).sections} sections).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Backup is damaged.' };
  }
}

/* ---- scheduling ---------------------------------------------------------------------------- */

export function isBackupDue(now: Date, latestAuto: BackupMeta | undefined, settings = getBackupSettings()): boolean {
  if (!settings.enabled) return false;
  if (!latestAuto) return true;
  return now.getTime() - new Date(latestAuto.createdAt).getTime() >= settings.intervalHours * 3_600_000;
}

let running = false;

/** Take an automatic snapshot if one is due and the data changed. Cheap to call often. */
export async function runAutoBackupIfDue(now = new Date()): Promise<BackupMeta | null> {
  if (running) return null;
  running = true;
  try {
    const list = await listBackups();
    const latestAuto = list.find(m => m.reason === 'auto');
    if (!isBackupDue(now, latestAuto)) return null;
    const latestAny = list[0];
    const sections = await readAllLocalSections();
    if (latestAny && latestAny.checksum === checksumOf(sections)) return null;   // unchanged since the last snapshot
    return await createBackup('auto');
  } catch {
    return null;
  } finally {
    running = false;
  }
}

/* ---- restore / export / import ------------------------------------------------------------- */

export interface RestoreResult { applied: string[]; safetyBackupId: string | null }

async function applyBackupFile(file: BackupFile, safetyReason: BackupReason): Promise<RestoreResult> {
  const safety = await createBackup(safetyReason).catch(() => null);
  const applied = await applySectionsToDevice(file.sections, new Set());
  return { applied, safetyBackupId: safety?.id ?? null };
}

export async function restoreBackup(id: string): Promise<RestoreResult> {
  const stored = await idbGet<StoredBackup>(STORE.backups, id);
  if (!stored) throw new Error('That backup no longer exists.');
  const file = await decodePayload(stored);
  return applyBackupFile(file, 'before-restore');
}

export async function importBackupFile(file: BackupFile): Promise<RestoreResult> {
  return applyBackupFile(file, 'before-import');
}

export async function exportBackup(id?: string): Promise<{ filename: string; blob: Blob; meta: { createdAt: string; counts: BackupCounts } }> {
  let file: BackupFile;
  if (id) {
    const stored = await idbGet<StoredBackup>(STORE.backups, id);
    if (!stored) throw new Error('That backup no longer exists.');
    file = await decodePayload(stored);
  } else {
    const sections = await readAllLocalSections();
    file = { format: BACKUP_FORMAT, schema: BACKUP_SCHEMA, createdAt: new Date().toISOString(), appVersion: appVersion(), checksum: checksumOf(sections), sections };
  }
  const stamp = file.createdAt.replace(/[:T]/g, '-').slice(0, 16);
  return {
    filename: `quiz-master-backup-${stamp}.json`,
    blob: new Blob([JSON.stringify(file)], { type: 'application/json' }),
    meta: { createdAt: file.createdAt, counts: countSections(file.sections) },
  };
}
