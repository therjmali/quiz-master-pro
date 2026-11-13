import { useState, useEffect, useCallback } from 'react';

/* ── Shared singleton clock ──────────────────────────────────────────
   One setInterval(1 s) drives all subscribers. The Android WebView keeps
   timers alive while the app is in the background (they are throttled but
   still cost wake-ups), so the interval is stopped when the app is hidden
   and restarted - with an immediate tick - when it comes back.
   Countdowns and dates therefore recover correctly from sleep/resume.   */

let listeners: Set<(d: Date) => void> = new Set();
let intervalId: ReturnType<typeof setInterval> | null = null;
let currentTime = new Date();

function tick() {
  currentTime = new Date();
  listeners.forEach(fn => fn(currentTime));
}

function startClock() {
  if (!intervalId) {
    intervalId = setInterval(tick, 1_000);
  }
}

function stopClock() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

// Stop the timer while hidden; re-sync and resume on return.
function handleVisibility() {
  if (document.visibilityState === 'visible') {
    tick();
    if (listeners.size > 0) startClock();
  } else {
    stopClock();
  }
}

export function useClock(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const listener = (d: Date) => setNow(d);
    listeners.add(listener);

    if (listeners.size === 1) {
      // Do not keep a timer alive for an app that is already in the background.
      if (document.visibilityState !== 'hidden') startClock();
      document.addEventListener('visibilitychange', handleVisibility);
    }

    // Tick on mount so we never show a stale timestamp
    tick();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        stopClock();
        document.removeEventListener('visibilitychange', handleVisibility);
      }
    };
  }, []);

  return now;
}

/** Non-reactive snapshot – use in callbacks / effects where you just
    need the current time without subscribing to updates. */
export function getNow(): Date {
  return currentTime;
}
