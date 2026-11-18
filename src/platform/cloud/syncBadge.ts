/** Text and tone of the header cloud badge, one entry for every state the sync engine can be in. */
export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'pending' | 'attention' | 'paused' | 'error';

/** What the header cloud badge says, for every state the engine can be in. */
export function syncBadgeCopy(status: SyncStatus, pending = 0): { label: string; title: string; tone: 'ok' | 'busy' | 'warn' | 'bad' | 'idle' } {
  switch (status) {
    case 'synced': return { label: '🟢 Synced', title: 'Cloud sync: everything is saved', tone: 'ok' };
    case 'syncing': return { label: '🔄 Syncing…', title: 'Cloud sync: syncing now', tone: 'busy' };
    case 'offline': return { label: pending > 0 ? `🔴 Offline (${pending})` : '🔴 Offline', title: pending > 0 ? `Offline: ${pending} change${pending === 1 ? '' : 's'} waiting, they upload when you are back online. Tap to retry.` : 'Offline: everything is saved on this device. Tap to retry.', tone: 'bad' };
    case 'pending': return { label: `🟡 ${pending} waiting`, title: `${pending} change${pending === 1 ? '' : 's'} waiting to upload. Tap to sync now.`, tone: 'warn' };
    case 'attention': return { label: '⚠️ Choose', title: 'This device and your cloud copy differ: tap to choose how to combine them', tone: 'warn' };
    case 'paused': return { label: '⏸ Paused', title: 'Auto-sync is paused. Tap to open Cloud sync', tone: 'idle' };
    case 'error': return { label: '⚠️ Retry', title: 'Sync error: tap to retry', tone: 'bad' };
    default: return { label: 'Local', title: 'Cloud sync & devices', tone: 'idle' };
  }
}

