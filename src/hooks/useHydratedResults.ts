import { useEffect, useMemo, useState } from 'react';
import type { QuizResult } from '../types/quiz';
import { loadFullResults } from '../utils/reports/loadFull';

/**
 * History rows are light summaries (empty quizData). This returns the SAME attempts with their
 * questions filled in from this device (IndexedDB) so lists, pills, tiles and PDFs all read one
 * complete master list. While loading it returns the summaries, so totals (which fall back to the
 * saved counters) never jump.
 */
export function useHydratedResults(summaries: QuizResult[]) {
  const needs = useMemo(() => summaries.some(r => (!r.quizData || r.quizData.length === 0) && r.totalQuestions > 0), [summaries]);
  const [done, setDone] = useState<{ source: QuizResult[]; results: QuizResult[]; missing: number } | null>(null);

  useEffect(() => {
    if (!needs) return;
    let cancelled = false;
    loadFullResults(summaries)
      .then(({ results, missing }) => { if (!cancelled) setDone({ source: summaries, results, missing }); })
      .catch(() => { if (!cancelled) setDone({ source: summaries, results: summaries, missing: summaries.length }); });
    return () => { cancelled = true; };
  }, [summaries, needs]);

  const ready = needs && done !== null && done.source === summaries;
  return {
    results: !needs ? summaries : ready ? done.results : summaries,
    missing: ready ? done.missing : 0,
    loading: needs && !ready,
  };
}
