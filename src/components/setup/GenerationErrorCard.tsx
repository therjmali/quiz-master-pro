import { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, FileText, ChevronDown, ChevronUp, Lightbulb, AlertTriangle } from 'lucide-react';
import { MCQ_SAMPLE } from '../../utils/quizParser';

interface Props {
  error: string;
  retryCount: number;
  onRetry: () => void;
  onRetrySimpler: () => void;
  onForceOffline: () => void;
  hasText: boolean;
}

export default function GenerationErrorCard({
  error,
  retryCount,
  onRetry,
  onRetrySimpler,
  onForceOffline,
  hasText,
}: Props) {
  const [showFormat, setShowFormat] = useState(false);

  const isQuota = error.includes('quota') || error.includes('billing') || error.includes('🚫');
  const isTimeout = error.includes('timed out') || error.includes('⏱️');
  const isOverloaded = error.includes('overloaded') || error.includes('busy');
  const isOffline = !navigator.onLine;

  const icon = isOffline ? (
    <WifiOff className="w-5 h-5 text-amber-400 flex-shrink-0" />
  ) : (
    <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
  );

  const title = isOffline
    ? "You're offline"
    : isQuota
    ? 'AI quota exceeded'
    : isTimeout
    ? 'AI took too long'
    : isOverloaded
    ? 'AI service is busy'
    : 'Quiz generation failed';

  const suggestion = isOffline
    ? 'Paste MCQs in standard format below and the offline parser will handle them — no internet needed!'
    : isQuota
    ? 'Switch to "Zite AI" mode in AI settings, or paste MCQs in the required format for offline parsing.'
    : isTimeout
    ? 'Try with less text, or paste just the questions (not full notes).'
    : isOverloaded
    ? 'Wait a moment and try again. The AI service is temporarily busy.'
    : retryCount >= 2
    ? 'Multiple attempts failed. Try the offline parser instead — paste MCQs in the format shown below.'
    : 'Check your input and try again. If the problem persists, try the offline parser.';

  return (
    <div className="rounded-2xl border border-destructive/25 bg-destructive/[0.06] overflow-hidden animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-3">
        {icon}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground">{title}</p>
          <p className="text-xs text-foreground/50 mt-1 leading-relaxed">{suggestion}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        {!isOffline && (
          <button
            onClick={onRetry}
            className="flex items-center gap-2 text-xs font-bold bg-foreground/[0.06] hover:bg-foreground/10 border border-border text-foreground/70 px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </button>
        )}

        {!isOffline && retryCount >= 1 && !isQuota && (
          <button
            onClick={onRetrySimpler}
            className="flex items-center gap-2 text-xs font-bold bg-amber-500/10 hover:bg-amber-500/15 border border-amber-500/25 text-amber-400 px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Try Simpler Settings
          </button>
        )}

        {hasText && (
          <button
            onClick={onForceOffline}
            className="flex items-center gap-2 text-xs font-bold bg-primary/10 hover:bg-primary/15 border border-primary/25 text-primary px-4 py-2.5 rounded-xl transition-all active:scale-95"
          >
            {isOffline ? <Wifi className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
            Parse Offline
          </button>
        )}
      </div>

      {/* Format hint (collapsible) */}
      {hasText && (
        <div className="border-t border-destructive/15">
          <button
            onClick={() => setShowFormat((p) => !p)}
            className="flex items-center gap-2 w-full px-4 py-2.5 text-[10px] font-bold text-foreground/30 hover:text-foreground/50 transition-colors"
          >
            <FileText className="w-3 h-3" />
            <span>Required MCQ format for offline parsing</span>
            {showFormat ? <ChevronUp className="w-3 h-3 ml-auto" /> : <ChevronDown className="w-3 h-3 ml-auto" />}
          </button>

          {showFormat && (
            <div className="px-4 pb-4 animate-fade-in">
              <pre className="text-[11px] text-foreground/40 bg-foreground/[0.04] border border-border rounded-xl p-3 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap">
{MCQ_SAMPLE}
              </pre>
              <p className="text-[9px] text-foreground/25 mt-2">
                Q1(E). question · four options (a)–(d) · Answer - (letter) option text · 1–2 • bullets · one blank line between every line.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Retry counter badge */}
      {retryCount > 0 && (
        <div className="px-4 pb-3">
          <span className="text-[9px] font-bold text-foreground/20">
            {retryCount} failed attempt{retryCount !== 1 ? 's' : ''}
            {retryCount >= 3 && ' — consider using offline mode'}
          </span>
        </div>
      )}
    </div>
  );
}
