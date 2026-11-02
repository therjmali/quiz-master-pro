import { useState, useEffect } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, ArrowLeft } from 'lucide-react';

interface SummaryModalProps {
  total: number;
  attended: number;
  onBack: () => void;
  onSubmit: () => void;
}

export default function SummaryModal({ total, attended, onBack, onSubmit }: SummaryModalProps) {
  const skipped = total - attended;
  const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
  const [submitting, setSubmitting] = useState(false);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAnimate(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Keyboard shortcut: Enter to submit, Escape to go back
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !submitting) {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [submitting]); // eslint-disable-line

  const handleSubmit = () => {
    if (submitting) return;
    setSubmitting(true);
    // Small delay to show loading state, then submit
    requestAnimationFrame(() => onSubmit());
  };

  const allAnswered = skipped === 0;
  const fewAnswered = pct < 50;

  return (
    <div className="flex items-center justify-center min-h-[80vh] px-4">
      <div className="glass-card p-7 sm:p-10 text-center w-full max-w-sm animate-slide-up">
        {/* Icon */}
        <div className={`text-5xl mb-5 w-20 h-20 mx-auto flex items-center justify-center rounded-2xl border transition-all duration-500 ${
          allAnswered
            ? 'bg-emerald-500/10 border-emerald-500/20'
            : fewAnswered
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-foreground/5 border-border'
        }`}>
          {allAnswered ? '✅' : fewAnswered ? '⚠️' : '⏸️'}
        </div>

        <h2 className="text-2xl sm:text-3xl font-black mb-2 text-foreground tracking-tight">Submit Quiz?</h2>
        <p className="text-foreground/50 text-sm mb-6">This will end your quiz session and show your results.</p>

        {/* Progress ring + stats */}
        <div className={`relative w-32 h-32 mx-auto mb-6 transition-transform duration-700 ${animate ? 'scale-100' : 'scale-75 opacity-0'}`}>
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--border))" strokeWidth="6" />
            <circle
              cx="50" cy="50" r="42" fill="none"
              stroke={pct >= 80 ? 'hsl(145, 65%, 42%)' : pct >= 50 ? 'hsl(39, 90%, 47%)' : 'hsl(350, 85%, 60%)'}
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={animate ? `${2 * Math.PI * 42 * pct / 100} ${2 * Math.PI * 42}` : `0 ${2 * Math.PI * 42}`}
              style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-3xl font-black ${pct >= 80 ? 'text-emerald-500' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{pct}%</span>
            <span className="text-[9px] text-foreground/35 uppercase tracking-widest font-bold">Complete</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-center gap-6 mb-6 p-4 bg-foreground/[0.04] rounded-2xl border border-border">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span className="text-2xl font-black text-emerald-500">{attended}</span>
            </div>
            <div className="text-[9px] text-foreground/35 uppercase tracking-widest font-bold mt-0.5">Answered</div>
          </div>
          <div className="w-px h-10 bg-border" />
          <div className="text-center">
            <div className="text-2xl font-black text-foreground/50">{total}</div>
            <div className="text-[9px] text-foreground/35 uppercase tracking-widest font-bold mt-0.5">Total</div>
          </div>
          {skipped > 0 && (
            <>
              <div className="w-px h-10 bg-border" />
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <span className="text-2xl font-black text-amber-500">{skipped}</span>
                </div>
                <div className="text-[9px] text-foreground/35 uppercase tracking-widest font-bold mt-0.5">Skipped</div>
              </div>
            </>
          )}
        </div>

        {skipped > 0 && (
          <p className="text-amber-500 text-xs font-semibold mb-5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
            ⚠️ {skipped} question{skipped !== 1 ? 's' : ''} unanswered — will count as skipped.
          </p>
        )}

        {allAnswered && (
          <p className="text-emerald-500 text-xs font-semibold mb-5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3">
            ✅ All questions answered! Ready to submit.
          </p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onBack}
            disabled={submitting}
            className="flex-1 py-4 rounded-2xl bg-foreground/5 border border-border text-sm font-bold text-foreground/70 transition-all active:scale-[0.98] hover:bg-foreground/10 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" /> Go Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-4 rounded-2xl bg-primary text-primary-foreground text-sm font-black shadow-lg shadow-primary/25 border border-primary/20 transition-all active:scale-[0.98] disabled:opacity-70 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Calculating…</>
            ) : (
              'Submit ✓'
            )}
          </button>
        </div>

        {/* Keyboard hint */}
        <p className="text-[9px] text-foreground/20 mt-4 font-medium">
          Press <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/10 font-mono text-[8px]">Enter</kbd> to submit · <kbd className="px-1.5 py-0.5 rounded bg-foreground/5 border border-foreground/10 font-mono text-[8px]">Esc</kbd> to go back
        </p>
      </div>
    </div>
  );
}
