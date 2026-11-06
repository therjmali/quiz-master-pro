import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence, PanInfo } from 'framer-motion';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Settings, Plus } from 'lucide-react';
import { getExamDates, ExamDate } from '../../utils/examDates';
import ExamPosterCard from '../shared/ExamPosterCard';
import type { QuizResult } from '../../types/quiz';

interface Props {
  history?: QuizResult[];
  onManageExams?: () => void;
  onPracticeSubject?: (subject: string) => void;
}

export default function ExamShelf({ history = [], onManageExams, onPracticeSubject }: Props) {
  const [exams, setExams] = useState<ExamDate[]>(getExamDates);
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [userInteracted, setUserInteracted] = useState(false);
  const interactionTimer = useRef<ReturnType<typeof setTimeout>>();

  const refresh = useCallback(() => {
    setExams(getExamDates());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upcoming = useMemo(() => {
    const now = Date.now();
    return exams
      .map((e) => {
        const t = e.time || '09:00';
        const target = new Date(`${e.date}T${t}:00`).getTime();
        return { ...e, target, daysLeft: Math.max(0, Math.ceil((target - now) / 86400000)) };
      })
      .sort((a, b) => a.target - b.target);
  }, [exams]);

  const list = upcoming.length > 0 ? upcoming : exams;

  // Auto-swipe carousel if multiple
  useEffect(() => {
    if (list.length <= 1 || userInteracted || expanded) return;
    const id = setInterval(() => setActiveIdx((i) => (i + 1) % list.length), 6000);
    return () => clearInterval(id);
  }, [list.length, userInteracted, expanded]);

  useEffect(() => {
    if (activeIdx >= list.length) setActiveIdx(0);
  }, [list.length, activeIdx]);

  const pauseAutoSwipe = useCallback(() => {
    setUserInteracted(true);
    clearTimeout(interactionTimer.current);
    interactionTimer.current = setTimeout(() => setUserInteracted(false), 9000);
  }, []);

  const goTo = useCallback((i: number) => {
    pauseAutoSwipe();
    setActiveIdx(i);
  }, [pauseAutoSwipe]);

  const goPrev = useCallback(() => goTo((activeIdx - 1 + list.length) % list.length), [activeIdx, list.length, goTo]);
  const goNext = useCallback(() => goTo((activeIdx + 1) % list.length), [activeIdx, list.length, goTo]);

  const handleDragEnd = useCallback((_: unknown, info: PanInfo) => {
    if (info.offset.x < -40) goNext();
    else if (info.offset.x > 40) goPrev();
  }, [goNext, goPrev]);

  if (exams.length === 0) {
    return (
      <div className="glass-card p-6 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
          <Calendar className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-foreground">No Upcoming Examinations</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Add an upcoming examination countdown to track days and study target.</p>
        </div>
        {onManageExams && (
          <button
            onClick={onManageExams}
            className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-black shadow-md hover:scale-[1.02] active:scale-95 transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Examination</span>
          </button>
        )}
      </div>
    );
  }

  const currentExam = list[activeIdx] || list[0];

  return (
    <div className="space-y-2">
      {/* Shelf Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            Upcoming Examinations
          </h3>
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/15">
            {activeIdx + 1} of {list.length}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {list.length > 1 && (
            <>
              <button
                onClick={goPrev}
                className="w-7 h-7 rounded-lg bg-card/60 border border-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                aria-label="Previous exam"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={goNext}
                className="w-7 h-7 rounded-lg bg-card/60 border border-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all"
                aria-label="Next exam"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {onManageExams && (
            <button
              onClick={onManageExams}
              className="w-7 h-7 rounded-lg bg-card/60 border border-white/5 flex items-center justify-center text-muted-foreground hover:text-foreground active:scale-90 transition-all ml-1"
              title="Manage exam countdowns"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Swipeable Exam Poster Card */}
      <div className="relative touch-pan-y">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentExam.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={handleDragEnd}
          >
            <ExamPosterCard
              exam={currentExam}
              history={history}
              onEdit={onManageExams}
              onPracticeSubject={onPracticeSubject}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Carousel Dots */}
      {list.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 pt-1">
          {list.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all ${
                activeIdx === i ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'
              }`}
              aria-label={`Go to exam ${i + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
