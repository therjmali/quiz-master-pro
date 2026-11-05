/**
 * Boots the platform features once, at app start:
 *   storage hook -> account (Supabase) -> cloud sync engine -> reload-on-remote-change,
 *   automatic backups, trash retention, reminders, custom app icon, PWA update/install plumbing.
 * Every step is independent and failure-tolerant: a problem in one never stops the app or the others.
 */
import { installStorageHook } from './storageHook';
import { initCloudAuth, onAuthChange } from './cloud/authStore';
import { DATA_APPLIED_EVENT, detachCloudAccount, refreshEngineForAccount } from './cloud/syncEngine';
import { isCloudConfigured } from './cloud/config';
import { runAutoBackupIfDue } from './autoBackup';
import { purgeExpiredHistoryTrash } from '../utils/historyTrash';
import { rescheduleAll } from './notify/notifier';
import { REMINDER_CHANGED_EVENT } from '../utils/studyReminders';
import { applyAppIcon } from './appIcon';
import { onLocalChange } from './cloud/changeBus';
import { isNative } from './native';
import { initPwa } from './pwa';

let booted = false;
const RELOAD_KEY = 'qm-cloud-reloads';

/** Applying remote data needs a reload so every screen re-reads storage. Capped to avoid loops. */
function reloadForRemoteData(): void {
  try {
    const now = Date.now();
    const recent = (JSON.parse(sessionStorage.getItem(RELOAD_KEY) || '[]') as number[]).filter(t => now - t < 30_000);
    if (recent.length >= 2) return;
    sessionStorage.setItem(RELOAD_KEY, JSON.stringify([...recent, now]));
  } catch { /* storage blocked: reload once anyway */ }
  window.location.reload();
}

export function initPlatform(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;

  try { installStorageHook(); } catch { /* ignore */ }
  try { applyAppIcon(); } catch { /* ignore */ }
  try { initPwa(); } catch { /* ignore */ }

  if (isCloudConfigured()) {
    onAuthChange({
      signedIn: () => refreshEngineForAccount(),
      signedOut: () => { void detachCloudAccount(); },
    });
    window.addEventListener(DATA_APPLIED_EVENT, () => reloadForRemoteData());
    void initCloudAuth();
  }

  // Housekeeping a moment after start so it never competes with the first paint.
  setTimeout(() => {
    void purgeExpiredHistoryTrash().catch(() => undefined);
    void runAutoBackupIfDue().catch(() => undefined);
    void rescheduleAll().catch(() => undefined);
  }, 8000);

  // Reminder inputs changed (daily reminder, exam dates): rebuild the background schedule.
  window.addEventListener(REMINDER_CHANGED_EVENT, () => { void rescheduleAll().catch(() => undefined); });
  // Finishing a quiz (history changes) or reviewing cards changes today's reminders: rebuild shortly after.
  let rescheduleTimer: ReturnType<typeof setTimeout> | null = null;
  onLocalChange(key => {
    if (key && !['qmp_history', 'qmp_spaced_rep_items', 'qmp_spaced_rep', 'qmp_exam_dates'].includes(key)) return;
    if (rescheduleTimer) clearTimeout(rescheduleTimer);
    rescheduleTimer = setTimeout(() => { void rescheduleAll().catch(() => undefined); }, 5000);
  });

  // Back up / refresh reminders whenever the app is left or comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void runAutoBackupIfDue().catch(() => undefined);
    else void rescheduleAll().catch(() => undefined);
  });
  if (isNative()) {
    import('@capacitor/app').then(({ App }) => {
      App.addListener('resume', () => { void rescheduleAll().catch(() => undefined); });
      App.addListener('pause', () => { void runAutoBackupIfDue().catch(() => undefined); });
    }).catch(() => undefined);
  }
}
