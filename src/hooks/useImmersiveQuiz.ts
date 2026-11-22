import { useEffect } from 'react';
import { applyStatusBar } from '../platform/immersive';

/**
 * Called by the quiz attempt screen. Applies the status-bar mode for "a quiz is on screen" and, when the quiz is
 * left, applies it for "no quiz" (so mode "always" keeps the bar hidden, mode "quiz" brings it back).
 *  - Android shows the bars again after the app comes back from the background, so they are re-applied on return.
 *  - A `cancelled` guard makes sure a late call can never run after the quiz was already left.
 */
export function useImmersiveQuiz(): void {
  useEffect(() => {
    let cancelled = false;
    void applyStatusBar(true);
    const refresh = () => { if (!cancelled && document.visibilityState === 'visible') void applyStatusBar(true); };
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('qmp-status-bar-mode', refresh);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('qmp-status-bar-mode', refresh);
      void applyStatusBar(false);
    };
  }, []);
}
