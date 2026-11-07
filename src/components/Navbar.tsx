import { useState, useEffect, memo } from 'react';
import { useAccount } from '../platform/cloud/useAccount';
import { useCloudAuth } from '../platform/cloud/authStore';
import { useSyncState } from '../platform/cloud/syncEngine';
import {
  GraduationCap,
  LogIn,
  Cloud,
  CloudOff,
  Loader2,
  Sun,
  Moon,
  Sparkles,
  Bell,
  Smartphone,
  X,
} from 'lucide-react';
import { Dialog, DialogContent } from '@project/components/ui/dialog';
import type { AppTheme } from '../types/quiz';
import type { SessionMode } from './SessionSelector';
import type { QuizResult } from '../types/quiz';
import { triggerOpenSettings } from './cloud/CloudGate';

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

function SyncBadge({ status, onClick }: { status: SyncStatus; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-2 sm:px-2.5 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] shadow-[0_8px_18px_-12px_rgba(0,0,0,0.7)] transition-all hover:scale-105 active:scale-95 shrink-0 ${
        status === 'syncing'
          ? 'border-primary/25 bg-primary/10 text-primary'
          : status === 'synced'
            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
            : status === 'error'
              ? 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300'
              : 'border-border/60 bg-card/40 text-muted-foreground'
      }`}
      title={
        status === 'syncing'
          ? 'Cloud sync — syncing…'
          : status === 'synced'
            ? 'Cloud sync — everything is saved'
            : status === 'error'
              ? 'Cloud sync — needs attention'
              : 'Cloud sync & devices'
      }
      aria-label="Open cloud sync"
    >
      {status === 'syncing' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
      {status === 'synced' && <Cloud className="h-3 w-3 text-emerald-600 dark:text-emerald-300" />}
      {status === 'error' && <CloudOff className="h-3 w-3 text-red-600 dark:text-red-300" />}
      {status === 'offline' && <CloudOff className="h-3 w-3 text-muted-foreground" />}
      {status === 'idle' && <Cloud className="h-3 w-3 text-muted-foreground" />}
      <span className="hidden sm:inline">
        {status === 'syncing' ? 'Syncing' : status === 'synced' ? 'Saved' : status === 'error' ? 'Error' : 'Local'}
      </span>
    </button>
  );
}

const THEME_CONFIGS: Record<AppTheme, { label: string; nextLabel: string }> = {
  amoled: { label: 'Ink', nextLabel: 'Switch to Parchment theme' },
  light: { label: 'Parchment', nextLabel: 'Switch to Papyrus theme' },
  ancient: { label: 'Papyrus', nextLabel: 'Switch to Liquid Glass theme' },
  glass: { label: 'Glass', nextLabel: 'Switch to Ink theme' },
};

function NavbarInner({
  onHome,
  onProfile,
  onLogin,
  syncStatus = 'idle',
  theme,
  onToggleTheme,
  profileAvatarEmoji,
  profileAvatarUrl,
  onOpenNotifications,
  unreadNotificationCount,
  onOpenWidgets,
  onOpenSyncCenter,
}: NavbarProps) {
  const account = useAccount();
  const cloudAuth = useCloudAuth();
  const syncEngine = useSyncState();
  const isLoading = account.loading;
  const user = account.signedIn ? account : null;
  const themeConf = THEME_CONFIGS[theme];
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Compute live sync status from Supabase cloud sync engine
  const effectiveSyncStatus: SyncStatus = ((): SyncStatus => {
    if (cloudAuth.status === 'signed-in') {
      if (syncEngine.phase === 'syncing') return 'syncing';
      if (syncEngine.phase === 'error') return 'error';
      return 'synced';
    }
    if (syncStatus === 'syncing') return 'syncing';
    return 'offline';
  })();

  return (
    <>
      <header className="sticky top-0 z-50 px-2 sm:px-3 pt-2 pb-2 pointer-events-auto will-change-transform" style={{ transform: 'translateZ(0)' }}>
        <div className="relative overflow-hidden rounded-[24px] sm:rounded-[28px] border border-white/10 bg-white/[0.03] dark:bg-black/[0.4] px-3 sm:px-4 py-2 shadow-[0_18px_48px_-26px_rgba(0,0,0,0.8)] backdrop-blur-md max-w-6xl mx-auto">
          <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(167,139,250,0.10),transparent_30%)]" />

          <div className="relative flex items-center justify-between gap-2">
            {/* Left: App icon + Brand */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
              <button
                type="button"
                onClick={onHome}
                className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/80 flex items-center justify-center shadow-[0_8px_20px_-10px_hsl(var(--primary))] shrink-0 hover:scale-105 active:scale-95 transition-all border border-primary/20"
                aria-label="Home"
              >
                <GraduationCap className="w-4 h-4 text-primary-foreground" />
              </button>
              <button
                type="button"
                onClick={onHome}
                className="font-heading text-foreground text-[15px] sm:text-[16px] font-black tracking-tight hover:text-primary transition-colors truncate"
              >
                Quiz Master
              </button>
              <span className="text-[8px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary font-black leading-none border border-primary/15 shrink-0 tracking-widest uppercase">
                PRO
              </span>
            </div>

            {/* Right: Controls & Profile */}
            <div className="flex items-center gap-1.5 shrink-0">
              {/* Live Online/Offline network status indicator */}
              <div
                className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black border transition-all ${
                  isOnline
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                    : 'border-amber-500/35 bg-amber-500/15 text-amber-600 dark:text-amber-400 animate-pulse'
                }`}
                title={isOnline ? 'Online — Connected to Internet' : 'Offline — Changes safely stored locally'}
              >
                <span className="text-[11px] leading-none">{isOnline ? '📶' : '📵'}</span>
                <span className="text-[9px] tracking-wide uppercase font-black font-mono">
                  {isOnline ? 'NET' : 'OFF'}
                </span>
              </div>

              {/* Cloud Sync indicator — clickable */}
              <SyncBadge
                status={effectiveSyncStatus}
                onClick={onOpenSyncCenter || (() => { onProfile(); triggerOpenSettings('cloud'); })}
              />

              {/* Widgets shortcut */}
              {onOpenWidgets && (
                <button
                  type="button"
                  onClick={onOpenWidgets}
                  title="Android Home Screen Widgets"
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-95 shrink-0"
                  aria-label="Widgets"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
              )}

              {/* Notifications with badge */}
              {onOpenNotifications && (
                <button
                  type="button"
                  onClick={onOpenNotifications}
                  title="Command Center & Smart Alerts"
                  className="relative flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-95 shrink-0"
                  aria-label="Notifications"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotificationCount !== undefined && unreadNotificationCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white shadow-sm animate-pulse">
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  )}
                </button>
              )}

              {/* Theme toggle */}
              <button
                type="button"
                onClick={onToggleTheme}
                title={themeConf.nextLabel}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card/60 text-foreground/70 shadow-sm transition-all hover:border-foreground/20 hover:text-foreground active:scale-95 shrink-0"
                aria-label="Toggle theme"
              >
                {theme === 'glass' ? <Sparkles className="h-4 w-4" /> : theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              {/* Profile Avatar / Login */}
              {isLoading ? (
                <div className="h-9 w-9 animate-pulse rounded-2xl bg-muted shrink-0" />
              ) : user ? (
                <button
                  type="button"
                  onClick={onProfile}
                  className="w-9 h-9 rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-accent/20 flex items-center justify-center text-xs font-semibold text-primary shrink-0 border border-primary/25 hover:scale-105 active:scale-95 transition-all overflow-hidden shadow-sm"
                  aria-label="Open profile"
                  title={`${user.name} (${user.email})`}
                >
                  {profileAvatarUrl ? (
                    <img src={profileAvatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  ) : profileAvatarEmoji ? (
                    <span className="text-base">{profileAvatarEmoji}</span>
                  ) : (
                    <span className="text-xs font-black">
                      {(user.name?.[0] || user.email?.[0] || 'U').toUpperCase()}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onLogin}
                  className="flex h-9 px-2.5 sm:px-3 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-[11px] font-black uppercase tracking-wider hover:bg-primary/20 active:scale-95 shrink-0 transition-all shadow-sm"
                  aria-label="Sign in"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">Sign in</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Avatar Viewer Dialog */}
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
    </>
  );
}

const Navbar = memo(NavbarInner);
export default Navbar;
