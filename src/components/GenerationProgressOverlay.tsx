import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  visible: boolean;
  label?: string;
  sublabel?: string;
}

export default function GenerationProgressOverlay({ visible, label = 'Generating', sublabel }: Props) {
  const [dots, setDots] = useState('');

  useEffect(() => {
    if (!visible) { setDots(''); return; }
    const iv = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400);
    return () => clearInterval(iv);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center pointer-events-none animate-fade-in">
      <div className="pointer-events-auto bg-card/80 backdrop-blur-2xl border border-border/60 rounded-3xl px-8 py-6 shadow-2xl shadow-black/30 flex flex-col items-center gap-3 min-w-[200px]">
        <div className="relative">
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-primary animate-spin" />
          </div>
          <div className="absolute -inset-2 rounded-3xl bg-primary/10 animate-pulse -z-10" />
        </div>
        <div className="text-center">
          <p className="text-sm font-black text-foreground">
            {label}<span className="inline-block w-6 text-left text-primary">{dots}</span>
          </p>
          {sublabel && (
            <p className="text-[10px] text-foreground/40 mt-1 max-w-[180px]">{sublabel}</p>
          )}
        </div>
        <div className="flex gap-1 mt-1">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full bg-primary/60"
              style={{
                animation: 'pulse 1.2s ease-in-out infinite',
                animationDelay: `${i * 0.15}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
