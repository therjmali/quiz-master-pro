import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useClock } from '../../hooks/useClock';
import FlipCard from '../shared/FlipCard';

function FlipDigit({ value, color = 'text-foreground' }: { value: string; color?: string }) {
  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8, scale: 0.92 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className={`inline-flex items-center justify-center text-[32px] sm:text-[42px] lg:text-[48px] leading-none font-bold tabular-nums ${color}`}
    >
      {value}
    </motion.span>
  );
}

/* ─── Ultra Premium Analog Watch Face ─── */
function AnalogWatch({ now }: { now: Date }) {
  const hourRef = useRef<SVGGElement>(null);
  const minRef = useRef<SVGGElement>(null);
  const secRef = useRef<SVGGElement>(null);

  /**
   * The sweeping second hand used to be driven by a 30 fps requestAnimationFrame loop that ran for
   * as long as the dashboard was mounted - including when the card had scrolled off screen. iOS and
   * Chrome keep rAF running for off-screen elements, so a phone paid 30 forced style recalcs a
   * second for a clock nobody was looking at. Now:
   *   • one 1 s interval paints the whole face (the hand ticks, which is also easier to read);
   *   • an IntersectionObserver stops the interval the moment the card leaves the viewport;
   *   • a hidden tab stops it too.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = true;
    let onScreen = false;

    const paint = () => {
      const d = new Date();
      const h = d.getHours(), m = d.getMinutes(), sec = d.getSeconds(), ms = d.getMilliseconds();
      hourRef.current?.setAttribute('transform', `rotate(${(h % 12) * 30 + m * 0.5}, 100, 100)`);
      minRef.current?.setAttribute('transform', `rotate(${m * 6 + sec * 0.1}, 100, 100)`);
      // Continuous sweep from the millisecond offset at the moment of the tick (no per-frame loop).
      secRef.current?.setAttribute('transform', `rotate(${(sec + ms / 1000) * 6}, 100, 100)`);
    };

    const start = () => {
      if (timer || !visible || !onScreen) return;
      paint();
      timer = setInterval(paint, 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    const host = secRef.current?.closest('svg') ?? null;
    let io: IntersectionObserver | null = null;
    if (host && typeof IntersectionObserver !== 'undefined') {
      onScreen = true; // assume on-screen until the first observation arrives
      io = new IntersectionObserver(entries => {
        const next = entries.some(e => e.isIntersecting);
        if (next === onScreen) return;
        onScreen = next;
        if (onScreen) start(); else stop();
      }, { rootMargin: '80px' });
      io.observe(host);
    } else {
      onScreen = true;
    }

    const onVis = () => {
      visible = !document.hidden;
      if (visible) start(); else stop();
    };
    document.addEventListener('visibilitychange', onVis);
    start();
    return () => {
      stop();
      io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  const dayNum = now.getDate();
  const dayShort = now.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();
  const romans = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

  return (
    <div className="relative w-full flex items-center justify-center py-3">
      <div className="relative w-[180px] h-[180px] sm:w-[220px] sm:h-[220px]">
        <div className="absolute inset-[4%] rounded-full pointer-events-none" style={{ boxShadow: '0 4px 20px hsl(var(--primary) / 0.15)' }} />
        <svg viewBox="0 0 200 200" className="relative w-full h-full">
          <defs>
            <linearGradient id="bezel" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground) / 0.12)" />
              <stop offset="30%" stopColor="hsl(var(--foreground) / 0.25)" />
              <stop offset="50%" stopColor="hsl(var(--foreground) / 0.08)" />
              <stop offset="70%" stopColor="hsl(var(--foreground) / 0.22)" />
              <stop offset="100%" stopColor="hsl(var(--foreground) / 0.10)" />
            </linearGradient>
            <radialGradient id="dial" cx="50%" cy="45%" r="50%">
              <stop offset="0%" stopColor="hsl(var(--card) / 1)" />
              <stop offset="85%" stopColor="hsl(var(--card) / 0.95)" />
              <stop offset="100%" stopColor="hsl(var(--muted) / 0.7)" />
            </radialGradient>
            <linearGradient id="glass" x1="0.3" y1="0" x2="0.7" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.12" />
              <stop offset="40%" stopColor="white" stopOpacity="0.03" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="glow" cx="50%" cy="50%" r="50%">
              <stop offset="60%" stopColor="transparent" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.06)" />
            </radialGradient>
          </defs>

          <circle cx="100" cy="100" r="98" fill="url(#glow)" />
          <circle cx="100" cy="100" r="96" fill="none" stroke="url(#bezel)" strokeWidth="4" />
          <circle cx="100" cy="100" r="94" fill="none" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
          <circle cx="100" cy="100" r="91" fill="url(#dial)" />
          <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(var(--border) / 0.15)" strokeWidth="0.3" />

          {Array.from({ length: 60 }, (_, i) => {
            const angle = (i * 6 - 90) * (Math.PI / 180);
            const isHour = i % 5 === 0;
            const r1 = isHour ? 80 : 84;
            const r2 = 87;
            return (
              <line
                key={`tick-${i}`}
                x1={100 + r1 * Math.cos(angle)}
                y1={100 + r1 * Math.sin(angle)}
                x2={100 + r2 * Math.cos(angle)}
                y2={100 + r2 * Math.sin(angle)}
                stroke={isHour ? 'hsl(var(--foreground) / 0.7)' : 'hsl(var(--foreground) / 0.15)'}
                strokeWidth={isHour ? 1.8 : 0.5}
                strokeLinecap="round"
              />
            );
          })}

          {romans.map((num, i) => {
            const angle = (i * 30 - 90) * (Math.PI / 180);
            const r = 72;
            const x = 100 + r * Math.cos(angle);
            const y = 100 + r * Math.sin(angle);
            return (
              <text
                key={`roman-${i}`}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill="hsl(var(--foreground) / 0.75)"
                fontSize={i === 0 ? "9" : "7.5"}
                fontWeight={i === 0 || i === 3 || i === 6 || i === 9 ? "700" : "500"}
                fontFamily="Georgia, 'Times New Roman', serif"
                letterSpacing="0.5"
              >
                {num}
              </text>
            );
          })}

          {/* Brand text */}
          <text x="100" y="62" textAnchor="middle" fill="hsl(var(--primary) / 0.75)" fontSize="4.5" fontWeight="800" letterSpacing="2" fontFamily="system-ui, sans-serif">
            R.J QUIZ
          </text>
          <text x="100" y="67" textAnchor="middle" fill="hsl(var(--muted-foreground) / 0.5)" fontSize="3" fontWeight="700" letterSpacing="1.5" fontFamily="system-ui, sans-serif">
            P R O
          </text>

          {/* Complication */}
          <rect x="117" y="95" width="20" height="11" rx="2.5" fill="hsl(var(--card))" stroke="hsl(var(--border) / 0.3)" strokeWidth="0.5" />
          <text x="122" y="99" textAnchor="middle" fill="hsl(var(--primary) / 0.6)" fontSize="3.5" fontWeight="700" fontFamily="system-ui, sans-serif">
            {dayShort}
          </text>
          <line x1="127" y1="95.5" x2="127" y2="105.5" stroke="hsl(var(--border) / 0.2)" strokeWidth="0.3" />
          <text x="132" y="99" textAnchor="middle" fill="hsl(var(--foreground) / 0.8)" fontSize="4.5" fontWeight="800" fontFamily="system-ui, sans-serif">
            {dayNum}
          </text>

          {/* Hands */}
          <g ref={hourRef} transform="rotate(0, 100, 100)">
            <polygon points="98,60 100,42 102,60" fill="hsl(var(--foreground) / 0.85)" />
            <rect x="98.5" y="60" width="3" height="42" rx="1.5" fill="hsl(var(--foreground) / 0.85)" />
          </g>

          <g ref={minRef} transform="rotate(0, 100, 100)">
            <polygon points="98.8,50 100,28 101.2,50" fill="hsl(var(--foreground) / 0.75)" />
            <rect x="99" y="50" width="2" height="52" rx="1" fill="hsl(var(--foreground) / 0.75)" />
          </g>

          <g ref={secRef} transform="rotate(0, 100, 100)">
            <line x1="100" y1="115" x2="100" y2="24" stroke="hsl(var(--primary))" strokeWidth="0.8" strokeLinecap="round" />
            <circle cx="100" cy="115" r="2.5" fill="hsl(var(--primary))" />
          </g>

          <circle cx="100" cy="100" r="4" fill="hsl(var(--foreground) / 0.7)" />
          <circle cx="100" cy="100" r="2" fill="hsl(var(--primary))" />
          <ellipse cx="85" cy="70" rx="45" ry="40" fill="url(#glass)" />
        </svg>
      </div>
    </div>
  );
}

