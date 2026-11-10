import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, ChevronRight, CloudCog, Loader2, LogIn, Pencil, Rocket, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAccount } from '../../platform/cloud/useAccount';
import { useCloudAuth } from '../../platform/cloud/authStore';
import { useProfileStore } from '../../hooks/useProfileStore';
import { useUpdateState, hasUpdate } from '../../platform/updater';
import { fileToAvatarDataUrl, AvatarError } from '../../utils/avatarImage';
import { calculateStreak } from '../../utils/scoring';
import { computeRank } from '../../utils/rank';
import type { AppTheme, QuizResult } from '../../types/quiz';
import SettingsTab from '../profile/SettingsTab';
import AwardsGrid from '../profile/AwardsGrid';
import NotesTab from '../profile/NotesTab';
import TemplatesTab from '../profile/TemplatesTab';
import TrashTab from '../profile/TrashTab';
import ApiKeysTab from '../profile/ApiKeysTab';
import CloudDataManager from '../CloudDataManager';
import { requestOpenSettingsSection } from '../cloud/CloudGate';
import type { ProfileTabLink } from '../profile/settings/sectionsB';

export type SettingsView = 'main' | ProfileTabLink;
const SUB_TITLES: Record<ProfileTabLink, string> = { apikeys: 'API keys', templates: 'Quiz templates', trash: 'Trash', awards: 'Awards', notes: 'AI notes' };
const EMOJI_OPTIONS = ['🧑‍⚕️', '🧑‍💻', '🧑‍🎓', '👩‍🎓', '🧑‍🔬', '🧑‍🎨', '🦸', '🧙', '🦊', '🐼', '🦁', '🌟', '🔥', '⚡', '🎯', '💎', '🚀', '🌈'];

interface Props {
  history: QuizResult[];
  rationaleCache: Record<string, string>;
  theme: AppTheme;
  onThemeChange: (t: AppTheme) => void;
  onBack: () => void;
  onSignIn: () => void;
  onHistoryChanged?: () => void;
  initialView?: string;
  onViewChange?: (view: SettingsView) => void;
}

const isSub = (v: string | undefined): v is ProfileTabLink => !!v && v in SUB_TITLES;

