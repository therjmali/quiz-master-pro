/**
 * Account state for the whole app - one store, two backends.
 *
 *  • Cloud build (Supabase configured): sign-in unlocks sync across devices. supabase-js handles the
 *    tokens; this module adds friendly errors, the device list and starts/stops the sync engine.
 *  • Offline build (the APK ships without a Supabase project): a real account lives on the device -
 *    e-mail + PBKDF2-hashed password (platform/account/localAccount.ts). Create account and Sign in
 *    work with no network, and the reason for any failure is always shown.
 *
 * Sign-in is always optional: Quiz Master works fully as a guest.
 */
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured } from './config';
import { AUTH_STORAGE_KEY, getSupabase } from './supabase';
import { CloudConfigError } from './config';
import { setEphemeralSession, isEphemeral } from './session';
import { setCloudUser, type CloudUser } from './cloudUser';
import { getDeviceIdentity, renameDevice } from './device';
import { CloudError, toCloudError } from './http';
import * as local from '../account/localAccount';
import { deleteMyAccountRemote, deleteMyCloudData } from './remote';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthState {
  /** Cloud sync is available in this build (Supabase URL + key baked in). */
  configured: boolean;
  /** Where the current account lives: 'cloud' (synced) or 'device' (this phone only). */
  mode: 'cloud' | 'device';
  status: AuthStatus;
  user: CloudUser | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  keepSignedIn: boolean;
  /** E-mail of the account stored on this device, even while signed out (so the form can prefill it). */
  deviceEmail: string | null;
}

export interface CloudDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
  current: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

function initialDeviceUser(): CloudUser | null {
  // Only when there is no cloud: a device account is the real account in this build.
  if (isCloudConfigured()) return null;
  const session = local.readSession();
  if (!session) return null;
  const info = local.deviceAccountInfo();
  if (!info || info.email !== session.email) return null;
  return { id: local.deviceAccountId(info.email), email: info.email, name: info.name };
}

const initialDevice = isCloudConfigured() ? null : local.deviceAccountInfo();

let state: AuthState = {
  configured: isCloudConfigured(),
  mode: isCloudConfigured() ? 'cloud' : 'device',
  status: isCloudConfigured() ? 'loading' : initialDeviceUser() ? 'signed-in' : 'signed-out',
  user: initialDeviceUser(),
  busy: false,
  error: null,
  notice: null,
  keepSignedIn: !isEphemeral(),
  deviceEmail: initialDevice?.email ?? null,
};
// The sync engine reads the account through this holder at boot, before any React render.
setCloudUser(state.user);

const listeners = new Set<() => void>();
const hooks = { onSignedIn: [] as Array<(u: CloudUser) => void>, onSignedOut: [] as Array<() => void> };

function setState(patch: Partial<AuthState>): void {
  state = { ...state, ...patch };
  listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}

export function getAuthState(): AuthState { return state; }
export function subscribeAuth(cb: () => void): () => void { listeners.add(cb); return () => { listeners.delete(cb); }; }
export function useCloudAuth(): AuthState { return useSyncExternalStore(subscribeAuth, getAuthState, getAuthState); }

/** The sync engine registers here (avoids an import cycle). */
export function onAuthChange(handlers: { signedIn?: (u: CloudUser) => void; signedOut?: () => void }): () => void {
  if (handlers.signedIn) hooks.onSignedIn.push(handlers.signedIn);
  if (handlers.signedOut) hooks.onSignedOut.push(handlers.signedOut);
  return () => {
    hooks.onSignedIn = hooks.onSignedIn.filter(h => h !== handlers.signedIn);
    hooks.onSignedOut = hooks.onSignedOut.filter(h => h !== handlers.signedOut);
  };
}

/* ---- friendly messages --------------------------------------------------------------------- */

