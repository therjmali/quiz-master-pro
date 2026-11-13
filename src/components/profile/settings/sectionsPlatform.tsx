import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  DatabaseBackup, Download, Upload, ShieldCheck, Trash2, RotateCcw, BellRing, Smartphone, HardDrive, ImagePlus, Pin,
  Sparkles, Eye, EyeOff, CheckCircle2, ArchiveRestore, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  listBackups, createBackup, restoreBackup, deleteBackup, verifyBackup, exportBackup, importBackupFile, parseBackupBytes,
  getBackupSettings, saveBackupSettings, countSections, type BackupMeta, type BackupFile, type BackupSettings,
} from '../../../platform/autoBackup';
import { saveBlobFile, readFileBytes } from '../../../platform/files';
import { readAllLocalSections } from '../../../platform/cloud/sections';
import {
  getNotifySettings, saveNotifySettings, getPermission, requestPermission, rescheduleAll, sendTestNotification, currentPlan,
  canDeliverInBackground, type PermissionState,
} from '../../../platform/notify/notifier';
import type { NotifySettings, Planned } from '../../../platform/notify/planner';
import { loadReminderConfig } from '../../../utils/studyReminders';
import {
  loadHistoryTrash, deleteFromHistoryTrash, emptyHistoryTrash, resultKey, getTrashRetentionDays, setTrashRetentionDays,
  daysLeft, onHistoryTrashChange, type TrashedResult,
} from '../../../utils/historyTrash';
import { restoreFromHistoryTrash } from '../../../utils/historyTrashActions';
import { appVersion, isNative, isStandalonePwa, platformName } from '../../../platform/native';
import { usePwaState, promptInstall } from '../../../platform/pwa';
import {
  getAppIcon, useAppIcon, saveAppIcon, resetAppIcon, loadBitmap, renderIcon, buildLauncherIcon, pinIconShortcut, nativeIconSupported,
  IconError, type CropState,
} from '../../../platform/appIcon';
import {
  PROVIDERS, PROVIDER_ORDER, getAiClientPrefs, saveAiClientPrefs, testProviderKey, type ProviderId,
} from '../../../platform/ai/providers';
import { getUserApiKeys, saveUserApiKeys, maskKey } from '../../../utils/apiKeys';
import { SettingsSection, SettingRow, SubHeading, Toggle, Segmented } from './controls';
import { Btn, Card, Confirm, Meter, Pill, TextField, formatBytes, timeAgo } from './platformUi';
import type { SectionProps } from './sectionsA';
import type { ProfileTabLink } from './sectionsB';

const reloadSoon = () => { setTimeout(() => window.location.reload(), 900); };

/* ═════════════════════════ Automatic backups ═════════════════════════ */

const REASON_LABEL: Record<BackupMeta['reason'], string> = {
  auto: 'Automatic', manual: 'Manual', 'before-restore': 'Before restore', 'before-import': 'Before import', 'before-reset': 'Before reset', 'before-cloud': 'Before cloud change',
};

