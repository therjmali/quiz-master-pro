import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Cloud, CloudOff, RefreshCw, LogOut, Smartphone, History, ShieldCheck, Copy, Check, UserRound, KeyRound, Laptop, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import SCHEMA_SQL from '../../../../supabase/quiz_schema.sql?raw';
import { isCloudConfigured } from '../../../platform/cloud/config';
import {
  useCloudAuth, signIn, signUp, signOut, requestPasswordReset, changePassword, updateDisplayName, clearAuthMessages,
  listDevices, removeDevice, renameThisDevice, deleteCloudData, deleteAccount, MIN_PASSWORD_LENGTH, type CloudDevice,
} from '../../../platform/cloud/authStore';
import {
  useSyncState, syncNow, setAutoSync, resolveFirstSync, pushDeviceOverCloud, pullCloudOverDevice, fetchRevisions,
  restoreRevision, clearConflicts, forgetCloudState, type SyncPhase,
} from '../../../platform/cloud/syncEngine';
import { sectionStats, DEVICE_ONLY_ITEMS, type SectionStat } from '../../../platform/cloud/sections';
import { getDeviceIdentity } from '../../../platform/cloud/device';
import type { RevisionRow } from '../../../platform/cloud/remote';
import { createBackup } from '../../../platform/autoBackup';
import { SettingsSection, SettingRow, SubHeading, Toggle } from './controls';
import { Btn, Card, Confirm, Pill, TextField, formatBytes, timeAgo } from './platformUi';
import type { SectionProps } from './sectionsA';

const PHASE_LABEL: Record<SyncPhase, { text: string; tone: 'neutral' | 'good' | 'warn' | 'bad' | 'info' }> = {
  disabled: { text: 'Off', tone: 'neutral' }, idle: { text: 'Ready', tone: 'info' }, syncing: { text: 'Syncing', tone: 'info' },
  synced: { text: 'Up to date', tone: 'good' }, paused: { text: 'Paused', tone: 'warn' }, pending: { text: 'Changes waiting', tone: 'warn' },
  offline: { text: 'Offline', tone: 'warn' }, error: { text: 'Problem', tone: 'bad' }, 'needs-choice': { text: 'Needs your choice', tone: 'warn' },
  'not-set-up': { text: 'Cloud not set up', tone: 'bad' },
};

export const CloudSection = memo(function CloudSection({ open, onToggle }: SectionProps) {
  return (
    <SettingsSection id="cloud" icon={<Cloud className="w-4 h-4" />} open={open} onToggle={onToggle}>
      {isCloudConfigured() ? <CloudBody /> : <NotConfigured />}
    </SettingsSection>
  );
});

function NotConfigured() {
  return (
    <div className="pt-3 space-y-2">
      <Card tone="info">
        <p className="text-sm font-bold text-foreground flex items-center gap-2"><CloudOff className="w-4 h-4" /> Cloud sync is not set up in this build</p>
        <p className="text-[12px] text-foreground/60 mt-1.5 leading-relaxed">
          Everything still works fully offline on this device, and automatic backups protect your data. To sync across devices, the app owner connects a free Supabase project once
          (see <b>docs/CLOUD_SETUP.md</b> in the repository) and rebuilds.
        </p>
      </Card>
    </div>
  );
}

function CloudBody() {
  const auth = useCloudAuth();
  if (auth.status === 'loading') return <div className="py-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-foreground/40" /></div>;
  return auth.status === 'signed-in' ? <SignedIn /> : <AuthForm />;
}

/* ───────────────────────── sign in / create account ───────────────────────── */

