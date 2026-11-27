/**
 * Correcting a question after the quiz (the answer key from the pasted text was wrong, a typo, a bad option) and
 * re-scoring everything that depends on it. Everything in this file is pure: it returns new objects and never
 * changes its input; storing the result everywhere is done by `applyQuestionFix.ts`.
 */
import type { QuizQuestion, QuizResult, ScoreResult } from '../types/quiz';
import { calculateScore } from './scoring';

export interface QuestionEdit {
  question?: string;
  /** the full option list after editing; option i keeps its identity (an edited option keeps the answers given on it) */
  options?: string[];
  /** the new correct answer (must be one of the final options) */
  correctAnswer?: string;
  /** several correct answers (multi-answer questions) */
  correctAnswers?: string[];
  rationale?: string;
  difficulty?: 'easy' | 'medium' | 'hard';
}

export type FixSource = 'user' | 'ai';
export const MAX_OPTIONS = 8;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Same question across attempts, the library, bookmarks and the mistakes bank: compared by text, ignoring case and spacing. */
export const questionKey = (text: string): string => clean(text).toLowerCase();

/** Same options (ignoring order, case and spacing): two questions with the same text but different options are different questions. */
export function sameOptionSet(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false;
  const norm = (x: readonly string[]) => x.map(o => clean(o).toLowerCase()).sort().join('\u0001');
  return norm(a) === norm(b);
}

export const isFixed = (q: Pick<QuizQuestion, 'fix'>): boolean => !!q.fix;

/** Why an edit can not be saved (empty list = fine). Checked against the question as it will look afterwards. */
export function validateEdit(q: QuizQuestion, edit: QuestionEdit): string[] {
  const errors: string[] = [];
  const text = clean(edit.question ?? q.question);
  const options = (edit.options ?? q.options).map(clean);
  if (!text) errors.push('The question can not be empty.');
  if (options.length < 2) errors.push('A question needs at least 2 options.');
  if (options.length > MAX_OPTIONS) errors.push(`At most ${MAX_OPTIONS} options.`);
  if (options.some(o => !o)) errors.push('Every option needs some text.');
  const lower = options.map(o => o.toLowerCase());
  if (new Set(lower).size !== lower.length) errors.push('Two options are the same.');
  const answers = edit.correctAnswers ?? (edit.correctAnswer !== undefined ? [edit.correctAnswer] : null);
  if (answers) {
    if (answers.length === 0) errors.push('Pick the correct answer.');
    for (const a of answers) if (!options.some(o => o.toLowerCase() === clean(a).toLowerCase())) errors.push('The correct answer must be one of the options.');
  }
  return errors;
}

/** True when the edit would change something. */
export function isEffectiveEdit(q: QuizQuestion, edit: QuestionEdit): boolean {
  if (edit.question !== undefined && clean(edit.question) !== clean(q.question)) return true;
  if (edit.options !== undefined && (edit.options.length !== q.options.length || edit.options.some((o, i) => clean(o) !== clean(q.options[i])))) return true;
  if (edit.correctAnswers !== undefined) {
    const cur = (q.correctAnswers?.length ? q.correctAnswers : [q.correctAnswer]).map(a => clean(a).toLowerCase()).sort().join('|');
    if (edit.correctAnswers.map(a => clean(a).toLowerCase()).sort().join('|') !== cur) return true;
  } else if (edit.correctAnswer !== undefined && clean(edit.correctAnswer).toLowerCase() !== clean(q.correctAnswer).toLowerCase()) return true;
  if (edit.rationale !== undefined && edit.rationale.trim() !== (q.rationale || '').trim()) return true;
  if (edit.difficulty !== undefined && edit.difficulty !== q.difficulty) return true;
  return false;
}

const bullets = (text: string) => text.split(/\r?\n|•/).map(s => s.trim()).filter(Boolean);

/** old option text -> new option text (by position when the number of options is unchanged, otherwise by exact text) */
export function buildAnswerMap(oldOptions: readonly string[], newOptions: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  if (oldOptions.length === newOptions.length) oldOptions.forEach((o, i) => map.set(o, clean(newOptions[i])));
  else oldOptions.forEach(o => { const hit = newOptions.find(n => clean(n).toLowerCase() === clean(o).toLowerCase()); if (hit !== undefined) map.set(o, clean(hit)); });
  return map;
}

/** An answer given on an old option follows that option to its new text. Answers that match nothing stay as they were. */
export const remapAnswer = (answer: string | null | undefined, map: ReadonlyMap<string, string>): string | null =>
  answer === null || answer === undefined ? null : (map.get(answer) ?? answer);

const snapshot = (q: QuizQuestion): NonNullable<QuizQuestion['fix']>['original'] => ({
  question: q.question, options: [...q.options], correctAnswer: q.correctAnswer,
  ...(q.correctAnswers ? { correctAnswers: [...q.correctAnswers] } : {}),
  ...(q.rationale !== undefined ? { rationale: q.rationale } : {}), difficulty: q.difficulty,
});

