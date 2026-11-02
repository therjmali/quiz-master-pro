import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { QuizResult } from '../../types/quiz';

interface Props {
  result: QuizResult;
}

interface TopicStat {
  topic: string;
  wrong: number;
  total: number;
  pct: number;
}

export default function WeakTopicsSummary({ result }: Props) {
  const weakTopics = useMemo(() => {
    const subject = result.subject?.trim();
    if (!subject) return []; // Can't do topic-level analysis without a subject

    // Group by difficulty as a proxy for sub-topics
    const stats = new Map<string, { wrong: number; total: number }>();

    result.quizData.forEach((q, i) => {
      const key = `${subject} · ${q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}`;
      const existing = stats.get(key) || { wrong: 0, total: 0 };
      existing.total++;
      const ua = result.userAnswers[i];
      if (ua !== null && ua !== q.correctAnswer) existing.wrong++;
      stats.set(key, existing);
    });

    const topics: TopicStat[] = [];
    for (const [topic, data] of stats.entries()) {
      if (data.wrong === 0) continue;
      const attempted = data.total;
      topics.push({ topic, wrong: data.wrong, total: attempted, pct: Math.round((data.wrong / attempted) * 100) });
    }
    return topics.sort((a, b) => b.pct - a.pct).slice(0, 3);
  }, [result]);

  if (weakTopics.length === 0) return null;

  return (
    <div className="glass-card px-5 py-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-amber-400" />
        <h3 className="text-[10px] font-black text-foreground/50 uppercase tracking-widest">Areas to Review</h3>
      </div>
      <div className="space-y-2">
        {weakTopics.map(t => (
          <div key={t.topic} className="flex items-center gap-3">
            <span className="text-xs font-bold text-foreground/60 truncate flex-1">{t.topic}</span>
            <span className="text-[10px] font-black text-red-400 tabular-nums">{t.wrong}✗/{t.total}</span>
            <div className="w-16 h-1.5 bg-muted/60 rounded-full overflow-hidden flex-shrink-0">
              <div className="h-full rounded-full bg-red-500 transition-all" style={{ width: `${t.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
