import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Loader2 } from 'lucide-react';

interface Props {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  enabled?: boolean;
}

const MAX_PULL = 80;
const THRESHOLD = 50;

/**
 * Pull-to-refresh with zero React renders during the gesture.
 * Pull distance lives in a ref; the indicator (a fixed overlay, so page
 * content never shifts) is updated via direct style writes batched with
 * requestAnimationFrame. Only the "refreshing" phase uses React state.
 */
export default function PullToRefresh({ onRefresh, children, enabled = true }: Props) {
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const distance = useRef(0);
  const rafId = useRef<number | null>(null);

  const overlayRef = useRef<HTMLDivElement>(null);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const readyRef = useRef(false);

  const paint = useCallback(() => {
    rafId.current = null;
    const d = distance.current;
    const overlay = overlayRef.current;
    if (!overlay) return;
    overlay.style.opacity = d > 0 ? String(Math.min(1, d / THRESHOLD)) : '0';
    overlay.style.transform = `translate3d(-50%, ${d - 40}px, 0)`;
    if (spinnerRef.current) {
      spinnerRef.current.style.transform = `rotate(${d * 4}deg) scale(${0.5 + d / 100})`;
    }
    const ready = d >= THRESHOLD;
    if (ready !== readyRef.current) {
      readyRef.current = ready;
      ringRef.current?.classList.toggle('border-primary', ready);
      ringRef.current?.classList.toggle('border-foreground/20', !ready);
      if (labelRef.current) {
        labelRef.current.textContent = ready ? 'Release to refresh' : 'Pull down…';
        labelRef.current.classList.toggle('text-primary', ready);
        labelRef.current.classList.toggle('text-foreground/40', !ready);
      }
    }
  }, []);

  const setDistance = useCallback((d: number) => {
    if (d === distance.current) return;
    distance.current = d;
    if (rafId.current == null) rafId.current = requestAnimationFrame(paint);
  }, [paint]);

  useEffect(() => () => { if (rafId.current != null) cancelAnimationFrame(rafId.current); }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enabled || refreshingRef.current || window.scrollY > 10) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
  }, [enabled]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling.current || refreshingRef.current) return;
    if (window.scrollY > 10) { isPulling.current = false; setDistance(0); return; }
    const dy = e.touches[0].clientY - startY.current;
    setDistance(dy <= 0 ? 0 : Math.min(dy * 0.4, MAX_PULL));
  }, [setDistance]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;
    const shouldRefresh = distance.current >= THRESHOLD;
    setDistance(0);
    if (!shouldRefresh) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try { await onRefresh(); } catch { /* caller surfaces errors */ }
    finally { refreshingRef.current = false; setRefreshing(false); }
  }, [onRefresh, setDistance]);

  return (
    <div onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd} onTouchCancel={handleTouchEnd}>
      {/* Portaled to <body>: the animated screen wrapper uses will-change: transform,
          which would otherwise turn position:fixed into position:absolute. */}
      {createPortal(<>
      {/* Gesture indicator — fixed overlay, driven by refs */}
      <div
        ref={overlayRef}
        aria-hidden
        className="fixed left-1/2 top-[env(safe-area-inset-top,0px)] z-50 pointer-events-none flex flex-col items-center gap-1 rounded-full bg-card/90 backdrop-blur px-3 py-1.5 shadow-md border border-border will-change-transform"
        style={{ opacity: 0, transform: 'translate3d(-50%, -40px, 0)' }}
      >
        <div ref={spinnerRef} className="flex items-center justify-center">
          <div ref={ringRef} className="w-5 h-5 rounded-full border-2 border-t-transparent border-foreground/20 transition-colors" />
        </div>
        <span ref={labelRef} className="text-[9px] font-bold text-foreground/40 transition-colors">Pull down…</span>
      </div>

      {refreshing && (
        <div
          role="status"
          className="fixed left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top,0px)+12px)] z-50 pointer-events-none flex items-center gap-2 rounded-full bg-card/90 backdrop-blur px-3 py-1.5 shadow-md border border-border text-primary"
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[10px] font-bold text-foreground/60">Refreshing…</span>
        </div>
      )}
      </>, document.body)}
      {children}
    </div>
  );
}
