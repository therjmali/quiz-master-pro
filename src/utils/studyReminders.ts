const REMINDER_KEY = 'qmp_study_reminder';

export interface ReminderConfig {
  enabled: boolean;
  time: string; // "HH:MM"
  days: number[]; // 0=Sun, 1=Mon, ...6=Sat
  subject?: string;
}

const DEFAULT_CONFIG: ReminderConfig = {
  enabled: false,
  time: '09:00',
  days: [1, 2, 3, 4, 5], // Mon–Fri
};

let timerHandle: ReturnType<typeof setTimeout> | null = null;

export function loadReminderConfig(): ReminderConfig {
  try {
    const raw = localStorage.getItem(REMINDER_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch { return DEFAULT_CONFIG; }
}

export const REMINDER_CHANGED_EVENT = 'qm:reminder-config-changed';

export function saveReminderConfig(config: ReminderConfig): void {
  try { localStorage.setItem(REMINDER_KEY, JSON.stringify(config)); } catch {}
  // Restart the in-page scheduler (web, while the app is open)
  stopScheduler();
  if (config.enabled && 'Notification' in window) startScheduler(config);
  // Let the platform layer rebuild the background (Android) schedule.
  try { window.dispatchEvent(new Event(REMINDER_CHANGED_EVENT)); } catch {}
}

export async function requestNotificationPermission(): Promise<boolean> {
  // Inside the Android app notifications go through the native layer, not the web Notification API.
  const { isNative } = await import('../platform/native');
  if (isNative()) {
    const { requestPermission } = await import('../platform/notify/notifier');
    return (await requestPermission()) === 'granted';
  }
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

function showNotification(config: ReminderConfig) {
  if (Notification.permission !== 'granted') return;
  const body = config.subject
    ? `Time to study ${config.subject}! 🎯`
    : 'Time to study! 🎯 Take a quick quiz to keep your streak going.';
  const n = new Notification('Quiz Master Pro', {
    body,
    icon: '/favicon.ico',
    tag: 'qmp-study-reminder',
  });
  n.onclick = () => { window.focus(); n.close(); };
}

function scheduleNext(config: ReminderConfig) {
  const [hour, minute] = config.time.split(':').map(Number);
  const now = new Date();
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);

  // If target is in the past, move to tomorrow
  if (target <= now) target.setDate(target.getDate() + 1);

  // Find next valid day
  let attempts = 0;
  while (!config.days.includes(target.getDay()) && attempts < 8) {
    target.setDate(target.getDate() + 1);
    attempts++;
  }

  const delay = target.getTime() - Date.now();
  if (delay < 0 || delay > 7 * 24 * 60 * 60 * 1000) return; // Max 1 week

  timerHandle = setTimeout(() => {
    if (config.days.includes(new Date().getDay())) {
      showNotification(config);
    }
    // Schedule next occurrence
    scheduleNext(config);
  }, delay);
}

export function startScheduler(config?: ReminderConfig) {
  const cfg = config || loadReminderConfig();
  if (!cfg.enabled) return;
  stopScheduler();
  scheduleNext(cfg);
}

export function stopScheduler() {
  if (timerHandle) { clearTimeout(timerHandle); timerHandle = null; }
}

// Auto-start on load
if (typeof window !== 'undefined') {
  const cfg = loadReminderConfig();
  if (cfg.enabled) startScheduler(cfg);
}
