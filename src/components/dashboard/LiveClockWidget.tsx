import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePersistedState } from '../../hooks/usePersistedState';

interface Props {
  streak: number;
  todayCount: number;
  avgScore: number;
}

const QUOTES = [
  "Your future self will thank you for studying today.",
  "Small daily improvements lead to stunning results.",
  "The expert in anything was once a beginner.",
  "Success is the sum of small efforts repeated daily.",
  "Don't wish it were easier — wish you were better.",
  "Knowledge is power. Practice is mastery.",
  "Every question you practice brings you closer to passing.",
  "Discipline is choosing between what you want now and what you want most.",
  "The pain of studying is temporary. The pride of passing is forever.",
  "You don't have to be great to start, but you have to start to be great.",
  "Consistency beats intensity. Show up every day.",
  "A little progress each day adds up to big results.",
  "Believe in the process. Trust the grind.",
  "One more question. One step closer to your goal.",
  "Hard work beats talent when talent doesn't work hard.",
  "The best time to study was yesterday. The next best time is now.",
  "Champions train. Losers complain.",
];

function getGreeting(h: number) {
  if (h >= 5 && h < 12) return { title: 'Early Bird!', emoji: '🌅', sub: 'Rise & grind' };
  if (h >= 12 && h < 17) return { title: 'Afternoon Focus!', emoji: '☀️', sub: 'Peak study hours' };
  if (h >= 17 && h < 21) return { title: 'Evening Scholar!', emoji: '🌆', sub: 'Golden hour learning' };
  return { title: 'Night Owl Mode!', emoji: '🌙', sub: 'Quiet hours, deep focus' };
}

const DAYS = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function pad(n: number) { return n < 10 ? '0' + n : String(n); }

