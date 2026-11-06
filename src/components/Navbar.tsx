import { useState, useEffect } from 'react';
import { useAccount } from '../platform/cloud/useAccount';
import { GraduationCap, User, LogIn, Cloud, CloudOff, Loader2, Sun, Moon, Sparkles, Filter, X } from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent } from '@project/components/ui/dialog';
import { format } from 'date-fns';
import { AppTheme } from '../types/quiz';
import type { SessionMode } from './SessionSelector';
import SessionSelector from './SessionSelector';
import type { QuizResult } from '../types/quiz';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';

interface SubjectOption {
  name: string;
  count: number;
  avg: number;
}

interface NavbarProps {
  onHome: () => void;
  onProfile: () => void;
  onLogin: () => void;
  syncStatus?: SyncStatus;
  quizCount?: number;
  theme: AppTheme;
  onToggleTheme: () => void;
  // Dashboard-specific props
  isDashboard?: boolean;
  profileAvatarEmoji?: string;
  profileAvatarUrl?: string;
  displayName?: string;
  subjectOptions?: SubjectOption[];
  subjectFilter?: string;
  onSubjectPopupOpen?: () => void;
  sessionMode?: SessionMode;
  onSessionModeChange?: (v: SessionMode) => void;
  sessionHistory?: QuizResult[];
  onOpenChatbot?: () => void;
}

