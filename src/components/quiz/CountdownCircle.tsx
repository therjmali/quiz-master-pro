interface CountdownCircleProps {
  timeLeft: number;
  totalTime: number;
}

export default function CountdownCircle({ timeLeft, totalTime }: CountdownCircleProps) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const pct = totalTime > 0 ? Math.max(0, timeLeft / totalTime) : 0;
  const offset = circumference - circumference * pct;

  const isLow = pct <= 0.25;
  const isMid = pct <= 0.5 && pct > 0.25;
  const color = isLow ? '#ef4444' : isMid ? '#f59e0b' : '#3b82f6';
  const glowColor = isLow ? 'rgba(239,68,68,0.4)' : isMid ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.25)';

  // Format as MM:SS when >= 60s, otherwise just seconds
  const display = timeLeft >= 60
    ? `${Math.floor(timeLeft / 60)}:${(timeLeft % 60).toString().padStart(2, '0')}`
    : String(timeLeft);

  const fontSize = timeLeft >= 60 ? '10' : '16';

  const spokenLabel = timeLeft >= 60
    ? `${Math.floor(timeLeft / 60)} minutes ${timeLeft % 60} seconds remaining`
    : `${timeLeft} seconds remaining`;

  return (
    <div
      className="relative w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center rounded-full bg-background"
      style={{ boxShadow: `0 0 20px ${glowColor}, inset 0 0 10px rgba(0,0,0,0.5)` }}
      role="timer"
      aria-live={isLow ? 'assertive' : 'polite'}
      aria-label={spokenLabel}
    >
      <svg className="w-full h-full -rotate-90 absolute inset-0" viewBox="0 0 60 60" aria-hidden="true">
        {/* Background ring */}
        <circle cx="30" cy="30" r={radius} stroke="currentColor" className="text-foreground/5" strokeWidth="5" fill="none" />
        {/* Progress ring */}
        <circle
          cx="30" cy="30" r={radius}
          stroke={color}
          strokeWidth="5"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 1s linear, stroke 0.4s ease',
            filter: `drop-shadow(0 0 6px ${color}90)`,
          }}
        />
      </svg>
      <span
        className={`relative z-10 font-black tabular-nums leading-none tracking-tight ${isLow ? 'animate-pulse' : ''}`}
        style={{ fontSize: `${fontSize}px`, color: isLow ? '#ef4444' : isMid ? '#f59e0b' : 'hsl(var(--foreground))' }}
        aria-hidden="true"
      >
        {display}
      </span>
    </div>
  );
}
