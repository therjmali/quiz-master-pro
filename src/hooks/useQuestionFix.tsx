import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { toast } from 'sonner';
import type { QuizQuestion, QuizResult } from '../types/quiz';
import { fixAttempt, fixQuestionList, questionKey, sameOptionSet, type FixSource, type QuestionEdit, type Rescored } from '../utils/questionFix';
import { resultKey } from '../utils/attemptStats';
import { getQuizDetailFromIDB, storeQuizDetail, IDB_HISTORY_KEY } from './useHistorySync';
import { setHistory as setHistoryStore } from '../utils/historyStore';
import { idbSet } from '../utils/indexedDB';
import { loadFileTree, saveFileTree, type FileNode } from '../utils/fileTree';
import { loadMistakeStore, saveMistakeStore } from '../utils/globalMistakes';
import { refreshOriginalScoreAfterFix } from '../utils/negativeMarkingStore';

export type FixChange = { edit: QuestionEdit; by?: FixSource } | { revert: true };

export interface FixRequest {
  /** the question as it is NOW; its text identifies it in every attempt, file and bookmark */
  questionText: string;
  change: FixChange;
  /** the question's options as they are NOW; other copies are only changed when they have the same options */
  options: string[];
  /** 'this' = only this attempt (and this position), 'all' = every attempt, saved quiz, bookmark and mistake of the question */
  scope: 'this' | 'all';
  /** the attempt the correction was made in (id, or timestamp as text) and the question's position in it */
  resultKey?: string;
  index?: number;
}

export interface FixSummary {
  attempts: number;
  questions: number;
  /** attempts that have the question but whose details are not on this device (left as they were) */
  missing: number;
  libraryFiles: number;
  bookmarks: number;
  mistakes: number;
  /** the attempt the correction was made in, after re-scoring */
  current?: { before: Rescored; after: Rescored };
}

interface Deps {
  historyRef: React.MutableRefObject<QuizResult[]>;
  setHistory: React.Dispatch<React.SetStateAction<QuizResult[]>>;
  currentResult: QuizResult | null;
  setCurrentResult: React.Dispatch<React.SetStateAction<QuizResult | null>>;
  markDirty: () => void;
  cacheDetail: (id: string, result: QuizResult) => void;
  invalidateDetail: (id: string) => void;
  onCloudDirty: (category: 'quiz' | 'library', priority?: 'background' | 'immediate' | 'critical') => void;
  /** your default marking rules, used only for old attempts whose penalty rate can not be worked out */
  fallbackScoring: () => { negativeMarking: boolean; negativeMarks: number; marksPerQuestion: number };
}

const rowKey = (r: QuizResult) => r.id || String(r.timestamp);
const scoreFields = (r: QuizResult) => ({ correct: r.correct, wrong: r.wrong, skipped: r.skipped, gain: r.gain, penalty: r.penalty, netScore: r.netScore, maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy, score: r.score, scoring: r.scoring, fixedAt: r.fixedAt });

/** Walks the library tree, calls `fn` for every file's questions and every bookmark. Returns a new tree only when something changed. */
function mapTree(root: FileNode, matchKey: string, change: FixChange, options: readonly string[]): { tree: FileNode; files: number; bookmarks: number } {
  let files = 0, bookmarks = 0;
  const walk = (n: FileNode): FileNode => {
    let next = n;
    if (n.type === 'file' && n.questions?.length) {
      const out = fixQuestionList(n.questions, matchKey, change, options);
      if (out.changed > 0) { files++; next = { ...next, questions: out.list, updatedAt: Date.now() }; }
    }
    if (n.type === 'bookmark' && n.bookmarkData && questionKey(n.bookmarkData.question) === matchKey && sameOptionSet(n.bookmarkData.options, options)) {
      const b = n.bookmarkData;
      const asQuestion: QuizQuestion = { question: b.question, options: b.options || [], correctAnswer: b.correctAnswer, rationale: b.rationale, difficulty: (b.difficulty as QuizQuestion['difficulty']) || 'medium' };
      const out = fixQuestionList([asQuestion], matchKey, change, options);
      if (out.changed > 0 && out.list) {
        const q = out.list[0];
        bookmarks++;
        next = { ...next, bookmarkData: { ...b, question: q.question, options: q.options, correctAnswer: q.correctAnswer, rationale: q.rationale, difficulty: q.difficulty }, updatedAt: Date.now() };
      }
    }
    if (n.children?.length) {
      const kids = n.children.map(walk);
      if (kids.some((k, i) => k !== n.children![i])) next = { ...next, children: kids };
    }
    return next;
  };
  const tree = walk(root);
  return { tree, files, bookmarks };
}

