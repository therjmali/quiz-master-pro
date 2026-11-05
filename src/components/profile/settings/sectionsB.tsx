import { memo, useState } from 'react';
import { useAuth, loginWithRedirect, logout } from 'zitejs/auth';
import { sendWeeklyReport } from 'zitejs/api';
import {
  Sparkles, KeyRound, LayoutTemplate, Database, Download, Trash2, Bell, Hand, UserRound, Settings2,
  LogIn, LogOut, Loader2, Send, Check,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@project/components/ui/alert-dialog';
import { useProfileStore } from '../../../hooks/useProfileStore';
import { getHapticsEnabled, setHapticsEnabled } from '../../../utils/haptics';
import {
  getPreferredEmail, setPreferredEmail, isValidEmail, getWeeklyEmailEnabled, setWeeklyEmailEnabled,
} from '../../../utils/preferredEmail';
import { loadReminderConfig, saveReminderConfig, requestNotificationPermission, type ReminderConfig } from '../../../utils/studyReminders';
import { clearAllPreferences } from '../../../hooks/usePersistedState';
import { clearHistoryCache } from '../../../hooks/useHistorySync';
import type { QuizResult } from '../../../types/quiz';
import BackupSection from '../BackupSection';
import GestureShortcutsPanel from '../../GestureShortcutsPanel';
import { SettingsSection, SettingRow, SubHeading, Toggle, LinkRow } from './controls';
import { AiProvidersPanel } from './sectionsPlatform';
import { hasBackend } from '../../../platform/ai/caller';
import type { SectionProps } from './sectionsA';

export type ProfileTabLink = 'apikeys' | 'templates' | 'trash' | 'downloads';
type Dirty = () => void;

/* ═════════ AI & Content ═════════ */
export const AISection = memo(function AISection({ open, onToggle, onOpenTab }: SectionProps & { onOpenTab?: (t: ProfileTabLink) => void }) {
  return (
    <SettingsSection id="ai" icon={<Sparkles className="w-4 h-4" />} open={open} onToggle={onToggle}>
      <SubHeading>AI on this device</SubHeading>
      <AiProvidersPanel />
      <SubHeading>AI source</SubHeading>
      <LinkRow id="apiKeys" icon={<KeyRound className="w-4 h-4" />} title="API keys" hint="Use your own Gemini/Claude/OpenAI keys for AI features" onClick={() => onOpenTab?.('apikeys')} />
      <SubHeading>Content</SubHeading>
      <LinkRow id="templates" icon={<LayoutTemplate className="w-4 h-4" />} title="Quiz templates" hint="Saved quiz configurations for one-tap setup" onClick={() => onOpenTab?.('templates')} />
      <p className="text-[11px] text-foreground/40 pt-2 leading-snug">Turn individual AI features on or off under Quiz & Study → Feature visibility. Rationale style is chosen on the quiz setup screen.</p>
    </SettingsSection>
  );
});

/* ═════════ Library & Data ═════════ */
export const LibrarySection = memo(function LibrarySection({ open, onToggle, onOpenTab, isLoggedIn, history }: SectionProps & { onOpenTab?: (t: ProfileTabLink) => void; isLoggedIn: boolean; history: QuizResult[] }) {
  return (
    <SettingsSection id="library" icon={<Database className="w-4 h-4" />} open={open} onToggle={onToggle}>
      <SubHeading>Backup</SubHeading>
      <SettingRow id="backup" title="Backup & restore" hint="Export, import and restore your quiz data" inline={false}
        control={open ? <BackupSection isLoggedIn={isLoggedIn} history={history} /> : null} />
      <SubHeading>Files</SubHeading>
      <LinkRow id="downloads" icon={<Download className="w-4 h-4" />} title="Downloads" hint="PDFs and reports you have generated" onClick={() => onOpenTab?.('downloads')} />
      <LinkRow id="trash" icon={<Trash2 className="w-4 h-4" />} title="Trash" hint="Restore or permanently delete removed quizzes" onClick={() => onOpenTab?.('trash')} />
    </SettingsSection>
  );
});

/* ═════════ Notifications & Reminders ═════════ */
const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const NotificationsSection = memo(function NotificationsSection({ open, onToggle, markDirty }: SectionProps & { markDirty: Dirty }) {
  const { user } = useAuth();
  const [email, setEmail] = useState(() => getPreferredEmail(user?.email));
  const [savedEmail, setSavedEmail] = useState(email);
  const [weekly, setWeekly] = useState(getWeeklyEmailEnabled);
  const [sending, setSending] = useState(false);
  const [reminder, setReminder] = useState<ReminderConfig>(loadReminderConfig);

  const dirtyEmail = email.trim() !== savedEmail;
  const saveEmail = () => {
    const t = email.trim();
    if (!isValidEmail(t)) { toast.error('Enter a valid email address'); return; }
    setPreferredEmail(t); setEmail(t); setSavedEmail(t); markDirty();
    toast.success(`Reports will be sent to ${t}`);
  };
  const setRem = (r: ReminderConfig) => { setReminder(r); saveReminderConfig(r); };
  const toggleReminder = async (on: boolean) => {
    if (on && !(await requestNotificationPermission())) { toast.error('Notifications are blocked for this site. Allow them in your browser settings.'); return; }
    setRem({ ...reminder, enabled: on });
    toast.success(on ? 'Reminder enabled' : 'Reminder disabled');
  };
  const sendNow = async () => {
    if (!isValidEmail(savedEmail)) { toast.error('Save a report email first'); return; }
    setSending(true);
    try { await sendWeeklyReport({ email: savedEmail }); toast.success(`Report sent to ${savedEmail}`); }
    catch (e: any) { toast.error(e?.message || 'Failed to send'); }
    finally { setSending(false); }
  };
  const reset = () => {
    setRem({ enabled: false, time: '09:00', days: [1, 2, 3, 4, 5] });
    setWeekly(false); setWeeklyEmailEnabled(false);
    toast.success('Notifications reset — your report email was kept');
  };

  return (
    <SettingsSection id="notifications" icon={<Bell className="w-4 h-4" />} open={open} onToggle={onToggle} onReset={reset}>
      <SubHeading>Email</SubHeading>
      <SettingRow id="reportEmail" title="Report email" hint="Where email reports and weekly summaries are sent" inline={false}
        control={
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input type="email" inputMode="email" autoComplete="email" value={email} placeholder="you@example.com"
                onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveEmail()}
                aria-label="Report email"
                className="flex-1 min-w-0 h-10 bg-foreground/[0.04] border border-border focus:border-primary/50 rounded-xl px-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none transition-colors" />
              <button type="button" onClick={saveEmail} disabled={!dirtyEmail}
                className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40 transition-opacity">
                {dirtyEmail ? 'Save' : <Check className="w-4 h-4" />}
              </button>
            </div>
            {user?.email && savedEmail && savedEmail !== user.email && (
              <p className="text-[11px] text-foreground/45">
                Custom address · sign-in is {user.email}.{' '}
                <button type="button" className="font-bold text-primary hover:underline"
                  onClick={() => { setPreferredEmail(user.email!); setEmail(user.email!); setSavedEmail(user.email!); markDirty(); toast.success('Using your sign-in email'); }}>
                  Use sign-in email
                </button>
              </p>
            )}
          </div>
        } />
      <SettingRow id="weeklyEmail" title="Weekly progress email" hint="A weekly summary of your progress, sent to your report email"
        control={<Toggle label="Weekly progress email" checked={weekly} onChange={v => { setWeekly(v); setWeeklyEmailEnabled(v); markDirty(); toast.success(v ? 'Weekly email enabled' : 'Weekly email disabled'); }} />}>
        {weekly && (
          <div className="mt-2.5 space-y-1.5">
            <button type="button" onClick={sendNow} disabled={sending}
              className="w-full h-9 inline-flex items-center justify-center gap-2 rounded-xl bg-primary/10 border border-primary/20 text-primary text-xs font-bold disabled:opacity-50">
              {sending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              {sending ? 'Sending…' : 'Send a report now'}
            </button>
            <p className="text-[10px] text-foreground/35">Automatic weekly delivery requires a plan upgrade — use "Send a report now" meanwhile.</p>
          </div>
        )}
      </SettingRow>
      <SubHeading>Reminders</SubHeading>
      <SettingRow id="reminder" title="Daily study reminder" hint="A notification on chosen days at a set time"
        control={<Toggle label="Daily study reminder" checked={reminder.enabled} onChange={toggleReminder} />}>
        {reminder.enabled && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-foreground/60">Time</span>
              <input type="time" value={reminder.time} aria-label="Reminder time" onChange={e => setRem({ ...reminder, time: e.target.value })}
                className="h-9 bg-foreground/[0.04] border border-border rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
            </div>
            <div className="flex justify-between gap-1">
              {DAYS.map((d, i) => {
                const on = reminder.days.includes(i);
                return (
                  <button key={i} type="button" aria-pressed={on} aria-label={DAY_NAMES[i]}
                    onClick={() => setRem({ ...reminder, days: on ? reminder.days.filter(x => x !== i) : [...reminder.days, i].sort() })}
                    className={`flex-1 max-w-10 aspect-square rounded-lg text-xs font-bold transition-colors ${on ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.05] text-foreground/45'}`}>
                    {d}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </SettingRow>
    </SettingsSection>
  );
});

/* ═════════ Gestures & Shortcuts ═════════ */
export const GesturesSection = memo(function GesturesSection({ open, onToggle }: SectionProps) {
  const [haptics, setHaptics] = useState(getHapticsEnabled);
  const apply = (v: boolean) => { setHaptics(v); setHapticsEnabled(v); if (v) navigator.vibrate?.(10); };
  return (
    <SettingsSection id="gestures" icon={<Hand className="w-4 h-4" />} open={open} onToggle={onToggle}
      onReset={() => { apply(true); toast.success('Gestures reset to defaults'); }}>
      <SubHeading>Feedback</SubHeading>
      <SettingRow id="haptics" title="Vibration feedback" hint="Subtle vibrations on taps, swipes and actions"
        control={<Toggle label="Vibration feedback" checked={haptics} onChange={v => { apply(v); toast.success(v ? 'Haptics enabled' : 'Haptics disabled'); }} />} />
      <SubHeading>Shortcuts</SubHeading>
      <div id="setting-gestureGuide" data-setting-id="gestureGuide" className="setting-row py-3 scroll-mt-28 rounded-lg">
        <GestureShortcutsPanel />
      </div>
    </SettingsSection>
  );
});

/* ═════════ Account & Sync ═════════ */
const EMOJIS = ['🧑‍⚕️', '👨‍🏫', '👩‍🏫', '🧠', '📚', '🎓', '🏥', '⚡', '🌟', '🔬', '💡', '🏆', '🩺', '🦁', '🐯', '🦊'];
interface BackupPrefs { autoDriveBackup?: boolean; allowDriveRestore?: boolean; autoCloudBackup: boolean; allowCloudRestore: boolean }
const DEFAULT_BACKUP: BackupPrefs = { autoDriveBackup: true, allowDriveRestore: true, autoCloudBackup: true, allowCloudRestore: true };
const loadBackup = (): BackupPrefs => { try { return { ...DEFAULT_BACKUP, ...JSON.parse(localStorage.getItem('qmp_backup_prefs') || '{}') }; } catch { return DEFAULT_BACKUP; } };

export const AccountSection = memo(function AccountSection({ open, onToggle, markDirty }: SectionProps & { markDirty: Dirty }) {
  const { user } = useAuth();
  const { profile, update } = useProfileStore();
  const [name, setName] = useState(profile.displayName);
  const [backup, setBackup] = useState<BackupPrefs>(loadBackup);

  const saveName = () => {
    const t = name.trim().slice(0, 24);
    if (!t) { toast.error('Name cannot be empty'); return; }
    update({ displayName: t }); setName(t); markDirty(); toast.success('Display name updated');
  };
  const setPref = (next: BackupPrefs) => { setBackup(next); try { localStorage.setItem('qmp_backup_prefs', JSON.stringify(next)); } catch {} markDirty(); };

  return (
    <SettingsSection id="account" icon={<UserRound className="w-4 h-4" />} open={open} onToggle={onToggle}
      onReset={() => { setPref({ ...DEFAULT_BACKUP }); toast.success('Sync preferences reset — your profile was kept'); }}>
      {hasBackend() && (
        <>
          <SubHeading>Account</SubHeading>
          <SettingRow id="signIn" title="Account" hint={user ? `Signed in as ${user.email}` : 'Guest mode — sign in to sync and back up your data'} inline={false}
            control={user ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button type="button" className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl border border-destructive/30 text-destructive text-sm font-bold hover:bg-destructive/10 transition-colors">
                    <LogOut className="w-4 h-4" /> Sign out
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Sign out?</AlertDialogTitle>
                    <AlertDialogDescription>You can sign back in anytime to access your synced data.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => { clearHistoryCache(); logout(); }} className="bg-destructive hover:bg-destructive/90 text-destructive-foreground">Sign out</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <button type="button" onClick={() => loginWithRedirect()} className="w-full h-10 inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground text-sm font-bold">
                <LogIn className="w-4 h-4" /> Sign in
              </button>
            )} />
        </>
      )}
      <SubHeading>Profile</SubHeading>
      <SettingRow id="displayName" title="Display name" hint="The name shown on your dashboard and reports (max 24 characters)" inline={false}
        control={
          <div className="flex gap-2">
            <input value={name} maxLength={24} placeholder="Your name" aria-label="Display name"
              onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()}
              className="flex-1 min-w-0 h-10 bg-foreground/[0.04] border border-border focus:border-primary/50 rounded-xl px-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none" />
            <button type="button" onClick={saveName} disabled={name.trim() === profile.displayName}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-40">Save</button>
          </div>
        } />
      <SettingRow id="avatar" title="Avatar" hint="Emoji shown next to your name" inline={false}
        control={
          <div className="grid grid-cols-8 gap-1.5">
            {EMOJIS.map(e => (
              <button key={e} type="button" aria-pressed={profile.avatarEmoji === e}
                onClick={() => { update({ avatarEmoji: e }); markDirty(); }}
                className={`aspect-square text-lg rounded-lg flex items-center justify-center transition-all ${profile.avatarEmoji === e ? 'bg-primary/15 ring-2 ring-primary' : 'bg-foreground/[0.04] hover:bg-foreground/[0.08]'}`}>
                {e}
              </button>
            ))}
          </div>
        } />
      {hasBackend() && (
        <>
          <SubHeading>Cloud sync</SubHeading>
          <SettingRow id="autoCloudBackup" title="Auto cloud backup" hint="Keep your quiz data synced to the cloud automatically"
            control={<Toggle label="Auto cloud backup" checked={backup.autoCloudBackup} onChange={v => setPref({ ...backup, autoCloudBackup: v })} />} />
          <SettingRow id="allowCloudRestore" title="Allow cloud restore" hint="Let this device restore from cloud backups"
            control={<Toggle label="Allow cloud restore" checked={backup.allowCloudRestore} onChange={v => setPref({ ...backup, allowCloudRestore: v })} />} />
        </>
      )}
    </SettingsSection>
  );
});

/* ═════════ Advanced & About ═════════ */
export const AdvancedSection = memo(function AdvancedSection({ open, onToggle }: SectionProps) {
  const [hide, setHide] = useState(() => { try { return localStorage.getItem('qmp_hide_zite_badge') === 'true'; } catch { return false; } });
  const apply = (v: boolean) => {
    setHide(v);
    try { localStorage.setItem('qmp_hide_zite_badge', String(v)); } catch {}
    window.dispatchEvent(new Event('qmp-badge-change'));
  };
  return (
    <SettingsSection id="advanced" icon={<Settings2 className="w-4 h-4" />} open={open} onToggle={onToggle}
      onReset={() => { apply(false); toast.success('Advanced reset to defaults'); }}>
      <SubHeading>Display</SubHeading>
      <SettingRow id="hideBadge" title="Hide platform badge" hint='Hide the "Made with Zite" badge'
        control={<Toggle label="Hide platform badge" checked={hide} onChange={v => { apply(v); toast.success(v ? 'Badge hidden' : 'Badge visible'); }} />} />
      <SubHeading>Danger zone</SubHeading>
      <SettingRow id="resetAll" title="Reset all preferences" hint="Reset sort, filter and view choices — your quizzes are kept" inline={false}
        control={
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button type="button" className="w-full h-10 rounded-xl border border-destructive/30 text-destructive text-sm font-bold hover:bg-destructive/10 transition-colors">Reset all preferences</button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset all preferences?</AlertDialogTitle>
                <AlertDialogDescription>Sort, filter and view choices go back to defaults and the app reloads. Your quiz data is not deleted.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { clearAllPreferences(); toast.success('Preferences reset — reloading…'); setTimeout(() => window.location.reload(), 800); }}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        } />
    </SettingsSection>
  );
});
