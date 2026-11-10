import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowUpCircle, CheckCircle2, ChevronDown, Download, ExternalLink, Loader2, RefreshCw, RotateCcw, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  RELEASES_PAGE, dismissUpdateError, formatBytes, hasUpdate, installDownloadedUpdate, isBusyPhase, isNativeUpdater,
  openDownload, openInstallPermission, runUpdateCheck, startNativeUpdate, useUpdateState,
} from '../../platform/updater';
import { applyUpdate, checkForUpdate as checkWebUpdate, promptInstall, usePwaState } from '../../platform/pwa';
import { isNative } from '../../platform/native';

const ago = (t: number | null) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Premium "App updates" card: check -> download -> verify -> install, all inside the app (installed Android app). */
export default function UpdatePanel() {
  const u = useUpdateState();
  const pwa = usePwaState();
  const native = isNativeUpdater();
  const installedApp = isNative();
  const [notesOpen, setNotesOpen] = useState(false);
  const busy = isBusyPhase(u.phase);
  const pct = Math.round(u.progress * 100);
  const newer = hasUpdate(u);
  const info = u.info;

  // Quietly refresh when the panel opens (installed app only; the check itself is throttled by the platform layer).
  useEffect(() => { if (installedApp && u.phase === 'idle') void runUpdateCheck({ silent: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async () => {
    if (installedApp) {
      const s = await runUpdateCheck();
      if (s.phase === 'available') toast.success(`Version ${s.info?.version} is available`);
      else if (s.phase === 'uptodate') toast.success('You have the latest version');
    } else {
      const r = await checkWebUpdate();
      toast[r === 'update-ready' ? 'success' : 'info'](r === 'update-ready' ? 'A new version is ready' : r === 'unsupported' ? 'Updates are managed by your browser' : "You're on the latest version");
    }
  };

  const headline =
    u.phase === 'checking' ? 'Checking for updates…'
    : u.phase === 'downloading' ? 'Downloading update…'
    : u.phase === 'verifying' ? 'Verifying the download…'
    : u.phase === 'ready' || u.phase === 'installing' ? 'Ready to install'
    : u.phase === 'needs-permission' ? 'One permission needed'
    : u.phase === 'offline' ? 'You are offline'
    : u.phase === 'error' ? 'Update problem'
    : newer ? `Version ${info?.version} is available`
    : u.phase === 'uptodate' ? "You're up to date"
    : 'App updates';

  const tone = u.phase === 'error' ? 'bad' : u.phase === 'uptodate' ? 'good' : u.phase === 'offline' ? 'warn' : 'primary';
  const toneIcon = {
    bad: 'bg-red-500/15 text-red-500 border-red-500/25',
    good: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25',
    warn: 'bg-amber-500/15 text-amber-500 border-amber-500/25',
    primary: 'bg-primary/15 text-primary border-primary/25',
  }[tone];

  const btn = 'flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl text-[13px] font-black active:scale-[0.98] transition-transform disabled:opacity-50';

  return (
    <div className="space-y-3" id="qm-update-panel">
      <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-4">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${toneIcon}`}>
            {busy ? <Loader2 className="h-5 w-5 animate-spin" />
              : u.phase === 'uptodate' ? <CheckCircle2 className="h-5 w-5" />
              : u.phase === 'error' ? <AlertTriangle className="h-5 w-5" />
              : u.phase === 'offline' ? <WifiOff className="h-5 w-5" />
              : <ArrowUpCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-base font-black leading-tight text-foreground">{headline}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-foreground/55">
              <span className="rounded-full border border-border bg-card/60 px-2 py-0.5 font-bold text-foreground">Installed v{u.current}</span>
              {newer && info && <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 font-black text-primary">New v{info.version}{info.sizeBytes ? ` · ${formatBytes(info.sizeBytes)}` : ''}</span>}
              {u.checkedAt ? <span>checked {ago(u.checkedAt)}</span> : null}
            </div>
          </div>
        </div>

        {(u.phase === 'downloading' || u.phase === 'verifying') && (
          <div className="relative mt-4">
            <div className="h-2.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Download progress">
              <div className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-[width] duration-200" style={{ width: `${u.phase === 'verifying' ? 100 : pct}%` }} />
            </div>
            <p className="mt-1.5 flex justify-between text-[10px] font-bold text-foreground/55">
              <span>{u.phase === 'verifying' ? 'Checking fingerprint, package and signature' : `${pct}%`}</span>
              <span>{formatBytes(u.doneBytes)}{u.totalBytes ? ` / ${formatBytes(u.totalBytes)}` : ''}</span>
            </p>
          </div>
        )}
        {u.error && <p className="relative mt-3 rounded-xl bg-red-500/10 p-2.5 text-[11px] leading-snug text-red-600 dark:text-red-300" role="alert">{u.error}</p>}
      </div>

      {u.phase === 'needs-permission' && (
        <div className="rounded-3xl border border-amber-500/35 bg-amber-500/10 p-4 text-[12px] leading-relaxed text-foreground">
          Android needs your OK to install updates from this app. Tap <b>Open settings</b>, switch on <b>Allow from this source</b>, come back and tap <b>Install now</b>.
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={openInstallPermission} className="h-11 flex-1 rounded-2xl bg-amber-500 text-[12px] font-black text-black active:scale-[0.98]">Open settings</button>
            <button type="button" onClick={installDownloadedUpdate} className="h-11 flex-1 rounded-2xl bg-primary text-[12px] font-black text-primary-foreground active:scale-[0.98]">Install now</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {installedApp && newer && u.phase === 'available' && native && info?.apkUrl && (
          <button type="button" onClick={startNativeUpdate} className={`${btn} bg-primary text-primary-foreground`}>
            <Download className="h-4 w-4" /> Download &amp; install
          </button>
        )}
        {u.phase === 'ready' && (
          <button type="button" onClick={installDownloadedUpdate} className={`${btn} bg-primary text-primary-foreground`}>
            <Smartphone className="h-4 w-4" /> Install now
          </button>
        )}
        {!installedApp && pwa.updateReady && (
          <button type="button" onClick={applyUpdate} className={`${btn} bg-primary text-primary-foreground`}>
            <RotateCcw className="h-4 w-4" /> Update &amp; reload
          </button>
        )}
        {!installedApp && pwa.canInstall && (
          <button type="button" onClick={() => void promptInstall()} className={`${btn} border border-border bg-card text-foreground`}>
            <Download className="h-4 w-4" /> Install app
          </button>
        )}
        {u.phase === 'error' && (
          <button type="button" onClick={dismissUpdateError} className={`${btn} border border-border bg-card text-foreground`}>Dismiss</button>
        )}
        {!busy && u.phase !== 'ready' && (
          <button type="button" onClick={() => void check()} disabled={installedApp ? false : pwa.checking} className={`${btn} border border-border bg-card text-foreground`}>
            <RefreshCw className={`h-4 w-4 ${pwa.checking ? 'animate-spin' : ''}`} /> Check for updates
          </button>
        )}
        {installedApp && !native && newer && info && (
          <button type="button" onClick={() => { if (!openDownload(info)) toast.error('Could not open the download page.'); }} className={`${btn} bg-primary text-primary-foreground`}>
            <Download className="h-4 w-4" /> Open download page
          </button>
        )}
        {(u.phase === 'error' || (newer && u.phase === 'available')) && (
          <a href={info?.pageUrl ?? RELEASES_PAGE} target="_blank" rel="noopener noreferrer" className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-border px-4 text-[12px] font-bold text-foreground/60">
            Release page <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>

      {newer && info?.notes && (
        <div className="rounded-3xl border border-border bg-card/60 p-4">
          <button type="button" onClick={() => setNotesOpen(o => !o)} aria-expanded={notesOpen} className="flex w-full items-center justify-between text-left">
            <span className="text-[13px] font-extrabold text-foreground">What's new in v{info.version}</span>
            <ChevronDown className={`h-4 w-4 text-foreground/45 transition-transform ${notesOpen ? 'rotate-180' : ''}`} />
          </button>
          {notesOpen && <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-foreground/65">{info.notes}</pre>}
        </div>
      )}

      <div className="flex items-start gap-2 rounded-2xl border border-border bg-foreground/[0.03] p-3 text-[11px] leading-relaxed text-foreground/55">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
        <span>
          {installedApp
            ? 'Updates come only from this project’s official GitHub releases. Before installing, the app checks the file’s SHA-256 fingerprint, package name, version and signing key. Your quizzes and settings stay on the device. If Android says “package conflicts”, this copy was signed with an older key: back up in Data & Trash, uninstall once, install the new APK, then restore.'
            : 'On the web and the installed web app, new versions download in the background and apply when you tap Update & reload. The Android app updates itself from GitHub releases.'}
        </span>
      </div>
    </div>
  );
}