/** Applies one correction to everything that holds the question. Returns what it touched. */
export function useQuestionFixEngine(deps: Deps) {
  const { historyRef, setHistory, currentResult, setCurrentResult, markDirty, cacheDetail, invalidateDetail, onCloudDirty, fallbackScoring } = deps;

  return useCallback(async (req: FixRequest): Promise<FixSummary> => {
    const matchKey = questionKey(req.questionText);
    const summary: FixSummary = { attempts: 0, questions: 0, missing: 0, libraryFiles: 0, bookmarks: 0, mistakes: 0 };
    const change = req.change;
    const fb = fallbackScoring();

    // 1) attempts
    const rows = req.scope === 'this' && req.resultKey ? historyRef.current.filter(r => rowKey(r) === req.resultKey) : [...historyRef.current];
    const updates = new Map<string, QuizResult>();
    const consider = rows.length ? rows : (currentResult && (!req.resultKey || rowKey(currentResult) === req.resultKey) ? [currentResult] : []);
    for (const row of consider) {
      const key = rowKey(row);
      let full: QuizResult | undefined = currentResult && rowKey(currentResult) === key ? currentResult : undefined;
      if (!full && row.quizData?.length) full = row;
      if (!full) full = (row.id ? await getQuizDetailFromIDB(String(row.id)) : undefined) || await getQuizDetailFromIDB(String(row.timestamp));
      if (!full?.quizData?.length) { if (req.scope === 'all') summary.missing++; continue; }
      const only = req.scope === 'this' && req.resultKey === key ? req.index : undefined;
      const out = fixAttempt(full, matchKey, change, { only, fallback: fb, matchOptions: req.options });
      if (!out) continue;
      updates.set(key, out.result);
      summary.attempts++; summary.questions += out.changedIndexes.length;
      if (req.resultKey && key === req.resultKey) summary.current = { before: out.before, after: out.after };
      if (!summary.current && currentResult && key === rowKey(currentResult)) summary.current = { before: out.before, after: out.after };
    }

    if (updates.size > 0) {
      // the corrected details are written BEFORE the history changes, because lists reload them from here as soon as it does
      const writes: Promise<unknown>[] = [];
      for (const [key, res] of updates) {
        writes.push(storeQuizDetail(String(res.timestamp), res).catch(() => {}));
        if (res.id) { writes.push(storeQuizDetail(String(res.id), res).catch(() => {})); invalidateDetail(String(res.id)); cacheDetail(String(res.id), res); }
        refreshOriginalScoreAfterFix(key, res);
      }
      await Promise.all(writes);
      const next = historyRef.current.map(r => { const u = updates.get(rowKey(r)); return u ? { ...r, ...scoreFields(u) } : r; });
      setHistory(next);
      try { setHistoryStore(next); } catch { /* storage full: the in-memory list and IndexedDB still hold it */ }
      idbSet(IDB_HISTORY_KEY, next).catch(() => {});
      if (currentResult) { const u = updates.get(rowKey(currentResult)); if (u) setCurrentResult(u); }
      markDirty();
      onCloudDirty('quiz', 'immediate');
    }

    // 2) saved quizzes in the Library and bookmarks (only for "all": a one-attempt fix must not rewrite your saved copy)
    if (req.scope === 'all') {
      try {
        const out = mapTree(loadFileTree(), matchKey, change, req.options);
        if (out.files + out.bookmarks > 0) { saveFileTree(out.tree); summary.libraryFiles = out.files; summary.bookmarks = out.bookmarks; onCloudDirty('library', 'immediate'); }
      } catch { /* the library is optional */ }

      // 3) mistakes bank: keep it in step; a mistake that is not a mistake any more leaves the bank
      try {
        const store = loadMistakeStore();
        let touched = 0;
        const entries = store.entries.flatMap(e => {
          if (questionKey(e.question) !== matchKey || !sameOptionSet(e.options, req.options)) return [e];
          const q: QuizQuestion = { question: e.question, options: e.options, correctAnswer: e.correctAnswer, rationale: e.rationale, difficulty: (e.difficulty as QuizQuestion['difficulty']) || 'medium' };
          const out = fixQuestionList([q], matchKey, change, req.options);
          if (!out.changed || !out.list) return [e];
          touched++;
          const nq = out.list[0];
          const nowCorrect = nq.correctAnswer === e.userAnswer || !!nq.correctAnswers?.includes(e.userAnswer);
          if (nowCorrect) return [];
          return [{ ...e, question: nq.question, options: nq.options, correctAnswer: nq.correctAnswer, rationale: nq.rationale, difficulty: nq.difficulty }];
        });
        if (touched > 0) { saveMistakeStore({ ...store, entries }); summary.mistakes = touched; }
      } catch { /* the bank is optional */ }
    }
    return summary;
  }, [historyRef, setHistory, currentResult, setCurrentResult, markDirty, cacheDetail, invalidateDetail, onCloudDirty, fallbackScoring]);
}

/* ───────── context: any review card can offer "Fix" without prop drilling ───────── */

interface Api { fix: ((req: FixRequest) => Promise<FixSummary>) | null; }
const Ctx = createContext<Api>({ fix: null });

export function QuestionFixProvider({ fix, children }: { fix: (req: FixRequest) => Promise<FixSummary>; children: ReactNode }) {
  const value = useMemo(() => ({ fix }), [fix]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** `null` outside the provider (the sheet then only offers the AI check). */
export const useQuestionFixApi = () => useContext(Ctx).fix;

/** One toast that says what the correction did. */
export function announceFix(s: FixSummary, reverted = false) {
  const parts: string[] = [];
  if (s.current && s.current.before.netScore !== s.current.after.netScore) parts.push(`score ${s.current.before.netScore} → ${s.current.after.netScore}`);
  if (s.attempts > 1) parts.push(`${s.attempts} attempts updated`);
  if (s.libraryFiles) parts.push(`${s.libraryFiles} saved quiz${s.libraryFiles > 1 ? 'zes' : ''}`.replace('quizzes', 'quizzes'));
  if (s.mistakes) parts.push('mistakes list updated');
  toast.success(`${reverted ? '↩️ Correction undone' : '✅ Saved'}${parts.length ? ' · ' + parts.join(' · ') : ''}`);
  if (s.missing > 0) toast(`${s.missing} older attempt${s.missing > 1 ? 's' : ''} of this question are not stored on this device and were left as they were.`);
}
