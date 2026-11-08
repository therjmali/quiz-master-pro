import { useState } from 'react';
import { Download, X, Rocket } from 'lucide-react';
import { toast } from 'sonner';
import { dismissUpdate, isDismissed, openDownload, canSelfUpdate } from '../../platform/updater';
import { useUpdateCheck } from './useUpdateCheck';

/** Slim, dismissible "new version" strip for the home screen (installed app only). */
export default function UpdateBanner() {
  const { result } = useUpdateCheck(true);
  const [hidden, setHidden] = useState(false);
  if (!canSelfUpdate() || hidden || result?.status !== 'update' || isDismissed(result.latest.version)) return null;
  const v = result.latest.version;
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-primary/30 bg-primary/10 px-3.5 py-2.5 mb-3" role="status">
      <span className="grid place-items-center w-9 h-9 rounded-2xl bg-primary/15 text-primary shrink-0"><Rocket className="w-4 h-4" aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-black text-foreground leading-tight">Update available · v{v}</p>
        <p className="text-[11px] text-foreground/55 truncate">You have v{result.current}</p>
      </div>
      <button type="button" onClick={() => { if (openDownload(result.latest)) toast('⬇️ Download started — open it and tap Install', { duration: 6000 }); }}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-black text-primary-foreground active:scale-95 transition-transform">
        <Download className="w-3.5 h-3.5" aria-hidden="true" /> Update
      </button>
      <button type="button" aria-label="Dismiss update notice" onClick={() => { dismissUpdate(v); setHidden(true); }} className="grid place-items-center w-8 h-8 rounded-full text-foreground/45 hover:bg-foreground/5">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
