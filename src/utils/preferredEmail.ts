/**
 * Single "Report email" setting.
 *
 * Previously the app kept two separate addresses: the Account → "Report &
 * Notification Email" (qmp_preferred_email) and Notifications → "Weekly
 * Progress Email" (qmp_weekly_email.email). They are now one setting.
 * `qmp_preferred_email` is the source of truth; the address is mirrored into
 * `qmp_weekly_email.email` so older backups/restores stay compatible.
 */
const KEY = 'qmp_preferred_email';
const WEEKLY_KEY = 'qmp_weekly_email';
const MIGRATED_KEY = 'qmp_email_merged_v1';

const isValid = (e: unknown): e is string => typeof e === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

function readWeekly(): { enabled?: boolean; email?: string } {
  try { return JSON.parse(localStorage.getItem(WEEKLY_KEY) || '{}') || {}; } catch { return {}; }
}

/**
 * One-time migration: if the user only ever set an address in the weekly-email
 * box, adopt it as the shared report email so nothing they chose is lost.
 * An explicitly saved report email always wins.
 */
export function migrateReportEmail(): void {
  try {
    if (localStorage.getItem(MIGRATED_KEY)) return;
    const saved = localStorage.getItem(KEY);
    const weekly = readWeekly();
    if (!isValid(saved) && isValid(weekly.email)) localStorage.setItem(KEY, weekly.email.trim());
    localStorage.setItem(MIGRATED_KEY, '1');
  } catch { /* storage unavailable */ }
}

export function getPreferredEmail(fallbackUserEmail?: string): string {
  migrateReportEmail();
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && saved.includes('@')) return saved;
  } catch { /* */ }
  return fallbackUserEmail || '';
}

export function setPreferredEmail(email: string) {
  const trimmed = email.trim();
  try {
    localStorage.setItem(KEY, trimmed);
    // Mirror for backup compatibility (weekly email reads the shared address)
    const weekly = readWeekly();
    localStorage.setItem(WEEKLY_KEY, JSON.stringify({ ...weekly, enabled: !!weekly.enabled, email: trimmed }));
  } catch { /* */ }
}

export function hasCustomEmail(userEmail?: string): boolean {
  const preferred = getPreferredEmail();
  return !!preferred && preferred !== userEmail;
}

export function isValidEmail(e: string): boolean { return isValid(e); }

/** Weekly progress email on/off — the address comes from the shared report email. */
export function getWeeklyEmailEnabled(): boolean { return !!readWeekly().enabled; }
export function setWeeklyEmailEnabled(enabled: boolean) {
  try {
    const weekly = readWeekly();
    localStorage.setItem(WEEKLY_KEY, JSON.stringify({ ...weekly, enabled, email: getPreferredEmail(weekly.email) }));
  } catch { /* */ }
}
