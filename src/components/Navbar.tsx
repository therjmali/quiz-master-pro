import { useState, useEffect, type ReactNode } from 'react';
import { useAccount } from '../platform/cloud/useAccount';
import {
  GraduationCap,
  User,
  LogIn,
  Cloud,
  CloudOff,
  Loader2,
  Sun,
  Moon,
  Sparkles,
  Filter,
  X,
  Bell,
  Smartphone,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Dialog, DialogContent } from '@project/components/ui/dialog';
import { format } from 'date-fns';
import type { AppTheme } from '../types/quiz';
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
  onOpenNotifications?: () => void;
  unreadNotificationCount?: number;
  onOpenWidgets?: () => void;
  onOpenSyncCenter?: () => void;
}

import { triggerOpenSettings } from './cloud/CloudGate';

function SyncBadge({ status, onClick }: { status: SyncStatus; onClick?: () => void }) {
  if (status === 'idle') return null;

  const cfg: Record<SyncStatus, { icon: ReactNode; label: string; cls: string }> = {
    idle: { icon: null, label: '', cls: '' },
    syncing: {
      icon: <Loader2 className="h-3 w-3 animate-spin" />,
      label: 'Syncing…',
      cls: 'border-primary/20 bg-primary/10 text-primary',
    },
    synced: {
      icon: <Cloud className="h-3 w-3" />,
      label: 'Saved',
      cls: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    },
    error: {
      icon: <CloudOff className="h-3 w-3" />,
      label: 'Error',
      cls: 'border-red-500/30 bg-red-500/10 text-red-300',
    },
    offline: {
      icon: <CloudOff className="h-3 w-3" />,
      label: 'Local',
      cls: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    },
  };

  const { icon, label, cls } = cfg[status];

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)] transition-all hover:scale-105 active:scale-95 ${cls}`}
      title="Cloud sync & devices"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

const THEME_CONFIGS: Record<AppTheme, { icon: typeof Moon; label: string; nextLabel: string }> = {
  amoled: { icon: Moon, label: 'Ink', nextLabel: 'Switch to Parchment theme' },
  light: { icon: Sun, label: 'Parchment', nextLabel: 'Switch to Papyrus theme' },
  ancient: { icon: Sun, label: 'Papyrus', nextLabel: 'Switch to Liquid Glass theme' },
  glass: { icon: Sparkles, label: 'Glass', nextLabel: 'Switch to Ink theme' },
};

export default function Navbar({
  onHome,
  onProfile,
  onLogin,
  syncStatus = 'idle',
  quizCount = 0,
  theme,
  onToggleTheme,
  isDashboard,
  profileAvatarEmoji,
  profileAvatarUrl,
  displayName,
  subjectOptions,
  subjectFilter,
  onSubjectPopupOpen,
  sessionMode,
  onSessionModeChange,
  sessionHistory,
  onOpenChatbot,
  onOpenNotifications,
  unreadNotificationCount,
  onOpenWidgets,
  onOpenSyncCenter,
}: NavbarProps) {
  const account = useAccount();
  const isLoading = account.loading;
  const user = account.signedIn ? account : null;
  const themeConf = THEME_CONFIGS[theme];
  const ThemeIcon = themeConf.icon;
  const [now, setNow] = useState(() => new Date());
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(id);
  }, []);

  const hasActiveFilter = Boolean(subjectFilter && subjectFilter !== 'all');

  return (
    <nav className={`relative mb-4 ${isDashboard ? '' : 'pb-3'}`}>
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.02] p-2 shadow-[0_18px_48px_-26px_rgba(0,0,0,0.8)] backdrop-blur-2xl supports-[backdrop-filter]:bg-white/[0.04]">
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.14),transparent_30%)]" />

        <div className="relative flex items-center justify-between gap-2 px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            {isDashboard && (profileAvatarUrl || profileAvatarEmoji) ? (
              <button
                type="button"
                onClick={() => (profileAvatarUrl ? setAvatarViewerOpen(true) : onProfile())}
                className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/25 via-primary/10 to-accent/20 shadow-[0_18px_35px_-22px_hsl(var(--primary))] transition-all active:scale-95"
              >
                {profileAvatarUrl ? (
                  <img src={profileAvatarUrl} alt="avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-xl">{profileAvatarEmoji}</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={onHome}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary shadow-[0_10px_24px_-16px_hsl(var(--primary))] transition-all active:scale-95"
                aria-label="Home"
              >
                <GraduationCap className="h-5 w-5" />
              </button>
            )}

            <button type="button" onClick={isDashboard ? onProfile : onHome} className="min-w-0 text-left">
              {isDashboard && displayName ? (
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-[0.18em] text-muted-foreground/70">
                    {format(now, 'EEE, MMM d')}
                  </p>
                  <h1 className="truncate text-base font-black leading-tight tracking-tight text-foreground sm:text-lg">
                    <span className="hidden sm:inline">Hi, </span>
                    {displayName}
                  </h1>
                </div>
              ) : (
                <div className="min-w-0">
                  <h1 className="text-base font-black leading-none tracking-tight text-foreground sm:text-lg">
                    Quiz Master<span className="text-primary">Pro</span>
                  </h1>
                  <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">
                    {format(now, 'EEE, MMM d · h:mm a')}
                  </p>
                </div>
              )}
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            {isDashboard && (
              <>
                {subjectOptions && subjectOptions.length >= 2 && onSubjectPopupOpen && (
                  <button
                    type="button"
                    onClick={onSubjectPopupOpen}
                    className={`relative flex items-center justify-center rounded-full border px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.18em] transition-all active:scale-95 ${
                      hasActiveFilter
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border/60 bg-card/50 text-foreground/60 hover:border-foreground/20 hover:text-foreground'
                    }`}
                  >
                    <Filter className="h-3.5 w-3.5" />
                    {hasActiveFilter && (
                      <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-[7px] font-black text-primary-foreground">
                        1
                      </span>
                    )}
                  </button>
                )}

                {sessionHistory && sessionMode !== undefined && onSessionModeChange && (
                  <SessionSelector history={sessionHistory} value={sessionMode} onChange={onSessionModeChange} compact />
                )}

                {onOpenChatbot && (
                  <button
                    type="button"
                    onClick={onOpenChatbot}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-lg shadow-sm transition-all hover:border-foreground/20 active:scale-95"
                    title="Ask AI"
                  >
                    🤖
                  </button>
                )}
              </>
            )}

            {onOpenNotifications && (
              <button
                type="button"
                onClick={onOpenNotifications}
                title="Command Center & Smart Alerts"
                className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-95"
              >
                <Bell className="h-4 w-4" />
                {unreadNotificationCount !== undefined && unreadNotificationCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white shadow-sm">
                    {unreadNotificationCount}
                  </span>
                )}
              </button>
            )}

            {onOpenWidgets && (
              <button
                type="button"
                onClick={onOpenWidgets}
                title="Android Home Screen Widgets"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-95"
              >
                <Smartphone className="h-4 w-4" />
              </button>
            )}

            <SyncBadge status={syncStatus} onClick={onOpenSyncCenter || (() => { onProfile(); triggerOpenSettings('cloud'); })} />

            {!isDashboard && quizCount > 0 && (
              <button
                type="button"
                onClick={onProfile}
                className="hidden items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-foreground/60 transition-all hover:text-foreground sm:flex"
              >
                <span>📊</span>
                {quizCount}
              </button>
            )}

            <button
              type="button"
              onClick={onToggleTheme}
              title={themeConf.nextLabel}
              className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card/60 px-2.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-foreground/70 transition-all hover:text-foreground active:scale-90"
            >
              <ThemeIcon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{themeConf.label}</span>
            </button>

            {isLoading ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
            ) : user ? (
              isDashboard ? null : (
                <button
                  type="button"
                  onClick={() => (profileAvatarUrl ? setAvatarViewerOpen(true) : onProfile())}
                  className="flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-2 py-1.5 pr-3 transition-all hover:bg-card active:scale-95"
                >
                  {profileAvatarUrl ? (
                    <div className="h-6 w-6 overflow-hidden rounded-full">
                      <img src={profileAvatarUrl} alt="avatar" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-[10px] font-black text-primary-foreground">
                      {(user.name?.[0] || user.email?.[0] || '?').toUpperCase()}
                    </div>
                  )}
                  <span className="hidden max-w-[90px] truncate text-[11px] font-bold text-foreground/70 sm:inline">
                    {user.name}
                  </span>
                  <User className="h-3.5 w-3.5 text-foreground/60 sm:hidden" />
                </button>
              )
            ) : (
              <Button
                onClick={onLogin}
                size="sm"
                variant="outline"
                aria-label="Sign in"
                className="h-9 rounded-full border-border/70 bg-card/60 text-[11px] font-black uppercase tracking-[0.14em] text-foreground/70 hover:bg-card hover:text-foreground"
              >
                <LogIn className="h-3.5 w-3.5" />
                <span>Sign in</span>
              </Button>
            )}
          </div>
        </div>

        {isDashboard && <div className="mt-3 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />}
      </div>

      <Dialog open={avatarViewerOpen} onOpenChange={setAvatarViewerOpen}>
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-lg items-center justify-center overflow-hidden rounded-3xl border-none bg-black/90 p-0">
          <button
            type="button"
            onClick={() => setAvatarViewerOpen(false)}
            className="absolute right-3 top-3 z-50 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {profileAvatarUrl ? (
            <img src={profileAvatarUrl} alt="Profile photo" className="max-h-[80vh] max-w-full object-contain rounded-2xl" />
          ) : profileAvatarEmoji ? (
            <span className="text-[120px]">{profileAvatarEmoji}</span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setAvatarViewerOpen(false);
              onProfile();
            }}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.18em] text-white hover:bg-white/20"
          >
            Edit profile
          </button>
        </DialogContent>
      </Dialog>

      <div className="pointer-events-none absolute -inset-x-2 bottom-[-18px] h-24 rounded-full bg-primary/5 blur-3xl" />
      <div className="pointer-events-none absolute -right-6 top-8 h-14 w-14 rounded-full bg-violet-500/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-6 top-6 h-16 w-16 rounded-full bg-cyan-400/10 blur-2xl" />
    </nav>
  );
}
