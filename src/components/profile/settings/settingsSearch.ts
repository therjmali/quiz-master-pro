/**
 * Settings search: case-insensitive, typo-tolerant matching over titles,
 * hints and keyword synonyms. Pure functions — safe to memoise.
 */
export interface SettingEntry {
  id: string;
  section: SectionId;
  title: string;
  hint: string;
  keywords?: string[];
}

export type SectionId =
  | 'updates' | 'appearance' | 'accessibility' | 'quiz' | 'ai' | 'library' | 'autobackup' | 'data' | 'notifications' | 'reminders'
  | 'gestures' | 'cloud' | 'account' | 'device' | 'advanced';

export const SECTION_META: Record<SectionId, { title: string; desc: string }> = {
  updates:       { title: 'App updates',             desc: 'Download and install the latest version inside the app' },
  appearance:    { title: 'Appearance',              desc: 'Theme, colour, text size and visual effects' },
  accessibility: { title: 'Accessibility',         desc: 'Zoom the whole app in or out' },
  quiz:          { title: 'Quiz & Study',            desc: 'Study targets, cards, exam dates and quiz features' },
  ai:            { title: 'AI & Content',            desc: 'AI features, API keys and quiz templates' },
  library:       { title: 'Library & Data',          desc: 'Backups, awards, AI notes and trash' },
  autobackup:    { title: 'Automatic Backups',       desc: 'Scheduled snapshots, restore and export' },
  data:          { title: 'Data & Trash',            desc: 'Storage, deleted results and data checks' },
  notifications: { title: 'Notifications & Email',   desc: 'Daily reminder and email reports' },
  reminders:     { title: 'Smart Reminders',         desc: 'Due cards, streak saver, exam countdown' },
  gestures:      { title: 'Gestures & Shortcuts',    desc: 'Haptics, swipes and keyboard shortcuts' },
  cloud:         { title: 'Account & Cloud Sync',    desc: 'Sign in and sync across devices' },
  account:       { title: 'Profile',                 desc: 'Display name, avatar and preferences' },
  device:        { title: 'App Icon & Device',       desc: 'Install, custom icon and device info' },
  advanced:      { title: 'Advanced & About',        desc: 'Platform badge and resetting preferences' },
};

export const SECTION_ORDER: SectionId[] = ['updates', 'appearance', 'accessibility', 'quiz', 'ai', 'library', 'autobackup', 'data', 'notifications', 'reminders', 'gestures', 'cloud', 'account', 'device', 'advanced'];

