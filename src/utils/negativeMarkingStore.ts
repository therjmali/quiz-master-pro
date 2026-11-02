/**
 * Negative Marking Store — Apply/Remove toggle system
 * Stores original scores so marking can be toggled on/off per quiz or globally.
 */

import { QuizResult } from '../types/quiz';
import { getHistorySync, setHistory } from './historyStore';

const ORIGINAL_KEY = 'qmp_original_scores';
const NM_CONFIG_KEY = 'qmp_nm_config';

interface OriginalScore {
  correct: number;
  wrong: number;
  skipped: number;
  gain: number;
  penalty: number;
  netScore: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
  score: number;
}

interface NMConfig {
  marksPerQ: number;
  negMarks: number;
  appliedAt: number;
}

type OriginalScoresMap = Record<string, OriginalScore>;
type NMConfigMap = Record<string, NMConfig>;

function getQuizKey(r: QuizResult): string {
  return r.id || String(r.timestamp);
}

function loadOriginals(): OriginalScoresMap {
  try {
    const raw = localStorage.getItem(ORIGINAL_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveOriginals(map: OriginalScoresMap): void {
  try { localStorage.setItem(ORIGINAL_KEY, JSON.stringify(map)); } catch {}
}

function loadConfigs(): NMConfigMap {
  try {
    const raw = localStorage.getItem(NM_CONFIG_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveConfigs(map: NMConfigMap): void {
  try { localStorage.setItem(NM_CONFIG_KEY, JSON.stringify(map)); } catch {}
}

function loadHistory(): QuizResult[] {
  return getHistorySync();
}

function saveHistory(all: QuizResult[]): void {
  setHistory(all);
}

function recalc(r: QuizResult, marksPerQ: number, negMarks: number): Partial<QuizResult> {
  let correct = 0, wrong = 0, skipped = 0;
  (r.quizData || []).forEach((q, i) => {
    const ua = r.userAnswers?.[i];
    if (ua === null || ua === undefined) skipped++;
    else if (ua === q.correctAnswer) correct++;
    else wrong++;
  });
  const gain = correct * marksPerQ;
  const penalty = parseFloat((wrong * negMarks).toFixed(2));
  const netScore = Math.max(0, parseFloat((gain - penalty).toFixed(2)));
  const totalQ = r.totalQuestions || r.quizData?.length || 0;
  const maxScore = totalQ * marksPerQ;
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((netScore / maxScore) * 100))) : 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  return { correct, wrong, skipped, gain, penalty, netScore, maxScore, percentage, accuracy, score: netScore };
}

/** Check if negative marking is currently applied to a quiz */
export function isNegativeMarkingApplied(quizId: string): boolean {
  const configs = loadConfigs();
  return !!configs[quizId];
}

/** Get negative marking config for a quiz (or null) */
export function getNegativeMarkingConfig(quizId: string): NMConfig | null {
  const configs = loadConfigs();
  return configs[quizId] || null;
}

/** Get count of quizzes with negative marking applied */
export function getAppliedCount(): { applied: number; total: number } {
  const configs = loadConfigs();
  const history = loadHistory();
  return { applied: Object.keys(configs).length, total: history.length };
}

/** Apply negative marking to a single quiz — stores original first */
export function applyNegativeMarking(quizId: string, marksPerQ: number, negMarks: number): QuizResult[] {
  const originals = loadOriginals();
  const configs = loadConfigs();
  const all = loadHistory();

  const idx = all.findIndex(r => getQuizKey(r) === quizId);
  if (idx === -1) return all;

  const r = all[idx];

  // Store original if not already stored
  if (!originals[quizId]) {
    originals[quizId] = {
      correct: r.correct, wrong: r.wrong, skipped: r.skipped,
      gain: r.gain, penalty: r.penalty, netScore: r.netScore,
      maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy,
      score: r.score,
    };
    saveOriginals(originals);
  }

  // Recalculate
  const updated = recalc(r, marksPerQ, negMarks);
  all[idx] = { ...r, ...updated };

  // Save config
  configs[quizId] = { marksPerQ, negMarks, appliedAt: Date.now() };
  saveConfigs(configs);
  saveHistory(all);

  return all;
}

/** Remove negative marking from a single quiz — restores original */
export function removeNegativeMarking(quizId: string): QuizResult[] {
  const originals = loadOriginals();
  const configs = loadConfigs();
  const all = loadHistory();

  const idx = all.findIndex(r => getQuizKey(r) === quizId);
  if (idx === -1) return all;

  const orig = originals[quizId];
  if (orig) {
    all[idx] = { ...all[idx], ...orig };
    delete originals[quizId];
    saveOriginals(originals);
  }

  delete configs[quizId];
  saveConfigs(configs);
  saveHistory(all);

  return all;
}

/** Apply negative marking to ALL quizzes */
export function applyNegativeMarkingToAll(marksPerQ: number, negMarks: number): QuizResult[] {
  const originals = loadOriginals();
  const configs = loadConfigs();
  const all = loadHistory();

  for (const r of all) {
    const key = getQuizKey(r);
    if (!r.quizData || !r.userAnswers) continue;

    // Store original if not stored
    if (!originals[key]) {
      originals[key] = {
        correct: r.correct, wrong: r.wrong, skipped: r.skipped,
        gain: r.gain, penalty: r.penalty, netScore: r.netScore,
        maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy,
        score: r.score,
      };
    }

    const updated = recalc(r, marksPerQ, negMarks);
    Object.assign(r, updated);
    configs[key] = { marksPerQ, negMarks, appliedAt: Date.now() };
  }

  saveOriginals(originals);
  saveConfigs(configs);
  saveHistory(all);
  return all;
}

/** Apply negative marking to a filtered set of quizzes by ID */
export function applyNegativeMarkingToFiltered(quizIds: string[], marksPerQ: number, negMarks: number): QuizResult[] {
  const originals = loadOriginals();
  const configs = loadConfigs();
  const all = loadHistory();
  const idSet = new Set(quizIds);

  for (const r of all) {
    const key = getQuizKey(r);
    if (!idSet.has(key)) continue;
    if (!r.quizData || !r.userAnswers) continue;

    if (!originals[key]) {
      originals[key] = {
        correct: r.correct, wrong: r.wrong, skipped: r.skipped,
        gain: r.gain, penalty: r.penalty, netScore: r.netScore,
        maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy,
        score: r.score,
      };
    }

    const updated = recalc(r, marksPerQ, negMarks);
    Object.assign(r, updated);
    configs[key] = { marksPerQ, negMarks, appliedAt: Date.now() };
  }

  saveOriginals(originals);
  saveConfigs(configs);
  saveHistory(all);
  return all;
}

/** Remove negative marking from a filtered set of quizzes by ID */
export function removeNegativeMarkingFromFiltered(quizIds: string[]): QuizResult[] {
  const originals = loadOriginals();
  const configs = loadConfigs();
  const all = loadHistory();
  const idSet = new Set(quizIds);

  for (const r of all) {
    const key = getQuizKey(r);
    if (!idSet.has(key)) continue;
    const orig = originals[key];
    if (orig) {
      Object.assign(r, orig);
      delete originals[key];
    }
    delete configs[key];
  }

  saveOriginals(originals);
  saveConfigs(configs);
  saveHistory(all);
  return all;
}

/** Remove negative marking from ALL quizzes */
export function removeNegativeMarkingFromAll(): QuizResult[] {
  const originals = loadOriginals();
  const all = loadHistory();

  for (const r of all) {
    const key = getQuizKey(r);
    const orig = originals[key];
    if (orig) Object.assign(r, orig);
  }

  saveOriginals({});
  saveConfigs({});
  saveHistory(all);
  return all;
}

/** Re-apply stored negative marking configs to a history array (e.g. after cloud sync) */
export function reapplyStoredNegativeMarking(history: QuizResult[]): QuizResult[] {
  const configs = loadConfigs();
  if (Object.keys(configs).length === 0) return history;
  const originals = loadOriginals();

  return history.map(r => {
    const key = getQuizKey(r);
    const cfg = configs[key];
    if (!cfg) return r;

    // Store original if not already stored
    if (!originals[key]) {
      originals[key] = {
        correct: r.correct, wrong: r.wrong, skipped: r.skipped,
        gain: r.gain, penalty: r.penalty, netScore: r.netScore,
        maxScore: r.maxScore, percentage: r.percentage, accuracy: r.accuracy,
        score: r.score,
      };
    }

    const updated = recalc(r, cfg.marksPerQ, cfg.negMarks);
    return { ...r, ...updated };
  });
}

/** Get original score for a quiz (before negative marking) */
export function getOriginalScore(quizId: string): OriginalScore | null {
  const originals = loadOriginals();
  return originals[quizId] || null;
}

/** Get count of applied negative marking for a specific set of quiz IDs */
export function getAppliedCountForIds(quizIds: string[]): { applied: number; total: number } {
  const configs = loadConfigs();
  let applied = 0;
  for (const id of quizIds) {
    if (configs[id]) applied++;
  }
  return { applied, total: quizIds.length };
}

/** Get all quiz IDs that have negative marking applied */
export function getAppliedQuizIds(): string[] {
  const configs = loadConfigs();
  return Object.keys(configs);
}

/** Utility: get quiz key from a result */
export { getQuizKey };
