/**
 * The sync contract: exactly which on-device data travels to the cloud, and how each piece is read
 * and written.
 *
 * Quiz Master keeps its bulky data in IndexedDB (history, library tree, bookmarks, mistakes) with a
 * trimmed localStorage mirror, and many small settings directly in localStorage. Each of those is a
 * *section* with an adapter, so the engine never needs to know where the bytes live:
 *
 *   - quiz history is split into one section per month (`hist:YYYY-MM`) so sections stay small and
 *     only the months that changed are uploaded;
 *   - lists without a natural `id` (history, trash) are converted to id-keyed maps for merging, which
 *     is what lets two phones add different quizzes and both keep them.
 *
 * Never leaves the device on purpose: AI provider keys, caches (rationale/notes), drafts, install and
 * onboarding flags, the active quiz session, backup bookkeeping and this module's own sync metadata.
 */
import { STORE, idbGet, idbPut, idbDelete } from '../idb';
import { stableStringify } from './merge3';
import { getHistory, setHistory } from '../../utils/historyStore';
import { initBookmarkStore, saveBookmarkStore } from '../../utils/bookmarkStore';
import { initMistakeStore, saveMistakeStore } from '../../utils/globalMistakes';
import { initFileTreeStore, saveFileTree, loadTrash, saveTrash } from '../../utils/fileTree';
import { loadHistoryTrash, saveHistoryTrash, withoutHistoryTrash } from '../../utils/historyTrash';
import { idbGetMulti as kvGetMulti, idbSet as kvSet } from '../../utils/indexedDB';

export type SectionGroup = 'quiz' | 'library' | 'progress' | 'preferences';

export interface SectionInfo { key: string; label: string; group: SectionGroup }

/* ---- plain localStorage sections ----------------------------------------------------------- */

const LS_SECTIONS: SectionInfo[] = [
  // library / content
  { key: 'qmp_user_subjects', label: 'Subjects', group: 'library' },
  { key: 'qmp_user_templates', label: 'Quiz templates', group: 'library' },
  { key: 'qmp_templates', label: 'Quiz templates (legacy)', group: 'library' },
  { key: 'qmp_pinned', label: 'Pinned quizzes', group: 'library' },
  { key: 'qmp_offline_notes', label: 'Offline notes', group: 'library' },
  { key: 'qmp_notes_config', label: 'Notes settings', group: 'library' },
  // progress & study data
  { key: 'qmp_spaced_rep', label: 'Spaced repetition', group: 'progress' },
  { key: 'qmp_spaced_rep_items', label: 'Spaced repetition items', group: 'progress' },
  { key: 'qmp_flashcard_sessions', label: 'Flashcard sessions', group: 'progress' },
  { key: 'qmp_flashcard_progress', label: 'Flashcard progress', group: 'progress' },
  { key: 'qmp_flashcard_sr', label: 'Flashcard scheduling', group: 'progress' },
  { key: 'qmp_used_flashcards', label: 'Used flashcards', group: 'progress' },
  { key: 'qmp_difficulty_ratings', label: 'Difficulty ratings', group: 'progress' },
  { key: 'qmp_quiz_ratings', label: 'Quiz ratings', group: 'progress' },
  { key: 'qmp_confidence_history', label: 'Confidence history', group: 'progress' },
  { key: 'qmp_disputes', label: 'Question disputes', group: 'progress' },
  { key: 'qmp_mistake_patterns', label: 'Mistake patterns', group: 'progress' },
  { key: 'qmp_negative_marking', label: 'Negative marking', group: 'progress' },
  { key: 'qmp_study_tracker', label: 'Study tracker', group: 'progress' },
  { key: 'qmp_study_plan', label: 'Study plan', group: 'progress' },
  { key: 'qmp_streak_targets', label: 'Streak targets', group: 'progress' },
  { key: 'qmp_daily_challenge', label: 'Daily challenge', group: 'progress' },
  { key: 'qmp_original_scores', label: 'Original scores', group: 'progress' },
  { key: 'rjquiz:practice_goal', label: 'Practice goal', group: 'progress' },
  { key: 'qmp_exam_dates', label: 'Exam dates', group: 'progress' },
  { key: 'qmp_drafts_v1', label: 'Quiz drafts (resume on any device)', group: 'quiz' },
  // preferences
  { key: 'qmp_settings', label: 'App settings', group: 'preferences' },
  { key: 'qmp_ai_prefs', label: 'AI preferences', group: 'preferences' },
  { key: 'qmp_rationale_prefs', label: 'Rationale preferences', group: 'preferences' },
  { key: 'qmp_training_rationale', label: 'Training rationale mode', group: 'preferences' },
  { key: 'qmp_study_reminder', label: 'Daily reminder', group: 'preferences' },
  { key: 'qmp_study_reminders', label: 'Reminder settings', group: 'preferences' },
  { key: 'qmp_theme', label: 'Theme', group: 'preferences' },
  { key: 'qmp_accent_hsl', label: 'Accent colour', group: 'preferences' },
  { key: 'qmp_accent_hex', label: 'Accent colour (hex)', group: 'preferences' },
  { key: 'qmp_font_size', label: 'Text size', group: 'preferences' },
  { key: 'qmp_glass_intensity', label: 'Glass intensity', group: 'preferences' },
  { key: 'qmp_quiz_skin', label: 'Quiz skin', group: 'preferences' },
  { key: 'qmp_quiz_skins', label: 'Quiz skins', group: 'preferences' },
  { key: 'qmp_profile', label: 'Profile', group: 'preferences' },
  { key: 'rjquiz:profile', label: 'Profile (display)', group: 'preferences' },
];

