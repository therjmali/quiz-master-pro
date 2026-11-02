import { useState } from 'react';
import { Check, Plus, BookOpen, BarChart3, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';

interface Props {
  quizCount: number;
  hasCompletedQuiz: boolean;
  hasViewedResults: boolean;
  hasUsedFlashcards: boolean;
  onStartCreate: () => void;
  onLibrary: () => void;
  onStats: () => void;
  onFlashcards?: (filter?: 'review') => void;
  onDismiss: () => void;
}

interface Step {
  id: string;
  label: string;
  description: string;
  icon: typeof Plus;
  done: boolean;
  action?: () => void;
  actionLabel?: string;
  color: string;
}

export default function GettingStartedChecklist({
  quizCount, hasCompletedQuiz, hasViewedResults, hasUsedFlashcards,
  onStartCreate, onLibrary, onStats, onFlashcards, onDismiss,
}: Props) {
  const [expanded, setExpanded] = useState(true);

  const steps: Step[] = [
    {
      id: 'create',
      label: 'Create your first quiz',
      description: 'Paste text, upload a PDF, or let AI generate questions',
      icon: Plus,
      done: quizCount > 0,
      action: onStartCreate,
      actionLabel: 'Create Quiz',
      color: 'primary',
    },
    {
      id: 'complete',
      label: 'Complete a quiz',
      description: 'Answer all questions and submit to see your score',
      icon: BookOpen,
      done: hasCompletedQuiz,
      action: quizCount > 0 ? onLibrary : onStartCreate,
      actionLabel: quizCount > 0 ? 'View Quizzes' : 'Create Quiz',
      color: 'emerald',
    },
    {
      id: 'review',
      label: 'Review your results',
      description: 'Check detailed analytics and AI explanations',
      icon: BarChart3,
      done: hasViewedResults,
      action: hasCompletedQuiz ? onStats : undefined,
      actionLabel: 'View Stats',
      color: 'violet',
    },
    {
      id: 'flashcards',
      label: 'Try flashcards',
      description: 'Practice wrong answers with spaced repetition',
      icon: Sparkles,
      done: hasUsedFlashcards,
      action: onFlashcards,
      actionLabel: 'Open Flashcards',
      color: 'amber',
    },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const progress = completedCount / steps.length;
  const allDone = completedCount === steps.length;

  if (allDone) return null;

  return (
    <div className="glass-card overflow-hidden animate-fade-in">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 transition-all active:scale-[0.99]"
      >
        <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center flex-shrink-0 relative">
          <span className="text-lg">🎯</span>
          {/* Mini progress ring */}
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="17" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
            <circle
              cx="20" cy="20" r="17" fill="none"
              stroke="hsl(var(--primary))" strokeWidth="2"
              strokeDasharray={`${progress * 106.8} 106.8`}
              strokeLinecap="round"
              className="transition-all duration-700"
            />
          </svg>
        </div>
        <div className="flex-1 text-left min-w-0">
          <p className="text-sm font-black text-foreground leading-tight">Getting Started</p>
          <p className="text-[10px] text-foreground/40 font-bold mt-0.5">
            {completedCount} of {steps.length} completed
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Progress bar */}
          <div className="w-16 h-1.5 bg-foreground/5 rounded-full overflow-hidden hidden xs:block">
            <div
              className="h-full bg-primary rounded-full transition-all duration-700"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <span className="text-[10px] font-black text-primary tabular-nums">
            {Math.round(progress * 100)}%
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-foreground/30" />
          ) : (
            <ChevronDown className="w-4 h-4 text-foreground/30" />
          )}
        </div>
      </button>

      {/* Steps */}
      {expanded && (
        <div className="px-4 pb-4 space-y-2 border-t border-border pt-3 animate-fade-in">
          {steps.map((step, i) => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 border transition-all ${
                  step.done
                    ? 'bg-emerald-500/5 border-emerald-500/15 opacity-60'
                    : i === completedCount
                    ? 'bg-primary/5 border-primary/20 shadow-sm'
                    : 'bg-card/50 border-border opacity-50'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border-2 transition-all ${
                  step.done
                    ? 'bg-emerald-500 border-emerald-500 text-white'
                    : i === completedCount
                    ? 'border-primary/40 text-primary/40'
                    : 'border-foreground/10 text-foreground/10'
                }`}>
                  {step.done ? (
                    <Check className="w-3.5 h-3.5" strokeWidth={3} />
                  ) : (
                    <span className="text-[10px] font-black">{i + 1}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className={`text-xs font-bold leading-tight ${step.done ? 'text-foreground/40 line-through' : 'text-foreground'}`}>
                    {step.label}
                  </p>
                  <p className="text-[10px] text-foreground/30 mt-0.5 hidden xs:block">
                    {step.description}
                  </p>
                </div>

                {/* Action button — only for current step */}
                {!step.done && i === completedCount && step.action && (
                  <button
                    onClick={step.action}
                    className="flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 flex-shrink-0"
                  >
                    <Icon className="w-3 h-3" />
                    {step.actionLabel}
                  </button>
                )}
              </div>
            );
          })}

          {/* Dismiss */}
          <button
            onClick={onDismiss}
            className="flex items-center justify-center gap-1 w-full text-[10px] font-bold text-foreground/25 hover:text-foreground/50 pt-2 transition-colors"
          >
            <X className="w-3 h-3" /> Dismiss checklist
          </button>
        </div>
      )}
    </div>
  );
}
