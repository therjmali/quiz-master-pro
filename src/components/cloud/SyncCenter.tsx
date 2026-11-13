/**
 * Cloud Sync Center for Quiz Master Pro.
 * Replicates RJ Study Tracker's multi-tab synchronization and device management architecture.
 *
 * Tabs:
 *   Overview   → account, live status, auto-sync, manual sync actions, privacy
 *   Devices    → signed-in devices, last seen, remote sign-out, rename device
 *   Recovery   → restore points (server revisions) & merge conflict history
 *   On device  → local data categories, storage breakdown & backup management
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle, ArrowLeft, ArrowUpFromLine, Check, ChevronRight, Cloud,
  Download, HardDrive, History, Loader2, Lock, Laptop, LogOut, Pencil,
  RefreshCw, RotateCcw, ShieldCheck, Smartphone, Trash2, X,
} from 'lucide-react';
import { Button } from '@project/components/ui/button';
import { Input } from '@project/components/ui/input';
import { Switch } from '@project/components/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@project/components/ui/alert-dialog';
import { toast } from 'sonner';

import {
  type CloudDevice, changePassword, deleteAccount, listDevices,
  removeDevice, renameThisDevice, signOut, useCloudAuth,
} from '../../platform/cloud/authStore';
import { getCloudEndpoint, isCloudConfigured } from '../../platform/cloud/config';
import { getDeviceIdentity, renameDevice } from '../../platform/cloud/device';
import {
  clearConflicts, fetchRevisions, pullCloudOverDevice, pushDeviceOverCloud,
  restoreRevision, setAutoSync,
  syncNow, useSyncState, wipeCloudCopy,
} from '../../platform/cloud/syncEngine';
import type { RevisionRow } from '../../platform/cloud/remote';
import { DEVICE_ONLY_ITEMS } from '../../platform/cloud/sections';
import { useAccount } from '../../platform/cloud/useAccount';
import CloudDataManager from '../CloudDataManager';
import GlowCard from '../shared/GlowCard';
import { getHistorySync } from '../../utils/historyStore';
import { openSignIn } from '../../platform/cloud/signInWindow';
import { OverlayLayer } from '../ui/Overlay';

interface Props {
  open: boolean;
  onClose: () => void;
  onTriggerAuth?: (mode: 'signin' | 'signup') => void;
}

type Tab = 'overview' | 'devices' | 'recovery' | 'device-data';

const TABS: Array<{ id: Tab; label: string; icon: typeof Cloud }> = [
  { id: 'overview', label: 'Overview', icon: Cloud },
  { id: 'devices', label: 'Devices', icon: Smartphone },
  { id: 'recovery', label: 'Recovery', icon: History },
  { id: 'device-data', label: 'On device', icon: HardDrive },
];

function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'unknown';
  const diff = Date.now() - then;
  if (diff < 0) return 'just now';
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function bytesLabel(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function platformIcon(platform: string) {
  const p = (platform || '').toLowerCase();
  if (p.includes('android') || p.includes('ios')) return Smartphone;
  return Laptop;
}

export default function SyncCenter({ open, onClose, onTriggerAuth }: Props) {
  const account = useAccount();
  const cloud = useCloudAuth();
  const sync = useSyncState();

  const [tab, setTab] = useState<Tab>('overview');
  const [devices, setDevices] = useState<CloudDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<
    | { kind: 'pull-cloud' }
    | { kind: 'push-device' }
    | { kind: 'wipe-cloud' }
    | { kind: 'delete-account' }
    | { kind: 'sign-out' }
    | { kind: 'revoke-device'; device: CloudDevice }
    | { kind: 'revoke-others' }
    | { kind: 'restore'; revision: RevisionRow }
    | null
  >(null);
  const [password, setPassword] = useState('');
  const [renameOpen, setRenameOpen] = useState(false);
  const [deviceName, setDeviceName] = useState(getDeviceIdentity().name);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwConfirm, setPwConfirm] = useState('');
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwBusy, setPwBusy] = useState(false);

  // Local quiz stats
  const localHistory = useMemo(() => {
    try {
      return getHistorySync();
    } catch {
      return [];
    }
  }, []);

  const totalQuizzes = localHistory.length;
  const totalQuestions = useMemo(
    () => localHistory.reduce((acc, h) => acc + (h.totalQuestions || 0), 0),
    [localHistory]
  );
  const avgAccuracy = useMemo(() => {
    if (totalQuizzes === 0) return 0;
    const sum = localHistory.reduce((acc, h) => acc + (h.percentage || 0), 0);
    return Math.round(sum / totalQuizzes);
  }, [localHistory, totalQuizzes]);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    try {
      setDevices(await listDevices());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load devices');
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  const loadRevisions = useCallback(async () => {
    setRevisionsLoading(true);
    try {
      setRevisions(await fetchRevisions());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load restore points');
    } finally {
      setRevisionsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!cloud.user) return;
    if (tab === 'devices') void loadDevices();
    if (tab === 'recovery') void loadRevisions();
  }, [tab, cloud.user, loadDevices, loadRevisions]);

  const statusCopy = useMemo(() => {
    if (sync.needsChoice) return { label: 'Needs a decision', tone: 'text-chart-4', dot: 'bg-chart-4' };
    switch (sync.phase) {
      case 'syncing':
        return { label: 'Syncing now', tone: 'text-primary', dot: 'bg-primary' };
      case 'synced':
        return { label: 'Everything is saved', tone: 'text-secondary', dot: 'bg-secondary' };
      case 'pending':
        return {
          label: `${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting`,
          tone: 'text-chart-4',
          dot: 'bg-chart-4',
        };
      case 'offline':
        return { label: 'Offline — safe on device', tone: 'text-chart-4', dot: 'bg-chart-4' };
      case 'needs-choice':
        return { label: 'Choose how to merge', tone: 'text-chart-4', dot: 'bg-chart-4' };
      case 'paused':
        return { label: 'Auto-sync paused', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
      case 'error':
        return { label: 'Sync needs attention', tone: 'text-destructive', dot: 'bg-destructive' };
      case 'disabled':
        return { label: 'Not signed in', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
      default:
        return { label: 'Ready', tone: 'text-muted-foreground', dot: 'bg-muted-foreground' };
    }
  }, [sync.phase, sync.pendingCount, sync.needsChoice]);

  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(label);
    try {
      await fn();
      toast.success(success);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'That did not work');
    } finally {
      setBusy(null);
    }
  };

  const handleSyncNow = () =>
    run(
      'sync',
      async () => {
        const result = await syncNow('manual');
        if (!result.ok && result.error) throw new Error(result.error);
      },
      '☁️ Synced successfully'
    );

  const handleConfirm = async () => {
    if (!confirm) return;
    switch (confirm.kind) {
      case 'pull-cloud':
        setBusy('pull-cloud');
        try {
          const result = await pullCloudOverDevice();
          toast.success(result.ok ? 'Cloud copy downloaded' : 'Nothing to download');
          setTimeout(() => window.location.reload(), 400);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Download failed');
        } finally {
          setBusy(null);
        }
        break;
      case 'push-device':
        setBusy('push-device');
        try {
          const result = await pushDeviceOverCloud();
          if (!result.ok && result.error) throw new Error(result.error);
          toast.success('This device is now the cloud copy');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Upload failed');
        } finally {
          setBusy(null);
        }
        break;
      case 'wipe-cloud':
        setBusy('wipe-cloud');
        try {
          await wipeCloudCopy();
          toast.success('Cloud copy cleared — this device is untouched');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not clear cloud copy');
        } finally {
          setBusy(null);
        }
        break;
      case 'delete-account':
        setBusy('delete-account');
        try {
          await deleteAccount();
          toast.success('Cloud account deleted');
          setTimeout(() => window.location.reload(), 500);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not delete account');
        } finally {
          setBusy(null);
        }
        break;
      case 'revoke-device':
        setBusy('revoke');
        try {
          await removeDevice(confirm.device.id);
          const next = await listDevices();
          setDevices(next);
          toast.success(`${confirm.device.name} signed out`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not sign that device out');
        } finally {
          setBusy(null);
        }
        break;
      case 'sign-out':
        setConfirm(null);
        await handleSignOut();
        return;
      case 'revoke-others':
        setBusy('revoke-others');
        try {
          await signOut('others');
          await loadDevices();
          toast.success('All other devices signed out');
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Could not sign out other devices');
        } finally {
          setBusy(null);
        }
        break;
      case 'restore':
        setBusy('restore');
        try {
          await restoreRevision(confirm.revision.version);
          toast.success('Restore point applied — reloading');
          setTimeout(() => window.location.reload(), 700);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Restore failed');
        } finally {
          setBusy(null);
        }
        break;
    }
    setConfirm(null);
    setPassword('');
  };

  const handleSignOut = async () => {
    setBusy('sign-out');
    try { await signOut('local'); } catch { /* the stored session is removed regardless */ }
    setBusy(null);
    toast.success('Signed out. Your quizzes stay on this device.');
    onClose();
    setTimeout(() => window.location.reload(), 350);
  };

  const handleChangePassword = async () => {
    setPwError(null);
    if (pwNew.length < 8) {
      setPwError('Use at least 8 characters.');
      return;
    }
    if (!/[a-zA-Z]/.test(pwNew) || !/\d/.test(pwNew)) {
      setPwError('Include at least one letter and one number.');
      return;
    }
    if (pwNew !== pwConfirm) {
      setPwError('The new passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      const ok = await changePassword(pwNew);
      if (!ok) throw new Error('Password update failed');
      setPasswordOpen(false);
      toast.success('Password changed — every other device was signed out');
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change the password');
    } finally {
      setPwBusy(false);
    }
  };

  const handleRename = async () => {
    const name = deviceName.trim();
    if (!name) { toast.error('Type a name for this device.'); return; }
    renameDevice(name);
    setRenameOpen(false);
    try { await renameThisDevice(name); toast.success('Device renamed'); }
    catch { toast.success('Renamed on this device. Other devices see it after the next sync.'); }
    if (tab === 'devices') void loadDevices();
  };

  if (!open) return null;

  if (!cloud.user) {
    return (
      <OverlayLayer layer="panel">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="fixed inset-0 overflow-y-auto bg-background" style={{ zIndex: 'var(--qmp-z-panel)' }}>
        <div className="sticky top-0 z-10 glass-header border-b border-border/20" style={{ paddingTop: 'var(--qmp-inset-top, 0px)' }}>
          <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-3xl mx-auto">
            <button onClick={onClose} aria-label="Back" className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors">
              <ArrowLeft className="w-4 h-4 text-foreground" />
            </button>
            <h1 className="text-sm font-bold text-foreground">Cloud Sync &amp; Backup</h1>
          </div>
        </div>
        <div className="max-w-md mx-auto px-5 py-16 text-center space-y-4">
          <span className="text-5xl">☁️</span>
          <h2 className="text-xl font-black text-foreground">{isCloudConfigured() ? 'You are working offline' : 'Your account lives on this phone'}</h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {isCloudConfigured()
              ? 'All quizzes, bookmarks, notes, and progress are saved safely on this device. Sign in to seamlessly sync your question solving across your phone, tablet, and laptop.'
              : 'All quizzes, bookmarks, notes and progress are saved safely on this device. Create your account here to protect it behind your own password — no e-mail, no server, no waiting.'}
          </p>
          <Button
            className="w-full h-11 rounded-xl font-bold"
            onClick={() => {
              onClose();
              if (onTriggerAuth) onTriggerAuth('signup');
              else openSignIn('signup');
            }}
          >
            {isCloudConfigured() ? 'Create a free account' : 'Create your account'}
          </Button>
          <button
            onClick={() => {
              onClose();
              if (onTriggerAuth) onTriggerAuth('signin');
              else openSignIn('signin');
            }}
            className="w-full h-10 rounded-xl border border-border/30 bg-card/30 text-xs font-semibold text-foreground hover:bg-card/60 transition-colors"
          >
            I already have an account
          </button>
          <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
            {isCloudConfigured()
              ? <>Sync Endpoint: <span className="font-mono text-muted-foreground">{getCloudEndpoint()}</span></>
              : <>Storage: <span className="font-mono text-muted-foreground">this device (no server in this build)</span></>}
          </p>
        </div>
      </motion.div>
      </OverlayLayer>
    );
  }

  return (
    <OverlayLayer layer="panel">
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 overflow-y-auto bg-background"
      style={{ zIndex: 'var(--qmp-z-panel)' }}
    >
      {/* Header */}
      <div className="sticky top-0 z-10 glass-header border-b border-border/20" style={{ paddingTop: 'var(--qmp-inset-top, 0px)' }}>
        <div className="flex items-center gap-3 px-4 sm:px-6 h-14 max-w-3xl mx-auto">
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors" aria-label="Back">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Cloud className="w-4 h-4 text-primary" /> Cloud Sync Center
            </h1>
            <p className={`text-[9.5px] font-semibold ${statusCopy.tone}`}>{statusCopy.label}</p>
          </div>
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-bold border ${
              sync.phase === 'synced'
                ? 'bg-secondary/10 border-secondary/20 text-secondary'
                : sync.phase === 'error'
                ? 'bg-destructive/10 border-destructive/20 text-destructive'
                : sync.phase === 'syncing'
                ? 'bg-primary/10 border-primary/20 text-primary'
                : 'bg-muted/20 border-border/20 text-muted-foreground'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${statusCopy.dot} ${sync.phase === 'syncing' ? 'animate-pulse' : ''}`} />
            {sync.online ? 'Online' : 'Offline'}
          </span>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-muted/20 flex items-center justify-center hover:bg-muted/30 transition-colors" aria-label="Close">
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pb-2 flex gap-1 overflow-x-auto scrollbar-none">
          {TABS.filter(t => isCloudConfigured() || t.id === 'overview' || t.id === 'device-data').map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1.5 px-3 h-8 rounded-lg text-[11px] font-bold whitespace-nowrap transition-colors ${
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
                {active && (
                  <motion.div
                    layoutId="activeSyncTab"
                    className="absolute inset-0 bg-primary/10 rounded-lg -z-10 border border-primary/20"
                    transition={{ type: 'spring', bounce: 0.2, duration: 0.3 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-4 space-y-4" style={{ paddingBottom: 'calc(var(--qmp-inset-bottom, 0px) + 32px)' }}>
        <AnimatePresence mode="wait">
          {/* ── OVERVIEW ─────────────────────────────────────────── */}
          {tab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-4">
              {/* Account Glow Card */}
              <GlowCard className="p-4 rounded-2xl border border-border/15 bg-card/40">
                <div className="flex items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary font-black text-sm">
                      {(cloud.user.name?.[0] || cloud.user.email?.[0] || 'U').toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-foreground">{cloud.user.name || 'Quiz Master Scholar'}</h3>
                      <p className="text-xs text-muted-foreground">{cloud.user.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={handleSyncNow}
                    disabled={busy !== null || !isCloudConfigured()}
                    title={isCloudConfigured() ? 'Upload and pull changes now' : 'Cloud sync needs a server address — this build keeps the account on the device'}
                    className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5 hover:opacity-90 active:scale-95 transition-all shadow-sm disabled:opacity-40 disabled:active:scale-100"
                  >
                    {busy === 'sync' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    <span>Sync Now</span>
                  </button>
                </div>

                <div className="border-t border-border/10 grid grid-cols-3 divide-x divide-border/10 pt-3">
                  <div className="text-center px-2">
                    <p className="text-sm font-black font-mono text-foreground">{totalQuizzes}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Quizzes</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-sm font-black font-mono text-foreground">{totalQuestions}</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Qs Solved</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-sm font-black font-mono text-foreground">{avgAccuracy}%</p>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Accuracy</p>
                  </div>
                </div>
              </GlowCard>

              {/* Auto-sync Switch */}
              <div className="rounded-2xl border border-border/15 bg-card/25 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/15 flex items-center justify-center text-primary">
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-foreground">Automatic Cloud Sync</p>
                      <p className="text-[10px] text-muted-foreground">Sync after completing quizzes and review sessions</p>
                    </div>
                  </div>
                  <Switch
                    checked={sync.autoSync}
                    onCheckedChange={v => {
                      setAutoSync(v);
                      toast.success(v ? 'Automatic sync enabled' : 'Automatic sync paused');
                    }}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setConfirm({ kind: 'push-device' })}
                    className="flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border/20 bg-card/40 text-xs font-bold text-foreground hover:bg-card/70 transition-all"
                  >
                    <ArrowUpFromLine className="w-3.5 h-3.5 text-primary" />
                    <span>Upload Device Copy</span>
                  </button>
                  <button
                    onClick={() => setConfirm({ kind: 'pull-cloud' })}
                    className="flex items-center justify-center gap-1.5 h-9 rounded-xl border border-border/20 bg-card/40 text-xs font-bold text-foreground hover:bg-card/70 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-primary" />
                    <span>Download Cloud Copy</span>
                  </button>
                </div>
              </div>

              {/* Connection & Security */}
              <div className="rounded-2xl border border-border/15 bg-card/25 overflow-hidden">
                <div className="px-4 py-2.5 border-b border-border/10 bg-muted/10">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Connection &amp; Device Identity</p>
                </div>
                <div className="divide-y divide-border/10 text-xs">
                  <Row label="Server" value={getCloudEndpoint()} mono />
                  <Row
                    label="This device"
                    value={`${getDeviceIdentity().name} · ${getDeviceIdentity().platform}`}
                    onEdit={() => {
                      setDeviceName(getDeviceIdentity().name);
                      setRenameOpen(true);
                    }}
                  />
                  <Row
                    label="Signed in"
                    value={cloud.user ? 'Active session' : 'Guest'}
                  />
                  <Row label="Security" value="HTTPS · scrypt password hashing · rotating tokens" />
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 bg-muted/5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setPwError(null);
                      setPwCurrent('');
                      setPwNew('');
                      setPwConfirm('');
                      setPasswordOpen(true);
                    }}
                    className="h-8 rounded-xl text-xs font-bold gap-1.5"
                  >
                    <Lock className="w-3 h-3" /> Change Password
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setConfirm({ kind: 'sign-out' })}
                    className="h-8 rounded-xl text-xs font-bold gap-1.5 text-destructive border-destructive/25 hover:bg-destructive/10"
                  >
                    <LogOut className="w-3 h-3" /> Sign Out
                  </Button>
                </div>
              </div>

              {/* Privacy Disclosure */}
              <div className="rounded-2xl border border-border/15 bg-card/25 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-3.5 h-3.5 text-secondary" />
                  <p className="text-xs font-bold text-foreground">Kept strictly on this device only</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {DEVICE_ONLY_ITEMS.map(item => (
                    <span key={item} className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-muted/25 text-muted-foreground border border-border/15">
                      {item}
                    </span>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-relaxed">
                  Your API keys, AI rationale cache, draft answers, and native device settings never leave this device.
                </p>
              </div>
            </motion.div>
          )}

          {/* ── DEVICES ──────────────────────────────────────────── */}
          {tab === 'devices' && (
            <motion.div key="devices" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Signed in on {devices.length || 1} device{(devices.length || 1) === 1 ? '' : 's'}
                </p>
                <button onClick={loadDevices} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  {devicesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                </button>
              </div>

              {devices.map(device => {
                const Icon = platformIcon(device.platform);
                return (
                  <div
                    key={device.id}
                    className={`rounded-2xl border p-3.5 flex items-center gap-3 ${
                      device.current ? 'border-primary/30 bg-primary/5' : 'border-border/15 bg-card/25'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${device.current ? 'bg-primary/10 border-primary/20' : 'bg-muted/20 border-border/15'}`}>
                      <Icon className={`w-4 h-4 ${device.current ? 'text-primary' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-foreground truncate flex items-center gap-1.5">
                        {device.name}
                        {device.current && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-black uppercase tracking-wider">
                            This device
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {device.platform} · active {relativeTime(device.lastSeenAt)}
                      </p>
                    </div>
                    {device.current ? (
                      <button
                        onClick={() => {
                          setDeviceName(getDeviceIdentity().name);
                          setRenameOpen(true);
                        }}
                        className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-muted/40 transition-colors"
                        title="Rename"
                      >
                        <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirm({ kind: 'revoke-device', device })}
                        className="w-8 h-8 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-destructive/10 group transition-colors"
                        title="Sign out this device"
                      >
                        <LogOut className="w-3.5 h-3.5 text-muted-foreground group-hover:text-destructive" />
                      </button>
                    )}
                  </div>
                );
              })}

              <Button
                variant="outline"
                onClick={() => setConfirm({ kind: 'revoke-others' })}
                className="w-full h-10 rounded-xl text-xs font-bold text-destructive border-destructive/25 hover:bg-destructive/10"
              >
                <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign out every other device
              </Button>
            </motion.div>
          )}

          {/* ── RECOVERY ─────────────────────────────────────────── */}
          {tab === 'recovery' && (
            <motion.div key="recovery" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="space-y-3">
              <div className="rounded-2xl border border-secondary/20 bg-secondary/5 p-3.5 flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every accepted sync generates a safe restore point. If anything is ever lost or corrupted, roll back the cloud
                  copy anytime.
                </p>
              </div>

              {sync.conflicts.length > 0 && (
                <div className="rounded-2xl border border-chart-4/25 bg-chart-4/6 overflow-hidden">
                  <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-chart-4/15">
                    <AlertTriangle className="w-4 h-4 text-chart-4" />
                    <p className="flex-1 text-xs font-bold text-foreground">
                      {sync.conflicts.length} conflicting change{sync.conflicts.length === 1 ? '' : 's'}
                    </p>
                    <button onClick={() => { clearConflicts(); toast.success('Conflict log cleared'); }} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">
                      Clear log
                    </button>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between px-1">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Restore Points</p>
                <button onClick={loadRevisions} className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  {revisionsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />} Refresh
                </button>
              </div>

              {revisions.length === 0 && !revisionsLoading && (
                <div className="rounded-2xl border border-border/15 bg-card/20 p-6 text-center">
                  <p className="text-xs font-semibold text-foreground">No restore points yet</p>
                  <p className="text-[10px] text-muted-foreground mt-1">They appear automatically after your first successful sync.</p>
                </div>
              )}

              {revisions.map(rev => (
                <div key={rev.version} className="rounded-2xl border border-border/15 bg-card/25 p-3.5 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-muted/20 border border-border/15 flex items-center justify-center">
                    <History className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">Version {rev.version}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {new Date(rev.at).toLocaleString()} · {bytesLabel(rev.bytes)} · {rev.keys.length} section{rev.keys.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-bold" onClick={() => setConfirm({ kind: 'restore', revision: rev })}>
                    Restore
                  </Button>
                </div>
              ))}

              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4 space-y-2 mt-4">
                <p className="text-xs font-bold text-destructive">Danger Zone</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  Clearing the cloud copy deletes the server data while leaving this device completely untouched.
                </p>
                <div className="flex gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'wipe-cloud' })} className="h-8 rounded-xl text-xs font-bold border-destructive/25 text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-3 h-3 mr-1" /> Clear cloud copy
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setConfirm({ kind: 'delete-account' })} className="h-8 rounded-xl text-xs font-bold border-destructive/25 text-destructive hover:bg-destructive/10">
                    <X className="w-3 h-3 mr-1" /> Delete account
                  </Button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── ON DEVICE ────────────────────────────────────────── */}
          {tab === 'device-data' && (
            <motion.div key="device-data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <CloudDataManager open={true} onClose={onClose} onSync={handleSyncNow} isLoggedIn={Boolean(cloud.user)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rename device Dialog */}
      <AlertDialog open={renameOpen} onOpenChange={setRenameOpen}>
        <AlertDialogContent className="qmp-dialog-track bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Rename this device</AlertDialogTitle>
            <AlertDialogDescription>The label other devices see in their device list.</AlertDialogDescription>
          </AlertDialogHeader>
          <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="e.g. Android Tablet" className="h-10 rounded-xl" />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRename}>Save name</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change password Dialog */}
      <AlertDialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <AlertDialogContent className="qmp-dialog-track bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>Change your password</AlertDialogTitle>
            <AlertDialogDescription>Your other devices will be signed out and will need the new password.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2.5">
            <Input type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Current password" className="h-10 rounded-xl" />
            <Input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="New password (8+ chars, numbers & letters)" className="h-10 rounded-xl" />
            <Input type="password" value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} placeholder="Confirm new password" className="h-10 rounded-xl" />
            {pwError && <p className="text-[11px] font-semibold text-destructive">{pwError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleChangePassword} disabled={pwBusy || !pwCurrent || !pwNew}>
              {pwBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Update password
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmations */}
      <AlertDialog open={!!confirm} onOpenChange={() => { setConfirm(null); setPassword(''); }}>
        <AlertDialogContent className="qmp-dialog-track bg-card">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === 'pull-cloud' && 'Replace this device with cloud copy?'}
              {confirm?.kind === 'push-device' && 'Upload this device to the cloud?'}
              {confirm?.kind === 'wipe-cloud' && 'Clear cloud copy?'}
              {confirm?.kind === 'delete-account' && 'Delete your cloud account?'}
              {confirm?.kind === 'sign-out' && 'Sign out of this device?'}
              {confirm?.kind === 'revoke-device' && `Sign out ${confirm.device.name}?`}
              {confirm?.kind === 'revoke-others' && 'Sign out every other device?'}
              {confirm?.kind === 'restore' && `Restore cloud version ${confirm.revision.version}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === 'pull-cloud' && 'Local quiz and bookmark data will be updated from the server copy.'}
              {confirm?.kind === 'push-device' && 'This device will become the definitive source of truth across all your devices.'}
              {confirm?.kind === 'wipe-cloud' && 'The server copy will be cleared. This device keeps all its data.'}
              {confirm?.kind === 'delete-account' && 'Your cloud account and remote backups will be permanently deleted.'}
              {confirm?.kind === 'sign-out' && 'Sync stops on this device. Everything stays saved here, and you can sign in again any time.'}
              {confirm?.kind === 'revoke-device' && 'That device will need to sign in again to sync.'}
              {confirm?.kind === 'revoke-others' && 'All other sessions will be terminated.'}
              {confirm?.kind === 'restore' && 'The cloud copy will be rolled back to this restore point.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {confirm?.kind === 'delete-account' && (
            <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your account password" className="h-10 rounded-xl" />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm} disabled={busy !== null}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
    </OverlayLayer>
  );
}

function Row({ label, value, mono, onEdit }: { label: string; value: string; mono?: boolean; onEdit?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-24 shrink-0">{label}</span>
      <span className={`flex-1 min-w-0 text-xs text-foreground truncate ${mono ? 'font-mono text-[11px]' : ''}`}>{value}</span>
      {onEdit && (
        <button onClick={onEdit} className="w-7 h-7 rounded-lg bg-muted/20 flex items-center justify-center hover:bg-muted/40 transition-colors" aria-label={`Edit ${label}`}>
          <Pencil className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}
