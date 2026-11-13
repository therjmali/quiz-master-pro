import { useState, useMemo } from 'react';
import { CalendarDays, Loader2, ChevronRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '../../platform/cloud/useAccount';
import { openSignIn } from '../../platform/cloud/signInWindow';
import { requestOpenSettingsSection } from '../cloud/CloudGate';
import { hasAnyAiKey } from '../../platform/ai/providers';
import { hasBackend } from '../../platform/ai/caller';
import { QuizResult } from '../../types/quiz';
import { generateStudyPlan, GenerateStudyPlanOutputType } from 'zitejs/api';

interface Props { history: QuizResult[]; onNavigateToSetup?: () => void; }

type PlanDay = GenerateStudyPlanOutputType['plan'][0];

const PRIORITY_STYLES: Record<string, string> = {
  high: 'bg-red-500/15 text-red-400 border-red-500/25',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

export default function StudyPlanCard({ history, onNavigateToSetup }: Props) {
  const user = useAccount().signedIn;
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState<GenerateStudyPlanOutputType | null>(() => {
    try { const s = localStorage.getItem('qmp_study_plan'); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [examDate, setExamDate] = useState('');
  const [showSetup, setShowSetup] = useState(false);

  const weakTopics = useMemo(() => {
    const map = new Map<string, { correct: number; total: number }>();
    history.forEach(r => {
      const subj = r.subject || 'General';
      const e = map.get(subj) || { correct: 0, total: 0 };
      e.correct += r.correct; e.total += r.totalQuestions;
      map.set(subj, e);
    });
    return Array.from(map.entries()).map(([subject, { correct, total }]) => ({
      subject, accuracy: total > 0 ? Math.round((correct / total) * 100) : 0, totalQuestions: total,
    })).sort((a, b) => a.accuracy - b.accuracy);
  }, [history]);

  const avgScore = useMemo(() =>
    history.length > 0 ? Math.round(history.reduce((a, r) => a + r.percentage, 0) / history.length) : 0
  , [history]);

  const handleGenerate = async () => {
    if (!hasAnyAiKey() && !hasBackend()) {
      toast.error('Add an AI key in Settings → AI Keys & Models to generate a study plan');
      requestOpenSettingsSection('ai');
      return;
    }
    if (!hasAnyAiKey() && hasBackend() && !user) {
      toast.error('Please sign in or add an AI key in Settings → AI');
      openSignIn();
      return;
    }
    setLoading(true);
    try {
      const result = await generateStudyPlan({
        weakTopics, examDate: examDate || undefined,
        hoursPerDay: 2, totalQuizzes: history.length, averageScore: avgScore,
      });
      setPlan(result);
      localStorage.setItem('qmp_study_plan', JSON.stringify(result));
      setShowSetup(false);
      toast.success('📅 Study plan generated!');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to generate plan');
    } finally { setLoading(false); }
  };

  if (history.length < 3) return null;

  // Show setup form
  if (showSetup || (!plan && !showSetup)) {
    return (
      <div className="glass-card p-4 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-base">🗓️</span>
          <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">AI Study Plan</h3>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-foreground/50 leading-relaxed">
            Generate a personalized study plan based on your performance data and weak areas.
          </p>
          <div>
            <label className="text-[10px] font-bold text-foreground/40 uppercase tracking-wider block mb-1">
              Exam Date (optional)
            </label>
            <input type="date" value={examDate} onChange={e => setExamDate(e.target.value)}
              className="w-full bg-foreground/[0.04] border border-foreground/[0.08] rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/50 [color-scheme:dark]" />
          </div>
          <button onClick={handleGenerate} disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50">
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Sparkles className="w-4 h-4" /> Generate Study Plan</>}
          </button>
          {onNavigateToSetup && (
            <button onClick={onNavigateToSetup}
              className="w-full flex items-center justify-center gap-2 text-foreground/50 hover:text-foreground/70 font-bold text-xs py-2 rounded-xl border border-border hover:border-foreground/20 transition-all active:scale-[0.98]">
              <ChevronRight className="w-3.5 h-3.5" /> Or create a quiz first
            </button>
          )}
        </div>
      </div>
    );
  }

  if (!plan) return null;

  // Show plan
  return (
    <div className="glass-card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🗓️</span>
          <h3 className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">Your Study Plan</h3>
        </div>
        <button onClick={() => { setPlan(null); localStorage.removeItem('qmp_study_plan'); setShowSetup(true); }}
          className="text-[10px] font-bold text-primary/60 hover:text-primary transition-colors">
          Regenerate
        </button>
      </div>

      {plan.summary && (
        <p className="text-xs text-foreground/50 leading-relaxed mb-3 bg-primary/5 border border-primary/15 rounded-lg px-3 py-2">
          💡 {plan.summary}
        </p>
      )}

      <div className="space-y-1.5 max-h-[280px] overflow-y-auto thin-scrollbar">
        {plan.plan.slice(0, 7).map((day: PlanDay, i: number) => (
          <div key={i} className="flex items-center gap-3 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5 hover:bg-foreground/[0.05] transition-colors">
            <div className="flex flex-col items-center w-8 flex-shrink-0">
              <span className="text-[10px] font-black text-foreground/30">D{day.day}</span>
              <CalendarDays className="w-3.5 h-3.5 text-foreground/20" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-xs font-bold text-foreground truncate">{day.subject}</span>
                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-md border ${PRIORITY_STYLES[day.priority] || PRIORITY_STYLES.medium}`}>
                  {day.priority}
                </span>
              </div>
              <p className="text-[11px] text-foreground/40 leading-snug truncate">{day.activity}</p>
            </div>
            <span className="text-[10px] font-bold text-foreground/30 flex-shrink-0">{day.duration}</span>
          </div>
        ))}
      </div>

      {plan.tips.length > 0 && (
        <div className="mt-3 space-y-1">
          {plan.tips.slice(0, 3).map((tip: string, i: number) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-foreground/40">
              <ChevronRight className="w-3 h-3 text-primary/50 mt-0.5 flex-shrink-0" />
              <span>{tip}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
