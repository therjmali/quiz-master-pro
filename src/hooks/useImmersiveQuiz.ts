import { useEffect } from 'react';
import { hideSystemBars, showSystemBars } from '../platform/immersive';

/**
 * Hides the system status bar while the calling component (the quiz attempt) is mounted and restores it on unmount.
 *  - Android shows the bars again after the app comes back from the background, so they are hidden again on return.
 *  - A `cancelled` guard makes sure a late `hide()` can never run after the quiz was already left (React StrictMode
 *    mounts, unmounts and mounts again in development).
 *  - The effect owns exactly one listener and removes it, so nothing leaks across quizzes.
 */
export function useImmersiveQuiz(): void {
  useEffect(() => {
    let cancelled = false;
    void hideSystemBars();
    const onVisible = () => { if (!cancelled && document.visibilityState === 'visible') void hideSystemBars(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      void showSystemBars();
    };
  }, []);
}
