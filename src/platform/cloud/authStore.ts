/**
 * Account state (Supabase Auth) for the whole app.
 *
 * Sign-in is optional: Quiz Master works fully as a guest. Signing in unlocks cloud sync across
 * devices. supabase-js handles tokens (storage, silent refresh); this module adds friendly errors,
 * the device list, and starts/stops the sync engine as the session changes.
 */
import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isCloudConfigured } from './config';
import { getSupabase } from './supabase';
import { setEphemeralSession, isEphemeral } from './session';
import { setCloudUser, type CloudUser } from './cloudUser';
import { getDeviceIdentity, renameDevice } from './device';
import { CloudError, toCloudError } from './http';
import { deleteMyAccountRemote, deleteMyCloudData } from './remote';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out';

export interface AuthState {
  configured: boolean;
  status: AuthStatus;
  user: CloudUser | null;
  busy: boolean;
  error: string | null;
  notice: string | null;
  keepSignedIn: boolean;
}

export interface CloudDevice {
  id: string;
  name: string;
  platform: string;
  lastSeenAt: string;
  current: boolean;
}

export const MIN_PASSWORD_LENGTH = 8;

let state: AuthState = {
  configured: isCloudConfigured(),
  status: isCloudConfigured() ? 'loading' : 'signed-out',
  user: null,
  busy: false,
  error: null,
  notice: null,
  keepSignedIn: !isEphemeral(),
};

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
  if (!isCloudConfigured()) { setState({ configured: false, status: 'signed-out' }); return; }
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
  const res = await guarded(async () => {
    const { error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    return true;
  });
  return res === true;
}

export async function signUp(name: string, email: string, password: string, keepSignedIn = true): Promise<boolean> {
  if (!validateEmail(email)) { setState({ error: 'Enter a valid email address.' }); return false; }
  if (password.length < MIN_PASSWORD_LENGTH) { setState({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }); return false; }
  setEphemeralSession(!keepSignedIn);
  setState({ keepSignedIn });
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

export async function requestPasswordReset(email: string): Promise<boolean> {
  if (!validateEmail(email)) { setState({ error: 'Enter the email you registered with.' }); return false; }
  const res = await guarded(async () => {
    const redirectTo = typeof location !== 'undefined' ? `${location.origin}${location.pathname}` : undefined;
    const { error } = await getSupabase().auth.resetPasswordForEmail(email.trim(), { redirectTo });
    if (error) throw error;
    setState({ notice: 'If that email has an account, a reset link is on its way.' });
    return true;
  });
  return res === true;
}

export async function changePassword(newPassword: string): Promise<boolean> {
  if (newPassword.length < MIN_PASSWORD_LENGTH) { setState({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }); return false; }
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
  await guarded(async () => {
    if (isCloudConfigured()) await getSupabase().auth.signOut({ scope });
    if (scope === 'others') setState({ notice: 'Signed out of all other devices.' });
  });
  if (scope !== 'others') applySession(null);
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
  const res = await guarded(async () => {
    await deleteMyAccountRemote();
    await getSupabase().auth.signOut({ scope: 'local' }).catch(() => undefined);
    return true;
  });
  if (res) applySession(null);
  return res === true;
}

export { CloudError };