/** The corrected question and how answers given on its options map to the new texts. Throws when the edit is invalid. */
export function applyEdit(q: QuizQuestion, edit: QuestionEdit, by: FixSource = 'user', at: number = Date.now()): { question: QuizQuestion; answerMap: Map<string, string> } {
  const errors = validateEdit(q, edit);
  if (errors.length) throw new Error(errors[0]);
  const options = (edit.options ?? q.options).map(clean);
  const answerMap = buildAnswerMap(q.options, options);
  const fromMap = (a: string) => answerMap.get(a) ?? clean(a);
  const pick = (a: string) => options.find(o => o.toLowerCase() === clean(a).toLowerCase()) ?? clean(a);

  let correctAnswer: string, correctAnswers: string[] | undefined;
  if (edit.correctAnswers !== undefined) { correctAnswers = edit.correctAnswers.map(pick); correctAnswer = correctAnswers[0]; }
  else if (edit.correctAnswer !== undefined) { correctAnswer = pick(edit.correctAnswer); correctAnswers = undefined; }
  else { correctAnswer = fromMap(q.correctAnswer); correctAnswers = q.correctAnswers?.map(fromMap); }
  if (correctAnswers && correctAnswers.length <= 1) correctAnswers = undefined;

  const rationale = edit.rationale !== undefined ? edit.rationale.trim() : q.rationale;
  const next: QuizQuestion = {
    ...q,
    question: clean(edit.question ?? q.question),
    options, correctAnswer,
    correctAnswers,
    rationale,
    difficulty: edit.difficulty ?? q.difficulty,
    fix: { at, by, original: q.fix?.original ?? snapshot(q) },
  };
  if (edit.rationale !== undefined) next.rationaleBullets = bullets(edit.rationale);
  if (q.shuffledOpts) {
    const mapped = q.shuffledOpts.map(o => answerMap.get(o)).filter((o): o is string => o !== undefined);
    next.shuffledOpts = [...mapped, ...options.filter(o => !mapped.includes(o))];
  }
  if (!next.correctAnswers) delete next.correctAnswers;
  return { question: next, answerMap };
}

/** Undo every correction of a question. Returns it unchanged when it was never corrected. */
export function revertQuestion(q: QuizQuestion): { question: QuizQuestion; answerMap: Map<string, string> } {
  if (!q.fix) return { question: q, answerMap: new Map() };
  const o = q.fix.original;
  const answerMap = buildAnswerMap(q.options, o.options);
  const next: QuizQuestion = { ...q, question: o.question, options: [...o.options], correctAnswer: o.correctAnswer, rationale: o.rationale, difficulty: o.difficulty };
  if (o.correctAnswers) next.correctAnswers = [...o.correctAnswers]; else delete next.correctAnswers;
  delete next.fix; delete next.rationaleBullets;
  if (q.shuffledOpts) { const m = q.shuffledOpts.map(x => answerMap.get(x)).filter((x): x is string => x !== undefined); next.shuffledOpts = [...m, ...o.options.filter(x => !m.includes(x))]; }
  return { question: next, answerMap };
}

/* ───────── scoring ───────── */

export interface Scoring { marksPerQuestion: number; negativeMarking: boolean; negativeMarks: number }

/**
 * The marking rules an attempt was scored with. New attempts carry them; for older ones they are worked out from the
 * numbers (marks = max score / questions, penalty per wrong = penalty / wrong). When an old attempt had no wrong answer
 * the penalty rate is unknown, so `fallback` (your current default rules) is used.
 */
export function inferScoring(r: Pick<QuizResult, 'scoring' | 'maxScore' | 'totalQuestions' | 'quizData' | 'penalty' | 'wrong'>, fallback?: Partial<Scoring>): Scoring {
  if (r.scoring) return r.scoring;
  const n = r.quizData?.length || r.totalQuestions || 0;
  const marks = n > 0 && r.maxScore > 0 ? Math.round((r.maxScore / n) * 10000) / 10000 : (fallback?.marksPerQuestion ?? 1);
  if (r.wrong > 0 && r.penalty > 0) return { marksPerQuestion: marks, negativeMarking: true, negativeMarks: Math.round((r.penalty / r.wrong) * 10000) / 10000 };
  if (r.wrong > 0 && r.penalty === 0) return { marksPerQuestion: marks, negativeMarking: false, negativeMarks: fallback?.negativeMarks ?? 0 };
  return { marksPerQuestion: marks, negativeMarking: fallback?.negativeMarking ?? false, negativeMarks: fallback?.negativeMarks ?? 0 };
}

export type Rescored = Pick<QuizResult, 'correct' | 'wrong' | 'skipped' | 'gain' | 'penalty' | 'netScore' | 'maxScore' | 'percentage' | 'accuracy' | 'score'>;

