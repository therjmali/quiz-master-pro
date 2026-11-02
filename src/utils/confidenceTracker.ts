/**
 * Confidence Calibration Tracker
 * Tracks whether users are well-calibrated in their confidence levels.
 */

export type ConfidenceLevel = 'sure' | 'guessing' | null;

export interface ConfidenceRecord {
  confident: number;
  confidentCorrect: number;
  confidentWrong: number;
  guessing: number;
  guessingCorrect: number;
  guessingWrong: number;
}

const STORAGE_KEY = 'qmp_confidence_history';

export function getConfidenceHistory(): ConfidenceRecord[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

export function saveConfidenceRecord(record: ConfidenceRecord): void {
  const history = getConfidenceHistory();
  history.unshift(record);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(0, 100)));
}

export function computeCalibration(records: ConfidenceRecord[]): {
  overconfidence: number; // % of "sure" answers that were wrong
  underconfidence: number; // % of "guessing" answers that were right
  totalSure: number;
  totalGuessing: number;
  calibrationScore: number; // 0-100, higher = better calibrated
} {
  let totalSure = 0, sureWrong = 0, totalGuessing = 0, guessingCorrect = 0;
  records.forEach(r => {
    totalSure += r.confident;
    sureWrong += r.confidentWrong;
    totalGuessing += r.guessing;
    guessingCorrect += r.guessingCorrect;
  });

  const overconfidence = totalSure > 0 ? Math.round((sureWrong / totalSure) * 100) : 0;
  const underconfidence = totalGuessing > 0 ? Math.round((guessingCorrect / totalGuessing) * 100) : 0;

  // Calibration score: 100 = perfect, lower = worse
  const sureAccuracy = totalSure > 0 ? (totalSure - sureWrong) / totalSure : 1;
  const guessingMissRate = totalGuessing > 0 ? (totalGuessing - guessingCorrect) / totalGuessing : 1;
  const calibrationScore = Math.round(((sureAccuracy + (1 - (guessingCorrect / Math.max(totalGuessing, 1)))) / 2) * 100);

  return { overconfidence, underconfidence, totalSure, totalGuessing, calibrationScore: Math.min(100, calibrationScore) };
}
