import { useEffect, useRef } from 'react';

interface ShakeOptions {
  onShake: () => void;
  threshold?: number;
  cooldown?: number;
  enabled?: boolean;
}

export function useShakeDetection({ onShake, threshold = 15, cooldown = 2000, enabled = true }: ShakeOptions) {
  const lastShake = useRef(0);
  const shakeCount = useRef(0);
  const lastAccel = useRef(0);
  const windowStart = useRef(0);
  const onShakeRef = useRef(onShake);
  onShakeRef.current = onShake;

  useEffect(() => {
    if (!enabled) return;
    if (typeof DeviceMotionEvent === 'undefined') return;

    // Android delivers devicemotion at display rate (~60 Hz). Two shakes are a human gesture half a
    // second long, so sampling at 10 Hz loses nothing and saves 50 wake-ups a second while the phone
    // sits in a hand - a measurable battery and jank cost on a mid-range device.
    const SAMPLE_MS = 100;
    let lastSample = 0;

    const handler = (e: DeviceMotionEvent) => {
      const acc = e.accelerationIncludingGravity;
      if (!acc || acc.x == null || acc.y == null || acc.z == null) return;
      const sampleNow = Date.now();
      if (sampleNow - lastSample < SAMPLE_MS) return;
      lastSample = sampleNow;

      const force = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const delta = Math.abs(force - lastAccel.current);
      lastAccel.current = force;

      if (delta < threshold) return;

      const now = Date.now();
      if (now - lastShake.current < cooldown) return;

      if (now - windowStart.current > 800) {
        shakeCount.current = 0;
        windowStart.current = now;
      }

      shakeCount.current++;

      if (shakeCount.current >= 2) {
        lastShake.current = now;
        shakeCount.current = 0;
        onShakeRef.current();
      }
    };

    window.addEventListener('devicemotion', handler);
    return () => window.removeEventListener('devicemotion', handler);
  }, [enabled, threshold, cooldown]);
}