const LS_MAP: Record<string, SectionInfo> = Object.fromEntries(LS_SECTIONS.map(s => [s.key, s]));

/** Section keys that hold a keyed list stored as `{ items: { [id]: item } }` for merging. */
type StoreKind = 'bookmarks' | 'mistakes' | 'tree' | 'tree_trash' | 'history_trash';
const STORE_SECTIONS: Array<SectionInfo & { kind: StoreKind }> = [
  { key: 'bookmarks', kind: 'bookmarks', label: 'Bookmarks', group: 'library' },
  { key: 'mistakes', kind: 'mistakes', label: 'Mistake book', group: 'progress' },
  { key: 'library_tree', kind: 'tree', label: 'Library folders & quizzes', group: 'library' },
  { key: 'library_trash', kind: 'tree_trash', label: 'Library trash', group: 'library' },
  { key: 'history_trash', kind: 'history_trash', label: 'Quiz history trash', group: 'quiz' },
];
const STORE_MAP: Record<string, (typeof STORE_SECTIONS)[number]> = Object.fromEntries(STORE_SECTIONS.map(s => [s.key, s]));

export const HISTORY_PREFIX = 'hist:';
const HISTORY_KEY_RE = /^hist:(\d{4}-\d{2}|undated)$/;
/** Full question data of finished quizzes, one section per month (`qd:YYYY-MM`), so every device can open them. */
export const DETAIL_PREFIX = 'qd:';
const DETAIL_KEY_RE = /^qd:(\d{4}-\d{2}|undated)$/;
const DETAIL_IDB_PREFIX = 'qmp_detail_';

/** localStorage keys whose writes mean "the synced data may have changed" (includes the IDB mirrors). */
export const LS_WATCH_KEYS: ReadonlySet<string> = new Set([
  ...LS_SECTIONS.map(s => s.key),
  'qmp_history', 'qmp_bookmarks_v2', 'qmp_global_mistakes_v1', 'qmp_file_tree', 'qmp_file_trash', 'qmp_history_trash_meta',
]);

/** What stays on the device (shown in the privacy copy of the UI). */
export const DEVICE_ONLY_ITEMS = [
  'AI provider keys',
  'AI caches (rationales, revision notes)',
  'Text typed in the quiz creator box (not yet a quiz)',
  'Install, onboarding and tip flags',
  'Automatic-backup files and settings of this device',
  'Notification schedule of this device',
];

export function isSyncKey(key: string): boolean {
  return key in LS_MAP || key in STORE_MAP || HISTORY_KEY_RE.test(key) || DETAIL_KEY_RE.test(key);
}

export function describeSection(key: string): SectionInfo {
  if (LS_MAP[key]) return LS_MAP[key];
  if (STORE_MAP[key]) return STORE_MAP[key];
  const dm = DETAIL_KEY_RE.exec(key);
  if (dm) {
    if (dm[1] === 'undated') return { key, label: 'Quiz questions - undated', group: 'quiz' };
    const [y, mo] = dm[1].split('-').map(Number);
    const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' });
    return { key, label: `Quiz questions - ${name} ${y}`, group: 'quiz' };
  }
  const m = HISTORY_KEY_RE.exec(key);
  if (m) {
    if (m[1] === 'undated') return { key, label: 'Quiz history - undated', group: 'quiz' };
    const [y, mo] = m[1].split('-').map(Number);
    const name = new Date(Date.UTC(y, mo - 1, 1)).toLocaleString('en', { month: 'long', timeZone: 'UTC' });
    return { key, label: `Quiz history - ${name} ${y}`, group: 'quiz' };
  }
  return { key, label: key, group: 'preferences' };
}

