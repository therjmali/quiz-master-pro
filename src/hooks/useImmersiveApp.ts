import { useEffect } from 'react';
import { applyStatusBar } from '../platform/immersive';

/**
 * App-level: keeps the system status bar hidden on every screen (mode "always"), at start, after coming back from the
 * background and whenever the setting changes. While a quiz is open the quiz screen owns the bar (useImmersiveQuiz).
 */
export function useImmersiveApp(quizOpen: boolean): void {
  useEffect(() => {
    let cancelled = false;
    const run = () => { if (!cancelled && document.visibilityState === 'visible') void applyStatusBar(quizOpen); };
    run();
    document.addEventListener('visibilitychange', run);
    window.addEventListener('qmp-status-bar-mode', run);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', run); window.removeEventListener('qmp-status-bar-mode', run); };
  }, [quizOpen]);
}
