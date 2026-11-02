import { QuizResult } from '../types/quiz';

const HISTORY_LIMIT = 200;

/**
 * Deduplicate quiz history by matching on:
 *  1. `id` field (exact match — most reliable)
 *  2. `timestamp + totalQuestions` composite key (fallback for legacy records without id)
 *
 * When duplicates are found, the newer record (higher timestamp or more data) wins.
 * Result is sorted newest-first and capped at HISTORY_LIMIT.
 */
export function deduplicateHistory(records: QuizResult[], limit = HISTORY_LIMIT): QuizResult[] {
  const byId = new Map<string, QuizResult>();
  const byComposite = new Map<string, QuizResult>();

  for (const r of records) {
    // Strategy 1: dedupe by id
    if (r.id) {
      const existing = byId.get(r.id);
      if (!existing || shouldReplace(existing, r)) {
        byId.set(r.id, r);
      }
      continue;
    }

    // Strategy 2: dedupe by timestamp + totalQuestions
    const compositeKey = `${r.timestamp}_${r.totalQuestions}`;
    const existing = byComposite.get(compositeKey);
    if (!existing || shouldReplace(existing, r)) {
      byComposite.set(compositeKey, r);
    }
  }

  // Merge both maps, with id-based taking priority
  const merged = new Map<string, QuizResult>();

  // First add composite-keyed records
  for (const r of byComposite.values()) {
    const key = r.id || `ts_${r.timestamp}_${r.totalQuestions}`;
    merged.set(key, r);
  }

  // Then overlay id-keyed records (these win)
  for (const r of byId.values()) {
    merged.set(r.id!, r);
  }

  return Array.from(merged.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/** Returns true if `candidate` should replace `existing` */
function shouldReplace(existing: QuizResult, candidate: QuizResult): boolean {
  // Prefer the one with quiz data
  const existingHasData = Array.isArray(existing.quizData) && existing.quizData.length > 0;
  const candidateHasData = Array.isArray(candidate.quizData) && candidate.quizData.length > 0;
  if (candidateHasData && !existingHasData) return true;
  if (!candidateHasData && existingHasData) return false;

  // Prefer the newer record
  return candidate.timestamp >= existing.timestamp;
}

/**
 * Merge incoming records with existing history, deduplicating and capping.
 */
export function mergeHistory(existing: QuizResult[], incoming: QuizResult[], limit = HISTORY_LIMIT): QuizResult[] {
  return deduplicateHistory([...existing, ...incoming], limit);
}
