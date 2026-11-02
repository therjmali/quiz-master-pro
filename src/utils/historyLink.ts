/**
 * Organizer ↔ Library link resolver — the ONE place that decides which history
 * records an organizer file belongs to.
 *
 * Rules (so every screen agrees):
 *   1. HARD LINK first. A file saved from a quiz carries sourceResultId / sourceTimestamp.
 *      If that resolves, it is THE match — never overridden by fuzzy title guessing.
 *   2. The match's "family" (retakes / practice attempts) is added via parentQuizId, so
 *      folder stats still count every attempt of the same quiz.
 *   3. If the hard link no longer resolves (quiz was deleted from the Library), fall back to
 *      the question fingerprint only — never to loose title matching.
 *   4. Files with no link (older files) use conservative matching: question fingerprint, or an
 *      EXACT title that is unique in history. Ambiguous matches resolve to nothing.
 *
 * Deleting a file from the Organizer never touches history, and deleting a quiz from the
 * Library never touches the Organizer — the link is read-only on both sides.
 */
import type { QuizResult } from '../types/quiz';
import type { FileNode } from './fileTree';

export function normalizeQ(text: string): string {
  return text.replace(/^\d+[\.\)\-:\s]+/, '').replace(/\*\*/g, '').trim().toLowerCase().slice(0, 80);
}

const keyOf = (r: QuizResult) => r.id || String(r.timestamp);

/** Direct record the file was saved from (by cloud id or timestamp), or null. */
export function findHardLinked(file: FileNode, history: QuizResult[]): QuizResult | null {
  if (file.sourceResultId) {
    const byId = history.find(r => r.id === file.sourceResultId || String(r.timestamp) === file.sourceResultId);
    if (byId) return byId;
  }
  if (file.sourceTimestamp) {
    const byTs = history.find(r => r.timestamp === file.sourceTimestamp);
    if (byTs) return byTs;
  }
  return null;
}

export function hasHardLink(file: FileNode): boolean {
  return !!(file.sourceResultId || file.sourceTimestamp);
}

/** Records sharing the same questions (needs full quizData — guests / opened quizzes). */
function fingerprintMatches(file: FileNode, history: QuizResult[]): QuizResult[] {
  const qs = file.questions;
  if (!qs || qs.length === 0) return [];
  const fq0 = qs[0].question;
  const nfq0 = normalizeQ(fq0);
  const fLen = qs.length;
  const norms3 = qs.length >= 3 ? qs.slice(0, 3).map(q => normalizeQ(q.question)) : null;
  return history.filter(r => {
    if (!r.quizData || r.quizData.length === 0) return false;
    if (r.totalQuestions === fLen && (r.quizData[0].question === fq0 || normalizeQ(r.quizData[0].question) === nfq0)) return true;
    if (norms3 && r.quizData.length >= 3 && norms3.every((nq, i) => normalizeQ(r.quizData[i].question) === nq)) return true;
    return false;
  });
}

/** Retakes / practice attempts of the same quiz (by parent links). */
function familyOf(primary: QuizResult, history: QuizResult[]): QuizResult[] {
  const out: QuizResult[] = [primary];
  const seen = new Set([keyOf(primary)]);
  const add = (r: QuizResult) => { const k = keyOf(r); if (!seen.has(k)) { seen.add(k); out.push(r); } };
  const rootId = primary.parentQuizId || primary.id;
  for (const r of history) {
    if (primary.id && r.parentQuizId === primary.id) add(r);                       // children
    else if (primary.parentQuizId && (r.id === primary.parentQuizId || r.parentQuizId === primary.parentQuizId)) add(r); // parent + siblings
    else if (rootId && r.parentQuizId === rootId) add(r);
    else if (primary.parentQuizTimestamp && r.timestamp === primary.parentQuizTimestamp) add(r);
    else if (r.parentQuizTimestamp && r.parentQuizTimestamp === primary.timestamp) add(r);
  }
  return out;
}

/** Every history record that belongs to this organizer file (for folder/file stats). */
export function resolveLinkedResults(file: FileNode, history: QuizResult[]): QuizResult[] {
  if (!history.length) return [];
  const direct = findHardLinked(file, history);
  if (direct) {
    const fam = familyOf(direct, history);
    // Also include same-question attempts when full data is available
    const fp = fingerprintMatches(file, history);
    const seen = new Set(fam.map(keyOf));
    for (const r of fp) if (!seen.has(keyOf(r))) { seen.add(keyOf(r)); fam.push(r); }
    return fam;
  }
  const fp = fingerprintMatches(file, history);
  if (fp.length > 0) return fp;
  // Unlinked legacy file: exact, UNIQUE title only. Linked-but-deleted files never title-match.
  if (!hasHardLink(file)) {
    const name = file.name.trim().toLowerCase();
    if (name.length >= 5) {
      const same = history.filter(r => r.quizTitle && r.quizTitle.trim().toLowerCase() === name);
      if (same.length === 1) return same;
    }
  }
  return [];
}

/** The single record to show on a file card / use for editing. */
export function resolveLinkedResult(file: FileNode, history: QuizResult[]): QuizResult | null {
  const direct = findHardLinked(file, history);
  if (direct) return direct;
  const all = resolveLinkedResults(file, history);
  return all[0] || null;
}

/**
 * Backfill missing hard links: for unlinked files with ONE unambiguous match, return the link to
 * store so the file is permanently tied to its quiz (survives renames, title edits, retakes).
 */
export function computeLinkBackfill(
  files: FileNode[],
  history: QuizResult[],
): { fileId: string; sourceResultId?: string; sourceTimestamp: number }[] {
  const patches: { fileId: string; sourceResultId?: string; sourceTimestamp: number }[] = [];
  const claimed = new Set<string>();
  for (const f of files) if (hasHardLink(f)) { const d = findHardLinked(f, history); if (d) claimed.add(keyOf(d)); }
  for (const f of files) {
    if (f.type !== 'file' || hasHardLink(f)) continue;
    const matches = resolveLinkedResults(f, history);
    if (matches.length === 0) continue;
    // Choose the earliest record (the original attempt); skip if it's ambiguous (different quizzes)
    const originals = matches.filter(r => !r.parentQuizId && !r.parentQuizTimestamp);
    const pool = originals.length > 0 ? originals : matches;
    if (pool.length !== 1) continue;
    const m = pool[0];
    if (claimed.has(keyOf(m))) continue; // another file already owns this quiz
    claimed.add(keyOf(m));
    patches.push({ fileId: f.id, sourceResultId: m.id, sourceTimestamp: m.timestamp });
  }
  return patches;
}
