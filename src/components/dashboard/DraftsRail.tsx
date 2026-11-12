import { Play, X } from 'lucide-react';
import { toast } from 'sonner';
import { putDraft, removeDraft, useDrafts, MAX_DRAFTS, type Draft } from '../../utils/drafts';
import { getDeviceIdentity } from '../../platform/cloud/device';

const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

/** Up to 5 drafts (quizzes you left), swipe sideways. Drafts made on your other devices show up here too. */
export default function DraftsRail({ onResume }: { onResume: (id: string) => void }) {
  const drafts = useDrafts();
  if (!drafts.length) return null;
  const me = (() => { try { return getDeviceIdentity().id; } catch { return ''; } })();

  const resume = (d: Draft) => {
    const elsewhere = d.deviceId && d.deviceId !== me;
    if (elsewhere && Date.now() - d.savedAt < 3 * 60_000 && !window.confirm(`“${d.title}” was just used on ${d.deviceName}. Resume it here anyway? The newest save wins.`)) return;
    onResume(d.id);
  };
  const del = (d: Draft) => {
    removeDraft(d.id);
    toast('Draft removed', { duration: 6000, action: { label: 'Undo', onClick: () => putDraft(d) } });
  };

  return (
    <section aria-label="Drafts" className="animate-slide-up">
      <div className="mb-2 flex items-center justify-between px-1">
        <h3 className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-foreground/45">📝 Drafts <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[9px] text-foreground/55">{drafts.length}/{MAX_DRAFTS}</span></h3>
        <span className="text-[10px] text-foreground/35">Saved when you leave a quiz</span>
      </div>
      <div className="-mx-4 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="drafts-rail">
        {drafts.map(d => {
          const pct = d.total ? Math.round((d.answered / d.total) * 100) : 0;
          const elsewhere = d.deviceId && d.deviceId !== me;
          return (
            <article key={d.id} className="relative w-[84%] max-w-[330px] shrink-0 snap-start rounded-3xl border border-primary/25 bg-gradient-to-br from-primary/12 via-card to-card p-3.5 shadow-sm">
              <button type="button" aria-label={`Delete draft ${d.title}`} onClick={() => del(d)} className="absolute right-2.5 top-2.5 grid h-7 w-7 place-items-center rounded-full bg-foreground/5 text-foreground/45 active:scale-90"><X className="h-3.5 w-3.5" /></button>
              <p className="truncate pr-8 text-sm font-black text-foreground">{d.title}</p>
              <p className="mt-0.5 truncate text-[11px] text-foreground/45">{d.subject ? `${d.subject} · ` : ''}{elsewhere ? `📱 ${d.deviceName}` : '📍 This device'} · {ago(d.savedAt)}</p>
              <div className="mt-2.5 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                <span className="text-[10px] font-black text-foreground/55">{d.answered}/{d.total}</span>
              </div>
              <button type="button" onClick={() => resume(d)} className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-2xl bg-primary text-[13px] font-black text-primary-foreground shadow-md shadow-primary/25 active:scale-[0.98]"><Play className="h-3.5 w-3.5 fill-current" /> Resume</button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
