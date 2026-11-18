/**
 * "Showing offline data. Tap to retry sync."
 * Shown instead of a hard error whenever something that should come from the cloud is not on this device yet:
 * the app keeps working with the local copy and the toast offers a one-tap retry.
 */
import { toast } from 'sonner';
import { syncNow } from './syncEngine';

export const OFFLINE_DATA_MESSAGE = 'Showing offline data. Tap to retry sync.';

export function notifyShowingOfflineData(): void {
  toast(OFFLINE_DATA_MESSAGE, {
    id: 'offline-data',
    duration: 9000,
    action: {
      label: 'Retry',
      onClick: () => {
        void syncNow('manual-retry').then(res => {
          if (res.ok) toast.success('☁️ Synced. Open it again.', { id: 'offline-data' });
          else toast.error(res.error === 'Offline' ? 'Still offline. Your data is safe on this device.' : `Sync: ${res.error ?? 'could not reach the cloud'}`, { id: 'offline-data' });
        }).catch(() => undefined);
      },
    },
  });
}
