import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Gauge, BarChart3, TrendingUp, Zap } from 'lucide-react';

interface Props {
  percentage: number;
  /** Precise percentage with decimals (e.g. 76.31). When provided and showDecimal is true, displays this. */
  precisePct?: number;
  netScore: number;
  maxScore: number;
  /** When true, start the animation (controlled by parent for staged reveal) */
  startAnimation?: boolean;
  /** When true, show percentage with decimals */
  showDecimal?: boolean;
}

/* ── Color zones ── */
function getZone(pct: number) {
  if (pct >= 100) return { primary: '#34C759', secondary: '#4ade80', glow: 'rgba(52,199,89,0.5)', label: 'PERFECT', perf: 'Perfect Score! 🎉', percentile: 'Top 1%', msg: "Flawless! You've achieved a perfect score." };
  if (pct >= 85)  return { primary: '#34C759', secondary: '#4ade80', glow: 'rgba(52,199,89,0.45)', label: 'EXCELLENT', perf: 'Impressive!', percentile: 'Top 5%', msg: "Outstanding! You've achieved excellence." };
  if (pct >= 67)  return { primary: '#34C759', secondary: '#86efac', glow: 'rgba(52,199,89,0.35)', label: 'WELL DONE', perf: 'Well Done!', percentile: 'Above 70%', msg: "Great job! You're in the green zone." };
  if (pct >= 50)  return { primary: '#F0A500', secondary: '#fbbf24', glow: 'rgba(240,165,0,0.4)', label: 'GOOD ATTEMPT', perf: 'Good Attempt', percentile: 'Above 50%', msg: "Good effort! You're getting there." };
  if (pct >= 34)  return { primary: '#F0A500', secondary: '#f59e0b', glow: 'rgba(240,165,0,0.35)', label: 'KEEP GOING', perf: 'Keep Practising', percentile: 'Above 30%', msg: "You're making progress. Keep at it!" };
  return { primary: '#FF3B5C', secondary: '#f87171', glow: 'rgba(255,59,92,0.45)', label: 'NEEDS WORK', perf: 'Keep Practising', percentile: 'Below 30%', msg: 'Every attempt brings you closer. Keep going!' };
}

function getArcGradient(pct: number) {
  if (pct >= 85)  return [['0%','#34C759'],['100%','#4ade80']];
  if (pct >= 67)  return [['0%','#F0A500'],['50%','#84cc16'],['100%','#34C759']];
  if (pct >= 50)  return [['0%','#F0A500'],['100%','#fbbf24']];
  if (pct >= 34)  return [['0%','#FF3B5C'],['50%','#F0A500'],['100%','#fbbf24']];
  return [['0%','#FF3B5C'],['100%','#f87171']];
}