/* ── Analog Clock Face ── */
function AnalogClock({ h, m, s }: { h: number; m: number; s: number }) {
  const secDeg = s * 6;
  const minDeg = m * 6 + s * 0.1;
  const hrDeg = (h % 12) * 30 + m * 0.5;

  const ticks = Array.from({ length: 60 }, (_, i) => i);
  const nums = [12,1,2,3,4,5,6,7,8,9,10,11];

  // Read CSS variable for primary color to use in SVG
  const primaryColor = 'hsl(var(--primary))';
  const primaryGlow = 'hsl(var(--primary) / 0.15)';
  const accentColor = 'hsl(var(--accent))';

  return (
    <div className="relative w-[220px] h-[220px] mx-auto">
      <svg viewBox="0 0 220 220" className="w-full h-full" style={{ filter: `drop-shadow(0 0 30px ${primaryGlow})` }}>
        {/* Outer ring */}
        <circle cx="110" cy="110" r="106" fill="none" stroke="hsl(var(--border))" strokeWidth="2" />
        <circle cx="110" cy="110" r="102" fill="hsl(var(--card))" stroke="hsl(var(--border) / 0.5)" strokeWidth="1" />

        {/* Tick marks */}
        {ticks.map(i => {
          const angle = (i * 6 - 90) * (Math.PI / 180);
          const major = i % 5 === 0;
          const r1 = major ? 84 : 90;
          const r2 = 96;
          return (
            <line
              key={i}
              x1={110 + r1 * Math.cos(angle)}
              y1={110 + r1 * Math.sin(angle)}
              x2={110 + r2 * Math.cos(angle)}
              y2={110 + r2 * Math.sin(angle)}
              stroke={major ? primaryColor : 'hsl(var(--foreground) / 0.15)'}
              strokeWidth={major ? 2.5 : 1}
              strokeLinecap="round"
              style={major ? { opacity: 0.8 } : undefined}
            />
          );
        })}

        {/* Numbers */}
        {nums.map((n, i) => {
          const angle = (i * 30 - 90) * (Math.PI / 180);
          const r = 74;
          const isCardinal = [12,3,6,9].includes(n);
          return (
            <text
              key={n}
              x={110 + r * Math.cos(angle)}
              y={110 + r * Math.sin(angle)}
              textAnchor="middle"
              dominantBaseline="central"
              fill={isCardinal ? primaryColor : 'hsl(var(--foreground) / 0.45)'}
              fontSize={isCardinal ? 14 : 11}
              fontWeight={isCardinal ? 800 : 600}
              fontFamily="var(--font-sans)"
              style={isCardinal ? { opacity: 0.9 } : undefined}
            >
              {n}
            </text>
          );
        })}

        {/* Branding */}
        <text x="110" y="145" textAnchor="middle" fill={primaryColor} fontSize="7" fontWeight="700" fontFamily="var(--font-sans)" letterSpacing="0.1em" style={{ opacity: 0.3 }}>
          R.J QUIZ
        </text>

        {/* Hour hand */}
        <line
          x1="110" y1="110"
          x2={110 + 48 * Math.cos((hrDeg - 90) * Math.PI / 180)}
          y2={110 + 48 * Math.sin((hrDeg - 90) * Math.PI / 180)}
          stroke="hsl(var(--foreground) / 0.9)"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 2px hsl(var(--foreground) / 0.3))' }}
        />

        {/* Minute hand */}
        <line
          x1="110" y1="110"
          x2={110 + 66 * Math.cos((minDeg - 90) * Math.PI / 180)}
          y2={110 + 66 * Math.sin((minDeg - 90) * Math.PI / 180)}
          stroke="hsl(var(--foreground) / 0.8)"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ filter: 'drop-shadow(0 0 2px hsl(var(--foreground) / 0.2))' }}
        />

        {/* Second hand */}
        <line
          x1={110 - 16 * Math.cos((secDeg - 90) * Math.PI / 180)}
          y1={110 - 16 * Math.sin((secDeg - 90) * Math.PI / 180)}
          x2={110 + 76 * Math.cos((secDeg - 90) * Math.PI / 180)}
          y2={110 + 76 * Math.sin((secDeg - 90) * Math.PI / 180)}
          stroke={accentColor}
          strokeWidth="1.2"
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 4px hsl(var(--accent) / 0.5))`, opacity: 0.9 }}
        />

        {/* Center hub */}
        <circle cx="110" cy="110" r="6" fill="url(#hubGrad)" stroke="hsl(var(--foreground) / 0.3)" strokeWidth="1" />
        <circle cx="110" cy="110" r="2.5" fill={accentColor} style={{ opacity: 0.9 }} />

        <defs>
          <radialGradient id="hubGrad">
            <stop offset="0%" stopColor="hsl(var(--foreground) / 0.7)" />
            <stop offset="100%" stopColor="hsl(var(--foreground) / 0.3)" />
          </radialGradient>
        </defs>
      </svg>
    </div>
  );
}

/* ── Digital Clock Display ── */
function DigitalClock({ h, m, s, ampm }: { h: number; m: number; s: number; ampm: string }) {
  return (
    <div className="flex items-baseline justify-center gap-0">
      <span className="text-[3.2rem] font-black leading-none tabular-nums text-accent">
        {h === 0 ? 12 : h > 12 ? h - 12 : h}
      </span>
      <span className="text-[3.2rem] font-black leading-none text-foreground/30 mx-0.5 animate-pulse">:</span>
      <span className="text-[3.2rem] font-black leading-none tabular-nums text-foreground">
        {pad(m)}
      </span>
      <span className="text-[3.2rem] font-black leading-none text-foreground/30 mx-0.5 animate-pulse">:</span>
      <span className="text-[3.2rem] font-black leading-none tabular-nums text-primary">
        {pad(s)}
      </span>
      <span className="text-sm font-extrabold text-foreground/50 ml-2 self-center tracking-wider">{ampm}</span>
    </div>
  );
}

export default function LiveClockWidget({ streak, todayCount, avgScore }: Props) {
  const [now, setNow] = useState(new Date());
  const [isAnalog, setIsAnalog] = usePersistedState('clock_analog', false);
  const [quoteIdx, setQuoteIdx] = useState(() => Math.floor(Math.random() * QUOTES.length));
  const [flipping, setFlipping] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const s = now.getSeconds();
  const ampm = h >= 12 ? 'PM' : 'AM';
  const dayName = DAYS[now.getDay()];
  const dateStr = `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;

  const greeting = useMemo(() => getGreeting(h), [h]);

  const handleFlip = useCallback(() => {
    setFlipping(true);
    setTimeout(() => {
      setIsAnalog(p => !p);
      setTimeout(() => setFlipping(false), 50);
    }, 250);
  }, []);

  const nextQuote = useCallback(() => {
    setQuoteIdx(i => (i + 1) % QUOTES.length);
  }, []);

  return (
    <div className="space-y-3 animate-fade-in">
      {/* ── Clock Card ── */}
      <div className="glass-card overflow-hidden relative" style={{ perspective: '1200px' }}>
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-accent/3 pointer-events-none rounded-[1.25rem]" />

        <div
          className="relative px-5 pt-5 pb-4 transition-all duration-500"
          style={{
            transform: flipping ? 'rotateY(90deg) scale(0.95)' : 'rotateY(0deg) scale(1)',
            opacity: flipping ? 0 : 1,
            transformStyle: 'preserve-3d',
          }}
        >
          {!isAnalog ? (
            /* Digital Mode */
            <div className="text-center">
              <p className="text-xs font-extrabold tracking-[0.35em] mb-3 text-primary">
                {dayName}
              </p>
              <DigitalClock h={h} m={m} s={s} ampm={ampm} />
              <p className="text-sm text-foreground/35 font-medium mt-2">{dateStr}</p>
            </div>
          ) : (
            /* Analog Mode */
            <div className="py-2">
              <AnalogClock h={h} m={m} s={s} />
              <p className="text-center text-xs text-foreground/30 font-medium mt-2">{dateStr}</p>
            </div>
          )}

          {/* Flip toggle */}
          <button
            onClick={handleFlip}
            className="flex items-center gap-1.5 ml-auto mt-3 text-[10px] font-bold text-foreground/30 hover:text-foreground/60 transition-colors active:scale-95"
          >
            <span className="text-xs">{isAnalog ? '🔢' : '⌚'}</span>
            <span className="tracking-wider uppercase">
              {isAnalog ? 'Analog' : 'Digital'} · Tap to flip
            </span>
          </button>
        </div>
      </div>

      {/* ── Motivation Card ── */}
      <div className="glass-card overflow-hidden relative p-5">
        {/* Watermark score */}
        <div className="absolute top-2 right-3 text-[5rem] font-black leading-none text-foreground/[0.04] pointer-events-none select-none tabular-nums">
          {avgScore}
        </div>

        <div className="absolute inset-0 bg-gradient-to-br from-accent/5 via-transparent to-primary/3 pointer-events-none rounded-[1.25rem]" />

        <div className="relative">
          {/* Greeting */}
          <h3 className="text-xl font-black text-foreground flex items-center gap-2">
            {greeting.title} <span className="text-2xl">{greeting.emoji}</span>
          </h3>
          <p className="text-sm text-foreground/40 italic mt-0.5">{greeting.sub}</p>

          {/* Badges */}
          <div className="flex items-center gap-2.5 mt-3.5">
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-primary/30 text-primary bg-primary/[0.08]">
              🔥 {streak}d streak
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full border border-accent/30 text-accent bg-accent/[0.08]">
              ◎ {todayCount} today
            </span>
          </div>

          {/* Quote */}
          <p className="text-sm text-foreground/60 italic mt-4 leading-relaxed pr-6">
            &ldquo;{QUOTES[quoteIdx]}&rdquo;
          </p>
          <p className="text-xs text-foreground/25 font-semibold mt-1.5">— R.J Quiz</p>

          {/* Refresh */}
          <button
            onClick={nextQuote}
            className="mt-2 p-1.5 rounded-lg text-foreground/20 hover:text-foreground/50 hover:bg-foreground/5 transition-all active:scale-90"
            aria-label="Next quote"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
