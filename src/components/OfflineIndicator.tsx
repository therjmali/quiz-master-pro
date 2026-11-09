import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Floating status pill (never a full-width bar, never blocks taps): tells the user the app is
 * running offline - everything still works - and confirms when the connection returns.
 * The header NET / LOCAL chip stays as the always-visible indicator.
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [visible, setVisible] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const flash = (ms: number, after?: () => void) => {
      if (hide) clearTimeout(hide);
      hide = setTimeout(() => { setVisible(false); after?.(); }, ms);
    };
    const goOffline = () => { setIsOffline(true); setShowReconnected(false); setVisible(true); flash(5000); };
    const goOnline = () => { setIsOffline(false); setShowReconnected(true); setVisible(true); flash(3000, () => setShowReconnected(false)); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    if (isOffline) flash(5000);
    return () => {
      if (hide) clearTimeout(hide);
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!visible || (!isOffline && !showReconnected)) return null;

  return (
    <div
      className="pointer-events-none fixed left-1/2 z-[300] -translate-x-1/2 animate-fade-in"
      style={{ top: 'calc(var(--qmp-inset-top) + 8px)' }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-bold shadow-lg backdrop-blur-xl ${
          isOffline
            ? 'border-amber-400/30 bg-amber-500/90 text-white'
            : 'border-emerald-400/30 bg-emerald-600/90 text-white'
        }`}
      >
        {isOffline ? (
          <>
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Offline mode — everything works, saved on this device</span>
          </>
        ) : (
          <>
            <Wifi className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back online ✓</span>
          </>
        )}
      </div>
    </div>
  );
}