export function friendlyAuthError(err: unknown): string {
  // A missing Supabase project is a build fact, not the user's mistake: say what still works.
  if (err instanceof CloudConfigError || (err as { code?: string })?.code === 'not_configured') {
    return 'Cloud sync is not set up in this build, so the account is kept on this device instead.';
  }
  const e = toCloudError(err);
  const msg = e.message || '';
  if (/invalid login credentials/i.test(msg)) return 'Wrong email or password.';
  if (/email not confirmed/i.test(msg)) return 'Please confirm your email first - check your inbox for the link.';
  if (/user already registered|already been registered/i.test(msg)) return 'An account with this email already exists. Try signing in instead.';
  if (/signups? (are |is )?(not allowed|disabled)/i.test(msg)) return 'New sign-ups are turned off for this cloud. Ask the owner to create your account, then sign in.';
  if (/password should be at least|weak password/i.test(msg)) return `Choose a stronger password (at least ${MIN_PASSWORD_LENGTH} characters).`;
  if (/rate limit|too many|over_email_send_rate_limit|429/i.test(msg) || e.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (/failed to fetch|network|load failed|offline/i.test(msg) || e.code === 'network') return 'No internet connection. Your data is safe on this device; try again when you are online.';
  return msg || 'Something went wrong. Please try again.';
}

function toUser(session: Session | null): CloudUser | null {
  const u = session?.user;
  if (!u) return null;
  const name = String((u.user_metadata?.name ?? u.user_metadata?.full_name ?? '') || '').trim();
  return { id: u.id, email: u.email ?? '', name: name || (u.email ?? 'Student').split('@')[0] };
}

function applySession(session: Session | null): void {
  const user = toUser(session);
  const previous = state.user;
  setCloudUser(user);
  setState({ user, status: user ? 'signed-in' : 'signed-out' });
  if (user && previous?.id !== user.id) {
    hooks.onSignedIn.forEach(h => { try { h(user); } catch { /* ignore */ } });
    void touchDevice();
  } else if (!user && previous) {
    hooks.onSignedOut.forEach(h => { try { h(); } catch { /* ignore */ } });
  }
}

let initialised = false;

export async function initCloudAuth(): Promise<void> {
  if (initialised) return;
  initialised = true;
  if (!isCloudConfigured()) {
    // Offline build: restore the on-device session (already read synchronously at import time).
    const user = initialDeviceUser();
    setCloudUser(user);
    setState({ configured: false, mode: 'device', status: user ? 'signed-in' : 'signed-out', user });
    return;
  }
  try {
    const supabase = getSupabase();
    supabase.auth.onAuthStateChange((_event, session) => applySession(session));
    const { data } = await supabase.auth.getSession();
    applySession(data.session);
  } catch (err) {
    setState({ status: 'signed-out', error: friendlyAuthError(err) });
  }
}

/* ---- actions ------------------------------------------------------------------------------- */

async function guarded<T>(fn: () => Promise<T>): Promise<T | undefined> {
  setState({ busy: true, error: null, notice: null });
  try {
    return await fn();
  } catch (err) {
    setState({ error: friendlyAuthError(err) });
    return undefined;
  } finally {
    setState({ busy: false });
  }
}

export function validateEmail(email: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()); }

export async function signIn(email: string, password: string, keepSignedIn = true): Promise<boolean> {
  if (!validateEmail(email)) { setState({ error: 'Enter a valid email address.' }); return false; }
  if (!password) { setState({ error: 'Enter your password.' }); return false; }
  setEphemeralSession(!keepSignedIn);
  setState({ keepSignedIn });
  if (!isCloudConfigured()) return signInOnDevice(email, password, keepSignedIn);
  const res = await guarded(async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return true;
  });
  return res === true;
}

/** Offline build: check the password against the hash stored on this device. */
async function signInOnDevice(email: string, password: string, keepSignedIn: boolean): Promise<boolean> {
  setState({ busy: true, error: null, notice: null });
  try {
    const result = await local.verifyPassword(email, password);
    if (!result.ok) {
      setState({ error: result.message, notice: result.reason === 'no_account' ? 'Create the account below - it takes a few seconds and works without a network.' : null });
      return false;
    }
    local.rememberEmail(result.info.email);
    local.startSession(result.info.email, keepSignedIn);
    const user: CloudUser = { id: local.deviceAccountId(result.info.email), email: result.info.email, name: result.info.name };
    setCloudUser(user);
    setState({ user, status: 'signed-in', mode: 'device', deviceEmail: result.info.email, error: null });
    hooks.onSignedIn.forEach(h => { try { h(user); } catch { /* ignore */ } });
    return true;
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : 'Could not sign in on this device.' });
    return false;
  } finally {
    setState({ busy: false });
  }
}

