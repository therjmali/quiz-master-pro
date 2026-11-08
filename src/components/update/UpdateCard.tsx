import { useState } from 'react';
import { Download, RefreshCw, CheckCircle2, WifiOff, AlertTriangle, ChevronDown, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { appVersion } from '../../platform/native';
import { openDownload, canSelfUpdate } from '../../platform/updater';
import { useUpdateCheck } from './useUpdateCheck';

const mb = (b: number | null) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Profile card: current version, "Check for updates", and a one-tap APK download. */
export default function UpdateCard() {
  const { result, checking, check } = useUpdateCheck(true);
  const [open, setOpen] = useState(false);
  const native = canSelfUpdate();
  const update = result?.status === 'update' ? result : null;

  const onCheck = async () => {
    const r = await check();
    if (!r) return;
    if (r.status === 'update') toast.success(`🎉 Version ${r.latest.version} is available`);
    else if (r.status === 'latest') toast.success('✅ You have the latest version');
    else if (r.status === 'offline') toast.error('You are offline — updates need internet');
    else toast.error(r.message);
  };

  const onDownload = () => {
    if (!update) return;
    if (!openDownload(update.latest)) toast.error('Could not open the download — open the releases page in your browser.');
    else toast('⬇️ Download started — open it when it finishes and tap Install', { duration: 6000 });
  };

  return (
    <section className={`glass-card p-4 sm:p-5 rounded-2xl sm:rounded-3xl border space-y-3 mb-4 ${update ? 'border-primary/40' : 'border-white/10'}`} aria-label="App updates">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-2xl grid place-items-center shrink-0 border ${update ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-foreground/5 border-foreground/10 text-foreground/60'}`}>
          {update ? <Rocket className="w-5 h-5" /> : result?.status === 'offline' ? <WifiOff className="w-5 h-5" /> : result?.status === 'error' ? <AlertTriangle className="w-5 h-5" /> : <CheckCircle2 className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground tracking-tight">
            {update ? `Update available · v${update.latest.version}` : 'App updates'}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {!result ? `You have v${appVersion()} · tap to check`
              : result.status === 'update' ? `You have v${result.current}${update?.latest.sizeBytes ? ` · ${mb(update.latest.sizeBytes)}` : ''}`
              : result.status === 'latest' ? `v${result.current} is the latest · checked ${ago(result.checkedAt)}`
              : result.status === 'offline' ? 'Offline — updates need internet'
              : result.message}
          </p>
        </div>
        <button type="button" onClick={onCheck} disabled={checking} aria-label="Check for updates" className="qh-btn !w-10 !h-10">
          <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {update && (
        <>
          <button type="button" onClick={onDownload} className="cq-cta is-ready !min-h-[56px] !max-w-none w-full">
            <span className="cq-cta-icon" aria-hidden="true"><Download className="w-5 h-5" /></span>
            <span className="cq-cta-text">
              <span className="cq-cta-title">Download v{update.latest.version}</span>
              <span className="cq-cta-sub">{native ? 'Android asks to install — your data stays' : 'Android app (APK)'}</span>
            </span>
          </button>
          {update.latest.notes && (
            <div>
              <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open} className="flex items-center gap-1.5 text-xs font-bold text-foreground/60">
                What's new <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>
              {open && <p className="mt-2 text-xs leading-relaxed text-foreground/65 whitespace-pre-wrap break-words max-h-48 overflow-y-auto">{update.latest.notes}</p>}
            </div>
          )}
        </>
      )}

      {native && (
        <p className="text-[11px] leading-relaxed text-foreground/45">
          Updates install over the current app and keep your data. If Android says <em>“package conflicts”</em>, this copy was signed with an older key — back up in Backup, uninstall once, then install the new APK (it only happens once).
        </p>
      )}
    </section>
  );
}