/* ---- sync metadata (device bookkeeping, never synced) -------------------------------------- */

const META_KEY = 'qm-cloud-syncmeta-v1';
const BASE_IDB_KEY = 'cloud-base-v1';

export interface SyncMeta {
  userId: string | null;
  endpoint: string;
  version: number;
  /** Server-computed hash per section, as last confirmed by the server. */
  serverHashes: Record<string, string>;
  /** Local content fingerprint per section, as last pushed/pulled. */
  localFingerprints: Record<string, string>;
  lastSyncAt: string | null;
  lastError: string | null;
  firstSyncDecision: 'merge' | 'cloud' | 'device' | null;
}

export const EMPTY_META: SyncMeta = {
  userId: null, endpoint: '', version: 0, serverHashes: {}, localFingerprints: {},
  lastSyncAt: null, lastError: null, firstSyncDecision: null,
};

export function loadMeta(): SyncMeta {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return { ...EMPTY_META };
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_META,
      ...parsed,
      serverHashes: parsed?.serverHashes && typeof parsed.serverHashes === 'object' ? parsed.serverHashes : {},
      localFingerprints: parsed?.localFingerprints && typeof parsed.localFingerprints === 'object' ? parsed.localFingerprints : {},
      version: Number(parsed?.version) || 0,
    };
  } catch {
    return { ...EMPTY_META };
  }
}