function AuthForm() {
  const auth = useCloudAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(auth.keepSignedIn);

  useEffect(() => { clearAuthMessages(); }, [mode]);

  const submit = async () => {
    if (mode === 'signin') { if (await signIn(email, password, keep)) toast.success('Signed in'); }
    else if (mode === 'signup') { if (await signUp(name, email, password, keep)) toast.success('Account created'); }
    else if (await requestPasswordReset(email)) toast.success('Check your email');
  };

  return (
    <div className="pt-3 space-y-3">
      <Card tone="info">
        <p className="text-sm font-bold text-foreground">Use Quiz Master on every device</p>
        <p className="text-[12px] text-foreground/60 mt-1 leading-relaxed">
          Sign in to keep your history, library, bookmarks and settings in sync across your phone and computer. You can keep using the app as a guest - nothing is lost either way.
        </p>
      </Card>

      <div role="tablist" className="flex gap-1 p-1 rounded-xl bg-foreground/[0.05] border border-border">
        {([['signin', 'Sign in'], ['signup', 'Create account']] as const).map(([m, label]) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
            className={`flex-1 text-xs font-bold py-2 rounded-lg transition ${mode === m ? 'bg-card text-foreground shadow-sm border border-border' : 'text-foreground/50'}`}>{label}</button>
        ))}
      </div>

      <form className="space-y-2.5" onSubmit={e => { e.preventDefault(); void submit(); }}>
        {mode === 'signup' && <TextField label="Your name" value={name} onChange={setName} autoComplete="name" placeholder="e.g. Asha" />}
        <TextField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" placeholder="you@example.com" />
        {mode !== 'reset' && (
          <TextField label={mode === 'signup' ? `Password (min ${MIN_PASSWORD_LENGTH} characters)` : 'Password'} type="password" value={password} onChange={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} />
        )}
        {mode !== 'reset' && (
          <label className="flex items-center gap-2 text-[12px] text-foreground/60 select-none">
            <input type="checkbox" checked={keep} onChange={e => setKeep(e.target.checked)} className="accent-[hsl(var(--primary))]" />
            Keep me signed in on this device
          </label>
        )}
        {auth.error && <p role="alert" className="text-[12px] font-semibold text-destructive">{auth.error}</p>}
        {auth.notice && <p role="status" className="text-[12px] font-semibold text-emerald-600 dark:text-emerald-400">{auth.notice}</p>}
        <Btn type="submit" tone="primary" full busy={auth.busy}>{mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</Btn>
      </form>

      <div className="flex justify-between text-[11px]">
        {mode === 'reset'
          ? <button type="button" className="font-bold text-primary hover:underline" onClick={() => setMode('signin')}>Back to sign in</button>
          : <button type="button" className="font-bold text-primary hover:underline" onClick={() => setMode('reset')}>Forgot password?</button>}
        <span className="text-foreground/40">One account works across RJ apps</span>
      </div>
    </div>
  );
}

/* ───────────────────────── signed in ───────────────────────── */

function SignedIn() {
  const auth = useCloudAuth();
  const sync = useSyncState();
  const user = auth.user!;
  const [busy, setBusy] = useState<string | null>(null);

  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try { await fn(); } finally { setBusy(null); }
  }, []);

  const phase = PHASE_LABEL[sync.phase];

  return (
    <div className="pt-3 space-y-4">
      <ProfileCard />

      <div className="space-y-2">
        <SubHeading>Sync</SubHeading>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2"><Pill tone={phase.tone}>{phase.text}</Pill>{sync.phase === 'syncing' && <Loader2 className="w-3.5 h-3.5 animate-spin text-foreground/40" />}</div>
              <p className="text-[11px] text-foreground/50 mt-1.5">
                Last synced {timeAgo(sync.lastSyncAt)}{sync.version > 0 ? ` - version ${sync.version}` : ''}{sync.pendingCount > 0 && sync.phase !== 'synced' ? ` - ${sync.pendingCount} change${sync.pendingCount === 1 ? '' : 's'} waiting` : ''}
              </p>
            </div>
            <Btn tone="primary" small icon={<RefreshCw className="w-3.5 h-3.5" />} busy={sync.phase === 'syncing'} onClick={() => void run('sync', async () => {
              const r = await syncNow('manual');
              if (r.ok) toast.success(r.pulled?.length ? 'Synced - updating this screen' : 'Everything is up to date');
              else if (!r.skipped || r.error) toast.error(r.error ?? 'Sync did not finish');
            })}>Sync now</Btn>
          </div>
          {sync.error && sync.phase !== 'not-set-up' && <p role="alert" className="text-[12px] font-semibold text-destructive mt-2">{sync.error}</p>}
        </Card>

        {sync.phase === 'not-set-up' && <SetupCard />}
        {sync.phase === 'needs-choice' && sync.needsChoice && <ChoiceCard />}

        <SettingRow id="autoSync" title="Automatic sync" hint="Upload changes a few seconds after you make them, and check for updates while the app is open"
          control={<Toggle checked={sync.autoSync} onChange={setAutoSync} label="Automatic sync" />} />
      </div>

      <WhatSyncs />
      <Devices />
      <RestorePoints />
      <SyncLog />

      <div className="space-y-2">
        <SubHeading>Account</SubHeading>
        <div className="flex flex-wrap gap-2">
          <Btn icon={<LogOut className="w-3.5 h-3.5" />} busy={busy === 'out'} onClick={() => void run('out', async () => { await signOut('local'); toast.success('Signed out - your data stays on this device'); })}>Sign out</Btn>
          <Btn busy={busy === 'others'} onClick={() => void run('others', async () => { await signOut('others'); })}>Sign out other devices</Btn>
        </div>
        <p className="text-[11px] text-foreground/40">Signed in as {user.email}. Signing out never deletes anything on this device.</p>
      </div>

      <DangerZone />
    </div>
  );
}

