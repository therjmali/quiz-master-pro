/**
 * Quiz drafts: leaving a quiz keeps your progress.
 *  - at most 5 drafts (the oldest is dropped when a 6th arrives);
 *  - one draft per quiz (same questions = same draft, however often you leave and come back);
 *  - drafts sync between your devices (section `qmp_drafts_v1`), so a quiz left on the phone can be resumed
 *    on the tablet. The newest save wins when two devices changed the same draft.
 * Stored as { v: 1, items: { [draftId]: "<json of Draft>" } }: each draft is one opaque string so a merge
 * always takes a whole draft from one device and never mixes answers from two.
 */
import { useEffect, useState } from 'react';
import type { QuizQuestion, QuizSettings } from '../types/quiz';
import { getDeviceIdentity } from '../platform/cloud/device';

export const DRAFTS_KEY = 'qmp_drafts_v1';
export const MAX_DRAFTS = 5;
export const DRAFTS_EVENT = 'qm:drafts-changed';
const DATA_APPLIED_EVENT = 'qm:cloud-data-applied';

/** Same shape the live quiz session saves (see useQuizSession). */
export interface SessionBlob {
  quizData: QuizQuestion[];
  settings: QuizSettings;
  currentIndex: number;
  userAnswers: (string | null)[];
  flaggedQuestions: boolean[];
  accumulatedTime: number;
  timeLeftPerQ: number[];
  forcedNext: boolean[];
  totalTimeLeft: number;
  savedAt: number;
  targetFolderId?: string | null;
}

export interface Draft {
  id: string;
  title: string;
  subject?: string;
  total: number;
  answered: number;
  index: number;
  savedAt: number;
  deviceId: string;
  deviceName: string;
  session: SessionBlob;
}

/** cyrb53 over the sorted question texts: the same quiz gives the same id even when the order is shuffled. */
export function draftIdFor(quizData: readonly { question: string }[]): string {
  const str = quizData.map(q => String(q.question ?? '').trim().toLowerCase()).sort().join('\u241f');
  let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `d${(4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)}q${quizData.length}`;
}

function readRaw(): Record<string, string> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DRAFTS_KEY) || 'null');
    const items = parsed && typeof parsed === 'object' ? (parsed as { items?: unknown }).items : null;
    return items && typeof items === 'object' ? { ...(items as Record<string, string>) } : {};
  } catch { return {}; }
}

function writeRaw(items: Record<string, string>): void {
  try {
    if (Object.keys(items).length === 0) localStorage.removeItem(DRAFTS_KEY);
    else localStorage.setItem(DRAFTS_KEY, JSON.stringify({ v: 1, items }));
  } catch { /* storage full */ }
  try { window.dispatchEvent(new Event(DRAFTS_EVENT)); } catch { /* ignore */ }
}

function parseDraft(id: string, raw: unknown): Draft | null {
  try {
    const d = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Draft;
    if (!d || typeof d !== 'object' || !Array.isArray(d.session?.quizData) || d.session.quizData.length === 0) return null;
    return { ...d, id: d.id || id };
  } catch { return null; }
}

/** Newest first, at most MAX_DRAFTS. Extra / broken entries are removed from storage. */
export function listDrafts(): Draft[] {
  const raw = readRaw();
  const all = Object.entries(raw).map(([id, v]) => parseDraft(id, v)).filter((d): d is Draft => !!d).sort((a, b) => b.savedAt - a.savedAt);
  const keep = all.slice(0, MAX_DRAFTS);
  if (keep.length !== Object.keys(raw).length) {
    const next: Record<string, string> = {};
    for (const d of keep) next[d.id] = raw[d.id] ?? JSON.stringify(d);
    writeRaw(next);
  }
  return keep;
}

export const getDraft = (id: string): Draft | undefined => listDrafts().find(d => d.id === id);

/** Creates or replaces the draft of this quiz. Returns it, or null when there is nothing worth keeping. */
export function upsertDraft(session: SessionBlob, now = Date.now()): Draft | null {
  if (!session?.quizData?.length) return null;
  const id = draftIdFor(session.quizData);
  const dev = (() => { try { return getDeviceIdentity(); } catch { return { id: '', name: 'This device' }; } })();
  const draft: Draft = {
    id,
    title: session.settings?.quizTitle?.trim() || session.quizData[0]?.question?.slice(0, 48) || 'Untitled quiz',
    subject: session.settings?.subject?.trim() || undefined,
    total: session.quizData.length,
    answered: (session.userAnswers ?? []).filter(a => a !== null && a !== undefined).length,
    index: Math.max(0, session.currentIndex ?? 0),
    savedAt: now,
    deviceId: dev.id,
    deviceName: dev.name,
    session: { ...session, savedAt: now },
  };
  const raw = readRaw();
  raw[id] = JSON.stringify(draft);
  // keep only the newest MAX_DRAFTS
  const ids = Object.keys(raw).map(k => ({ k, t: parseDraft(k, raw[k])?.savedAt ?? 0 })).sort((a, b) => b.t - a.t);
  const next: Record<string, string> = {};
  ids.slice(0, MAX_DRAFTS).forEach(x => { next[x.k] = raw[x.k]; });
  writeRaw(next);
  return draft;
}

/** Puts a draft back exactly as it was (undo). */
export function putDraft(d: Draft): void {
  const raw = readRaw();
  raw[d.id] = JSON.stringify(d);
  const ids = Object.keys(raw).map(k => ({ k, t: parseDraft(k, raw[k])?.savedAt ?? 0 })).sort((a, b) => b.t - a.t);
  const next: Record<string, string> = {};
  ids.slice(0, MAX_DRAFTS).forEach(x => { next[x.k] = raw[x.k]; });
  writeRaw(next);
}

export function removeDraft(id: string): void {
  const raw = readRaw();
  if (!(id in raw)) return;
  delete raw[id];
  writeRaw(raw);
}

export function removeDraftForQuiz(quizData: readonly { question: string }[]): void {
  if (quizData?.length) removeDraft(draftIdFor(quizData));
}

export function clearDrafts(): void { writeRaw({}); }

/** Live list for React; refreshes on local changes, other tabs and after a cloud merge. */
export function useDrafts(): Draft[] {
  const [drafts, setDrafts] = useState<Draft[]>(listDrafts);
  useEffect(() => {
    const on = () => setDrafts(listDrafts());
    window.addEventListener(DRAFTS_EVENT, on);
    window.addEventListener(DATA_APPLIED_EVENT, on);
    window.addEventListener('storage', on);
    on();
    return () => { window.removeEventListener(DRAFTS_EVENT, on); window.removeEventListener(DATA_APPLIED_EVENT, on); window.removeEventListener('storage', on); };
  }, []);
  return drafts;
}