export const AutoBackupSection = memo(function AutoBackupSection({ open, onToggle }: SectionProps) {
  const [settings, setSettings] = useState<BackupSettings>(getBackupSettings);
  const [list, setList] = useState<BackupMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupMeta | null>(null);
  const [importFile, setImportFile] = useState<BackupFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => { listBackups().then(setList).catch(() => setList([])); }, []);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const update = (patch: Partial<BackupSettings>) => { const next = { ...settings, ...patch }; setSettings(next); saveBackupSettings(next); };
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); try { await fn(); } catch (e) { toast.error((e as Error).message || 'Something went wrong'); } finally { setBusy(null); refresh(); } };

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    try { setImportFile(await parseBackupBytes(await readFileBytes(file))); }
    catch (e) { toast.error((e as Error).message); }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <SettingsSection id="autobackup" icon={<DatabaseBackup className="w-4 h-4" />} open={open} onToggle={onToggle}
      onReset={() => { update({ enabled: true, intervalHours: 24, keep: 7 }); toast.success('Backup settings reset'); }}>
      <SubHeading>Automatic backups</SubHeading>
      <SettingRow id="autoBackup" title="Back up automatically" hint="A checked, compressed snapshot is saved on this device whenever your data changed since the last one"
        control={<Toggle checked={settings.enabled} onChange={v => update({ enabled: v })} label="Back up automatically" />}>
        {settings.enabled && (
          <div className="mt-3 space-y-3">
            <div>
              <p className="text-[11px] font-bold text-foreground/55 mb-1.5">How often</p>
              <Segmented label="Backup interval" value={String(settings.intervalHours)} onChange={v => update({ intervalHours: Number(v) })}
                options={[{ value: '6', label: '6 h' }, { value: '12', label: '12 h' }, { value: '24', label: 'Daily' }, { value: '168', label: 'Weekly' }]} />
            </div>
            <div>
              <p className="text-[11px] font-bold text-foreground/55 mb-1.5">Keep the latest</p>
              <Segmented label="Backups to keep" value={String(settings.keep)} onChange={v => update({ keep: Number(v) })}
                options={[{ value: '3', label: '3' }, { value: '7', label: '7' }, { value: '14', label: '14' }, { value: '30', label: '30' }]} />
            </div>
          </div>
        )}
      </SettingRow>

      <div className="flex flex-wrap gap-2 py-3">
        <Btn tone="primary" icon={<DatabaseBackup className="w-3.5 h-3.5" />} busy={busy === 'now'} onClick={() => void run('now', async () => { const m = await createBackup('manual'); toast[m ? 'success' : 'info'](m ? 'Backup saved' : 'Nothing to back up yet'); })}>Back up now</Btn>
        <Btn icon={<Download className="w-3.5 h-3.5" />} busy={busy === 'export'} onClick={() => void run('export', async () => { const f = await exportBackup(); await saveBlobFile(f.filename, f.blob); toast.success('Backup file ready'); })}>Export to file</Btn>
        <Btn icon={<Upload className="w-3.5 h-3.5" />} onClick={() => fileInput.current?.click()}>Import file</Btn>
        <input ref={fileInput} type="file" accept=".json,application/json,.gz" className="hidden" onChange={e => void pickFile(e.target.files?.[0])} />
      </div>

      <SubHeading>Saved on this device</SubHeading>
      {list.length === 0 ? <p className="text-[12px] text-foreground/45 py-2">No backups yet. The first one is taken automatically soon after you start using the app.</p> : (
        <ul className="space-y-1.5 pb-1">
          {list.map(b => (
            <li key={b.id} className="rounded-xl border border-border bg-foreground/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-bold text-foreground">{new Date(b.createdAt).toLocaleString()}</span>
                <Pill tone={b.reason === 'auto' ? 'info' : b.reason === 'manual' ? 'neutral' : 'warn'}>{REASON_LABEL[b.reason]}</Pill>
              </div>
              <p className="text-[11px] text-foreground/45 mt-0.5">{b.counts.history} quiz results - {b.counts.folders} bookmark folders - {formatBytes(b.bytes)} - {timeAgo(b.createdAt)}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Btn small icon={<ArchiveRestore className="w-3 h-3" />} onClick={() => setRestoreTarget(b)}>Restore</Btn>
                <Btn small icon={<Download className="w-3 h-3" />} onClick={() => void run(`x${b.id}`, async () => { const f = await exportBackup(b.id); await saveBlobFile(f.filename, f.blob); })}>Export</Btn>
                <Btn small icon={<ShieldCheck className="w-3 h-3" />} onClick={() => void verifyBackup(b.id).then(r => toast[r.ok ? 'success' : 'error'](r.message))}>Check</Btn>
                <Btn small tone="danger" icon={<Trash2 className="w-3 h-3" />} onClick={() => void run(`d${b.id}`, async () => { await deleteBackup(b.id); })}>Delete</Btn>
              </div>
            </li>
          ))}
        </ul>
      )}
      <Card tone="info"><p className="text-[11px] text-foreground/60 leading-relaxed">Backups live inside this app's storage, so <b>uninstalling the app or clearing its data deletes them</b>. For a copy that survives, use cloud sync or <b>Export to file</b> and keep the file somewhere safe. API keys are never included.</p></Card>

      <Confirm open={!!restoreTarget} onOpenChange={v => !v && setRestoreTarget(null)} danger={false} title="Restore this backup?"
        body={<><p>Your data goes back to {restoreTarget ? new Date(restoreTarget.createdAt).toLocaleString() : ''} ({restoreTarget?.counts.history} quiz results).</p><p>A safety backup of the current state is saved first, so you can undo this.</p></>}
        confirmLabel="Restore" onConfirm={async () => { const r = await restoreBackup(restoreTarget!.id); setRestoreTarget(null); toast.success(r.applied.length ? 'Restored - refreshing the app' : 'Already identical - nothing changed'); if (r.applied.length) reloadSoon(); }} />
      <Confirm open={!!importFile} onOpenChange={v => !v && setImportFile(null)} danger={false} title="Import this backup file?"
        body={importFile ? <><p>Made {new Date(importFile.createdAt).toLocaleString()} with version {importFile.appVersion}: {countSections(importFile.sections).history} quiz results, {countSections(importFile.sections).sections} data groups. The file is intact.</p><p>It replaces the data on this device. A safety backup is saved first.</p></> : null}
        confirmLabel="Import" onConfirm={async () => { const r = await importBackupFile(importFile!); setImportFile(null); toast.success(r.applied.length ? 'Imported - refreshing the app' : 'Already identical - nothing changed'); if (r.applied.length) reloadSoon(); }} />
    </SettingsSection>
  );
});

