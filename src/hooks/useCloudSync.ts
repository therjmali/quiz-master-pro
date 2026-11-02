import { useState, useCallback } from 'react';

type SyncCategory = 'settings' | 'quiz' | 'flashcards' | 'filemanager' | 'library';
type SyncPriority = 'background' | 'immediate' | 'critical';
export type CloudSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export function useCloudSync(_user: any, _isLoggedIn: boolean) {
  const [syncStatus] = useState<CloudSyncStatus>('idle');
  const [lastSyncTime] = useState(0);

  const markDirty = useCallback((_category: SyncCategory, _priority?: SyncPriority) => {
    // No-op: Google Drive sync removed
  }, []);

  const triggerSync = useCallback(() => {
    // No-op: Google Drive sync removed
  }, []);

  const linkDrive = useCallback(() => {}, []);
  const unlinkDrive = useCallback(() => {}, []);

  return {
    syncStatus,
    lastSyncTime,
    markDirty,
    triggerSync,
    driveLinked: false,
    linkDrive,
    unlinkDrive,
  };
}