function ProfileCard() {
  const auth = useCloudAuth();
  const user = auth.user!;
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState('');

  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-primary/15 text-primary flex items-center justify-center font-black text-lg flex-shrink-0">{(user.name || user.email).slice(0, 1).toUpperCase()}</div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-foreground truncate">{user.name}</p>
          <p className="text-[11px] text-foreground/50 truncate">{user.email}</p>
        </div>
        <Pill tone="good"><ShieldCheck className="w-3 h-3" /> Signed in</Pill>
      </div>
      <div className="flex gap-2 mt-3">
        <Btn small icon={<UserRound className="w-3.5 h-3.5" />} onClick={() => { setEditing(v => !v); setPwOpen(false); }}>Edit name</Btn>
        <Btn small icon={<KeyRound className="w-3.5 h-3.5" />} onClick={() => { setPwOpen(v => !v); setEditing(false); }}>Change password</Btn>
      </div>
      {editing && (
        <div className="flex gap-2 mt-2.5 items-end">
          <div className="flex-1"><TextField label="Display name" value={name} onChange={setName} onEnter={() => void updateDisplayName(name).then(ok => { if (ok) { setEditing(false); toast.success('Name updated'); } })} /></div>
          <Btn tone="primary" onClick={() => void updateDisplayName(name).then(ok => { if (ok) { setEditing(false); toast.success('Name updated'); } })}>Save</Btn>
        </div>
      )}
      {pwOpen && (
        <div className="flex gap-2 mt-2.5 items-end">
          <div className="flex-1"><TextField label={`New password (min ${MIN_PASSWORD_LENGTH})`} type="password" value={pw} onChange={setPw} autoComplete="new-password" /></div>
          <Btn tone="primary" busy={auth.busy} onClick={() => void changePassword(pw).then(ok => { if (ok) { setPw(''); setPwOpen(false); toast.success('Password updated'); } })}>Update</Btn>
        </div>
      )}
      {auth.error && <p role="alert" className="text-[12px] font-semibold text-destructive mt-2">{auth.error}</p>}
    </Card>
  );
}

function SetupCard() {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(SCHEMA_SQL); setCopied(true); toast.success('SQL copied'); setTimeout(() => setCopied(false), 2500); }
    catch { toast.error('Could not copy - open supabase/quiz_schema.sql in the repository instead'); }
  };
  return (
    <Card tone="warn">
      <p className="text-sm font-bold text-foreground flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-500" /> One-time database setup needed</p>
      <ol className="text-[12px] text-foreground/65 mt-2 space-y-1 list-decimal list-inside leading-relaxed">
        <li>Open your Supabase project -&gt; <b>SQL Editor</b> -&gt; <b>New query</b>.</li>
        <li>Paste the SQL (button below) and press <b>Run</b>. It is safe to run twice.</li>
        <li>Come back here and press <b>Sync now</b>.</li>
      </ol>
      <div className="mt-2.5"><Btn tone="primary" small icon={copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />} onClick={copy}>{copied ? 'Copied' : 'Copy setup SQL'}</Btn></div>
    </Card>
  );
}