export function saveMeta(meta: SyncMeta): void {
  try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

export function clearMeta(): void {
  try { localStorage.removeItem(META_KEY); } catch { /* ignore */ }
}

/* ---- fast fingerprint (change detection only) ---------------------------------------------- */

/** cyrb53 - 53-bit string hash, plenty for "did this section change?". */
export function fingerprint(value: unknown): string {
  const str = typeof value === 'string' ? `s:${value}` : `j:${stableStringify(value)}`;
  let h1 = 0xdeadbeef ^ str.length;
  let h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ---- last-synced base snapshot (IndexedDB) ------------------------------------------------- */

type BaseSnapshot = Record<string, unknown>;
let baseCache: BaseSnapshot | null = null;

export async function loadBase(): Promise<BaseSnapshot> {
  if (baseCache) return baseCache;
  try {
    const stored = await idbGet<BaseSnapshot>(STORE.kv, BASE_IDB_KEY);
    baseCache = stored && typeof stored === 'object' ? stored : {};
  } catch { baseCache = {}; }
  return baseCache;
}

export async function saveBase(base: BaseSnapshot): Promise<void> {
  baseCache = base;
  try { await idbPut(STORE.kv, base, BASE_IDB_KEY); } catch { /* ignore */ }
}

/** Test hook: forget the in-memory base so the next load reads storage again. */
export function __resetBaseCacheForTests(): void { baseCache = null; }

export async function clearBase(): Promise<void> {
  baseCache = {};
  try { await idbDelete(STORE.kv, BASE_IDB_KEY); } catch { /* ignore */ }
}

/* ---- keyed-list helpers -------------------------------------------------------------------- */

type Item = Record<string, unknown>;

function toKeyedMap<T>(list: readonly T[], idOf: (item: T, index: number) => string): { items: Record<string, T> } {
  const items: Record<string, T> = {};
  list.forEach((item, i) => { items[idOf(item, i)] = item; });
  return { items };
}

function fromKeyedMap<T>(value: unknown): T[] {
  const items = (value as { items?: Record<string, T> } | undefined)?.items;
  return items && typeof items === 'object' ? Object.values(items) : [];
}

function resultIdentity(r: Item): string {
  return r.id ? String(r.id) : `ts_${r.timestamp}_${r.totalQuestions ?? 0}`;
}

function historyMonthKey(timestamp: unknown): string {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || ts <= 0) return `${HISTORY_PREFIX}undated`;
  const d = new Date(ts);
  return `${HISTORY_PREFIX}${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Exposed for tests: split a history list into month shards. */
/**
 * Month shards of full quiz details. `lookup` returns the full record (questions, answers) for a history
 * entry, or undefined when this device does not have it. Entries that already carry their questions are
 * skipped: they travel inside the history shard.
 */
export function buildDetailShards(list: readonly Item[], lookup: (r: Item) => Item | undefined): Record<string, { items: Record<string, Item> }> {
  const shards: Record<string, { items: Record<string, Item> }> = {};
  for (const r of list) {
    if (Array.isArray(r.quizData) && (r.quizData as unknown[]).length > 0) continue;
    const full = lookup(r);
    if (!full || !Array.isArray(full.quizData) || (full.quizData as unknown[]).length === 0) continue;
    const key = historyMonthKey(r.timestamp).replace(HISTORY_PREFIX, DETAIL_PREFIX);
    (shards[key] ??= { items: {} }).items[resultIdentity(r)] = full;
  }
  return shards;
}

export function shardHistory(list: readonly Item[]): Record<string, { items: Record<string, Item> }> {
  const shards: Record<string, { items: Record<string, Item> }> = {};
  for (const r of list) {
    const key = historyMonthKey(r.timestamp);
    (shards[key] ??= { items: {} }).items[resultIdentity(r)] = r;
  }
  return shards;
}

/** Exposed for tests: rebuild the newest-first history list from every shard in `sections`. */
export function unshardHistory(sections: Record<string, unknown>): Item[] {
  const all: Item[] = [];
  for (const [key, value] of Object.entries(sections)) {
    if (HISTORY_KEY_RE.test(key)) all.push(...fromKeyedMap<Item>(value));
  }
  return all.sort((a, b) => Number(b.timestamp ?? 0) - Number(a.timestamp ?? 0));
}

/* ---- localStorage JSON / string values ----------------------------------------------------- */

interface RawWrapper { __raw: string }

function readLs(key: string): unknown | undefined {
  let raw: string | null = null;
  try { raw = localStorage.getItem(key); } catch { return undefined; }
  if (raw === null) return undefined;
  try { return JSON.parse(raw); } catch { return { __raw: raw } satisfies RawWrapper; }
}

function writeLs(key: string, value: unknown): void {
  try {
    const raw = value && typeof value === 'object' && typeof (value as RawWrapper).__raw === 'string' && Object.keys(value as object).length === 1
      ? (value as RawWrapper).__raw
      : JSON.stringify(value);
    localStorage.setItem(key, raw);
  } catch { /* quota: nothing sensible to do */ }
}

/* ---- stores (IndexedDB-primary) ------------------------------------------------------------ */

async function readStore(kind: StoreKind): Promise<unknown | undefined> {
  switch (kind) {
    case 'bookmarks': {
      const store = await initBookmarkStore();
      return store && store.folders?.length ? { version: store.version, folders: toKeyedMap(store.folders, (f, i) => f.id || `f${i}`).items } : undefined;
    }
    case 'mistakes': {
      const store = await initMistakeStore();
      return store && store.entries?.length ? { version: store.version, entries: toKeyedMap(store.entries, (e, i) => e.id || `m${i}`).items } : undefined;
    }
    case 'tree': {
      const tree = await initFileTreeStore();
      return tree && (tree.children?.length ?? 0) > 0 ? tree : undefined;
    }
    case 'tree_trash': {
      const trash = loadTrash();
      return trash.length ? toKeyedMap(trash, (t, i) => t.node?.id || `t${i}`) : undefined;
    }
    case 'history_trash': {
      const trash = await loadHistoryTrash();
      return trash.length ? toKeyedMap(trash, (t, i) => resultIdentity((t.result ?? {}) as unknown as Item) || `h${i}`) : undefined;
    }
  }
}

async function writeStore(kind: StoreKind, value: unknown | undefined): Promise<void> {
  switch (kind) {
    case 'bookmarks': {
      const v = value as { version?: 2; folders?: Record<string, unknown> } | undefined;
      saveBookmarkStore({ version: 2, folders: v?.folders ? (Object.values(v.folders) as never[]) : [] });
      return;
    }
    case 'mistakes': {
      const v = value as { version?: 1; entries?: Record<string, unknown> } | undefined;
      saveMistakeStore({ version: 1, entries: v?.entries ? (Object.values(v.entries) as never[]) : [] });
      return;
    }
    case 'tree': {
      if (value) saveFileTree(value as never);
      return;
    }
    case 'tree_trash':
      saveTrash(fromKeyedMap(value));
      return;
    case 'history_trash':
      await saveHistoryTrash(fromKeyedMap(value));
      return;
  }
}

/* ---- reading / writing everything ---------------------------------------------------------- */

export async function readAllLocalSections(): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const def of LS_SECTIONS) {
    const value = readLs(def.key);
    if (value !== undefined) out[def.key] = value;
  }
  for (const def of STORE_SECTIONS) {
    try {
      const value = await readStore(def.kind);
      if (value !== undefined) out[def.key] = value;
    } catch { /* a broken store must not block the others */ }
  }
  try {
    const history = (await getHistory()) as unknown as Item[];
    Object.assign(out, shardHistory(history));
    // Full question data lives in IndexedDB next to (not inside) the history list; without it a second
    // device shows the quiz in its totals but cannot open it ("Quiz details not available").
    const need = history.filter(r => !(Array.isArray(r.quizData) && (r.quizData as unknown[]).length > 0));
    if (need.length) {
      const keys = [...new Set(need.flatMap(r => [String(r.timestamp), r.id ? String(r.id) : ''].filter(Boolean)))].map(k => DETAIL_IDB_PREFIX + k);
      const found = await kvGetMulti<Item>(keys);
      Object.assign(out, buildDetailShards(history, r => found.get(DETAIL_IDB_PREFIX + String(r.timestamp)) ?? (r.id ? found.get(DETAIL_IDB_PREFIX + String(r.id)) : undefined)));
    }
  } catch { /* ignore */ }
  return out;
}

/**
 * Write the merged sections to the device. `skip` holds keys that changed on the device while the
 * sync was talking to the server: those are newer than the merge and must not be overwritten.
 * Returns the section keys that actually changed.
 */
export async function applySectionsToDevice(target: Record<string, unknown>, skip: ReadonlySet<string> = new Set()): Promise<string[]> {
  const changed: string[] = [];

  for (const def of LS_SECTIONS) {
    if (skip.has(def.key)) continue;
    const next = target[def.key];
    const current = readLs(def.key);
    if (next === undefined) {
      if (current !== undefined) { try { localStorage.removeItem(def.key); } catch { /* ignore */ } changed.push(def.key); }
      continue;
    }
    if (current !== undefined && fingerprint(current) === fingerprint(next)) continue;
    writeLs(def.key, next);
    changed.push(def.key);
  }

  for (const def of STORE_SECTIONS) {
    if (skip.has(def.key)) continue;
    const next = target[def.key];
    let current: unknown;
    try { current = await readStore(def.kind); } catch { current = undefined; }
    if (next === undefined && current === undefined) continue;
    if (next !== undefined && current !== undefined && fingerprint(current) === fingerprint(next)) continue;
    // An empty library tree must never be written over a populated one by "absence".
    if (next === undefined && def.kind === 'tree') continue;
    await writeStore(def.kind, next);
    changed.push(def.key);
  }

  // History: all shards are applied together, unless any shard was touched mid-sync.
  const targetHistoryKeys = Object.keys(target).filter(k => HISTORY_KEY_RE.test(k));
  const touchedHistory = [...skip].some(k => HISTORY_KEY_RE.test(k));
  if (!touchedHistory) {
    const currentShards = shardHistory(((await getHistory().catch(() => [])) as unknown as Item[]));
    const keys = new Set([...Object.keys(currentShards), ...targetHistoryKeys]);
    const differing = [...keys].filter(k => fingerprint(currentShards[k] ?? null) !== fingerprint(target[k] ?? null));
    if (differing.length) {
      // Applying synced/restored data is not a user deletion: nothing may land in the local trash.
      withoutHistoryTrash(() => setHistory(unshardHistory(target) as never));
      changed.push(...differing);
    }
  }
  // Question details: write what this device does not have yet (details never change once a quiz is finished).
  for (const key of Object.keys(target)) {
    if (!DETAIL_KEY_RE.test(key) || skip.has(key)) continue;
    const items = ((target[key] as { items?: Record<string, Item> } | undefined)?.items) ?? {};
    const entries = Object.values(items).filter(d => d && Array.isArray(d.quizData) && (d.quizData as unknown[]).length > 0);
    if (!entries.length) continue;
    try {
      const probe = entries.map(d => DETAIL_IDB_PREFIX + String(d.timestamp));
      const have = await kvGetMulti<Item>(probe);
      let wrote = false;
      for (const d of entries) {
        const tsKey = DETAIL_IDB_PREFIX + String(d.timestamp);
        const mine = have.get(tsKey);
        if (mine && Array.isArray(mine.quizData) && (mine.quizData as unknown[]).length > 0) continue;
        await kvSet(tsKey, d);
        if (d.id) await kvSet(DETAIL_IDB_PREFIX + String(d.id), d);
        wrote = true;
      }
      if (wrote) changed.push(key);
    } catch { /* storage full or blocked: the next sync tries again */ }
  }
  return changed;
}

/* ---- diagnostics --------------------------------------------------------------------------- */

export interface SectionStat extends SectionInfo { bytes: number; present: boolean }

export async function sectionStats(): Promise<SectionStat[]> {
  const local = await readAllLocalSections();
  const keys = Object.keys(local);
  const rows: SectionStat[] = keys.map(key => ({
    ...describeSection(key),
    bytes: JSON.stringify(local[key]).length,
    present: true,
  }));
  return rows.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

export const SYNC_SECTION_COUNT_HINT = LS_SECTIONS.length + STORE_SECTIONS.length;
