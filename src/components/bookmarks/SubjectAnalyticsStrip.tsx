import { BookmarkStats } from './bookmarkAnalytics';

interface Props {
  stats: BookmarkStats;
  showRing?: boolean;
}

function MiniRing({ pct }: { pct: number }) {
  const r = 22, c = 2 * Math.PI * r, offset = c - (pct / 100) * c;
  const clr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const txt = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="relative w-16 h-16 flex-shrink-0">
      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="3" />
        <circle cx="24" cy="24" r={r} fill="none" stroke={clr} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-700" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-sm font-black ${txt}`}>{pct}%</span>
    </div>
  );
}

function ProgressBar({ label, value, total, colorCls }: { label: string; value: number; total: number; colorCls: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold text-foreground/40 w-14 text-right">{label}</span>
      <div className="flex-1 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${colorCls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-black text-foreground/50 w-6 text-right">{value}</span>
    </div>
  );
}

export default function SubjectAnalyticsStrip({ stats, showRing = true }: Props) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-3">
      <div className="flex items-center gap-4">
        {showRing && <MiniRing pct={stats.accuracy} />}
        <div className="flex-1 space-y-1.5">
          <ProgressBar label="Correct" value={stats.correct} total={stats.total} colorCls="bg-emerald-500" />
          <ProgressBar label="Wrong" value={stats.wrong} total={stats.total} colorCls="bg-red-500" />
          <ProgressBar label="Skipped" value={stats.skipped} total={stats.total} colorCls="bg-amber-500" />
        </div>
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-border">
        <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-400">🟢 Easy: {stats.easy}</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-400">🟡 Medium: {stats.medium}</span>
        <span className="flex items-center gap-1 text-[10px] font-bold text-red-400">🔴 Hard: {stats.hard}</span>
      </div>
    </div>
  );
}