function ChoiceCard() {
  const sync = useSyncState();
  const c = sync.needsChoice!;
  const [confirmCloud, setConfirmCloud] = useState(false);
  const [busy, setBusy] = useState(false);
  const choose = async (choice: 'merge' | 'cloud' | 'device') => {
    setBusy(true);
    try {
      if (choice === 'cloud') await createBackup('before-cloud').catch(() => null);
      const r = await resolveFirstSync(choice);
      if (!r.ok && r.error) toast.error(r.error); else toast.success('Sync complete');
    } finally { setBusy(false); }
  };
  return (
    <Card tone="warn">
      <p className="text-sm font-bold text-foreground">This account already has data</p>
      <p className="text-[12px] text-foreground/65 mt-1 leading-relaxed">
        The cloud holds {c.remoteSections} item groups{c.remoteUpdatedAt ? ` (last saved ${timeAgo(c.remoteUpdatedAt)})` : ''}; this device has {c.localSections}. Nothing has been changed yet. How should they be combined?
      </p>
      <div className="grid gap-2 mt-3">
        <Btn tone="primary" full busy={busy} onClick={() => void choose('merge')}>Merge both (recommended)</Btn>
        <Btn full busy={busy} onClick={() => setConfirmCloud(true)}>Use the cloud copy on this device</Btn>
        <Btn full busy={busy} onClick={() => void choose('device')}>Use this device and replace the cloud copy</Btn>
      </div>
      <p className="text-[11px] text-foreground/45 mt-2">Merge keeps everything from both sides: quizzes taken on either device, bookmarks, notes and settings. A safety backup of this device is saved first.</p>
      <Confirm open={confirmCloud} onOpenChange={setConfirmCloud} title="Replace this device with the cloud copy?"
        body={<p>Everything on this device that is not in the cloud will be removed from view. A safety backup is saved first, so you can undo this from Automatic backups.</p>}
        confirmLabel="Use cloud copy" onConfirm={() => choose('cloud')} />
    </Card>
  );
}

