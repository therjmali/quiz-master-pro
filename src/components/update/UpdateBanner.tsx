import { useState } from 'react';
import { Download, Loader2, Rocket, Smartphone, X } from 'lucide-react';
import {
  OPEN_UPDATES_EVENT, canSelfUpdate, dismissUpdate, hasUpdate, installDownloadedUpdate, isDismissed, isNativeUpdater, openDownload, startNativeUpdate, useUpdateState,
} from '../../platform/updater';

/** Slim, dismissible "new version" strip for the home screen (installed app only). One tap downloads and installs in the app. */
export default function UpdateBanner() {
  const u = useUpdateState();
  const [hidden, setHidden] = useState(false);
  const info = u.info;
  const active = u.phase === 'downloading' || u.phase === 'verifying' || u.phase === 'ready' || u.phase === 'installing' || u.phase === 'needs-permission';
  if (!canSelfUpdate() || hidden || !info || !hasUpdate(u)) return null;
  if (!active && isDismissed(info.version)) return null;
  const pct = Math.round(u.progress * 100);
  const openPanel = () => window.dispatchEvent(new Event(OPEN_UPDATES_EVENT));

  const action = u.phase === 'ready' ? { label: 'Install', icon: <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />, run: installDownloadedUpdate }
    : u.phase === 'needs-permission' ? { label: 'Allow', icon: <Smartphone className="w-3.5 h-3.5" aria-hidden="true" />, run: openPanel }
    : u.phase === 'available' || u.phase === 'error' ? { label: 'Update', icon: <Download className="w-3.5 h-3.5" aria-hidden="true" />, run: () => { if (isNativeUpdater() && info.apkUrl) startNativeUpdate(); else if (!openDownload(info)) openPanel(); } }
    : null;

  return (
    <div className="rounded-3xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 mb-3" role="status">
      <div className="flex items-center gap-3">
        <span className="grid place-items-center w-9 h-9 rounded-2xl bg-primary/15 text-primary shrink-0">
          {u.phase === 'downloading' || u.phase === 'verifying' ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Rocket className="w-4 h-4" aria-hidden="true" />}
        </span>
        <button type="button" onClick={openPanel} className="min-w-0 flex-1 text-left">
          <p className="text-sm font-black text-foreground leading-tight">
            {u.phase === 'downloading' ? `Downloading v${info.version} · ${pct}%` : u.phase === 'verifying' ? 'Verifying…' : u.phase === 'ready' ? `v${info.version} is ready to install` : `Update available · v${info.version}`}
          </p>
          <p className="text-[11px] text-foreground/55 truncate">You have v{u.current} · tap for details</p>
        </button>
        {action && (
          <button type="button" onClick={action.run} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground active:scale-95 transition-transform">
            {action.icon} {action.label}
          </button>
        )}
        {!active && (
          <button type="button" aria-label="Dismiss update notice" onClick={() => { dismissUpdate(info.version); setHidden(true); }} className="grid place-items-center w-8 h-8 rounded-full text-foreground/45 hover:bg-foreground/5">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      {u.phase === 'downloading' && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}
