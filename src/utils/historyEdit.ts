/**
 * Editing a quiz in the Library (name, subject, notes, date / time).
 *
 * An edit is an immutable UPDATE of the one record, never "remove and add again":
 *  - the record keeps its identity (`id`); a legacy record that never had one gets a permanent UUID *before* its
 *    date changes, because an id-less record is keyed by `ts_<timestamp>_<n>` and changing the date used to change
 *    that key, which made the history store park the old record in Trash and show a new, unopenable copy;
 *  - everything that was filed under the old key follows the record: its saved questions (`qmp_detail_*`), pin,
 *    rating, revision sheet, negative-marking state and the practice attempts that point at it as their parent.
 */
import type { QuizResult } from '../types/quiz';
import { generateUUID } from '../platform/cloud/uuid';
import { idbGet, idbSet, idbDelete } from './indexedDB';

export interface EditPatch {
  quizTitle?: string;
  subject?: string;
  notes?: string;
  /** New date + time as epoch ms (omit when unchanged) */
  timestamp?: number;
}

export const DETAIL_PREFIX = 'qmp_detail_';
const PIN_KEY = 'rjquiz:pinnedIds';
const RATING_KEY = 'qmp_quiz_ratings';
const ORIGINALS_KEY = 'qmp_original_scores';
const NM_CONFIG_KEY = 'qmp_nm_config';
const REVISION_IDB = 'revision_';
const REVISION_LS = 'qmp_revision_';

export const resultKeyOf = (r: Pick<QuizResult, 'id' | 'timestamp'>): string => r.id || String(r.timestamp);

/** The record a Library action refers to: by id, or (legacy, id-less) by timestamp. */
export function findResult(history: readonly QuizResult[], key: string): QuizResult | undefined {
  return history.find(r => r.id && r.id === key) ?? history.find(r => !r.id && String(r.timestamp) === key);
}

export interface EditOutcome {
  history: QuizResult[];
  before: QuizResult;
  after: QuizResult;
}

/** Pure: returns the updated history (new array, new object for the edited record only) or null when the key is unknown. */
export function applyHistoryEdit(history: readonly QuizResult[], key: string, patch: EditPatch): EditOutcome | null {
  const before = findResult(history, key);
  if (!before) return null;
  const dateChanged = typeof patch.timestamp === 'number' && Number.isFinite(patch.timestamp) && patch.timestamp > 0 && patch.timestamp !== before.timestamp;
  const after: QuizResult = {
    ...before,
    quizTitle: patch.quizTitle || before.quizTitle,
    subject: patch.subject || before.subject,
    notes: patch.notes !== undefined ? patch.notes : before.notes,
    ...(dateChanged ? { timestamp: patch.timestamp as number } : {}),
  };
  // Legacy record: give it its permanent identity before the date (its old key) changes.
  if (dateChanged && !before.id) after.id = generateUUID();

  let next = history.map(r => {
    if (r === before) return after;
    // Practice attempts keep pointing at their parent through the date / id.
    if (dateChanged && r.attemptType === 'practice' && (
      (before.id && r.parentQuizId === before.id) || (r.parentQuizTimestamp === before.timestamp && (!r.parentQuizId || r.parentQuizId === before.id))
    )) {
      return { ...r, parentQuizTimestamp: after.timestamp, ...(after.id ? { parentQuizId: after.id } : {}) };
    }
    return r;
  });
  if (dateChanged) next = [...next].sort((a, b) => b.timestamp - a.timestamp);
  return { history: next, before, after };
}

function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeJson(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full */ }
}
function renameKey(map: Record<string, unknown>, from: string, to: string): boolean {
  if (from === to || !(from in map)) return false;
  map[to] = map[from];
  delete map[from];
  return true;
}

/** Moves everything that was filed under the old key / date to the edited record. Safe to call twice. */
export async function migrateResultKeys(before: QuizResult, after: QuizResult): Promise<void> {
  const oldKey = resultKeyOf(before), newKey = resultKeyOf(after);
  const oldTs = String(before.timestamp), newTs = String(after.timestamp);

  // 1. Saved questions + answers (opened from the Library): follow the record and carry the new name / date.
  try {
    const oldKeys = [...new Set([oldTs, before.id].filter((k): k is string => !!k))];
    const newKeys = [...new Set([newTs, after.id].filter((k): k is string => !!k))];
    let detail: QuizResult | undefined;
    for (const k of oldKeys) {
      const hit = await idbGet<QuizResult>(DETAIL_PREFIX + k);
      if (hit && hit.quizData?.length) { detail = hit; break; }
    }
    if (detail) {
      const patched: QuizResult = { ...detail, id: after.id ?? detail.id, timestamp: after.timestamp, quizTitle: after.quizTitle, subject: after.subject, notes: after.notes };
      for (const k of newKeys) await idbSet(DETAIL_PREFIX + k, patched);
      for (const k of oldKeys) if (!newKeys.includes(k)) await idbDelete(DETAIL_PREFIX + k);
    }
  } catch { /* the record itself may carry its questions */ }

  // 2. Pin, negative-marking state: keyed by id (or the old date for legacy records).
  if (oldKey !== newKey) {
    const pins = readJson<string[]>(PIN_KEY, []);
    if (pins.includes(oldKey)) writeJson(PIN_KEY, [...new Set(pins.map(p => (p === oldKey ? newKey : p)))]);
    for (const k of [ORIGINALS_KEY, NM_CONFIG_KEY]) {
      const m = readJson<Record<string, unknown>>(k, {});
      if (renameKey(m, oldKey, newKey)) writeJson(k, m);
    }
  }

  // 3. Rating + revision sheet: keyed by the date.
  if (oldTs !== newTs) {
    const ratings = readJson<Record<string, unknown>>(RATING_KEY, {});
    if (renameKey(ratings, oldTs, newTs)) writeJson(RATING_KEY, ratings);
    try {
      const sheet = await idbGet<string>(REVISION_IDB + oldTs);
      if (sheet) { await idbSet(REVISION_IDB + newTs, sheet); await idbDelete(REVISION_IDB + oldTs); }
    } catch { /* none */ }
    try {
      const raw = localStorage.getItem(REVISION_LS + oldTs);
      if (raw !== null) { localStorage.setItem(REVISION_LS + newTs, raw); localStorage.removeItem(REVISION_LS + oldTs); }
    } catch { /* none */ }
  }
}
