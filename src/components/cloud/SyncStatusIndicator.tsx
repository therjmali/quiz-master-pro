/**
 * SyncStatusIndicator Component & Offline Resilience Controls.
 *
 * Implements requirement 5:
 * - Global Sync Status Indicator with 4 distinct states:
 *   1. 🟢 Synced
 *   2. 🔄 Syncing...
 *   3. 🔴 Offline (Pending X changes)
 *   4. ⚠️ Sync Error - Tap to Retry
 * - Manual Override button ("Force Sync / Backup Now")
 * - Resilient Offline Fallback UI preventing hard "data not synch" error screens
 */

import React, { useState, useCallback } from 'react';
import { Cloud, CloudOff, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { useSyncState, syncFromCloud, syncNow, type SyncPhase } from '../../platform/cloud/syncEngine';
import { toast } from 'sonner';

export interface SyncStatusIndicatorProps {
  className?: string;
  showLabel?: boolean;
  onOpenSyncCenter?: () => void;
}

export function SyncStatusIndicator({
  className = '',
  showLabel = true,
  onOpenSyncCenter,
}: SyncStatusIndicatorProps) {
  const syncState = useSyncState();
  const [retrying, setRetrying] = useState(false);

  const handleAction = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If there is an error, retry immediately
    if (syncState.phase === 'error' || !syncState.online) {
      setRetrying(true);
      try {
        const res = await syncFromCloud('manual-retry');
        if (res.ok) {
          toast.success('☁️ Synced successfully');
        } else if (res.error) {
          toast.error(`Sync error: ${res.error}`);
        }
      } catch (err: any) {
        toast.error(`Sync failed: ${err.message || 'Network error'}`);
      } finally {
        setRetrying(false);
      }
      return;
    }

    // Open Sync Center if provided
    if (onOpenSyncCenter) {
      onOpenSyncCenter();
    } else {
      // Trigger instant non-blocking sync
      setRetrying(true);
      try {
        const res = await syncFromCloud('manual-tap');
        if (res.ok) toast.success('☁️ Synced with cloud');
      } finally {
        setRetrying(false);
      }
    }
  }, [syncState.phase, syncState.online, onOpenSyncCenter]);

  // Determine current display state
  const isSyncing = syncState.phase === 'syncing' || retrying;
  const isError = syncState.phase === 'error' || syncState.phase === 'not-set-up';
  const isOffline = !syncState.online || syncState.phase === 'offline';
  const pendingCount = syncState.pendingCount || 0;

  let badgeColor = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400';
  let icon = <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  let label = '🟢 Synced';
  let tooltip = 'All data is synchronized with Supabase cloud';

  if (isSyncing) {
    badgeColor = 'border-primary/30 bg-primary/10 text-primary';
    icon = <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
    label = '🔄 Syncing...';
    tooltip = 'Syncing records with cloud...';
  } else if (isError) {
    badgeColor = 'border-amber-500/35 bg-amber-500/15 text-amber-700 dark:text-amber-300';
    icon = <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />;
    label = '⚠️ Sync Error - Tap to Retry';
    tooltip = syncState.error ? `Sync error: ${syncState.error} — tap to retry` : 'Sync error — tap to retry';
  } else if (isOffline) {
    badgeColor = 'border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400';
    icon = <CloudOff className="h-3.5 w-3.5 text-rose-500" />;
    label = pendingCount > 0 ? `🔴 Offline (Pending ${pendingCount})` : '🔴 Offline';
    tooltip = pendingCount > 0
      ? `Offline: ${pendingCount} change${pendingCount > 1 ? 's' : ''} queued locally with auto-retry`
      : 'Offline — saved locally on this device';
  }

  return (
    <button
      type="button"
      onClick={handleAction}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-105 active:scale-95 shadow-sm ${badgeColor} ${className}`}
      title={tooltip}
      aria-label={label}
    >
      {icon}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

/**
 * Manual Override: "Force Sync / Backup Now" Button.
 * Placed in Settings and Sync Center for immediate user-initiated sync.
 */
export function ForceSyncButton({
  className = '',
  onComplete,
}: {
  className?: string;
  onComplete?: () => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleForceSync = async () => {
    setLoading(true);
    const toastId = toast.loading('🔄 Syncing with cloud...');
    try {
      const res = await syncNow('force-sync-button');
      if (res.ok) {
        toast.success('☁️ Synced & backed up to cloud!', { id: toastId });
        onComplete?.();
      } else if (res.skipped && res.error === 'Offline') {
        toast.error('Device is offline. Changes queued in outbox for auto-sync.', { id: toastId });
      } else {
        toast.error(`Sync notice: ${res.error || 'Failed to complete cloud sync'}`, { id: toastId });
      }
    } catch (err: any) {
      toast.error(`Sync error: ${err.message || 'Network issue'}`, { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleForceSync}
      disabled={loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-95 disabled:pointer-events-none disabled:opacity-50 ${className}`}
    >
      {loading ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Syncing & Backing Up...</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          <span>Force Sync / Backup Now</span>
        </>
      )}
    </button>
  );
}

/**
 * Resilient Offline Fallback Container.
 * Replaces hard blocking error screens when remote data cannot be reached.
 * Immediately loads and presents cached local records with a non-blocking toast.
 */
export function OfflineFallbackCard({
  title = 'Showing offline data',
  message = 'Device is operating with local cache. Tap to retry sync with cloud.',
  onRetry,
  children,
}: {
  title?: string;
  message?: string;
  onRetry?: () => Promise<void> | void;
  children?: React.ReactNode;
}) {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      if (onRetry) {
        await onRetry();
      } else {
        await syncFromCloud('offline-fallback-retry');
      }
      toast.success('Cloud data refreshed ✓');
    } catch (e: any) {
      toast.error(e.message || 'Still unable to reach cloud. Retaining offline cache.');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-semibold">{title}</p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/80">{message}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-semibold hover:bg-amber-500/30 active:scale-95 disabled:opacity-50"
        >
          {retrying ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span>Retry</span>
        </button>
      </div>
      {children}
    </div>
  );
}

export default SyncStatusIndicator;