/* ─── Digital Clock Face ─── */
function DigitalClock({ now }: { now: Date }) {
  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  const hStr = String(h12).padStart(2, '0');
  const mStr = String(m).padStart(2, '0');
  const sStr = String(s).padStart(2, '0');

  const dayFull = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dayNum = now.getDate();
  const monthFull = now.toLocaleDateString('en-US', { month: 'long' });
  const year = now.getFullYear();

  return (
    <div className="relative z-10 flex flex-col items-center py-5 sm:py-6 px-4">
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.35em] uppercase text-primary mb-1">
        {dayFull}
      </span>
      <div className="flex items-baseline gap-0.5 sm:gap-1">
        <div className="flex items-baseline">
          <FlipDigit value={hStr[0]} color="text-primary" />
          <FlipDigit value={hStr[1]} color="text-primary" />
        </div>
        <span className="text-[28px] sm:text-[36px] lg:text-[42px] font-mono text-muted-foreground/60 mx-0.5 -translate-y-[2px]">
          :
        </span>
        <div className="flex items-baseline">
          <FlipDigit value={mStr[0]} color="text-foreground" />
          <FlipDigit value={mStr[1]} color="text-foreground" />
        </div>
        <span className="text-[28px] sm:text-[36px] lg:text-[42px] font-mono text-muted-foreground/40 mx-0.5 -translate-y-[2px]">
          :
        </span>
        <div className="flex items-baseline">
          <FlipDigit value={sStr[0]} color="text-secondary" />
          <FlipDigit value={sStr[1]} color="text-secondary" />
        </div>
        <span className="text-[10px] sm:text-xs font-black tracking-widest text-muted-foreground ml-1.5 self-center">
          {ampm}
        </span>
      </div>
      <div className="flex items-center gap-2 mt-1.5">
        <div className="h-px w-6 sm:w-10 bg-gradient-to-r from-transparent to-border/40" />
        <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground tracking-wide">
          {dayNum} {monthFull} {year}
        </span>
        <div className="h-px w-6 sm:w-10 bg-gradient-to-l from-transparent to-border/40" />
      </div>
    </div>
  );
}