/** Settings hub, opened from the profile photo at the top right. Account card, quick jumps, then every setting. */
export default function SettingsScreen({ history, rationaleCache, theme, onThemeChange, onBack, onSignIn, onHistoryChanged, initialView, onViewChange }: Props) {
  const account = useAccount();
  const cloudAuth = useCloudAuth();
  const { profile, update } = useProfileStore();
  const upd = useUpdateState();
  const [view, setViewState] = useState<SettingsView>(isSub(initialView) ? initialView : 'main');
  const setView = useCallback((v: SettingsView) => { setViewState(v); onViewChange?.(v); window.scrollTo({ top: 0 }); }, [onViewChange]);

  const [editingName, setEditingName] = useState(false);
  const [nameVal, setNameVal] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cloudOpen, setCloudOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const authName = cloudAuth.user?.name || account.name || 'Student';
  const displayName = profile.displayName || authName;
  const streak = useMemo(() => calculateStreak(history.map(r => r.timestamp)), [history]);
  const avgAcc = useMemo(() => {
    let c = 0, w = 0;
    history.forEach(r => { c += r.correct || 0; w += r.wrong || 0; });
    return c + w > 0 ? Math.round((c / (c + w)) * 100) : 0;
  }, [history]);
  const rank = computeRank(history.length, avgAcc);
  const updateReady = hasUpdate(upd);

  const saveName = () => {
    const t = nameVal.trim().slice(0, 24);
    if (t) { update({ displayName: t }); toast.success('Name updated'); }
    setEditingName(false);
  };

  const onPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoBusy(true);
    try { update({ avatarUrl: await fileToAvatarDataUrl(file) }); toast.success('Profile photo updated'); }
    catch (err) { toast.error(err instanceof AvatarError ? err.message : 'Could not use that photo. Try another.'); }
    finally { setPhotoBusy(false); }
  };

  const jump = (section: string) => requestOpenSettingsSection(section);

  const tiles: { key: string; label: string; sub: string; icon: string; onClick: () => void; badge?: string }[] = [
    { key: 'updates', label: 'App updates', sub: updateReady ? `v${upd.info?.version} ready` : `v${upd.current}`, icon: '🚀', onClick: () => jump('updates'), badge: updateReady ? 'NEW' : undefined },
    { key: 'cloud', label: 'Cloud & sync', sub: account.signedIn ? 'Signed in' : 'Guest', icon: '☁️', onClick: () => jump('cloud') },
    { key: 'backup', label: 'Backups', sub: 'Auto & restore', icon: '💾', onClick: () => jump('backup') },
    { key: 'trash', label: 'Trash', sub: 'Recover quizzes', icon: '🗑️', onClick: () => setView('trash') },
  ];

  if (view !== 'main') {
    return (
      <div className="w-full pb-4 animate-fade-in" data-screen="settings-sub">
        <div className="flex items-center gap-3 mb-4 px-1">
          <button type="button" onClick={() => setView('main')} aria-label="Back to settings" className="grid place-items-center w-10 h-10 rounded-2xl border border-border bg-card/60 text-foreground/70 active:scale-95 transition-transform">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <p className="text-[10px] font-black text-foreground/35 uppercase tracking-[0.12em]">Settings</p>
            <h2 className="text-xl font-black text-foreground leading-tight">{SUB_TITLES[view]}</h2>
          </div>
        </div>
        {view === 'awards' && <AwardsGrid history={history} />}
        {view === 'notes' && <NotesTab history={history} rationaleCache={rationaleCache} />}
        {view === 'templates' && <TemplatesTab />}
        {view === 'trash' && <TrashTab onHistoryChanged={() => onHistoryChanged?.()} />}
        {view === 'apikeys' && <ApiKeysTab />}
      </div>
    );
  }

  return (
    <div className="w-full pb-4 animate-fade-in" data-screen="settings">
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => void onPhoto(e)} aria-label="Choose profile photo" />

      <div className="flex items-center gap-3 mb-4 px-1">
        <button type="button" onClick={onBack} aria-label="Back" className="grid place-items-center w-10 h-10 rounded-2xl border border-border bg-card/60 text-foreground/70 active:scale-95 transition-transform">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black text-foreground/35 uppercase tracking-[0.12em]">Account</p>
          <h2 className="text-xl font-black text-foreground leading-tight">Settings</h2>
        </div>
        <span className="text-[10px] font-black px-2.5 py-1 rounded-full border border-border bg-card/60 text-foreground/50">v{upd.current}</span>
      </div>

      {/* Account card */}
      <section className="glass-card relative overflow-hidden p-4 sm:p-5 mb-3" aria-label="Your account">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />
        <div className="relative flex items-center gap-4">
          <div className="relative shrink-0">
            <div className="w-20 h-20 rounded-3xl overflow-hidden border-2 border-primary/40 shadow-lg shadow-primary/20 bg-gradient-to-br from-primary/60 to-accent/60">
              {profile.avatarUrl
                ? <img src={profile.avatarUrl} alt="Your profile photo" className="w-full h-full object-cover" />
                : <span className="w-full h-full flex items-center justify-center text-4xl">{profile.avatarEmoji}</span>}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={photoBusy} aria-label="Change profile photo"
              className="absolute -bottom-1.5 -right-1.5 w-8 h-8 rounded-full bg-primary border-2 border-background grid place-items-center shadow-lg active:scale-90 transition-transform">
              {photoBusy ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" /> : <Camera className="w-3.5 h-3.5 text-white" />}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <div className="flex items-center gap-2">
                <input autoFocus value={nameVal} onChange={e => setNameVal(e.target.value)} maxLength={24} aria-label="Display name"
                  onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') setEditingName(false); }}
                  className="flex-1 min-w-0 bg-foreground/10 border border-primary/40 rounded-lg px-2 py-1 text-lg font-black text-foreground focus:outline-none" />
                <button type="button" onClick={saveName} aria-label="Save name" className="text-emerald-500"><Check className="w-5 h-5" /></button>
                <button type="button" onClick={() => setEditingName(false)} aria-label="Cancel" className="text-foreground/40"><X className="w-5 h-5" /></button>
              </div>
            ) : (
              <button type="button" onClick={() => { setNameVal(displayName); setEditingName(true); }} className="group flex items-center gap-2 text-left max-w-full">
                <span className="text-xl font-black text-foreground truncate">{displayName}</span>
                <Pencil className="w-3.5 h-3.5 text-foreground/25 group-hover:text-foreground/60 shrink-0" />
              </button>
            )}
            <p className="mt-0.5 text-xs truncate flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${account.signedIn ? 'bg-emerald-500 animate-pulse' : 'bg-muted-foreground/40'}`} />
              <span className={account.signedIn ? 'text-emerald-500 font-bold' : 'text-foreground/45'}>{account.signedIn ? (account.email || 'Cloud synced') : 'Guest · saved on this device'}</span>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="bg-gradient-to-r from-primary to-accent text-[10px] uppercase tracking-widest font-bold px-3 py-1 rounded-full text-white">{rank.label}</span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-border bg-foreground/5 text-foreground/60">🔥 {streak}d</span>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full border border-border bg-foreground/5 text-foreground/60">{history.length} quizzes</span>
            </div>
          </div>
        </div>

        <div className="relative mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setEmojiOpen(o => !o)} aria-expanded={emojiOpen}
            className="flex items-center gap-1.5 bg-foreground/[0.04] border border-border text-foreground/60 text-xs font-bold py-2.5 px-3.5 rounded-xl active:scale-95 transition-transform">
            {profile.avatarEmoji} Emoji avatar
          </button>
          {profile.avatarUrl && (
            <button type="button" onClick={() => { update({ avatarUrl: '' }); toast.success('Photo removed'); }}
              className="flex items-center gap-1.5 bg-foreground/[0.04] border border-border text-foreground/60 text-xs font-bold py-2.5 px-3.5 rounded-xl active:scale-95 transition-transform">
              <Trash2 className="w-3.5 h-3.5" /> Remove photo
            </button>
          )}
          <button type="button" onClick={() => setCloudOpen(true)}
            className="flex items-center gap-1.5 bg-foreground/[0.04] border border-border text-foreground/60 text-xs font-bold py-2.5 px-3.5 rounded-xl active:scale-95 transition-transform">
            <CloudCog className="w-3.5 h-3.5" /> Cloud data
          </button>
          {!account.signedIn && (
            <button type="button" onClick={onSignIn}
              className="flex items-center gap-1.5 bg-primary text-primary-foreground text-xs font-black py-2.5 px-4 rounded-xl active:scale-95 transition-transform">
              <LogIn className="w-3.5 h-3.5" /> Sign in
            </button>
          )}
        </div>

        {emojiOpen && (
          <div className="relative mt-3 p-3 bg-foreground/[0.04] rounded-2xl border border-border">
            <p className="text-[9px] text-foreground/40 uppercase font-bold tracking-widest mb-2">Choose avatar emoji</p>
            <div className="flex flex-wrap gap-1.5">
              {EMOJI_OPTIONS.map(e => (
                <button key={e} type="button" onClick={() => { update({ avatarEmoji: e, avatarUrl: '' }); setEmojiOpen(false); toast.success('Avatar updated'); }}
                  className={`text-xl p-1.5 rounded-lg transition-all active:scale-90 ${profile.avatarEmoji === e && !profile.avatarUrl ? 'bg-primary/20 ring-1 ring-primary/40' : 'hover:bg-foreground/10'}`} aria-label={`Use ${e}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Quick jumps */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4" role="list" aria-label="Quick settings">
        {tiles.map(t => (
          <button key={t.key} type="button" role="listitem" onClick={t.onClick}
            className={`relative text-left p-3 rounded-2xl border bg-card/50 hover:bg-card/80 active:scale-[0.98] transition-all ${t.badge ? 'border-primary/40' : 'border-border'}`}>
            <span className="text-xl leading-none">{t.icon}</span>
            <span className="mt-2 flex items-center justify-between gap-1">
              <span className="min-w-0">
                <span className="block text-xs font-black text-foreground truncate">{t.label}</span>
                <span className="block text-[10px] text-foreground/45 truncate">{t.sub}</span>
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-foreground/25 shrink-0" />
            </span>
            {t.badge && <span className="absolute top-2 right-2 inline-flex items-center gap-0.5 text-[8px] font-black px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground"><Rocket className="w-2.5 h-2.5" />{t.badge}</span>}
          </button>
        ))}
      </div>

      <SettingsTab theme={theme} onThemeChange={onThemeChange} isLoggedIn={account.signedIn} history={history} onOpenTab={t => setView(t)} />

      <CloudDataManager open={cloudOpen} onClose={() => setCloudOpen(false)} isLoggedIn={account.signedIn} />
    </div>
  );
}
