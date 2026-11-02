import { useState } from 'react';
import { RefreshCw, WifiOff, AlertTriangle } from 'lucide-react';

interface Props {
  message?: string;
  detail?: string;
  onRetry: () => void | Promise<void>;
  type?: 'network' | 'generic';
  compact?: boolean;
}

export default function RetryErrorCard({
  message = 'Something went wrong',
  detail,
  onRetry,
  type = 'generic',
  compact = false,
}: Props) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 bg-destructive/5 border border-destructive/15 rounded-xl px-3 py-2.5 animate-fade-in">
        {type === 'network' ? (
          <WifiOff className="w-3.5 h-3.5 text-destructive/60 flex-shrink-0" />
        ) : (
          <AlertTriangle className="w-3.5 h-3.5 text-destructive/60 flex-shrink-0" />
        )}
        <p className="text-[11px] font-bold text-destructive/70 flex-1">{message}</p>
        <button
          onClick={handleRetry}
          disabled={retrying}
          className="flex items-center gap-1 text-[10px] font-bold text-destructive/70 hover:text-destructive bg-destructive/10 border border-destructive/20 px-2.5 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying…' : 'Retry'}
        </button>
      </div>
    );
  }

  return (
    <div className="glass-card p-6 flex flex-col items-center text-center animate-fade-in">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 ${
        type === 'network'
          ? 'bg-amber-500/10 border border-amber-500/20'
          : 'bg-destructive/10 border border-destructive/20'
      }`}>
        {type === 'network' ? (
          <WifiOff className="w-6 h-6 text-amber-400" />
        ) : (
          <AlertTriangle className="w-6 h-6 text-destructive" />
        )}
      </div>
      <h3 className="text-base font-black text-foreground mb-1">{message}</h3>
      {detail && (
        <p className="text-xs text-foreground/40 mb-4 max-w-xs leading-relaxed">{detail}</p>
      )}
      <button
        onClick={handleRetry}
        disabled={retrying}
        className="flex items-center gap-2 bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm px-6 py-3 rounded-2xl shadow-lg shadow-primary/25 transition-all active:scale-[0.97] disabled:opacity-50"
      >
        <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
        {retrying ? 'Retrying…' : 'Try Again'}
      </button>
    </div>
  );
}
