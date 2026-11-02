import { ChevronRight } from 'lucide-react';
import { SubjectGroup, BookmarkStats } from './bookmarkAnalytics';

interface Props {
  subjects: SubjectGroup[];
  globalStats: BookmarkStats;
  onSelectSubject: (subject: string) => void;
}

function AccuracyDonut({ pct, size = 48 }: { pct: number; size?: number }) {
  const r = (size / 2) - 4, c = 2 * Math.PI * r, offset = c - (pct / 100) * c;
  const clr = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const txt = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="3" />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={clr} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-700" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center font-black ${txt}`} style={{ fontSize: size * 0.26 }}>{pct}%</span>
    </div>
  );
}

function GlobalStatsDashboard({ stats }: { stats: BookmarkStats }) {
  const items = [
    { label: 'Total', value: stats.total, cls: 'text-primary', bg: 'bg-primary/10 border-primary/20' },
    { label: 'Correct', value: stats.correct, cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
    { label: 'Wrong', value: stats.wrong, cls: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20' },
    { label: 'Skipped', value: stats.skipped, cls: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  ];
  return (
    <div className="flex items-center gap-3 mb-4">
      <AccuracyDonut pct={stats.accuracy} size={60} />
      <div className="flex-1 grid grid-cols-4 gap-1.5">
        {items.map(s => (
          <div key={s.label} className={`rounded-xl border p-2.5 text-center ${s.bg}`}>
            <div className={`text-lg font-black ${s.cls}`}>{s.value}</div>
            <div className="text-[7px] font-bold text-foreground/30 uppercase tracking-widest">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SubjectCard({ group, onSelect }: { group: SubjectGroup; onSelect: () => void }) {
  const { stats } = group;
  const pct = stats.accuracy;
  const ringColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const accClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';

  return (
    <button onClick={onSelect}
      className="w-full bg-card border border-border rounded-2xl p-4 hover:border-foreground/15 hover:shadow-md hover:shadow-black/5 transition-all active:scale-[0.98] text-left group">
      <div className="flex items-center gap-3.5">
        <div className="w-13 h-13 rounded-2xl bg-primary/8 border border-primary/10 flex items-center justify-center text-2xl flex-shrink-0 shadow-sm" style={{ width: 52, height: 52 }}>
          {group.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-black text-foreground truncate">{group.subject}</p>
            <span className={`text-[10px] font-black ${accClr}`}>{pct}%</span>
          </div>
          <p className="text-[10px] text-foreground/35 font-medium mt-0.5">{stats.total} bookmarks · {group.quizzes.length} quiz{group.quizzes.length !== 1 ? 'zes' : ''}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/15">✓{stats.correct}</span>
            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md border border-red-500/15">✗{stats.wrong}</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md border border-amber-500/15">⏭{stats.skipped}</span>
            <span className="text-foreground/8 mx-0.5">|</span>
            {stats.easy > 0 && <span className="text-[8px] font-bold text-emerald-400/60">🟢{stats.easy}</span>}
            {stats.medium > 0 && <span className="text-[8px] font-bold text-amber-400/60">🟡{stats.medium}</span>}
            {stats.hard > 0 && <span className="text-[8px] font-bold text-red-400/60">🔴{stats.hard}</span>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-foreground/15 group-hover:text-foreground/40 flex-shrink-0 transition-colors" />
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: ringColor }} />
      </div>
    </button>
  );
}

export default function SubjectListView({ subjects, globalStats, onSelectSubject }: Props) {
  return (
    <div className="animate-fade-in">
      <GlobalStatsDashboard stats={globalStats} />

      {/* Subject distribution bar */}
      {subjects.length > 1 && (
        <div className="flex gap-0.5 mb-4 h-2.5 rounded-full overflow-hidden bg-foreground/5 border border-border">
          {subjects.map((s, i) => {
            const pct = (s.stats.total / globalStats.total) * 100;
            const colors = ['bg-primary', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500', 'bg-violet-500', 'bg-cyan-500'];
            return <div key={s.subject} className={`${colors[i % colors.length]} first:rounded-l-full last:rounded-r-full transition-all`} style={{ width: `${pct}%` }} title={`${s.subject}: ${s.stats.total}`} />;
          })}
        </div>
      )}

      <p className="text-[10px] font-black text-foreground/25 uppercase tracking-widest mb-2.5 px-1">
        {subjects.length} Subject{subjects.length !== 1 ? 's' : ''}
      </p>

      <div className="space-y-2">
        {subjects.map(group => (
          <SubjectCard key={group.subject} group={group} onSelect={() => onSelectSubject(group.subject)} />
        ))}
      </div>
    </div>
  );
}