/** New score numbers for an attempt (its questions / answers as given). The input is not changed. */
export function rescoreResult(r: Pick<QuizResult, 'quizData' | 'userAnswers'>, scoring: Scoring): Rescored {
  const s: ScoreResult = calculateScore(r.quizData, r.userAnswers, scoring.marksPerQuestion, scoring.negativeMarking, scoring.negativeMarks);
  return { ...s, score: s.netScore };
}

/* ───────── applying one correction to attempts ───────── */

export interface FixOutcome {
  result: QuizResult;
  /** questions of this attempt that were changed */
  changedIndexes: number[];
  before: Rescored;
  after: Rescored;
}

const pickScoreFields = (r: QuizResult): Rescored => ({ correct: r.correct, wrong: r.wrong, skipped: r.skipped, gain: r.gain, penalty: r.penalty, netScore: r.netScore, maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy, score: r.score });

/**
 * Applies one correction (`edit`, or a revert) to every question of `result` that is the question `matchKey`
 * (`only` limits it to one position), re-maps the answers given on edited options and re-scores the attempt.
 * Returns null when nothing in this attempt matched.
 */
export function fixAttempt(result: QuizResult, matchKey: string, change: { edit: QuestionEdit; by?: FixSource; at?: number } | { revert: true }, opts: { only?: number; fallback?: Partial<Scoring>; matchOptions?: readonly string[] } = {}): FixOutcome | null {
  if (!result.quizData?.length) return null;
  const scoring = inferScoring(result, opts.fallback);
  const quizData = [...result.quizData];
  const userAnswers = [...result.userAnswers];
  const changed: number[] = [];
  quizData.forEach((q, i) => {
    if (opts.only !== undefined && opts.only !== i) return;
    if (questionKey(q.question) !== matchKey) return;
    // the question you fixed is always changed; other copies only when they have the very same options
    if (opts.only === undefined && opts.matchOptions && !sameOptionSet(q.options, opts.matchOptions)) return;
    let out: { question: QuizQuestion; answerMap: Map<string, string> };
    try { out = 'revert' in change ? revertQuestion(q) : applyEdit(q, change.edit, change.by ?? 'user', change.at ?? Date.now()); }
    catch (e) { if (opts.only !== undefined) throw e; return; }
    if (out.question === q) return;
    quizData[i] = out.question;
    userAnswers[i] = remapAnswer(userAnswers[i], out.answerMap);
    changed.push(i);
  });
  if (!changed.length) return null;
  const rescored = rescoreResult({ quizData, userAnswers }, scoring);
  return {
    result: { ...result, quizData, userAnswers, ...rescored, scoring, fixedAt: Date.now() },
    changedIndexes: changed,
    before: pickScoreFields(result),
    after: rescored,
  };
}

/** Preview for the editor: what an edit does to the question's status and to the attempt's score. */
export function previewFix(result: QuizResult, index: number, edit: QuestionEdit, fallback?: Partial<Scoring>): { ok: boolean; error?: string; statusBefore: 'correct' | 'wrong' | 'skipped'; statusAfter: 'correct' | 'wrong' | 'skipped'; before: Rescored; after: Rescored } {
  const q = result.quizData[index];
  const status = (qq: QuizQuestion, ua: string | null): 'correct' | 'wrong' | 'skipped' => ua === null || ua === undefined ? 'skipped' : (ua === qq.correctAnswer || qq.correctAnswers?.includes(ua)) ? 'correct' : 'wrong';
  const statusBefore = status(q, result.userAnswers[index]);
  const before = pickScoreFields(result);
  try {
    const out = fixAttempt(result, questionKey(q.question), { edit }, { only: index, fallback });
    if (!out) return { ok: true, statusBefore, statusAfter: statusBefore, before, after: before };
    return { ok: true, statusBefore, statusAfter: status(out.result.quizData[index], out.result.userAnswers[index]), before, after: out.after };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid edit', statusBefore, statusAfter: statusBefore, before, after: before };
  }
}

/* ───────── other places a question lives ───────── */

/** A list of questions (a library file, ...) with the correction applied to every copy of the question. New array/objects; unchanged ones are reused. */
export function fixQuestionList(list: readonly QuizQuestion[] | undefined, matchKey: string, change: { edit: QuestionEdit; by?: FixSource; at?: number } | { revert: true }, matchOptions?: readonly string[]): { list: QuizQuestion[] | undefined; changed: number } {
  if (!list?.length) return { list: list ? [...list] : list, changed: 0 };
  let changed = 0;
  const next = list.map(q => {
    if (questionKey(q.question) !== matchKey) return q;
    if (matchOptions && !sameOptionSet(q.options, matchOptions)) return q;
    try {
      const out = 'revert' in change ? revertQuestion(q) : applyEdit(q, change.edit, change.by ?? 'user', change.at ?? Date.now());
      if (out.question !== q) changed++;
      return out.question;
    } catch { return q; }
  });
  return { list: next, changed };
}
