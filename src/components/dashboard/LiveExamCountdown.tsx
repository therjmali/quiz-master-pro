import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { getUpcomingExams, ExamDate } from '../../utils/examDates';
import { useClock } from '../../hooks/useClock';

interface Props {
  onOpenExams?: () => void;
}

export default function LiveExamCountdown({ onOpenExams }: Props) {
  // The shared 1 s clock: one timer for every countdown on screen instead of one per card.
  const now = useClock().getTime();
  const exams = useMemo(() => getUpcomingExams(5), [now]);

  const closest = useMemo(() => {
    const list = exams
      .map((e) => {
        const examTime = e.time || '09:00';
        const target = new Date(`${e.date}T${examTime}:00`).getTime();
        const diff = target - now;
        return { ...e, target, diff };
      })
      .filter((e) => e.diff > 0)
      .sort((a, b) => a.diff - b.diff);
    return list[0] || null;
  }, [exams, now]);

  if (!closest) return null;

  const diff = closest.diff;
  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);

  const urgency = days <= 7 ? 'critical' : days <= 14 ? 'warning' : 'safe';
  const pulseColor = urgency === 'critical' ? 'bg-destructive' : urgency === 'warning' ? 'bg-chart-4' : 'bg-secondary';
  const textColor = urgency === 'critical' ? 'text-destructive' : urgency === 'warning' ? 'text-chart-4' : 'text-secondary';

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onOpenExams}
      role="button"
      tabIndex={0}
      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-white/10 bg-card/40 backdrop-blur-md cursor-pointer hover:bg-card/60 transition-all select-none"
    >
      {/* Pulsing urgency dot */}
      <span className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${pulseColor} opacity-50`} />
        <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${pulseColor}`} />
      </span>

      {/* Subject color dot */}
      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: closest.color || '#38BDF8' }} />

      {/* Exam name */}
      <span className="text-[11px] font-bold text-foreground truncate max-w-[140px] sm:max-w-[200px]">
        {closest.emoji || '📝'} {closest.label || closest.subject}
      </span>

      {/* Countdown */}
      <div className="flex items-center gap-1 ml-auto shrink-0">
        {days > 0 && (
          <span className={`text-xs font-black font-mono ${textColor}`}>{days}d</span>
        )}
        <span className={`text-xs font-black font-mono tabular-nums ${textColor}`}>
          {String(hrs).padStart(2, '0')}:{String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
        </span>
      </div>
    </motion.div>
  );
}