export const SETTINGS: SettingEntry[] = [
  // App updates
  { id: 'appUpdate', section: 'updates', title: 'Check for updates', hint: 'See what is new, then download and install the latest version in one tap', keywords: ['update', 'upgrade', 'version', 'install', 'apk', 'release', 'download', 'new version', 'latest'] },
  // Appearance
  { id: 'theme', section: 'appearance', title: 'Theme', hint: 'Light or AMOLED black — styles the whole app and quiz screen', keywords: ['dark mode', 'night', 'black', 'colour scheme', 'skin'] },
  { id: 'accent', section: 'appearance', title: 'Accent colour', hint: 'Highlight colour used for buttons and active states', keywords: ['color', 'primary', 'tint', 'brand'] },
  { id: 'fontSize', section: 'appearance', title: 'Text size', hint: 'Make text smaller or larger across the app', keywords: ['font', 'readability', 'large text'] },
  { id: 'glass', section: 'appearance', title: 'Glass blur intensity', hint: 'How strongly frosted-glass cards blur what is behind them', keywords: ['blur', 'transparency', 'frosted', 'effects', 'performance'] },
  // Accessibility
  { id: 'zoom', section: 'accessibility', title: 'Zoom', hint: 'Make everything in the app smaller or larger', keywords: ['zoom in', 'zoom out', 'magnify', 'scale', 'bigger', 'smaller', 'large text', 'readability', 'accessibility', 'size', 'display', 'ctrl'] },
  // Quiz & Study
  { id: 'goals', section: 'quiz', title: 'Study targets', hint: 'Daily and weekly quiz and question goals', keywords: ['goal', 'target', 'streak', 'daily', 'weekly'] },
  { id: 'scoreOnCards', section: 'quiz', title: 'Show scores on cards', hint: 'Display the percentage on quiz cards', keywords: ['percentage', 'marks', 'result'] },
  { id: 'timeOnCards', section: 'quiz', title: 'Show time on cards', hint: 'Display how long each quiz took', keywords: ['duration', 'timer', 'clock'] },
  { id: 'decimalPct', section: 'quiz', title: 'Decimal percentages', hint: 'Show 76.31% instead of 76%', keywords: ['precision', 'rounding', 'decimal'] },
  { id: 'cardDensity', section: 'quiz', title: 'Card density', hint: 'Comfortable spacing or compact lists', keywords: ['compact', 'spacing', 'layout', 'dense'] },
  { id: 'examDates', section: 'quiz', title: 'Exam dates', hint: 'Add exams to power countdowns and readiness', keywords: ['countdown', 'calendar', 'norcet', 'aiims', 'schedule'] },
  { id: 'features', section: 'quiz', title: 'Feature visibility', hint: 'Show or hide setup tools, dashboard widgets, quiz options and more', keywords: ['shuffle', 'flag', 'confidence', 'adaptive', 'widgets', 'dashboard', 'hide', 'show', 'rationale', 'pdf', 'reports', 'ocr', 'csv', 'highlighter'] },
  // AI & Content
  { id: 'apiKeys', section: 'ai', title: 'API keys', hint: 'Use your own Gemini/Claude/OpenAI keys for AI features', keywords: ['gemini', 'claude', 'openai', 'anthropic', 'key', 'token', 'ai source', 'model'] },
  { id: 'templates', section: 'ai', title: 'Quiz templates', hint: 'Saved quiz configurations for one-tap setup', keywords: ['preset', 'mode', 'exam mode', 'practice', 'norcet', 'aao'] },
  // Library & Data
  { id: 'backup', section: 'library', title: 'Backup & restore', hint: 'Export, import and restore your quiz data', keywords: ['export', 'import', 'json', 'restore', 'save', 'file', 'drive'] },
  { id: 'awards', section: 'library', title: 'Awards', hint: 'Badges and milestones you have earned', keywords: ['badge', 'achievement', 'milestone', 'trophy', 'reward'] },
  { id: 'aiNotes', section: 'library', title: 'AI notes', hint: 'Study notes built from your quiz explanations', keywords: ['notes', 'revision', 'rationale', 'study', 'summary'] },
  { id: 'trash', section: 'library', title: 'Trash', hint: 'Restore or permanently delete removed quizzes', keywords: ['deleted', 'bin', 'recycle', 'restore', 'undo'] },
  // Notifications
  { id: 'reportEmail', section: 'notifications', title: 'Report email', hint: 'Where email reports and weekly summaries are sent', keywords: ['email', 'mail', 'address', 'inbox', 'weekly'] },
  { id: 'weeklyEmail', section: 'notifications', title: 'Weekly progress email', hint: 'A weekly summary of your progress, sent to your report email', keywords: ['summary', 'digest', 'newsletter', 'report'] },
  { id: 'reminder', section: 'notifications', title: 'Daily study reminder', hint: 'A notification on chosen days at a set time', keywords: ['notification', 'alarm', 'alert', 'push', 'remind', 'time', 'days'] },
  // Gestures
  { id: 'haptics', section: 'gestures', title: 'Vibration feedback', hint: 'Subtle vibrations on taps, swipes and actions', keywords: ['haptic', 'vibrate', 'buzz', 'feedback'] },
  { id: 'gestureGuide', section: 'gestures', title: 'Gesture & keyboard guide', hint: 'Swipe, shake, pinch and keyboard shortcuts', keywords: ['swipe', 'shake', 'pinch', 'keyboard', 'shortcut', 'undo', 'long press'] },
  // AI on device
  { id: 'aiOnDevice', section: 'ai', title: 'AI on this device', hint: 'Use your own key so AI works without any server', keywords: ['gemini', 'claude', 'openai', 'cohere', 'key', 'model', 'provider', 'offline ai'] },
  // Automatic backups
  { id: 'autoBackup', section: 'autobackup', title: 'Automatic backups', hint: 'Checked snapshots saved on this device on a schedule', keywords: ['backup', 'snapshot', 'restore', 'export', 'import', 'safety', 'rotate'] },
  // Data & Trash
  { id: 'trashRetention', section: 'data', title: 'Trash retention', hint: 'How long deleted quiz results can be restored', keywords: ['trash', 'bin', 'deleted', 'undo', 'recycle', 'restore', 'purge'] },
  // Reminders
  { id: 'remindersOn', section: 'reminders', title: 'Smart reminders', hint: 'Background notifications for study, review and exams', keywords: ['notification', 'alarm', 'push', 'alert', 'permission'] },
  { id: 'dueReminder', section: 'reminders', title: 'Cards due for review', hint: 'Nudge when flashcards are waiting', keywords: ['spaced repetition', 'flashcards', 'review'] },
  { id: 'streakReminder', section: 'reminders', title: 'Streak saver', hint: 'Evening reminder to protect your streak', keywords: ['streak', 'daily', 'evening'] },
  { id: 'examReminder', section: 'reminders', title: 'Exam countdown', hint: 'Alerts before each exam date', keywords: ['exam', 'countdown', 'norcet', 'days left'] },
  { id: 'quietHours', section: 'reminders', title: 'Quiet hours', hint: 'No reminders during these hours', keywords: ['sleep', 'night', 'do not disturb', 'silent'] },
  // Cloud
  { id: 'cloudAccount', section: 'cloud', title: 'Cloud account', hint: 'Sign in, create an account, reset your password', keywords: ['login', 'sign in', 'register', 'password', 'email', 'supabase', 'cloud'] },
  { id: 'autoSync', section: 'cloud', title: 'Automatic sync', hint: 'Keep devices in step in the background', keywords: ['sync', 'cloud', 'devices', 'upload'] },
  // Device
  { id: 'appIcon', section: 'device', title: 'App icon', hint: 'Use your own picture as the app icon', keywords: ['logo', 'icon', 'image', 'shortcut', 'home screen'] },
  { id: 'installApp', section: 'device', title: 'Install the web app', hint: 'Add the web app to your home screen and see device info', keywords: ['pwa', 'install', 'version', 'offline', 'home screen'] },
  // Account
  { id: 'signIn', section: 'account', title: 'Account', hint: 'Sign in to sync and back up your data', keywords: ['login', 'logout', 'sign out', 'google', 'user'] },
  { id: 'displayName', section: 'account', title: 'Display name', hint: 'The name shown on your dashboard and reports', keywords: ['name', 'username', 'nickname', 'profile'] },
  { id: 'avatar', section: 'account', title: 'Avatar', hint: 'Emoji shown next to your name', keywords: ['emoji', 'picture', 'icon', 'profile photo'] },
  { id: 'autoCloudBackup', section: 'account', title: 'Auto cloud backup', hint: 'Keep your quiz data synced to the cloud automatically', keywords: ['sync', 'cloud', 'backup', 'automatic'] },
  { id: 'allowCloudRestore', section: 'account', title: 'Allow cloud restore', hint: 'Let this device restore from cloud backups', keywords: ['restore', 'cloud', 'recover'] },
  // Advanced
  { id: 'hideBadge', section: 'advanced', title: 'Hide platform badge', hint: 'Hide the "Made with Zite" badge', keywords: ['zite', 'watermark', 'branding', 'logo'] },
  { id: 'resetAll', section: 'advanced', title: 'Reset all preferences', hint: 'Reset sort, filter and view choices — your quizzes are kept', keywords: ['reset', 'defaults', 'clear', 'factory'] },
];

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