/* ── Spark particles ── */
function SparkParticles({ color, active }: { color: string; active: boolean }) {
  const particles = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      angle: (i * 25.7) + Math.random() * 12,
      dist: 65 + Math.random() * 45,
      size: 2 + Math.random() * 3.5,
      delay: i * 0.06,
      dur: 0.7 + Math.random() * 0.5,
    })), []);

  if (!active) return null;

  return (
    <div className="speedo-sparks absolute inset-0 pointer-events-none">
      {particles.map(p => {
        const rad = (p.angle * Math.PI) / 180;
        const x = Math.cos(rad) * p.dist;
        const y = Math.sin(rad) * p.dist;
        return (
          <div key={p.id} className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: p.size, height: p.size, background: color,
              boxShadow: `0 0 8px ${color}, 0 0 16px ${color}`,
              animation: `sparkFly ${p.dur}s cubic-bezier(0.22,1,0.36,1) ${p.delay}s both`,
              '--spark-x': `${x}px`, '--spark-y': `${y}px`,
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
}

export default function PremiumSpeedometer({ percentage, precisePct, netScore, maxScore, startAnimation = true, showDecimal = false }: Props) {
  // Final display value: use precise decimal when toggle is on
  const finalDisplayValue = showDecimal && precisePct !== undefined ? precisePct : percentage;
  const [animPct, setAnimPct] = useState(0);
  const [displayPct, setDisplayPct] = useState(0);
  const [showCards, setShowCards] = useState(false);
  const [showSparks, setShowSparks] = useState(false);
  const [bouncePhase, setBouncePhase] = useState(false);
  const [hasAnimated, setHasAnimated] = useState(false);
  const animRef = useRef(0);
  const numberAnimRef = useRef(0);
  const bounceRef = useRef(false);
  const prevPercentageRef = useRef<number | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  // Reset and replay animation
  const triggerAnimation = useCallback(() => {
    // Cancel existing animations
    cancelAnimationFrame(animRef.current);
    cancelAnimationFrame(numberAnimRef.current);
    if (cleanupRef.current) cleanupRef.current();
    
    // Reset state
    setAnimPct(0);
    setDisplayPct(0);
    setShowCards(false);
    setShowSparks(false);
    setBouncePhase(false);
    bounceRef.current = false;

    // Start arc animation after a dramatic pause
    const arcTimer = setTimeout(() => setAnimPct(percentage), 1200);

    // Start number counting animation with longer duration
    const numTimer = setTimeout(() => {
      const dur = 4000;
      const overshoot = Math.min(percentage * 1.07, 100);
      const start = performance.now();
      
      const tick = (now: number) => {
        const elapsed = now - start;
        const p = Math.min(elapsed / dur, 1);
        
        let val: number;
        if (p < 0.65) {
          const phase1 = p / 0.65;
          const eased = 1 - Math.pow(1 - phase1, 4);
          val = eased * overshoot;
        } else if (p < 0.85) {
          const phase2 = (p - 0.65) / 0.2;
          const eased = phase2 * phase2 * (3 - 2 * phase2);
          val = overshoot - (overshoot - percentage * 0.97) * eased;
        } else {
          const phase3 = (p - 0.85) / 0.15;
          const eased = phase3 * phase3 * (3 - 2 * phase3);
          val = percentage * 0.97 + (percentage - percentage * 0.97) * eased;
        }
        
        setDisplayPct(Math.round(Math.min(val, 100)));
        
        if (p >= 0.65 && !bounceRef.current) {
          bounceRef.current = true;
          setBouncePhase(true);
        }
        
        if (p < 1) {
          numberAnimRef.current = requestAnimationFrame(tick);
        } else {
          setDisplayPct(Math.max(0, Math.min(Math.round(percentage), 100)));
          setShowSparks(true);
          const sparkTimer = setTimeout(() => setShowSparks(false), 1500);
          cleanupRef.current = () => clearTimeout(sparkTimer);
        }
      };
      numberAnimRef.current = requestAnimationFrame(tick);
    }, 1000);

    // Show stat cards after gauge animation completes
    const cardsTimer = setTimeout(() => setShowCards(true), 2600);

    setHasAnimated(true);

    const cleanup = () => {
      clearTimeout(arcTimer);
      clearTimeout(numTimer);
      clearTimeout(cardsTimer);
    };
    cleanupRef.current = cleanup;
    return cleanup;
  }, [percentage]);

  // Start animation when startAnimation becomes true or percentage changes
  useEffect(() => {
    if (!startAnimation) {
      // Reset everything when animation is turned off (new result loading)
      cancelAnimationFrame(animRef.current);
      cancelAnimationFrame(numberAnimRef.current);
      if (cleanupRef.current) cleanupRef.current();
      setAnimPct(0);
      setDisplayPct(0);
      setShowCards(false);
      setShowSparks(false);
      setBouncePhase(false);
      bounceRef.current = false;
      setHasAnimated(false);
      prevPercentageRef.current = null;
      return;
    }

    // Animate when startAnimation becomes true, or when percentage actually changes
    const pctChanged = prevPercentageRef.current !== null && prevPercentageRef.current !== percentage;
    const firstRun = prevPercentageRef.current === null;
    prevPercentageRef.current = percentage;

    if (firstRun || pctChanged) {
      setHasAnimated(false);
      const cleanup = triggerAnimation();
      return () => {
        cleanup?.();
        cancelAnimationFrame(animRef.current);
        cancelAnimationFrame(numberAnimRef.current);
      };
    }
  }, [startAnimation, percentage, triggerAnimation]);

  // Click handler to replay animation
  const handleClick = useCallback(() => {
    triggerAnimation();
  }, [triggerAnimation]);

  const zone = getZone(percentage);
  const gradStops = getArcGradient(percentage);

  const cx = 160, cy = 160, r = 120;
  const startAngle = 225;
  const totalSweep = 270;
  const gradId = useMemo(() => `arcGrad-${Math.random().toString(36).slice(2,8)}`, []);
  const glowGradId = useMemo(() => `glowGrad-${Math.random().toString(36).slice(2,8)}`, []);

  const angleToPoint = useCallback((deg: number, radius: number) => {
    const rad = ((deg - 90) * Math.PI) / 180;
    return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
  }, []);

  const createArc = useCallback((sDeg: number, sweep: number, radius: number) => {
    if (sweep <= 0) return '';
    const eDeg = sDeg + sweep;
    const s = angleToPoint(sDeg, radius);
    const e = angleToPoint(eDeg, radius);
    const large = sweep > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${radius} ${radius} 0 ${large} 1 ${e.x} ${e.y}`;
  }, [angleToPoint]);

  const filledSweep = (animPct / 100) * totalSweep;
  const trackPath = createArc(startAngle, totalSweep, r);
  const filledPath = createArc(startAngle, filledSweep, r);

  const needleAngle = startAngle + (animPct / 100) * totalSweep;
  const needleTip = angleToPoint(needleAngle, r - 8);
  const needleDot = angleToPoint(needleAngle, r + 2);

  const majorTicks = [0, 25, 50, 75, 100];
  const minorTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= 100; i += 5) if (!majorTicks.includes(i)) ticks.push(i);
    return ticks;
  }, []);

  return (
    <div className="flex flex-col items-center w-full max-w-[400px] mx-auto">
      {/* Range badge */}
      <div
        className="speedo-range-badge px-4 py-1.5 rounded-full text-xs font-black tracking-wider mb-3"
        style={{
          background: `${zone.primary}18`,
          color: zone.primary,
          border: `1.5px solid ${zone.primary}40`,
          boxShadow: `0 0 16px ${zone.glow}`,
        }}
      >
        {percentage >= 100 ? '100%' : percentage >= 85 ? '85% – 100%' : percentage >= 70 ? '70% – 85%' : percentage >= 50 ? '50% – 70%' : percentage >= 25 ? '25% – 50%' : '0% – 25%'}
      </div>

      {/* SVG Speedometer — click to replay */}
      <div
        className="relative w-[290px] h-[230px] sm:w-[330px] sm:h-[260px] cursor-pointer group"
        onClick={handleClick}
        title="Click to replay animation"
      >
        {/* Ambient glow behind */}
        <div className="speedo-ambient-glow absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(ellipse at 50% 55%, ${zone.primary}15 0%, transparent 65%)`,
            filter: 'blur(30px)',
            animation: 'ambientPulse 3s ease-in-out infinite',
          }}
        />

        {/* Replay hint */}
        <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <span className="text-[9px] font-bold text-foreground/30 bg-foreground/5 px-2 py-1 rounded-lg border border-border">
            ↻ Tap to replay
          </span>
        </div>

        <svg viewBox="0 0 320 260" className="w-full h-full relative z-10">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              {gradStops.map(([offset, color]) => (
                <stop key={offset} offset={offset} stopColor={color} />
              ))}
            </linearGradient>
            <radialGradient id={glowGradId} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={zone.primary} stopOpacity="0.3" />
              <stop offset="100%" stopColor={zone.primary} stopOpacity="0" />
            </radialGradient>
            <filter id="speedoGlow2" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="needleDotGlow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            <filter id="hubGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* Track */}
          <path d={trackPath} fill="none" className="speedo-track" strokeWidth="12" strokeLinecap="round" />
          <path d={trackPath} fill="none" stroke={`${zone.primary}08`} strokeWidth="24" strokeLinecap="round" />

          {/* Filled arc — outer glow */}
          {filledSweep > 1 && (
            <path d={filledPath} fill="none" stroke={`url(#${gradId})`}
              strokeWidth="18" strokeLinecap="round" filter="url(#speedoGlow2)" opacity="0.35"
              style={{ transition: 'd 3.5s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
          )}

          {/* Filled arc — main */}
          {filledSweep > 1 && (
            <path d={filledPath} fill="none" stroke={`url(#${gradId})`}
              strokeWidth="12" strokeLinecap="round"
              style={{ transition: 'd 3.5s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
          )}
          
          {/* Inner highlight arc */}
          {filledSweep > 1 && (
            <path d={createArc(startAngle, filledSweep, r - 2)} fill="none" stroke="white"
              strokeWidth="1" strokeLinecap="round" opacity="0.15"
              style={{ transition: 'd 3.5s cubic-bezier(0.34,1.56,0.64,1)' }}
            />
          )}

          {/* Minor ticks */}
          {minorTicks.map(val => {
            const angle = startAngle + (val / 100) * totalSweep;
            const p1 = angleToPoint(angle, r + 16);
            const p2 = angleToPoint(angle, r + 22);
            return (
              <line key={`m${val}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                className="speedo-tick-empty" strokeWidth="1" strokeLinecap="round"
                style={{ opacity: val <= animPct ? 0.5 : 0.15, transition: 'opacity 0.5s' }}
              />
            );
          })}

          {/* Major ticks + labels */}
          {majorTicks.map(val => {
            const angle = startAngle + (val / 100) * totalSweep;
            const p1 = angleToPoint(angle, r + 16);
            const p2 = angleToPoint(angle, r + 28);
            const labelPt = angleToPoint(angle, r + 38);
            const dotPt = angleToPoint(angle, r + 14);
            const active = val <= animPct;
            return (
              <g key={val}>
                <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y}
                  strokeWidth="2.5" strokeLinecap="round"
                  stroke={active ? zone.primary : undefined}
                  className={active ? '' : 'speedo-tick-empty'}
                  style={{ opacity: active ? 0.8 : 0.25, transition: 'all 0.5s' }}
                />
                <circle cx={dotPt.x} cy={dotPt.y} r="2.5"
                  fill={active ? zone.primary : 'currentColor'}
                  className={active ? '' : 'speedo-tick-empty'}
                  style={{ opacity: active ? 0.9 : 0.2, transition: 'all 0.5s' }}
                />
                <text x={labelPt.x} y={labelPt.y} textAnchor="middle" dominantBaseline="middle"
                  fontSize="11" fontWeight="800" className="speedo-label"
                  style={{ fill: active ? zone.primary : undefined, opacity: active ? 1 : 0.35, transition: 'all 0.5s' }}
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Needle line with gradient */}
          <line
            x1={cx} y1={cy} x2={needleTip.x} y2={needleTip.y}
            stroke={zone.primary} strokeWidth="2.5" strokeLinecap="round"
            style={{ transition: 'all 3.5s cubic-bezier(0.34,1.56,0.64,1)', filter: `drop-shadow(0 0 8px ${zone.glow})` }}
          />

          {/* Needle dot — pulsing */}
          <circle cx={needleDot.x} cy={needleDot.y} r="7"
            fill={zone.primary} filter="url(#needleDotGlow)" opacity="0.4"
            style={{ transition: 'all 3.5s cubic-bezier(0.34,1.56,0.64,1)' }}
          />
          <circle cx={needleDot.x} cy={needleDot.y} r="5"
            fill={zone.primary} filter="url(#needleDotGlow)"
            style={{ transition: 'all 3.5s cubic-bezier(0.34,1.56,0.64,1)' }}
          />

          {/* Center hub — layered */}
          <circle cx={cx} cy={cy} r="12" fill={`${zone.primary}15`} filter="url(#hubGlow)" />
          <circle cx={cx} cy={cy} r="8" className="speedo-hub-ring" />
          <circle cx={cx} cy={cy} r="5" fill={zone.primary} opacity="0.9" />
          <circle cx={cx} cy={cy} r="2" fill="white" opacity="0.6" />
        </svg>

        {/* Spark particles on completion */}
        <SparkParticles color={zone.primary} active={showSparks} />

        {/* Center: percentage with glow */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20" style={{ paddingTop: '16px' }}>
          <div className="flex items-baseline gap-0.5">
            <span className={`${showDecimal ? 'text-[2.5rem] sm:text-[3rem]' : 'text-[3.25rem] sm:text-[3.75rem]'} font-black leading-none tracking-tight font-display ${bouncePhase ? 'speedo-number-settle' : ''}`}
              style={{ color: zone.primary, textShadow: `0 0 40px ${zone.glow}, 0 0 80px ${zone.glow}`, fontVariantNumeric: 'tabular-nums', letterSpacing: '-3px' }}>
              {showDecimal && precisePct !== undefined && displayPct >= Math.round(percentage)
                ? precisePct.toFixed(2).replace(/\.?0+$/, '')
                : displayPct}
            </span>
            <span className="text-xl font-black" style={{ color: zone.primary, opacity: 0.5 }}>%</span>
          </div>
        </div>
      </div>

      {/* Status label with glow pulse */}
      <div
        className="speedo-status-badge px-6 py-2 rounded-full text-xs font-black tracking-[0.2em] uppercase -mt-2 mb-3"
        style={{
          background: `${zone.primary}20`,
          color: zone.primary,
          border: `2px solid ${zone.primary}50`,
          boxShadow: `0 0 24px ${zone.glow}, 0 0 48px ${zone.glow}`,
        }}
      >
        {zone.label}
      </div>

      {/* Lightning bolt for high scores */}
      {percentage >= 80 && (
        <div className="flex items-center gap-2 mb-3 speedo-lightning-badge">
          <Zap className="w-4 h-4" style={{ color: zone.primary, filter: `drop-shadow(0 0 6px ${zone.glow})` }} />
          <span className="text-xs font-black tracking-wider" style={{ color: zone.primary }}>
            {percentage >= 95 ? 'LEGENDARY' : percentage >= 90 ? 'OUTSTANDING' : 'IMPRESSIVE'}
          </span>
          <Zap className="w-4 h-4" style={{ color: zone.primary, filter: `drop-shadow(0 0 6px ${zone.glow})` }} />
        </div>
      )}

      {/* Motivational */}
      <p className="text-center text-sm font-semibold text-foreground/55 px-6 mb-6 leading-relaxed max-w-[280px]">
        {zone.msg}
      </p>

      {/* ── Premium Stat Cards ── */}
      <div className={`w-full space-y-3 transition-all duration-700 ${showCards ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <ScoreCard netScore={netScore} maxScore={maxScore} percentage={percentage} precisePct={precisePct} showDecimal={showDecimal} color={zone.primary} glow={zone.glow} delay={0} show={showCards} />
        <div className="grid grid-cols-2 gap-3">
          <PerformanceCard perf={zone.perf} color={zone.primary} glow={zone.glow} delay={150} />
          <PercentileCard percentile={zone.percentile} color={zone.primary} glow={zone.glow} delay={300} />
        </div>
      </div>
    </div>
  );
}

/* ═══ Score Card ═══ */
function ScoreCard({ netScore, maxScore, percentage, precisePct, showDecimal, color, glow, delay, show }: { netScore: number; maxScore: number; percentage: number; precisePct?: number; showDecimal?: boolean; color: string; glow: string; delay: number; show: boolean }) {
  const [countScore, setCountScore] = useState(0);
  
  useEffect(() => {
    if (!show) { setCountScore(0); return; }
    const dur = 1400;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCountScore(Math.round(eased * netScore));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const t = setTimeout(() => { raf = requestAnimationFrame(tick); }, delay);
    return () => { clearTimeout(t); cancelAnimationFrame(raf); };
  }, [netScore, delay, show]);

  return (
    <div
      className="speedo-hero-card relative overflow-hidden rounded-2xl border p-5 flex items-center gap-5"
      style={{
        background: `linear-gradient(135deg, ${color}08, ${color}15)`,
        borderColor: `${color}30`,
        boxShadow: `0 4px 32px ${glow}, inset 0 1px 0 ${color}15`,
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="absolute -right-8 -top-8 w-28 h-28 rounded-full speedo-glow-orb"
        style={{ background: `radial-gradient(circle, ${color}25 0%, transparent 70%)` }} />

      <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}20`, border: `1.5px solid ${color}35`, boxShadow: `0 0 20px ${glow}` }}>
        <Gauge className="w-7 h-7" style={{ color }} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: `${color}90` }}>
          Score
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl sm:text-4xl font-black leading-none" style={{ color, textShadow: `0 0 20px ${glow}` }}>
            {countScore}
          </span>
          <span className="text-base font-bold" style={{ color, opacity: 0.4 }}>/ {maxScore}</span>
        </div>
      </div>

      <div className="flex-shrink-0 w-14 h-14 relative">
        <svg viewBox="0 0 48 48" className="w-full h-full">
          <circle cx="24" cy="24" r="20" fill="none" stroke={`${color}15`} strokeWidth="3" />
          <circle cx="24" cy="24" r="20" fill="none" stroke={color} strokeWidth="3"
            strokeLinecap="round" strokeDasharray={`${(Math.min(percentage, 100) / 100) * 125.7} 125.7`}
            transform="rotate(-90 24 24)" className="speedo-ring-animate"
            style={{ filter: `drop-shadow(0 0 4px ${glow})` }} />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black" style={{ color }}>
          {showDecimal && precisePct !== undefined
            ? `${Math.min(precisePct, 100).toFixed(2).replace(/\.?0+$/, '')}%`
            : `${Math.min(percentage, 100)}%`}
        </span>
      </div>
    </div>
  );
}

/* ═══ Performance Card ═══ */
function PerformanceCard({ perf, color, glow, delay }: { perf: string; color: string; glow: string; delay: number }) {
  return (
    <div
      className="speedo-stat-card-lg relative overflow-hidden rounded-2xl border p-4 flex flex-col items-center justify-center text-center gap-2"
      style={{
        background: `linear-gradient(160deg, ${color}08, ${color}12)`,
        borderColor: `${color}25`,
        boxShadow: `0 4px 24px ${glow}`,
        animationDelay: `${delay}ms`,
        minHeight: '110px',
      }}
    >
      <div className="absolute inset-0 speedo-card-pulse" style={{ background: `radial-gradient(circle at 50% 80%, ${color}12 0%, transparent 60%)` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10"
        style={{ background: `${color}18`, border: `1.5px solid ${color}30` }}>
        <BarChart3 className="w-5 h-5" style={{ color }} />
      </div>
      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-1" style={{ color: `${color}70` }}>
          Performance
        </p>
        <p className="text-base sm:text-lg font-black leading-none" style={{ color, textShadow: `0 0 12px ${glow}` }}>
          {perf}
        </p>
      </div>
    </div>
  );
}

/* ═══ Percentile Card ═══ */
function PercentileCard({ percentile, color, glow, delay }: { percentile: string; color: string; glow: string; delay: number }) {
  return (
    <div
      className="speedo-stat-card-lg relative overflow-hidden rounded-2xl border p-4 flex flex-col items-center justify-center text-center gap-2"
      style={{
        background: `linear-gradient(160deg, ${color}08, ${color}12)`,
        borderColor: `${color}25`,
        boxShadow: `0 4px 24px ${glow}`,
        animationDelay: `${delay}ms`,
        minHeight: '110px',
      }}
    >
      <div className="absolute inset-0 speedo-card-pulse" style={{ background: `radial-gradient(circle at 50% 20%, ${color}12 0%, transparent 60%)` }} />
      <div className="w-10 h-10 rounded-xl flex items-center justify-center relative z-10"
        style={{ background: `${color}18`, border: `1.5px solid ${color}30` }}>
        <TrendingUp className="w-5 h-5" style={{ color }} />
      </div>
      <div className="relative z-10">
        <p className="text-[9px] font-black uppercase tracking-[0.18em] mb-1" style={{ color: `${color}70` }}>
          Percentile
        </p>
        <p className="text-base sm:text-lg font-black leading-none" style={{ color, textShadow: `0 0 12px ${glow}` }}>
          {percentile}
        </p>
      </div>
    </div>
  );
}