/* ─── Flip Clock Face (split-flap cards: HH · MM · SS) ─── */
function FlipClock({ now }: { now: Date }) {
  const h = now.getHours();
  const h12 = h % 12 || 12;
  const dayFull = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const pad = (n: number) => String(n).padStart(2, '0');
  const dot = (
    <span className="flex flex-col gap-2 self-center pb-5" aria-hidden>
      <i className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
      <i className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
    </span>
  );

  return (
    <div className="relative z-10 flex flex-col items-center py-5 sm:py-6 px-3">
      <span className="text-[9px] sm:text-[10px] font-bold tracking-[0.35em] uppercase text-primary mb-3">
        {dayFull}
      </span>
      <div className="flex items-start justify-center gap-1.5 sm:gap-2.5">
        <FlipCard value={pad(h12)} label="Hours" size={58} tone="dark" />
        {dot}
        <FlipCard value={pad(now.getMinutes())} label="Minutes" size={58} tone="dark" />
        {dot}
        <FlipCard value={pad(now.getSeconds())} label="Seconds" size={58} tone="dark" />
        <span className="self-center text-[11px] font-black tracking-widest text-muted-foreground ml-1 pb-5">
          {h >= 12 ? 'PM' : 'AM'}
        </span>
      </div>
      <span className="text-[10px] sm:text-[11px] font-semibold text-muted-foreground tracking-wide mt-2.5">
        {dateStr}
      </span>
    </div>
  );
}

type ClockStyle = 'digital' | 'flip' | 'analog';
const CLOCK_ORDER: ClockStyle[] = ['digital', 'flip', 'analog'];
const CLOCK_LABEL: Record<ClockStyle, string> = { digital: '🔢 digital', flip: '🎞️ flip', analog: '⌚ analog' };
const CLOCK_MODE_KEY = 'qmp-clock-mode';

export interface HeroClockProps {
  streak?: number;
  todayCount?: number;
  avgScore?: number;
}

export default function HeroClock({ streak, todayCount, avgScore }: HeroClockProps = {}) {
  const now = useClock();
  const [style, setStyle] = useState<ClockStyle>(() => {
    try {
      const v = localStorage.getItem(CLOCK_MODE_KEY);
      return v === 'analog' || v === 'flip' ? v : 'digital';
    } catch {
      return 'digital';
    }
  });
  const [isFlipping, setIsFlipping] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(CLOCK_MODE_KEY, style);
    } catch {}
  }, [style]);

  const handleFlip = () => {
    if (isFlipping) return;
    setIsFlipping(true);
    setTimeout(() => {
      setStyle((p) => CLOCK_ORDER[(CLOCK_ORDER.indexOf(p) + 1) % CLOCK_ORDER.length]);
      setTimeout(() => setIsFlipping(false), 400);
    }, 300);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-2xl overflow-hidden cursor-pointer select-none glass-card"
      onClick={handleFlip}
      style={{ perspective: 1000 }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-card/70 to-secondary/10" />
      <div className="absolute inset-0 border border-white/10 rounded-2xl" />

      <div
        className="absolute -top-10 -left-10 w-40 h-40 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(var(--primary) / 0.12), transparent 70%)' }}
      />
      <div
        className="absolute -bottom-8 -right-8 w-36 h-36 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, hsl(var(--secondary) / 0.10), transparent 70%)' }}
      />

      <motion.div
        animate={{ rotateY: isFlipping ? 90 : 0 }}
        transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}
        className="relative z-10"
        style={{ transformStyle: 'preserve-3d' }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={style}
            initial={{ rotateY: -90, opacity: 0 }}
            animate={{ rotateY: 0, opacity: 1 }}
            exit={{ rotateY: 90, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.45, 0, 0.55, 1] }}
          >
            {style === 'analog' ? (
              <AnalogWatch now={now} />
            ) : style === 'flip' ? (
              <FlipClock now={now} />
            ) : (
              <DigitalClock now={now} />
            )}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      <div className="absolute bottom-2 right-3 z-20">
        <span className="text-[8px] font-bold text-muted-foreground/60 uppercase tracking-widest">
          {CLOCK_LABEL[style]} · tap to switch
        </span>
      </div>
    </motion.div>
  );
}
