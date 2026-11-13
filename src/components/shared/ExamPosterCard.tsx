import { useState, useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { Calendar, CalendarPlus, Clock, TrendingUp, Settings, ChevronDown, Share2, Sparkles, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import FlipCard from './FlipCard';
import type { ExamDate } from '../../utils/examDates';
import type { QuizResult } from '../../types/quiz';

/* ── Status badge logic ── */
function statusBadge(days: number, avgScore: number) {
  if (avgScore >= 80) return { emoji: '🔥', label: 'Exam Ready', cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' };
  if (days <= 3) return { emoji: '🔴', label: 'CRITICAL — Final Review!', cls: 'bg-destructive/10 text-destructive border-destructive/20' };
  if (days <= 7) return { emoji: '⚡', label: 'Crunch Week', cls: 'bg-chart-4/10 text-chart-4 border-chart-4/20' };
  if (days <= 14) return { emoji: '🟡', label: 'URGENT — Solve Daily Mocks', cls: 'bg-chart-4/10 text-chart-4 border-chart-4/20' };
  if (days <= 30) return { emoji: '💪', label: 'Building Momentum', cls: 'bg-chart-2/10 text-chart-2 border-chart-2/20' };
  return { emoji: '🟢', label: 'ON TRACK — Keep Practicing', cls: 'bg-secondary/10 text-secondary border-secondary/20' };
}

export interface ExamPosterProps {
  exam: ExamDate;
  history?: QuizResult[];
  onEdit?: () => void;
  onPracticeSubject?: (subject: string) => void;
}

export default function ExamPosterCard({ exam, history = [], onEdit, onPracticeSubject }: ExamPosterProps) {
  const [now, setNow] = useState(Date.now());
  const [planOpen, setPlanOpen] = useState(false);

  // One repaint a second is only worth it while the countdown is actually on screen (the exam shelf can
  // hold several cards, and each used to keep a timer alive after scrolling past it).
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    let onScreen = true;
    const start = () => {
      if (id || !onScreen || document.hidden) return;
      setNow(Date.now());
      id = setInterval(() => setNow(Date.now()), 1000);
    };
    const stop = () => { if (id) clearInterval(id); id = null; };
    let io: IntersectionObserver | null = null;
    const host = rootRef.current;
    if (host && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver(entries => {
        const next = entries.some(e => e.isIntersecting);
        if (next === onScreen) return;
        onScreen = next;
        if (onScreen) start(); else stop();
      }, { rootMargin: '60px' });
      io.observe(host);
    }
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => { stop(); io?.disconnect(); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  const t = exam.time || '09:00';
  const target = new Date(`${exam.date}T${t}:00`).getTime();
  const diff = Math.max(0, target - now);
  const isPast = target <= now;

  const days = Math.floor(diff / 86400000);
  const hours = Math.floor((diff % 86400000) / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);

  // Subject quiz history stats
  const subjectQuizzes = useMemo(() => {
    return history.filter(
      (r) =>
        r.subject &&
        (r.subject.toLowerCase() === exam.subject.toLowerCase() ||
          r.subject.toLowerCase() === (exam.label || '').toLowerCase())
    );
  }, [history, exam]);

  const totalQuestionsSolved = useMemo(() => {
    return subjectQuizzes.reduce((acc, q) => acc + (q.totalQuestions || 0), 0);
  }, [subjectQuizzes]);

  const avgScore = useMemo(() => {
    if (subjectQuizzes.length === 0) return 0;
    const sum = subjectQuizzes.reduce((acc, q) => acc + (q.percentage || 0), 0);
    return Math.round(sum / subjectQuizzes.length);
  }, [subjectQuizzes]);

  const badge = statusBadge(days, avgScore);

  const saveIcs = () => {
    const pad = (n: number) => String(n).padStart(2, '0');
    const [hStr, mStr] = t.split(':').map(Number);
    const [y, mo, d] = exam.date.split('-').map(Number);
    const start = new Date(y, mo - 1, d, hStr || 9, mStr || 0);
    const end = new Date(start.getTime() + 3 * 3600_000);
    const f = (x: Date) =>
      `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Quiz Master Pro//Exam Countdown//EN',
      'BEGIN:VEVENT',
      `UID:${exam.id}@quizmaster`,
      `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(start)}`,
      `DTEND:${f(end)}`,
      `SUMMARY:${exam.emoji || '📝'} ${exam.label || exam.subject}`,
      `DESCRIPTION:Upcoming examination countdown in Quiz Master Pro. Target: ${exam.targetScore || 80}%`,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    try {
      const blob = new Blob([ics], { type: 'text/calendar' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${(exam.label || exam.subject).replace(/[^\w-]/g, '_')}.ics`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success('Calendar file downloaded');
    } catch {
      toast.error('Could not download calendar file');
    }
  };

  const shareCountdown = () => {
    const text = `${exam.emoji || '📝'} ${exam.label || exam.subject}: ${days}d ${hours}h ${minutes}m left · Target: ${exam.targetScore || 80}% (Solved ${totalQuestionsSolved} questions in Quiz Master Pro)`;
    if (navigator.share) {
      navigator.share({ title: exam.label || exam.subject, text }).catch(() => {});
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Countdown copied to clipboard!');
    }
  };

  return (
    <div ref={rootRef} className="relative rounded-3xl border border-white/10 bg-card/60 backdrop-blur-xl overflow-hidden shadow-2xl transition-all">
      {/* Decorative gradient banner */}
      <div
        className="h-2.5 w-full bg-gradient-to-r"
        style={{
          backgroundImage: `linear-gradient(to right, ${exam.color || 'hsl(var(--primary))'}, hsl(var(--secondary)))`,
        }}
      />

      <div className="p-4 sm:p-6 space-y-4">
        {/* Header: Emoji, Exam Title, Target, Status Badge */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shadow-md border border-white/10 shrink-0"
              style={{ backgroundColor: `${exam.color || '#38BDF8'}20` }}
            >
              {exam.emoji || '🏥'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                  {exam.label || exam.subject}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground font-medium flex items-center gap-2 mt-0.5">
                <span>{exam.subject}</span>
                <span>•</span>
                <span className="font-mono text-[11px]">{exam.date} at {t}</span>
              </p>
            </div>
          </div>

          <span className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${badge.cls}`}>
            {badge.emoji} {badge.label}
          </span>
        </div>

        {/* Flip Cards mechanical Countdown Grid */}
        <div className="py-2">
          {isPast ? (
            <div className="py-6 text-center space-y-1">
              <span className="text-3xl">🎉</span>
              <p className="text-base font-black text-foreground">Exam Day Has Arrived!</p>
              <p className="text-xs text-muted-foreground">Good luck with your examination.</p>
            </div>
          ) : (
            <div className="flex items-center justify-center gap-2 sm:gap-4">
              <FlipCard value={String(days)} label="Days" size={54} tone="auto" />
              <span className="text-xl font-bold text-muted-foreground/40 pb-4">:</span>
              <FlipCard value={String(hours).padStart(2, '0')} label="Hours" size={54} tone="auto" />
              <span className="text-xl font-bold text-muted-foreground/40 pb-4">:</span>
              <FlipCard value={String(minutes).padStart(2, '0')} label="Mins" size={54} tone="auto" />
              <span className="text-xl font-bold text-muted-foreground/40 pb-4 hidden sm:inline">:</span>
              <div className="hidden sm:block">
                <FlipCard value={String(seconds).padStart(2, '0')} label="Secs" size={54} tone="auto" />
              </div>
            </div>
          )}
        </div>

        {/* Mini stats row */}
        <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-muted/20 border border-white/5 text-center">
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold">TARGET SCORE</p>
            <p className="text-sm font-black text-foreground font-mono">{exam.targetScore || 80}%</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold">AVERAGE ACCURACY</p>
            <p className="text-sm font-black text-primary font-mono">{avgScore > 0 ? `${avgScore}%` : '—'}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground font-semibold">QS SOLVED</p>
            <p className="text-sm font-black text-secondary font-mono">{totalQuestionsSolved}</p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/5">
          <div className="flex items-center gap-1.5">
            <button
              onClick={saveIcs}
              className="p-2 rounded-xl bg-card border border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
              title="Add to calendar (.ics)"
            >
              <CalendarPlus className="w-4 h-4" />
            </button>
            <button
              onClick={shareCountdown}
              className="p-2 rounded-xl bg-card border border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
              title="Share countdown"
            >
              <Share2 className="w-4 h-4" />
            </button>
            {onEdit && (
              <button
                onClick={onEdit}
                className="p-2 rounded-xl bg-card border border-border/40 hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-all"
                title="Edit examination"
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>

          {onPracticeSubject && (
            <button
              onClick={() => onPracticeSubject(exam.subject)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-md shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center gap-1.5"
            >
              <span>Practice {exam.subject}</span>
              <span>→</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
