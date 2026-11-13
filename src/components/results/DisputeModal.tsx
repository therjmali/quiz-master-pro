import { useState } from 'react';
import { X, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { QuizQuestion } from '../../types/quiz';
import Overlay from '../ui/Overlay';
import { verifyQuestion } from 'zitejs/api';
import { saveDispute, DisputeRecord } from '../../utils/disputes';

interface Props {
  question: QuizQuestion;
  onClose: () => void;
  onFixed?: (newAnswer: string) => void;
}

export default function DisputeModal({ question, onClose, onFixed }: Props) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DisputeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await verifyQuestion({
        question: question.question,
        options: question.options,
        markedCorrectAnswer: question.correctAnswer,
        disputeReason: reason || undefined,
      });
      const record = saveDispute(question.question, {
        verdict: data.verdict,
        verdictText: data.verdictText,
        confidence: data.confidence,
        suggestedAnswer: data.suggestedAnswer,
        reason,
        timestamp: Date.now(),
      });
      setResult(record);
      if (data.verdict === 'confirmed') toast.success('✅ Answer confirmed correct');
      else if (data.verdict === 'disputed') toast('⚠️ Answer is disputed');
      else toast.error('❌ Answer may be incorrect');
    } catch (e: any) {
      const msg = e?.message || 'Verification failed. Please try again.';
      setError(msg);
      toast.error(msg.slice(0, 80));
    } finally { setLoading(false); }
  };

  const verdictColor = result?.verdict === 'confirmed' ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400' :
    result?.verdict === 'disputed' ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' :
    'bg-red-500/15 border-red-500/30 text-red-400';

  const verdictIcon = result?.verdict === 'confirmed' ? '✅' : result?.verdict === 'disputed' ? '⚠️' : '❌';

  return (
    <Overlay open onClose={onClose} kind="center" layer="sheet" className="max-w-lg" label="Dispute question">
      <div className="qmp-panel-body p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="flex items-center gap-2 text-base font-black text-foreground">
            <Shield className="w-4 h-4 text-primary" /> Dispute Question
          </h2>
          <button onClick={onClose} aria-label="Close" className="qmp-panel-close-inline"><X className="h-4 w-4" /></button>
        </div>

        <div className="bg-card/60 border border-border rounded-xl p-3 mb-4">
          <p className="text-sm text-foreground/70 leading-relaxed">{question.question}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-lg border border-emerald-500/25">
              ✓ {question.correctAnswer}
            </span>
          </div>
        </div>

        {!result ? (
          <>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
              placeholder="Why do you think this answer is wrong? (optional)"
              className="w-full bg-card border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:border-primary/40 resize-none mb-4" />
            {error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 mb-3 animate-fade-in">
                <p className="text-xs font-bold text-destructive/80">{error}</p>
              </div>
            )}
            <button onClick={handleVerify} disabled={loading}
              className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground text-sm font-bold py-3 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50">
              {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Verifying…</> : <><Shield className="w-4 h-4" /> {error ? '↻ Retry Verification' : '🤖 AI Verify'}</>}
            </button>
          </>
        ) : (
          <div className="space-y-3">
            <div className={`rounded-xl border p-4 ${verdictColor}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{verdictIcon}</span>
                <span className="text-sm font-black capitalize">{result.verdict}</span>
                <span className="ml-auto text-xs font-bold opacity-70">{result.confidence}% confident</span>
              </div>
              <p className="text-sm leading-relaxed opacity-80">{result.verdictText}</p>
              {result.suggestedAnswer && result.suggestedAnswer !== question.correctAnswer && (
                <div className="mt-3 pt-2.5 border-t border-current/15 text-xs font-bold">
                  Suggested correct answer: <span className="underline">{result.suggestedAnswer}</span>
                </div>
              )}
            </div>
            {onFixed && result.suggestedAnswer && result.suggestedAnswer !== question.correctAnswer && result.verdict !== 'confirmed' && (
              <button
                onClick={() => {
                  onFixed(result.suggestedAnswer!);
                  toast.success(`Updated correct answer to "${result.suggestedAnswer}"`);
                  onClose();
                }}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/35 text-emerald-400 text-xs font-black py-2.5 rounded-xl transition-all active:scale-[0.98]"
              >
                ✓ Apply Suggested Answer
              </button>
            )}
            <button onClick={onClose}
              className="w-full text-xs font-bold text-foreground/40 hover:text-foreground/70 py-2 transition-colors">
              Close
            </button>
          </div>
        )}
      </div>
    </Overlay>
  );
}