/** Bounded Levenshtein — returns early once distance exceeds `max`. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}

function tokenScore(token: string, text: string, words: string[]): number {
  if (text.includes(token)) return 3;
  if (token.length < 3) return 0;
  const tol = token.length >= 7 ? 2 : 1;
  for (const w of words) {
    if (w.startsWith(token.slice(0, Math.max(3, token.length - 1)))) return 2;
    if (within(token, w, tol) || (w.length > token.length && within(token, w.slice(0, token.length), tol))) return 1;
  }
  return 0;
}

export interface SearchHit { entry: SettingEntry; score: number }

export function searchSettings(query: string): SearchHit[] {
  const q = norm(query).trim();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  const hits: SearchHit[] = [];
  for (const entry of SETTINGS) {
    const title = norm(entry.title);
    const text = norm([entry.title, entry.hint, SECTION_META[entry.section].title, ...(entry.keywords || [])].join(' '));
    const words = text.split(/[^a-z0-9]+/).filter(Boolean);
    let score = 0;
    let ok = true;
    for (const t of tokens) {
      const s = tokenScore(t, text, words);
      if (!s) { ok = false; break; }
      score += s + (title.includes(t) ? 2 : 0);
    }
    if (ok) hits.push({ entry, score });
  }
  return hits.sort((a, b) => b.score - a.score);
}

/** Split text into [plain, match, plain, …] segments for highlighting (substring matches only). */
export function highlightParts(text: string, query: string): { text: string; match: boolean }[] {
  const tokens = norm(query).trim().split(/\s+/).filter(t => t.length >= 2);
  if (!tokens.length) return [{ text, match: false }];
  const lower = norm(text);
  const marks = new Array(text.length).fill(false);
  for (const t of tokens) {
    let i = lower.indexOf(t);
    while (i !== -1) { for (let k = i; k < i + t.length && k < marks.length; k++) marks[k] = true; i = lower.indexOf(t, i + t.length); }
  }
  const out: { text: string; match: boolean }[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else out.push({ text: text[i], match: marks[i] });
  }
  return out;
}