/* ═════════════════════════ Reminders & alerts ═════════════════════════ */

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const RemindersSection = memo(function RemindersSection({ open, onToggle }: SectionProps) {
  const [s, setS] = useState<NotifySettings>(getNotifySettings);
  const [perm, setPerm] = useState<PermissionState>('prompt');
  const [plan, setPlan] = useState<Planned[]>([]);
  const [busy, setBusy] = useState(false);
  const background = canDeliverInBackground();

  const refresh = useCallback(() => { void getPermission().then(setPerm); setPlan(currentPlan().slice(0, 5)); }, []);
  useEffect(() => { if (open) refresh(); }, [open, refresh]);

  const commit = (next: NotifySettings) => { setS(next); saveNotifySettings(next); void rescheduleAll().then(refresh); };

  const toggleMaster = async (on: boolean) => {
    if (on) {
      const p = await requestPermission();
      setPerm(p);
      if (p !== 'granted') { toast.error(p === 'unsupported' ? 'This device does not support notifications.' : 'Notifications are blocked. Allow them in your device or browser settings.'); return; }
    }
    commit({ ...s, enabled: on });
    toast.success(on ? 'Reminders on' : 'Reminders off');
  };

  const timeInput = (value: string, onChange: (v: string) => void, label: string) => (
    <input type="time" value={value} aria-label={label} onChange={e => onChange(e.target.value)}
      className="h-9 bg-foreground/[0.04] border border-border rounded-xl px-3 text-sm text-foreground focus:outline-none focus:border-primary/50" />
  );
  const daily = loadReminderConfig();

  return (
    <SettingsSection id="reminders" icon={<BellRing className="w-4 h-4" />} open={open} onToggle={onToggle}
      onReset={() => { commit({ ...getNotifySettings(), enabled: false, dueReviews: { on: true, time: '18:00' }, streak: { on: true, time: '20:30' }, exams: { on: true }, weekly: { on: false, day: 0, time: '18:00' }, quiet: { on: true, start: '22:00', end: '07:00' } }); toast.success('Reminders reset'); }}>
      <SettingRow id="remindersOn" title="Smart reminders" hint={background ? 'Delivered by Android even when the app is closed' : 'Shown while the app is open - install the Android app for background delivery'}
        control={<Toggle checked={s.enabled} onChange={v => void toggleMaster(v)} label="Smart reminders" />} />
      {!background && <Card tone="info"><p className="text-[11px] text-foreground/60 leading-relaxed">Browsers cannot wake a closed web app, so on the web a reminder only appears while Quiz Master is open. The Android app schedules real notifications that arrive on time.</p></Card>}
      {perm === 'denied' && <p className="text-[11px] font-semibold text-destructive pt-2">Notifications are blocked for this app. Turn them on in your device or browser settings.</p>}

      <div className={s.enabled ? '' : 'opacity-50 pointer-events-none select-none'} aria-disabled={!s.enabled}>
        <SubHeading>What to remind me about</SubHeading>
        <div className="py-2 text-[12px] text-foreground/55">Daily study reminder: <b className="text-foreground/80">{daily.enabled ? `${daily.time} on ${daily.days.length} day${daily.days.length === 1 ? '' : 's'}` : 'off'}</b> <span className="text-foreground/35">(set it in Notifications above)</span></div>
        <SettingRow id="dueReminder" title="Cards due for review" hint="A nudge when spaced-repetition cards are waiting"
          control={<Toggle checked={s.dueReviews.on} onChange={v => commit({ ...s, dueReviews: { ...s.dueReviews, on: v } })} label="Cards due for review" />}>
          {s.dueReviews.on && <div className="mt-2 flex items-center justify-between"><span className="text-xs font-bold text-foreground/60">Time</span>{timeInput(s.dueReviews.time, v => commit({ ...s, dueReviews: { ...s.dueReviews, time: v } }), 'Due review time')}</div>}
        </SettingRow>
        <SettingRow id="streakReminder" title="Streak saver" hint="Reminds you in the evening if you have a streak and have not studied yet"
          control={<Toggle checked={s.streak.on} onChange={v => commit({ ...s, streak: { ...s.streak, on: v } })} label="Streak saver" />}>
          {s.streak.on && <div className="mt-2 flex items-center justify-between"><span className="text-xs font-bold text-foreground/60">Time</span>{timeInput(s.streak.time, v => commit({ ...s, streak: { ...s.streak, time: v } }), 'Streak saver time')}</div>}
        </SettingRow>
        <SettingRow id="examReminder" title="Exam countdown" hint="Alerts at 30, 14, 7, 3 and 1 days before each exam, and on the day"
          control={<Toggle checked={s.exams.on} onChange={v => commit({ ...s, exams: { on: v } })} label="Exam countdown" />} />
        <SettingRow id="weeklyReminder" title="Weekly summary" hint="A weekly nudge to review your progress"
          control={<Toggle checked={s.weekly.on} onChange={v => commit({ ...s, weekly: { ...s.weekly, on: v } })} label="Weekly summary" />}>
          {s.weekly.on && (
            <div className="mt-2 flex items-center justify-between gap-2">
              <select value={s.weekly.day} aria-label="Weekly summary day" onChange={e => commit({ ...s, weekly: { ...s.weekly, day: Number(e.target.value) } })}
                className="h-9 bg-foreground/[0.04] border border-border rounded-xl px-2 text-sm text-foreground">{DAY_NAMES.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
              {timeInput(s.weekly.time, v => commit({ ...s, weekly: { ...s.weekly, time: v } }), 'Weekly summary time')}
            </div>
          )}
        </SettingRow>
        <SettingRow id="quietHours" title="Quiet hours" hint="No reminders during these hours"
          control={<Toggle checked={s.quiet.on} onChange={v => commit({ ...s, quiet: { ...s.quiet, on: v } })} label="Quiet hours" />}>
          {s.quiet.on && <div className="mt-2 flex items-center gap-2 justify-end text-xs font-bold text-foreground/60">From {timeInput(s.quiet.start, v => commit({ ...s, quiet: { ...s.quiet, start: v } }), 'Quiet hours start')} to {timeInput(s.quiet.end, v => commit({ ...s, quiet: { ...s.quiet, end: v } }), 'Quiet hours end')}</div>}
        </SettingRow>

        <SubHeading>Coming up</SubHeading>
        {plan.length === 0 ? <p className="text-[12px] text-foreground/45">Nothing scheduled right now.</p> : (
          <ul className="space-y-1">
            {plan.map(p => <li key={p.id} className="flex justify-between gap-3 text-[12px]"><span className="text-foreground/75 truncate">{p.title}</span><span className="text-foreground/40 flex-shrink-0">{p.at.toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</span></li>)}
          </ul>
        )}
        <div className="pt-3"><Btn busy={busy} icon={<BellRing className="w-3.5 h-3.5" />} onClick={() => { setBusy(true); void sendTestNotification().then(r => toast[r.ok ? 'success' : 'error'](r.message)).finally(() => setBusy(false)); }}>Send a test</Btn></div>
        <p className="text-[11px] text-foreground/40 pt-2 leading-snug">Reminders refresh every time you open the app, so a quiet week never turns into a stream of nagging.</p>
      </div>
    </SettingsSection>
  );
});

/* ═════════════════════════ Data & Trash ═════════════════════════ */

export const DataSection = memo(function DataSection({ open, onToggle, onOpenTab }: SectionProps & { onOpenTab?: (t: ProfileTabLink) => void }) {
  const [trash, setTrash] = useState<TrashedResult[]>([]);
  const [retention, setRetention] = useState(getTrashRetentionDays);
  const [usage, setUsage] = useState<{ used: number; quota: number; persisted: boolean | null } | null>(null);
  const [counts, setCounts] = useState<ReturnType<typeof countSections> | null>(null);
  const [check, setCheck] = useState<string[] | null>(null);
  const [emptyOpen, setEmptyOpen] = useState(false);

  const refresh = useCallback(() => {
    void loadHistoryTrash().then(t => setTrash([...t]));
    void (async () => {
      try {
        const est = await navigator.storage?.estimate?.();
        const persisted = (await navigator.storage?.persisted?.()) ?? null;
        setUsage({ used: est?.usage ?? 0, quota: est?.quota ?? 0, persisted });
      } catch { setUsage(null); }
      try { setCounts(countSections(await readAllLocalSections())); } catch { /* ignore */ }
    })();
  }, []);
  useEffect(() => { if (!open) return; refresh(); return onHistoryTrashChange(() => { void loadHistoryTrash().then(t => setTrash([...t])); }); }, [open, refresh]);

  const protect = async () => {
    const ok = await navigator.storage?.persist?.();
    toast[ok ? 'success' : 'info'](ok ? 'Storage protected from automatic clean-up' : 'The browser did not grant protection (install the app to improve the odds)');
    refresh();
  };

  const runCheck = async () => {
    const lines: string[] = [];
    try {
      const sections = await readAllLocalSections();
      lines.push(`${Object.keys(sections).length} data groups readable`);
      let bad = 0; for (const v of Object.values(sections)) { try { JSON.stringify(v); } catch { bad++; } }
      lines.push(bad ? `${bad} groups could not be serialised` : 'All groups can be saved and synced');
      const latest = (await listBackups())[0];
      if (latest) { const r = await verifyBackup(latest.id); lines.push(`Latest backup: ${r.ok ? 'intact' : 'DAMAGED - ' + r.message}`); }
      else lines.push('No backup yet - make one in Automatic backups');
    } catch (e) { lines.push(`Check failed: ${(e as Error).message}`); }
    setCheck(lines);
  };

  return (
    <SettingsSection id="data" icon={<HardDrive className="w-4 h-4" />} open={open} onToggle={onToggle}>
      <SubHeading>Storage on this device</SubHeading>
      {usage && usage.quota > 0 ? (
        <div className="space-y-1.5 py-1">
          <Meter value={usage.used} max={usage.quota} label="Storage used" />
          <p className="text-[11px] text-foreground/50">{formatBytes(usage.used)} used of about {formatBytes(usage.quota)} available</p>
          {usage.persisted === false && (
            <div className="flex items-center gap-2 pt-1"><Pill tone="warn">Not protected</Pill><Btn small onClick={() => void protect()}>Protect my data</Btn></div>
          )}
          {usage.persisted === true && <Pill tone="good">Protected from clean-up</Pill>}
        </div>
      ) : <p className="text-[12px] text-foreground/45 py-1">Storage details are not available on this browser.</p>}
      {counts && <p className="text-[11px] text-foreground/45 pb-1">{counts.history} quiz results - {counts.folders} bookmark folders ({counts.bookmarks} saved questions) - {counts.sections} data groups</p>}

      <SubHeading>Quiz history trash</SubHeading>
      <p className="text-[12px] text-foreground/55 leading-relaxed pb-2">Deleted quiz results wait here before they are gone for good. Trash syncs, so you can undo a delete from another device.</p>
      <SettingRow id="trashRetention" title="Keep deleted results for" hint="After this, they are removed automatically" inline={false}
        control={<Segmented label="Trash retention" value={String(retention)} onChange={v => { setRetention(Number(v)); setTrashRetentionDays(Number(v)); }}
          options={[{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: '90', label: '90 days' }, { value: '0', label: 'Forever' }]} />} />
      {trash.length === 0 ? <p className="text-[12px] text-foreground/45 py-2">Trash is empty.</p> : (
        <>
          <ul className="space-y-1.5 py-2 max-h-72 overflow-y-auto">
            {trash.map(t => {
              const key = resultKey(t.result); const left = daysLeft(t.deletedAt);
              const firstQ = Array.isArray(t.result.quizData) ? t.result.quizData[0]?.question : undefined;
              const legacyTitle = !Array.isArray(t.result.quizData) ? (t.result.quizData as { title?: string } | undefined)?.title : undefined;
              const title = t.result.quizTitle || t.result.subject || legacyTitle || firstQ || 'Untitled quiz';
              return (
                <li key={key} className="rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
                  <p className="text-[12px] font-bold text-foreground truncate">{title}</p>
                  <p className="text-[10px] text-foreground/40">Deleted {timeAgo(t.deletedAt)}{left === null ? '' : ` - ${left} day${left === 1 ? '' : 's'} left`}</p>
                  <div className="flex gap-1.5 mt-1.5">
                    <Btn small icon={<RotateCcw className="w-3 h-3" />} onClick={() => void restoreFromHistoryTrash([key]).then(n => { toast.success(n ? 'Restored to history' : 'Already in history'); refresh(); })}>Restore</Btn>
                    <Btn small tone="danger" onClick={() => void deleteFromHistoryTrash([key]).then(refresh)}>Delete forever</Btn>
                  </div>
                </li>
              );
            })}
          </ul>
          <Btn tone="danger" small icon={<Trash2 className="w-3 h-3" />} onClick={() => setEmptyOpen(true)}>Empty history trash ({trash.length})</Btn>
        </>
      )}
      <Confirm open={emptyOpen} onOpenChange={setEmptyOpen} title="Empty the history trash?" body={<p>{trash.length} deleted quiz result{trash.length === 1 ? '' : 's'} will be removed permanently. This cannot be undone.</p>}
        confirmLabel="Empty trash" onConfirm={async () => { const n = await emptyHistoryTrash(); toast.success(`${n} removed permanently`); setEmptyOpen(false); refresh(); }} />

      <SubHeading>More</SubHeading>
      {onOpenTab && (
        <div className="grid gap-2 pb-2">
          <Btn full icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => onOpenTab('trash')}>Library trash (removed folders &amp; quizzes)</Btn>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center pb-1">
        <Btn icon={<ShieldCheck className="w-3.5 h-3.5" />} onClick={() => void runCheck()}>Run a data check</Btn>
      </div>
      {check && <ul className="text-[12px] text-foreground/65 space-y-0.5 pt-2">{check.map(l => <li key={l} className="flex gap-1.5"><CheckCircle2 className="w-3.5 h-3.5 mt-0.5 text-foreground/35 flex-shrink-0" />{l}</li>)}</ul>}
    </SettingsSection>
  );
});

/* ═════════════════════════ App icon & device ═════════════════════════ */

export const DeviceSection = memo(function DeviceSection({ open, onToggle }: SectionProps) {
  const pwa = usePwaState();
  const icon = useAppIcon();
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [crop, setCrop] = useState<CropState>({ zoom: 1, x: 0, y: 0 });
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const native = isNative();

  useEffect(() => {
    if (!bmp || !canvas.current) return;
    const c = renderIcon(bmp, crop, 160, 'rounded');
    const ctx = canvas.current.getContext('2d');
    canvas.current.width = 160; canvas.current.height = 160;
    ctx?.clearRect(0, 0, 160, 160); ctx?.drawImage(c, 0, 0);
  }, [bmp, crop]);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    try { setBmp(await loadBitmap(f)); setCrop({ zoom: 1, x: 0, y: 0 }); }
    catch (e) { toast.error(e instanceof IconError ? e.message : 'Could not read that image'); }
    if (file.current) file.current.value = '';
  };
  const save = async () => {
    if (!bmp) return;
    const dataUrl = renderIcon(bmp, crop, 512, 'square').toDataURL('image/png');
    saveAppIcon(dataUrl); setBmp(null);
    toast.success('Icon updated');
    if (nativeIconSupported()) { const launcher = await buildLauncherIcon(dataUrl); void pinIconShortcut(launcher).then(ok => ok && toast.success('Shortcut added to your home screen')); }
  };

  const where = native ? 'Android app' : isStandalonePwa() ? 'Installed web app' : 'Web browser';
  const platform = platformName();

  return (
    <SettingsSection id="device" icon={<Smartphone className="w-4 h-4" />} open={open} onToggle={onToggle}>
      <SubHeading>This app</SubHeading>
      <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 text-[12px] py-1">
        <dt className="text-foreground/45">Version</dt><dd className="font-bold text-foreground">{appVersion()}</dd>
        <dt className="text-foreground/45">Running as</dt><dd className="font-bold text-foreground">{where}{platform !== 'web' ? ` (${platform})` : ''}</dd>
        <dt className="text-foreground/45">Offline</dt><dd className="font-bold text-foreground">{native ? 'Whole app is inside the APK' : 'serviceWorker' in navigator ? 'Cached for offline use' : 'Not supported by this browser'}</dd>
      </dl>
      {!native && (
        <div className="flex flex-wrap gap-2 py-2">
          {pwa.canInstall && <Btn tone="primary" icon={<Download className="w-3.5 h-3.5" />} onClick={() => void promptInstall()}>Install app</Btn>}
          {pwa.installed && <Pill tone="good">Installed</Pill>}
        </div>
      )}
      {!pwa.canInstall && !pwa.installed && !native && <p className="text-[11px] text-foreground/40">To install: use your browser menu -&gt; "Install app" or "Add to Home Screen".</p>}
      <p className="text-[11px] text-foreground/40 pb-1">New versions: see <b>App updates</b> at the top of Settings.</p>

      <SubHeading>App icon</SubHeading>
      <div className="flex items-center gap-4 py-2">
        <div className="w-16 h-16 rounded-2xl overflow-hidden border border-border bg-card flex-shrink-0">
          <img src={icon?.dataUrl ?? `${import.meta.env.BASE_URL}icons/icon-192.png`} alt="Current app icon" className="w-full h-full object-cover" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground">{icon ? 'Your custom icon' : 'Default icon'}</p>
          <p className="text-[11px] text-foreground/45 leading-snug">Used for the browser tab, the installed web app and {native ? 'a home-screen shortcut on Android' : 'new installs'}.</p>
        </div>
      </div>
      {!bmp ? (
        <div className="flex flex-wrap gap-2 pb-1">
          <Btn icon={<ImagePlus className="w-3.5 h-3.5" />} onClick={() => file.current?.click()}>Choose image</Btn>
          {icon && <Btn tone="danger" onClick={() => { resetAppIcon(); toast.success('Default icon restored'); }}>Reset</Btn>}
          {icon && nativeIconSupported() && <Btn icon={<Pin className="w-3.5 h-3.5" />} onClick={() => void buildLauncherIcon(icon.dataUrl).then(pinIconShortcut).then(ok => toast[ok ? 'success' : 'info'](ok ? 'Shortcut added' : 'Your launcher did not allow a shortcut'))}>Pin to home screen</Btn>}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={e => void pick(e.target.files?.[0])} />
        </div>
      ) : (
        <Card>
          <div className="flex gap-4 items-start">
            <canvas ref={canvas} width={160} height={160} className="rounded-2xl border border-border w-28 h-28 flex-shrink-0" aria-label="Icon preview" />
            <div className="flex-1 space-y-2">
              {([['zoom', 'Zoom', 1, 3, 0.05], ['x', 'Left / right', -1, 1, 0.02], ['y', 'Up / down', -1, 1, 0.02]] as const).map(([k, label, min, max, step]) => (
                <label key={k} className="block text-[11px] font-bold text-foreground/55">{label}
                  <input type="range" min={min} max={max} step={step} value={crop[k]} onChange={e => setCrop(c => ({ ...c, [k]: Number(e.target.value) }))} className="w-full accent-[hsl(var(--primary))]" />
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2 mt-3"><Btn tone="primary" onClick={() => void save()}>Use this icon</Btn><Btn onClick={() => setBmp(null)}>Cancel</Btn></div>
        </Card>
      )}
      {native && <p className="text-[11px] text-foreground/40 pt-1 leading-snug">Android does not let any app replace its own launcher icon, so your picture is added as a home-screen shortcut next to the app.</p>}
    </SettingsSection>
  );
});

/* ═════════════════════════ AI on this device (used inside the AI section) ═════════════════════════ */

export const AiProvidersPanel = memo(function AiProvidersPanel() {
  const [keys, setKeys] = useState(getUserApiKeys);
  const [prefs, setPrefs] = useState(getAiClientPrefs);
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [reveal, setReveal] = useState<ProviderId | null>(null);
  const [testing, setTesting] = useState<ProviderId | null>(null);

  const saved = (p: ProviderId) => !!(keys[p] || '').trim();
  const setKey = (p: ProviderId, value: string) => { const next = { ...keys, [p]: value.trim() || undefined, [`${p}Enabled`]: true }; setKeys(next); saveUserApiKeys(next); };
  const setPref = (next: typeof prefs) => { setPrefs(next); saveAiClientPrefs(next); };
  const test = async (p: ProviderId) => {
    setTesting(p);
    const key = (drafts[p] || keys[p] || '').trim();
    const r = key ? await testProviderKey(p, key) : { ok: false, message: 'Enter a key first.' };
    toast[r.ok ? 'success' : 'error'](r.message);
    setTesting(null);
  };

  return (
    <div id="setting-aiOnDevice" data-setting-id="aiOnDevice" className="setting-row py-3 scroll-mt-28 rounded-lg space-y-3">
      <div>
        <p className="text-sm font-bold text-foreground flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> AI on this device</p>
        <p className="text-[11px] text-foreground/45 leading-snug mt-0.5">Add your own key and quiz generation and explanations run straight from this device to your provider - no server of ours in between. Keys stay on this device and are never synced or backed up.</p>
      </div>
      <ul className="space-y-2">
        {PROVIDER_ORDER.map(p => (
          <li key={p} className="rounded-xl border border-border bg-foreground/[0.03] p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12px] font-black text-foreground">{PROVIDERS[p].label}</span>
              {saved(p) ? <Pill tone="good">Key saved {maskKey(keys[p] || '').slice(0, 4)}...</Pill> : <a href={PROVIDERS[p].keyUrl} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-primary hover:underline">Get a key</a>}
            </div>
            <div className="flex gap-1.5">
              <div className="relative flex-1 min-w-0">
                <input type={reveal === p ? 'text' : 'password'} value={drafts[p] ?? ''} placeholder={saved(p) ? 'Replace key...' : PROVIDERS[p].keyHint} autoComplete="off" spellCheck={false}
                  onChange={e => setDrafts(d => ({ ...d, [p]: e.target.value }))} aria-label={`${PROVIDERS[p].label} API key`}
                  className="w-full h-9 bg-foreground/[0.04] border border-border rounded-xl pl-3 pr-9 text-xs text-foreground placeholder:text-foreground/30 focus:outline-none focus:border-primary/50" />
                <button type="button" aria-label={reveal === p ? 'Hide key' : 'Show key'} onClick={() => setReveal(r => (r === p ? null : p))} className="absolute right-2 top-1/2 -translate-y-1/2 text-foreground/40">{reveal === p ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}</button>
              </div>
              <Btn small tone="primary" disabled={!(drafts[p] || '').trim()} onClick={() => { setKey(p, drafts[p] || ''); setDrafts(d => ({ ...d, [p]: '' })); toast.success(`${PROVIDERS[p].label} key saved`); }}>Save</Btn>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Btn small busy={testing === p} onClick={() => void test(p)} icon={testing === p ? <Loader2 className="w-3 h-3 animate-spin" /> : undefined}>Test key</Btn>
              {saved(p) && <Btn small tone="danger" onClick={() => { setKey(p, ''); toast.success('Key removed'); }}>Remove</Btn>}
            </div>
            <TextField label={`Model (default ${PROVIDERS[p].defaultModel})`} value={prefs.models[p] ?? ''} onChange={v => setPref({ ...prefs, models: { ...prefs.models, [p]: v || undefined } })} placeholder={PROVIDERS[p].defaultModel} />
          </li>
        ))}
      </ul>
      <div>
        <p className="text-[11px] font-bold text-foreground/55 mb-1.5">Try this provider first</p>
        <Segmented label="Preferred AI provider" value={prefs.preferred ?? 'auto'} onChange={v => setPref({ ...prefs, preferred: v === 'auto' ? null : (v as ProviderId) })}
          options={[{ value: 'auto', label: 'Auto' }, ...PROVIDER_ORDER.map(p => ({ value: p, label: PROVIDERS[p].label.split(' ').pop() ?? p }))]} />
        <p className="text-[10px] text-foreground/35 mt-1.5">If a provider is busy or rejects the request, the next one with a key is tried automatically.</p>
      </div>
    </div>
  );
});
