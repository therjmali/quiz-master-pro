import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BookOpen, Brain, BarChart3, Sparkles, ChevronRight, ChevronLeft, X, Zap, Target, Layers } from 'lucide-react';

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    emoji: '👋',
    title: 'Welcome to Quiz Master Pro',
    subtitle: 'Your AI-powered study companion',
    description: 'Create quizzes from any source — paste text, upload PDFs, snap photos, or let AI generate questions for you.',
    features: [
      { icon: BookOpen, label: 'Multiple Sources', desc: 'PDF, text, images, AI' },
      { icon: Brain, label: 'Smart Learning', desc: 'Adaptive difficulty' },
      { icon: BarChart3, label: 'Deep Analytics', desc: 'Track your growth' },
    ],
    gradient: 'from-primary/20 via-transparent to-accent/10',
  },
  {
    emoji: '🚀',
    title: 'How It Works',
    subtitle: '3 simple steps to mastery',
    description: 'Our intelligent system adapts to your learning style and helps you focus on what matters most.',
    features: [
      { icon: Layers, label: '1. Create', desc: 'Generate a quiz instantly' },
      { icon: Target, label: '2. Practice', desc: 'Instant feedback & rationale' },
      { icon: Zap, label: '3. Master', desc: 'AI tracks your weak spots' },
    ],
    gradient: 'from-emerald-500/15 via-transparent to-primary/10',
  },
  {
    emoji: '✨',
    title: 'Unlock Your Potential',
    subtitle: 'Powerful tools at your fingertips',
    description: 'Flashcards, revision sheets, study plans, performance predictions, and more — all powered by AI.',
    features: [
      { icon: Sparkles, label: 'AI Explanations', desc: 'Understand every answer' },
      { icon: BookOpen, label: 'Flashcards', desc: 'Review wrong answers' },
      { icon: BarChart3, label: 'Predictions', desc: 'Forecast your scores' },
    ],
    gradient: 'from-violet-500/15 via-transparent to-primary/10',
  },
];

export default function OnboardingModal({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  const totalSteps = STEPS.length;

  const handleNext = useCallback(() => {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep(s => s + 1);
    } else {
      // Complete onboarding
      onComplete();
    }
  }, [step, totalSteps]);

  const handlePrev = useCallback(() => {
    if (step > 0) {
      setDirection(-1);
      setStep(s => s - 1);
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    onComplete();
  }, [onComplete]);

  const current = STEPS[step];
  const isLast = step === totalSteps - 1;

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: 'var(--qmp-z-sheet)' }}>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
        onClick={handleSkip}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="relative max-h-[calc(var(--qmp-app-h)-32px)] w-full max-w-md overflow-y-auto overscroll-contain rounded-[1.5rem] border border-border bg-card glass-card"
      >
        <div className={`absolute inset-0 bg-gradient-to-br ${current.gradient} pointer-events-none rounded-[1.5rem]`} />
        <div className="absolute top-0 right-0 w-40 h-40 bg-primary/5 rounded-full blur-3xl pointer-events-none" />

        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 z-10 flex items-center gap-1 text-[11px] font-bold text-foreground/30 hover:text-foreground/60 transition-colors px-2 py-1.5 rounded-lg bg-foreground/5 border border-foreground/10"
        >
          Skip <X className="w-3 h-3" />
        </button>

        <div className="relative px-6 pt-8 pb-6">
          {/* Step indicator */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all duration-500 ${
                  i === step ? 'w-7 bg-primary' : i < step ? 'w-3.5 bg-primary/40' : 'w-3.5 bg-foreground/10'
                }`}
              />
            ))}
          </div>

          <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  initial={{ opacity: 0, x: direction * 60 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: direction * -60 }}
                  transition={{ type: 'spring', damping: 28, stiffness: 350 }}
                >
                  <div className="flex justify-center mb-5">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl">
                      {current.emoji}
                    </div>
                  </div>
                  <h2 className="text-[22px] font-extrabold text-foreground text-center leading-tight mb-1">{current.title}</h2>
                  <p className="text-[10px] font-bold text-primary/60 text-center mb-2.5 uppercase tracking-[0.15em]">{current.subtitle}</p>
                  <p className="text-[13px] text-foreground/45 text-center leading-relaxed mb-5 max-w-[280px] mx-auto">{current.description}</p>
                  <div className="space-y-2.5">
                    {current.features.map(({ icon: Icon, label, desc }, i) => (
                      <motion.div
                        key={label}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.08 }}
                        className="flex items-center gap-3.5 bg-card/50 border border-border/80 rounded-2xl px-4 py-3"
                      >
                        <div className="w-9 h-9 rounded-xl bg-primary/12 flex items-center justify-center flex-shrink-0">
                          <Icon className="w-4.5 h-4.5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-bold text-foreground leading-tight">{label}</p>
                          <p className="text-[11px] text-foreground/40 mt-0.5">{desc}</p>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              </AnimatePresence>

              <div className="flex items-center gap-2.5 mt-5">
                {step > 0 && (
                  <button onClick={handlePrev}
                    className="flex items-center justify-center w-12 h-12 rounded-2xl bg-foreground/5 border border-foreground/10 text-foreground/50 hover:text-foreground transition-all active:scale-95">
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                )}
                <button onClick={handleNext}
                  className="flex-1 flex items-center justify-center gap-2 bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm h-12 rounded-2xl shadow-lg shadow-primary/20 transition-all active:scale-[0.97]">
                  {isLast ? <>Get Started <ChevronRight className="w-4 h-4" /></> : <>Continue <ChevronRight className="w-4 h-4" /></>}
                </button>
              </div>
        </div>
      </motion.div>
    </div>
  );
}