function WhatSyncs() {
  const [stats, setStats] = useState<SectionStat[] | null>(null);
  const [show, setShow] = useState(false);
  useEffect(() => { if (show && !stats) void sectionStats().then(setStats).catch(() => setStats([])); }, [show, stats]);
  const totals = useMemo(() => (stats ?? []).reduce((n, s) => n + s.bytes, 0), [stats]);
  return (
    <div className="space-y-1.5">
      <SubHeading>What syncs</SubHeading>
      <p className="text-[12px] text-foreground/55 leading-relaxed">Quiz history, library &amp; folders, bookmarks, mistake book, flashcards &amp; spaced repetition, study plan, exam dates, notes and preferences.</p>
      <button type="button" className="text-[11px] font-bold text-primary hover:underline" onClick={() => setShow(v => !v)}>{show ? 'Hide details' : 'Show details'}</button>
      {show && (
        <Card>
          {!stats ? <Loader2 className="w-4 h-4 animate-spin text-foreground/40" /> : (
            <>
              <p className="text-[11px] font-bold text-foreground/60 mb-1.5">{stats.length} groups - about {formatBytes(totals)} before compression</p>
              <ul className="max-h-40 overflow-y-auto divide-y divide-border/60 text-[11px]">
                {stats.map(s => <li key={s.key} className="flex justify-between py-1 gap-2"><span className="truncate text-foreground/70">{s.label}</span><span className="text-foreground/40 flex-shrink-0">{formatBytes(s.bytes)}</span></li>)}
              </ul>
              <p className="text-[11px] font-bold text-foreground/60 mt-3 mb-1">Stays on this device only</p>
              <ul className="text-[11px] text-foreground/50 list-disc list-inside space-y-0.5">{DEVICE_ONLY_ITEMS.map(i => <li key={i}>{i}</li>)}</ul>
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function Devices() {
  const [devices, setDevices] = useState<CloudDevice[] | null>(null);
  const [name, setName] = useState(() => getDeviceIdentity().name);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { listDevices().then(d => { setDevices(d); setError(null); }).catch(e => setError(e?.message ?? 'Could not load devices')); }, []);
  useEffect(() => { load(); }, [load]);
  return (
    <div className="space-y-2">
      <SubHeading>Your devices</SubHeading>
      <div className="flex gap-2 items-end">
        <div className="flex-1"><TextField label="Name of this device" value={name} onChange={setName} /></div>
        <Btn disabled={!name.trim() || name.trim() === getDeviceIdentity().name} onClick={() => void renameThisDevice(name.trim()).then(() => { toast.success('Device renamed'); load(); })}>Rename</Btn>
      </div>
      {error && <p className="text-[11px] text-foreground/45">{error}</p>}
      {devices && devices.length > 0 && (
        <ul className="space-y-1.5">
          {devices.map(d => (
            <li key={d.id} className="flex items-center gap-2.5 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
              {d.platform === 'android' ? <Smartphone className="w-4 h-4 text-foreground/45" /> : <Laptop className="w-4 h-4 text-foreground/45" />}
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-foreground truncate">{d.name}{d.current && <span className="ml-1.5 text-primary">(this device)</span>}</p><p className="text-[10px] text-foreground/40">Active {timeAgo(d.lastSeenAt)}</p></div>
              {!d.current && <Btn small tone="danger" onClick={() => void removeDevice(d.id).then(load)}>Remove</Btn>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RestorePoints() {
  const [rows, setRows] = useState<RevisionRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [target, setTarget] = useState<RevisionRow | null>(null);
  const load = async () => {
    setLoading(true);
    try { setRows(await fetchRevisions()); } catch (e) { toast.error((e as Error).message || 'Could not load restore points'); } finally { setLoading(false); }
  };
  return (
    <div className="space-y-1.5">
      <SubHeading>Restore points</SubHeading>
      <p className="text-[12px] text-foreground/55 leading-relaxed">The cloud keeps your last few saved versions, so a mistake on one device can be undone.</p>
      {!rows && <Btn small icon={<History className="w-3.5 h-3.5" />} busy={loading} onClick={() => void load()}>Show restore points</Btn>}
      {rows && (rows.length === 0 ? <p className="text-[11px] text-foreground/45">No restore points yet.</p> : (
        <ul className="space-y-1.5">
          {rows.map(r => (
            <li key={r.version} className="flex items-center gap-2 rounded-xl border border-border bg-foreground/[0.03] px-3 py-2">
              <div className="min-w-0 flex-1"><p className="text-[12px] font-bold text-foreground">Version {r.version}</p><p className="text-[10px] text-foreground/40">{timeAgo(r.at)} - {r.keys.length} groups - {formatBytes(r.bytes)}</p></div>
              <Btn small onClick={() => setTarget(r)}>Restore</Btn>
            </li>
          ))}
        </ul>
      ))}
      <Confirm open={!!target} onOpenChange={v => !v && setTarget(null)} title={`Restore version ${target?.version}?`}
        body={<p>This device and the cloud will both go back to how things were at that save ({target ? timeAgo(target.at) : ''}). A safety backup of this device is saved first.</p>}
        confirmLabel="Restore" onConfirm={async () => { await createBackup('before-restore').catch(() => null); const r = await restoreRevision(target!.version); if (r.ok) toast.success('Restored - refreshing'); else toast.error(r.error ?? 'Restore failed'); setTarget(null); }} />
    </div>
  );
}

function SyncLog() {
  const sync = useSyncState();
  if (sync.conflicts.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <SubHeading>Sync log</SubHeading>
      <p className="text-[12px] text-foreground/55 leading-relaxed">When two devices changed the same thing differently, the most recently synced device won. Here is what the other side had, in case you want it back.</p>
      <ul className="space-y-1.5 max-h-48 overflow-y-auto">
        {sync.conflicts.slice(0, 10).map(c => (
          <li key={c.id} className="rounded-xl border border-border bg-foreground/[0.03] px-3 py-2 text-[11px]">
            <p className="font-bold text-foreground">{c.label} <span className="font-normal text-foreground/40">- {timeAgo(c.at)}</span></p>
            <p className="text-foreground/55 break-words">Kept: <span className="text-foreground/75">{c.resolution === 'local' ? c.localPreview : c.remotePreview}</span></p>
            <p className="text-foreground/55 break-words">Other side: <span className="text-foreground/75">{c.resolution === 'local' ? c.remotePreview : c.localPreview}</span></p>
          </li>
        ))}
      </ul>
      <Btn small onClick={clearConflicts}>Clear log</Btn>
    </div>
  );
}

function DangerZone() {
  const [dlg, setDlg] = useState<null | 'device' | 'cloud' | 'data' | 'account'>(null);
  return (
    <div className="space-y-2 rounded-2xl border border-destructive/25 p-3.5">
      <p className="text-[10px] font-black text-destructive uppercase tracking-[0.14em]">Careful</p>
      <div className="grid gap-2">
        <Btn tone="danger" full onClick={() => setDlg('device')}>Replace the cloud copy with this device</Btn>
        <Btn tone="danger" full onClick={() => setDlg('cloud')}>Replace this device with the cloud copy</Btn>
        <Btn tone="danger" full icon={<Trash2 className="w-3.5 h-3.5" />} onClick={() => setDlg('data')}>Delete my cloud data</Btn>
        <Btn tone="danger" full onClick={() => setDlg('account')}>Delete my account</Btn>
      </div>
      <Confirm open={dlg === 'device'} onOpenChange={v => !v && setDlg(null)} title="Replace the cloud copy?"
        body={<p>The cloud copy will be overwritten with what is on this device. Other devices will receive it on their next sync. The cloud keeps restore points.</p>}
        confirmLabel="Replace cloud" onConfirm={async () => { const r = await pushDeviceOverCloud(); r.ok ? toast.success('Cloud copy replaced') : toast.error(r.error ?? 'Failed'); setDlg(null); }} />
      <Confirm open={dlg === 'cloud'} onOpenChange={v => !v && setDlg(null)} title="Replace this device?"
        body={<p>This device will be made identical to the cloud copy. A safety backup is saved first (Automatic backups).</p>}
        confirmLabel="Replace device" onConfirm={async () => { await createBackup('before-cloud').catch(() => null); const r = await pullCloudOverDevice(); r.ok ? toast.success('Updated from cloud') : toast.error(r.error ?? 'Failed'); setDlg(null); }} />
      <Confirm open={dlg === 'data'} onOpenChange={v => !v && setDlg(null)} requireText="DELETE" title="Delete all cloud data?"
        body={<p>Your synced data, restore points and device list are removed from the cloud. This device keeps its data and your login stays. This cannot be undone.</p>}
        confirmLabel="Delete cloud data" onConfirm={async () => { if (await deleteCloudData()) { await forgetCloudState(); toast.success('Cloud data deleted'); } else toast.error('Could not delete cloud data'); setDlg(null); }} />
      <Confirm open={dlg === 'account'} onOpenChange={v => !v && setDlg(null)} requireText="DELETE" title="Delete your account?"
        body={<><p>Your login and all cloud data are permanently deleted. This device keeps its local data.</p><p className="font-bold">If you use the same account in other RJ apps, it is removed there too.</p></>}
        confirmLabel="Delete account" onConfirm={async () => { if (await deleteAccount()) { await forgetCloudState(); toast.success('Account deleted'); } else toast.error('Could not delete the account'); setDlg(null); }} />
    </div>
  );
}