function SyncBadge({ status }: { status: SyncStatus }) {
  if (status === 'idle') return null;

  const cfg: Record<SyncStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    idle: { icon: null, label: '', cls: '' },
    syncing: {
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
      label: 'Syncing…',
      cls: 'text-primary bg-primary/10 border-primary/20',
    },
    synced: {
      icon: <Cloud className="w-3 h-3" />,
      label: 'Saved',
      cls: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    },
    error: {
      icon: <CloudOff className="w-3 h-3" />,
      label: 'Error',
      cls: 'text-destructive bg-destructive/10 border-destructive/20',
    },
    offline: {
      icon: <CloudOff className="w-3 h-3" />,
      label: 'Local',
      cls: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    },
  };

  const { icon, label, cls } = cfg[status];
  return (
    <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold transition-all ${cls}`}>
      {icon}
      <span className="hidden xs:inline">{label}</span>
    </div>
  );
}

const THEME_CONFIGS: Record<AppTheme, { icon: typeof Moon; label: string; nextLabel: string }> = {
  amoled: { icon: Moon,     label: 'AMOLED', nextLabel: 'Switch to Light theme' },
  light:  { icon: Sun,      label: 'Light',  nextLabel: 'Switch to AMOLED theme' },
};

export default function Navbar({
  onHome, onProfile, onLogin,
  syncStatus = 'idle', quizCount = 0,
  theme, onToggleTheme,
  isDashboard, profileAvatarEmoji, profileAvatarUrl, displayName,
  subjectOptions, subjectFilter, onSubjectPopupOpen,
  sessionMode, onSessionModeChange, sessionHistory,
  onOpenChatbot,
}: NavbarProps) {
  const account = useAccount();
  const isLoading = account.loading;
  const user = account.signedIn ? account : null;
  const themeConf = THEME_CONFIGS[theme];
  const ThemeIcon = themeConf.icon;
  const [now, setNow] = useState(() => new Date());
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);

  const hasActiveFilter = subjectFilter && subjectFilter !== 'all';

  return (
    <nav className={`pb-3 mb-4 border-b ${isDashboard ? 'border-transparent' : 'border-border/80'}`}>
      <div className="flex justify-between items-center px-1">
        {/* Left: Logo + Dashboard avatar */}
        <div className="flex items-center gap-2">
          {isDashboard && (profileAvatarUrl || profileAvatarEmoji) ? (
            <button
              onClick={() => profileAvatarUrl ? setAvatarViewerOpen(true) : onProfile()}
              className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary/50 to-accent/50 border border-primary/25 ring-1 ring-primary/20 shadow-lg shadow-primary/10 flex items-center justify-center text-xl flex-shrink-0 transition-all active:scale-95 hover:ring-primary/40 hover:shadow-primary/20 overflow-hidden"
            >
              {profileAvatarUrl
                ? <img src={profileAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
                : profileAvatarEmoji}
            </button>
          ) : (
            <button
              onClick={onHome}
              className="flex items-center group active:scale-95 transition-transform"
            >
              <div className="bg-primary p-2 rounded-xl shadow-sm shadow-primary/15 group-hover:shadow-primary/25 transition-all">
                <GraduationCap className="w-5 h-5 text-primary-foreground" />
              </div>
            </button>
          )}
          <button
            onClick={isDashboard ? onProfile : onHome}
            className="active:scale-95 transition-transform text-left"
          >
            {isDashboard && displayName ? (
              <div>
                <p className="text-[9px] text-foreground/25 font-medium leading-tight tracking-wide">
                  {format(now, 'EEE, MMM d')}
                </p>
                <h1 className="text-sm sm:text-base font-extrabold text-foreground tracking-tight leading-snug">
                  <span className="hidden sm:inline">Hi, </span>{displayName}
                </h1>
              </div>
            ) : (
              <div>
                <h1 className="font-extrabold text-base sm:text-lg leading-none tracking-tight text-foreground">
                  Quiz Master<span className="text-primary">Pro</span>
                </h1>
                <p className="text-[9px] font-medium mt-0.5 text-foreground/25 tracking-wide">
                  {format(now, 'EEE, MMM d · h:mm a')}
                </p>
              </div>
            )}
          </button>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-1.5">
          {/* Dashboard-specific controls */}
          {isDashboard && (
            <>
              {/* Subject Filter */}
              {subjectOptions && subjectOptions.length >= 2 && onSubjectPopupOpen && (
                <button
                  onClick={onSubjectPopupOpen}
                  className={`relative flex items-center gap-1 text-[11px] font-bold px-2 py-1.5 rounded-xl border transition-all active:scale-95 flex-shrink-0 ${
                    hasActiveFilter
                      ? 'bg-primary/15 border-primary/30 text-primary'
                      : 'bg-foreground/[0.03] border-border text-foreground/50 hover:bg-foreground/[0.06] hover:text-foreground/70'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  {hasActiveFilter && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[7px] font-black flex items-center justify-center">1</span>
                  )}
                </button>
              )}

              {/* Session Selector */}
              {sessionHistory && sessionMode !== undefined && onSessionModeChange && (
                <SessionSelector history={sessionHistory} value={sessionMode} onChange={onSessionModeChange} compact />
              )}

              {/* AI Chatbot */}
              {onOpenChatbot && (
                <button
                  onClick={onOpenChatbot}
                  className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-border text-base hover:border-foreground/20 transition-all active:scale-95 flex-shrink-0 bg-foreground/[0.03] hover:bg-foreground/[0.06]"
                  title="Ask AI"
                >
                  🤖
                </button>
              )}
            </>
          )}

          <SyncBadge status={syncStatus} />

          {/* Quiz count — desktop only, non-dashboard */}
          {!isDashboard && quizCount > 0 && (
            <button
              onClick={onProfile}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-[10px] font-bold transition-all text-foreground/40 bg-foreground/[0.03] hover:text-foreground/70"
            >
              📊 {quizCount}
            </button>
          )}

          {/* Theme cycle button */}
          <button
            onClick={onToggleTheme}
            title={themeConf.nextLabel}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-border text-[11px] font-bold transition-all active:scale-90 flex-shrink-0 bg-foreground/[0.03] text-foreground/60 hover:bg-foreground/[0.06] hover:text-foreground/80"
          >
            <ThemeIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline tracking-wide">{themeConf.label}</span>
          </button>

          {/* Auth section */}
          {isLoading ? (
            <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            isDashboard ? null : (
              <button
                onClick={() => profileAvatarUrl ? setAvatarViewerOpen(true) : onProfile()}
                className="flex items-center gap-1.5 backdrop-blur-xl rounded-full pl-2.5 pr-3 py-1.5 border border-border bg-card/60 transition-colors hover:bg-card/80 active:scale-95"
              >
                {profileAvatarUrl ? (
                  <div className="w-6 h-6 rounded-full overflow-hidden flex-shrink-0">
                    <img src={profileAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-[10px] font-black text-primary-foreground flex-shrink-0">
                    {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                  </div>
                )}
                <span className="hidden sm:inline max-w-[80px] truncate text-xs font-bold text-foreground/60">
                  {user.name}
                </span>
                <User className="w-3.5 h-3.5 sm:hidden text-foreground/60" />
              </button>
            )
          ) : (
            <Button
              onClick={onLogin}
              size="sm"
              variant="outline"
              aria-label="Sign in"
              className="text-xs gap-1.5 rounded-xl h-9 bg-card/60 border-border text-foreground/60 hover:bg-card hover:text-foreground"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </Button>
          )}
        </div>
      </div>

      {/* Gradient divider for dashboard */}
      {isDashboard && (
        <div className="mt-3 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
      )}

      {/* Full-screen avatar viewer */}
      <Dialog open={avatarViewerOpen} onOpenChange={setAvatarViewerOpen}>
        <DialogContent className="bg-black/95 border-none p-0 max-w-lg w-[95vw] max-h-[90vh] flex items-center justify-center rounded-2xl overflow-hidden">
          <button
            onClick={() => setAvatarViewerOpen(false)}
            className="absolute top-3 right-3 z-50 w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          {profileAvatarUrl ? (
            <img src={profileAvatarUrl} alt="Profile photo" className="max-w-full max-h-[80vh] object-contain rounded-xl" />
          ) : profileAvatarEmoji ? (
            <span className="text-[120px]">{profileAvatarEmoji}</span>
          ) : null}
          <button
            onClick={() => { setAvatarViewerOpen(false); onProfile(); }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-sm text-white text-xs font-bold hover:bg-white/20 transition-colors"
          >
            Edit Profile
          </button>
        </DialogContent>
      </Dialog>
    </nav>
  );
}
