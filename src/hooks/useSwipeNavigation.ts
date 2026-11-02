import { useRef, useEffect } from 'react';

interface SwipeOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  threshold?: number;
  enabled?: boolean;
  /** Only allow swipe gestures that start in the top or bottom edge zones (px from edge). Default: header=60, footer=70 */
  edgeOnly?: boolean;
  headerZone?: number;
  footerZone?: number;
}

export function useSwipeNavigation(
  ref: React.RefObject<HTMLElement | null>,
  { onSwipeLeft, onSwipeRight, threshold = 80, enabled = true, edgeOnly = false, headerZone = 60, footerZone = 70 }: SwipeOptions
) {
  const startX = useRef(0);
  const startY = useRef(0);
  const startTime = useRef(0);
  const startInEdge = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    const handleStart = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      startTime.current = Date.now();

      // Check if touch started in header or footer zone
      if (edgeOnly) {
        const y = e.touches[0].clientY;
        const vh = window.innerHeight;
        startInEdge.current = y <= headerZone || y >= vh - footerZone;
      } else {
        startInEdge.current = true;
      }
    };

    const handleEnd = (e: TouchEvent) => {
      // If edgeOnly mode is on and touch didn't start in an edge zone, skip
      if (edgeOnly && !startInEdge.current) return;

      const dx = e.changedTouches[0].clientX - startX.current;
      const dy = e.changedTouches[0].clientY - startY.current;
      const dt = Date.now() - startTime.current;

      // Must be more horizontal than vertical (1.8x ratio), exceed threshold, and within 600ms
      if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * 1.8 || dt > 600) return;

      // Don't trigger if the touch started on an input or scrollable element
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [data-no-swipe], .overflow-x-auto, .overflow-x-scroll')) return;

      if (dx < 0) onSwipeLeft?.();
      else onSwipeRight?.();
    };

    el.addEventListener('touchstart', handleStart, { passive: true });
    el.addEventListener('touchend', handleEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleStart);
      el.removeEventListener('touchend', handleEnd);
    };
  }, [ref, onSwipeLeft, onSwipeRight, threshold, enabled, edgeOnly, headerZone, footerZone]);
}