export async function signUp(name: string, email: string, password: string, keepSignedIn = true): Promise<boolean> {
  if (!validateEmail(email)) { setState({ error: 'Enter a valid email address.' }); return false; }
  if (password.length < MIN_PASSWORD_LENGTH) { setState({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }); return false; }
  setEphemeralSession(!keepSignedIn);
  setState({ keepSignedIn });
  if (!isCloudConfigured()) return signUpOnDevice(name, email, password, keepSignedIn);
  const res = await guarded(async () => {
    const { data, error } = await getSupabase().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() } },
    });
    if (error) throw error;
    // With "Confirm email" enabled there is no session until the link is opened.
    if (!data.session) setState({ notice: 'Account created. Open the confirmation link we emailed you, then sign in.' });
    return true;
  });
  return res === true;
}

/** Offline build: hash the password (PBKDF2) and keep the account on this device. */
async function signUpOnDevice(name: string, email: string, password: string, keepSignedIn: boolean): Promise<boolean> {
  setState({ busy: true, error: null, notice: null });
  try {
    const info = await local.createAccount({ name, email, password });
    local.rememberEmail(info.email);
    local.startSession(info.email, keepSignedIn);
    const user: CloudUser = { id: local.deviceAccountId(info.email), email: info.email, name: info.name };
    setCloudUser(user);
    setState({ user, status: 'signed-in', mode: 'device', deviceEmail: info.email, error: null, notice: 'Account created on this device. Your password is stored only as a secure hash.' });
    hooks.onSignedIn.forEach(h => { try { h(user); } catch { /* ignore */ } });
    return true;
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : 'Could not create the account on this device.' });
    return false;
  } finally {
    setState({ busy: false });
  }
}

export async function requestPasswordReset(email: string): Promise<boolean> {
  if (!validateEmail(email)) { setState({ error: 'Enter the email you registered with.' }); return false; }
  if (!isCloudConfigured()) {
    // There is no mail server in an offline build - be honest instead of pretending to send a link.
    const info = local.deviceAccountInfo();
    setState({
      error: info ? 'This account lives on this device, so there is no reset e-mail. Sign in with the password you chose, or create a new account after deleting this one in Settings → Cloud.' : 'No account exists on this device yet. Create one below.',
      notice: null,
    });
    return false;
  }
  const res = await guarded(async () => {
    const redirectTo = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : undefined;
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
    setState({ notice: 'If that email has an account, a reset link is on its way.' });
    return true;
  });
  return res === true;
}

export async function changePassword(newPassword: string, currentPassword?: string): Promise<boolean> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) { setState({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }); return false; }
  if (!isCloudConfigured()) {
    const res = await guarded(async () => {
      await local.changePassword(currentPassword ?? '', newPassword);
      setState({ notice: 'Password updated on this device.' });
      return true;
    });
    return res === true;
  }
  const res = await guarded(async () => {
    const { error } = await getSupabase().auth.updateUser({ password: newPassword });
    if (error) throw error;
    setState({ notice: 'Password updated.' });
    return true;
  });
  return res === true;
}

export async function updateDisplayName(name: string): Promise<boolean> {
  const clean = name.trim().slice(0, 60);
  if (!clean) { setState({ error: 'Name cannot be empty.' }); return false; }
  if (!isCloudConfigured()) {
    const info = local.renameAccount(clean);
    if (info && state.user) {
      const next = { ...state.user, name: info.name };
      setCloudUser(next);
      setState({ user: next, notice: 'Name updated.' });
    }
    return Boolean(info);
  }
  const res = await guarded(async () => {
    const { data, error } = await getSupabase().auth.updateUser({ data: { name: clean } });
    if (error) throw error;
    if (data.user && state.user) {
      const next = { ...state.user, name: clean };
      setCloudUser(next);
      setState({ user: next, notice: 'Name updated.' });
    }
    return true;
  });
  return res === true;
}

