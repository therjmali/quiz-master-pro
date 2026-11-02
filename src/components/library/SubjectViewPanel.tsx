import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { QuizResult } from '../../types/quiz';
import { formatDateDMY } from '../../utils/dateFormat';

interface Props {
  history: QuizResult[];
  onViewResult: (r: QuizResult) => void;
}

const SUBJECT_ICONS: [string, string][] = [
  ['biology', '🔬'], ['anatomy', '🏥'], ['pharmacology', '💊'],
  ['physiology', '⚡'], ['biochemistry', '🧪'], ['pathology', '🔍'],
  ['medicine', '🩺'], ['surgery', '⚕️'], ['pediatric', '👶'],
  ['obstetric', '🤱'], ['gynecol', '🌸'], ['psychiatry', '🧠'],
  ['microbiology', '🦠'], ['immunology', '🛡️'], ['radiology', '📡'],
  ['ortho', '🦴'], ['cardio', '❤️'], ['neuro', '🧠'],
];
function getIcon(s: string): string {
  const lower = s.toLowerCase();
  const match = SUBJECT_ICONS.find(([k]) => lower.includes(k));
  return match ? match[1] : '📚';
}
function scoreBar(p: number) { return p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-amber-500' : 'bg-red-500'; }
function scoreColor(p: number) { return p >= 80 ? 'text-emerald-400' : p >= 60 ? 'text-amber-400' : 'text-red-400'; }

export default function SubjectViewPanel({ history, onViewResult }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, QuizResult[]>();
    history.forEach(r => {
      const s = r.subject || '📋 No Subject';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(r);
    });
    return Array.from(map.entries()).map(([subject, quizzes]) => ({
      subject,
      quizzes: quizzes.sort((a, b) => b.timestamp - a.timestamp),
      avgScore: Math.round(quizzes.reduce((a, r) => a + r.percentage, 0) / quizzes.length),
      icon: getIcon(subject),
    })).sort((a, b) => b.quizzes.length - a.quizzes.length);
  }, [history]);

  if (!groups.length) {
    return (
      <div className="glass-card p-10 flex flex-col items-center text-center">
        <div className="text-4xl mb-3">🏷️</div>
        <p className="text-sm font-black text-foreground">No subjects yet</p>
        <p className="text-xs text-foreground/40 mt-1">Tag your quizzes with subjects to see them here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in">
      {groups.map(g => (
        <div key={g.subject} className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
          <button
            onClick={() => setExpanded(expanded === g.subject ? null : g.subject)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-foreground/4 transition-all active:bg-foreground/6"
          >
            <span className="text-2xl flex-shrink-0 leading-none">{g.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{g.subject}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <div className="flex-1 h-1 bg-muted/60 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-700 ${scoreBar(g.avgScore)}`} style={{ width: `${g.avgScore}%` }} />
                </div>
                <span className={`text-xs font-black flex-shrink-0 ${scoreColor(g.avgScore)}`}>{g.avgScore}%</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs font-black text-foreground/40 bg-foreground/8 px-2.5 py-1 rounded-lg">{g.quizzes.length}</span>
              {expanded === g.subject
                ? <ChevronDown className="w-4 h-4 text-foreground/30" />
                : <ChevronRight className="w-4 h-4 text-foreground/30" />}
            </div>
          </button>

          {expanded === g.subject && (
            <div className="border-t border-border animate-fade-in">
              {g.quizzes.map(r => (
                <button
                  key={r.id || r.timestamp}
                  onClick={() => onViewResult(r)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-foreground/4 transition-all border-b border-border last:border-0 active:bg-foreground/6"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground/90 truncate">
                      {r.quizTitle || `Quiz · ${r.totalQuestions} Questions`}
                    </p>
                    <p className="text-[10px] text-foreground/35 mt-0.5">
                      {formatDateDMY(r.timestamp)} · {r.totalQuestions} Qs
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className={`text-sm font-black ${scoreColor(r.percentage)}`}>{r.percentage}%</p>
                    <p className="text-[9px] text-foreground/30">
                      ✓{r.correct} ✗{r.wrong}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
