/**
 * Delivers the plan: real OS notifications on Android (they fire even when the app is closed) and a
 * graceful, honest fallback on the web. Everything is device-local: nothing about your study habits
 * is sent anywhere.
 */
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from '../native';
import { loadReminderConfig } from '../../utils/studyReminders';
import { getExamDates } from '../../utils/examDates';
import { getDueCount } from '../../utils/spacedRepetition';
import { calculateStreak } from '../../utils/scoring';
import { getHistorySync } from '../../utils/historyStore';
import { DEFAULT_NOTIFY_SETTINGS, isOurNotificationId, planNotifications, type NotifySettings, type Planned } from './planner';

const SETTINGS_KEY = 'qm-notify-v1';
const CHANNEL_ID = 'study-reminders';

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported';

export function getNotifySettings(): NotifySettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      ...DEFAULT_NOTIFY_SETTINGS, ...raw,
      dueReviews: { ...DEFAULT_NOTIFY_SETTINGS.dueReviews, ...raw.dueReviews },
      streak: { ...DEFAULT_NOTIFY_SETTINGS.streak, ...raw.streak },
      exams: { ...DEFAULT_NOTIFY_SETTINGS.exams, ...raw.exams },
      weekly: { ...DEFAULT_NOTIFY_SETTINGS.weekly, ...raw.weekly },
      quiet: { ...DEFAULT_NOTIFY_SETTINGS.quiet, ...raw.quiet },
    };
  } catch { return { ...DEFAULT_NOTIFY_SETTINGS }; }
}

export function saveNotifySettings(settings: NotifySettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* ignore */ }
}

export function canDeliverInBackground(): boolean { return isNative(); }

export async function getPermission(): Promise<PermissionState> {
  try {
    if (isNative()) {
      const res = await LocalNotifications.checkPermissions();
      return res.display === 'granted' ? 'granted' : res.display === 'denied' ? 'denied' : 'prompt';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    return Notification.permission === 'default' ? 'prompt' : (Notification.permission as PermissionState);
  } catch { return 'unsupported'; }
}

/** Must be called from a user gesture on the web. */
export async function requestPermission(): Promise<PermissionState> {
  try {
    if (isNative()) {
      const res = await LocalNotifications.requestPermissions();
      return res.display === 'granted' ? 'granted' : 'denied';
    }
    if (typeof Notification === 'undefined') return 'unsupported';
    const res = await Notification.requestPermission();
    return res === 'default' ? 'prompt' : (res as PermissionState);
  } catch { return 'unsupported'; }
}

function studiedTodayAndStreak(): { studiedToday: boolean; streakDays: number } {
  const stamps = getHistorySync().map(r => Number(r.timestamp)).filter(Number.isFinite);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return { studiedToday: stamps.some(t => t >= start.getTime()), streakDays: stamps.length ? calculateStreak(stamps) : 0 };
}

export function currentPlan(now = new Date()): Planned[] {
  const { studiedToday, streakDays } = studiedTodayAndStreak();
  return planNotifications({
    now, settings: getNotifySettings(), reminder: loadReminderConfig(), exams: getExamDates(),
    studiedToday, dueCount: safeDueCount(), streakDays,
  });
}

function safeDueCount(): number { try { return getDueCount(); } catch { return 0; } }

async function ensureChannel(): Promise<void> {
  try {
    await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Study reminders', description: 'Daily study, review and exam reminders', importance: 4, visibility: 1 });
  } catch { /* already exists / not supported */ }
}

export async function cancelAll(): Promise<void> {
  if (!isNative()) return;
  try {
    const { notifications } = await LocalNotifications.getPending();
    const ours = notifications.filter(n => isOurNotificationId(n.id));
    if (ours.length) await LocalNotifications.cancel({ notifications: ours.map(n => ({ id: n.id })) });
  } catch { /* ignore */ }
}

export interface RescheduleResult { scheduled: number; permission: PermissionState; background: boolean; next: Planned | null }

/** Rebuild the schedule from the current data. Safe to call often (app start, resume, after a quiz). */
export async function rescheduleAll(): Promise<RescheduleResult> {
  const permission = await getPermission();
  const background = isNative();
  if (!background) return { scheduled: 0, permission, background, next: null };
  await cancelAll();
  const settings = getNotifySettings();
  if (!settings.enabled || permission !== 'granted') return { scheduled: 0, permission, background, next: null };
  await ensureChannel();
  const plan = currentPlan();
  if (plan.length === 0) return { scheduled: 0, permission, background, next: null };
  try {
    await LocalNotifications.schedule({
      notifications: plan.map(p => ({
        id: p.id, title: p.title, body: p.body, channelId: CHANNEL_ID,
        schedule: { at: p.at, allowWhileIdle: true }, extra: { kind: p.kind },
      })),
    });
  } catch { return { scheduled: 0, permission, background, next: null }; }
  return { scheduled: plan.length, permission, background, next: plan[0] };
}

export async function sendTestNotification(): Promise<{ ok: boolean; message: string }> {
  const permission = await getPermission();
  if (permission !== 'granted') return { ok: false, message: 'Allow notifications first.' };
  try {
    if (isNative()) {
      await ensureChannel();
      await LocalNotifications.schedule({ notifications: [{ id: 90_001, title: 'Quiz Master Pro', body: 'Notifications are working.', channelId: CHANNEL_ID, schedule: { at: new Date(Date.now() + 2000), allowWhileIdle: true } }] });
      return { ok: true, message: 'A test notification arrives in about 2 seconds.' };
    }
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) await registration.showNotification('Quiz Master Pro', { body: 'Notifications are working.', icon: `${import.meta.env.BASE_URL}icons/icon-192.png`, tag: 'qm-test' });
    else new Notification('Quiz Master Pro', { body: 'Notifications are working.' });
    return { ok: true, message: 'Test notification sent.' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Could not send the test notification.' };
  }
}
