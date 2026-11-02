import { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

/**
 * Shows a banner when the device goes offline,
 * and a brief "back online" confirmation when reconnecting.
 */
export default function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => {
      setIsOffline(false);
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  return (
    <div
      className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-center gap-2 py-2 px-4 text-xs font-bold transition-all duration-300 ${
        isOffline
          ? 'bg-amber-600 text-white'
          : 'bg-emerald-600 text-white'
      }`}
      role="alert"
      aria-live="polite"
    >
      {isOffline ? (
        <>
          <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
          <span>You're offline — quizzes will be saved locally</span>
        </>
      ) : (
        <>
          <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Back online ✓</span>
        </>
      )}
    </div>
  );
}
