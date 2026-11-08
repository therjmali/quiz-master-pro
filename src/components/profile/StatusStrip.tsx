import { readCachedResult } from '../../platform/updater';
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, HardDrive, Loader2, RefreshCw, ShieldCheck, Sparkles, UserRound } from 'lucide-react';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useSyncState } from '../../platform/cloud/syncEngine';
import { listBackups, type BackupMeta } from '../../platform/autoBackup';
import { triggerOpenSettings } from '../cloud/CloudGate';
import { appVersion } from '../../platform/native';

type Tone = 'good' | 'warn' | 'bad' | 'info' | 'busy';

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}

const TONES: Record<Tone, { ring: string; chip: string; dot: string; label: string }> = {
  good: { ring: 'border-emerald-500/25', chip: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500', label: 'Good' },
  warn: { ring: 'border-amber-500/30', chip: 'bg-amber-500/12 text-amber-600 dark:text-amber-400', dot: 'bg-amber-500', label: 'Attention' },
  bad: { ring: 'border-destructive/35', chip: 'bg-destructive/12 text-destructive', dot: 'bg-destructive', label: 'Problem' },
  info: { ring: 'border-border/25', chip: 'bg-muted/40 text-muted-foreground', dot: 'bg-muted-foreground/60', label: 'Info' },
  busy: { ring: 'border-primary/30', chip: 'bg-primary/12 text-primary', dot: 'bg-primary', label: 'Working' },
};

interface Tile { id: string; tone: Tone; icon: React.ReactNode; label: string; title: string; detail: string; section: string; pulse?: boolean }

export default function StatusStrip({ onJump }: { onJump?: (section: string) => void }) {
  const cloud = useCloudAuth();
  const sync = useSyncState();
  const [backups, setBackups] = useState<BackupMeta[]>([]);
  const [, tick] = useState(0);

  useEffect(() => {
    void listBackups().then(setBackups).catch(() => undefined);
    const id = window.setInterval(() => tick(n => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const handleTileClick = (section: string) => {
    if (onJump) onJump(section);
    else triggerOpenSettings(section);
  };

  const tiles: Tile[] = [];
  const ic = 'w-4 h-4';

  // ── Cloud ──
  const C = 'Cloud';
  if (cloud.status !== 'signed-in') {
    tiles.push({ id: 'cloud', tone: 'info', icon: <UserRound className={ic} />, label: C, title: 'Guest mode', detail: 'Saved on this device', section: 'cloud' });
  } else if (sync.phase === 'syncing') {
    tiles.push({ id: 'cloud', tone: 'busy', icon: <Loader2 className={`${ic} animate-spin`} />, label: C, title: 'Syncing…', detail: 'Updating your devices', section: 'cloud', pulse: true });
  } else if (sync.phase === 'error') {
    tiles.push({ id: 'cloud', tone: 'bad', icon: <AlertTriangle className={ic} />, label: C, title: 'Sync problem', detail: sync.error?.slice(0, 35) || 'Tap for details', section: 'cloud' });
  } else if (sync.pendingCount > 0) {
    tiles.push({ id: 'cloud', tone: 'busy', icon: <RefreshCw className={ic} />, label: C, title: `${sync.pendingCount} to upload`, detail: 'Uploads automatically', section: 'cloud', pulse: true });
  } else {
    tiles.push({ id: 'cloud', tone: 'good', icon: <Cloud className={ic} />, label: C, title: 'Synced', detail: timeAgo(sync.lastSyncAt), section: 'cloud' });
  }

  // ── Backup ──
  const latestBackup = backups[0];
  const ageDays = latestBackup ? (Date.now() - Date.parse(latestBackup.createdAt)) / 86_400_000 : Infinity;
  tiles.push(latestBackup
    ? { id: 'backup', tone: ageDays > 7 ? 'warn' : 'good', icon: <HardDrive className={ic} />, label: 'Backup', title: ageDays > 7 ? 'Backup is old' : 'Backed up', detail: timeAgo(latestBackup.createdAt), section: 'backup' }
    : { id: 'backup', tone: 'warn', icon: <HardDrive className={ic} />, label: 'Backup', title: 'No backup yet', detail: 'Tap to configure', section: 'backup' });

  // ── Storage ──
  tiles.push({ id: 'storage', tone: 'good', icon: <ShieldCheck className={ic} />, label: 'Storage', title: 'Protected', detail: 'Safe on device', section: 'data' });

  // ── App ──
  const upd = readCachedResult();
  const appDetail = upd?.status === 'update' ? `v${upd.latest.version} available` : upd?.status === 'latest' ? 'Latest version' : 'Installed version';
  tiles.push({ id: 'version', tone: 'info', icon: <Sparkles className={ic} />, label: 'App', title: `v${appVersion()}`, detail: appDetail, section: 'about' });

  const rank = (t: Tone) => (t === 'bad' ? 3 : t === 'warn' ? 2 : t === 'busy' ? 1 : 0);
  const worst = tiles.reduce<Tone>((w, t) => (rank(t.tone) > rank(w) ? t.tone : w), 'good');
  const verdict = worst === 'bad'
    ? { tone: 'bad' as Tone, icon: <AlertTriangle className="w-4 h-4" />, title: 'Needs attention', sub: 'Something needs a quick look — tap the highlighted tile.' }
    : worst === 'warn'
      ? { tone: 'warn' as Tone, icon: <AlertTriangle className="w-4 h-4" />, title: 'Almost there', sub: 'A small step will make everything safe.' }
      : worst === 'busy'
        ? { tone: 'busy' as Tone, icon: <Loader2 className="w-4 h-4 animate-spin" />, title: 'Working…', sub: 'Your data is being updated.' }
        : { tone: 'good' as Tone, icon: <CheckCircle2 className="w-4 h-4" />, title: 'All systems healthy', sub: 'Your data is saved, backed up and protected.' };
  const V = TONES[verdict.tone];

  return (
    <div className="glass-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-white/10 space-y-3 mb-4">
      {/* Overall verdict */}
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${V.ring} ${V.chip}`}>
          {verdict.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-black text-foreground tracking-tight">{verdict.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">{verdict.sub}</p>
        </div>
      </div>

      {/* 4 Status tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
        {tiles.map(tile => {
          const T = TONES[tile.tone];
          return (
            <button
              key={tile.id}
              type="button"
              onClick={() => handleTileClick(tile.section)}
              className={`text-left p-3 rounded-xl border ${T.ring} bg-card/40 hover:bg-card/70 transition-all hover:scale-[1.02] active:scale-[0.98] group`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">{tile.label}</span>
                <span className={`w-2 h-2 rounded-full ${T.dot} ${tile.pulse ? 'animate-ping' : ''}`} />
              </div>
              <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">{tile.title}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{tile.detail}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