export async function signOut(scope: 'local' | 'global' | 'others' = 'local'): Promise<void> {
  if (!isCloudConfigured()) {
    // Offline build: drop the session, keep the account and every piece of data on the device.
    local.clearSession();
    setCloudUser(null);
    const previous = state.user;
    setState({ user: null, status: 'signed-out', error: null, notice: scope === 'others' ? null : 'Signed out on this device. Your account and data are still here.' });
    if (previous) hooks.onSignedOut.forEach(h => { try { h(); } catch { /* ignore */ } });
    return;
  }
  await guarded(async () => {
    if (isCloudConfigured()) {
      // With no connection supabase-js returns an error BEFORE it forgets the session, so "Sign out" would silently
      // do nothing and the next start would sign you straight back in. Never let that happen for this device.
      try { await getSupabase().auth.signOut({ scope }); } catch { /* handled below */ }
    }
    if (scope === 'others') setState({ notice: 'Signed out of all other devices.' });
  });
  if (scope !== 'others') {
    forgetStoredSession();
    applySession(null);
    setState({ error: null });
  }
}

/** Removes the saved session from this device (both storages), whatever the network says. */
export function forgetStoredSession(): void {
  for (const store of [() => localStorage, () => sessionStorage]) {
    try {
      const st = store();
      for (const k of [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-user`, `${AUTH_STORAGE_KEY}-code-verifier`]) st.removeItem(k);
    } catch { /* storage blocked */ }
  }
}

export function clearAuthMessages(): void { setState({ error: null, notice: null }); }

/* ---- devices ------------------------------------------------------------------------------- */

export async function touchDevice(): Promise<void> {
  const user = state.user;
  if (!user || !isCloudConfigured()) return;
  const device = getDeviceIdentity();
  try {
    await getSupabase().from('quiz_devices').upsert({
      user_id: user.id,
      device_id: device.id,
      name: device.name,
      platform: device.platform,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' });
  } catch { /* best effort */ }
}

export async function listDevices(): Promise<CloudDevice[]> {
  const { data, error } = await getSupabase().from('quiz_devices').select('device_id,name,platform,last_seen_at').order('last_seen_at', { ascending: false });
  if (error) throw toCloudError(error);
  const me = getDeviceIdentity().id;
  return (data ?? []).map((d: { device_id: string; name: string; platform: string; last_seen_at: string }) => ({
    id: d.device_id, name: d.name, platform: d.platform, lastSeenAt: d.last_seen_at, current: d.device_id === me,
  }));
}

export async function renameThisDevice(name: string): Promise<void> {
  renameDevice(name);
  await touchDevice();
}

export async function removeDevice(deviceId: string): Promise<void> {
  const { error } = await getSupabase().from('quiz_devices').delete().eq('device_id', deviceId);
  if (error) throw toCloudError(error);
}

/* ---- destructive account actions ----------------------------------------------------------- */

export async function deleteCloudData(): Promise<boolean> {
  const res = await guarded(async () => { await deleteMyCloudData(); return true; });
  return res === true;
}

export async function deleteAccount(): Promise<boolean> {
  if (!isCloudConfigured()) {
    const res = await guarded(async () => {
      local.deleteAccount();
      setCloudUser(null);
      setState({ user: null, status: 'signed-out', deviceEmail: null, notice: 'Account removed from this device. Your quizzes and settings were kept.' });
      hooks.onSignedOut.forEach(h => { try { h(); } catch { /* ignore */ } });
      return true;
    });
    return res === true;
  }
  const res = await guarded(async () => {
    await deleteMyAccountRemote();
    await getSupabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
    return true;
  });
  if (res) applySession(null);
  return res === true;
}

export { CloudError };

/**
 * Test hook: return the store to the state a fresh app start would have, without touching storage.
 * Used by tests/accountStore.test.ts, which drives the real sign-in/sign-out path in "no cloud"
 * configuration - exactly the build the APK ships.
 */
export function __resetAuthForTests(): void {
  initialised = false;
  const device = isCloudConfigured() ? null : local.deviceAccountInfo();
  const session = device ? local.readSession() : null;
  const user = device && session && session.email === device.email
    ? { id: local.deviceAccountId(device.email), email: device.email, name: device.name }
    : null;
  setCloudUser(user);
  state = {
    configured: isCloudConfigured(),
    mode: isCloudConfigured() ? 'cloud' : 'device',
    status: isCloudConfigured() ? 'loading' : user ? 'signed-in' : 'signed-out',
    user,
    busy: false,
    error: null,
    notice: null,
    keepSignedIn: !isEphemeral(),
    deviceEmail: device?.email ?? null,
  };
  listeners.forEach(cb => { try { cb(); } catch { /* ignore */ } });
}
