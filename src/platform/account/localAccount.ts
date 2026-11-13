/**
 * On-device account (no server).
 *
 * The Android APK bundles the whole app and ships *without* a Supabase project, so cloud sign-in
 * is impossible there. Instead of showing a dead form, the app keeps a real account on the device:
 * an e-mail, a display name and a password stored only as a PBKDF2-SHA256 hash (210 000 rounds,
 * random 16-byte salt). Nothing ever leaves the phone - this is what lets "Create account / Sign in"
 * work with no network, and it is why the password is never written in clear text anywhere.
 *
 * Pure module (no React, no DOM beyond WebCrypto + Web Storage) so it is unit-tested directly.
 * WebCrypto requires a secure context; the APK serves from https://localhost, so it is available.
 */

export const LOCAL_ACCOUNT_KEY = 'qm-device-account-v1';
export const DEVICE_SESSION_KEY = 'qm-device-session-v1';
export const LAST_EMAIL_KEY = 'qm-last-login-email-v1';

/** Deliberately slow: a phone takes ~150-400 ms, an attacker pays that per guess. */
export const PBKDF2_ITERATIONS = 210_000;
export const MIN_PASSWORD_LENGTH = 8;
/** Wrong passwords allowed before a short cool-down. */
export const MAX_ATTEMPTS = 5;
export const LOCKOUT_MS = 60_000;

export type DeviceAccountCode =
  | 'invalid_email'
  | 'weak_password'
  | 'exists'
  | 'no_account'
  | 'mismatch'
  | 'locked'
  | 'unsupported'
  | 'storage';

export class DeviceAccountError extends Error {
  code: DeviceAccountCode;
  constructor(message: string, code: DeviceAccountCode) {
    super(message);
    this.name = 'DeviceAccountError';
    this.code = code;
  }
}

export interface StoredDeviceAccount {
  v: 1;
  name: string;
  email: string;
  salt: string;
  hash: string;
  iterations: number;
  createdAt: number;
  updatedAt: number;
  failures: number;
  lockedUntil: number;
}

export interface DeviceAccountInfo {
  name: string;
  email: string;
  createdAt: number;
  /** True when a cool-down is running after too many wrong passwords. */
  lockedUntil: number;
}

/* ---- helpers ------------------------------------------------------------------------------- */

export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((email ?? '').trim());
}

/** Why a password is not acceptable yet, or null when it is. */
export function passwordProblem(password: string): string | null {
  const pw = password ?? '';
  if (pw.length < MIN_PASSWORD_LENGTH) return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (pw.trim().length === 0) return 'Password cannot be only spaces.';
  return null;
}

/** True when this device can hash passwords (Android WebView on https://localhost can). */
export function deviceAccountSupported(): boolean {
  try { return typeof globalThis.crypto?.subtle?.deriveBits === 'function'; } catch { return false; }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function randomSalt(): Uint8Array {
  const salt = new Uint8Array(16);
  try { globalThis.crypto.getRandomValues(salt); } catch { /* filled below */ }
  // Only reached if getRandomValues is unavailable (never in a secure context): still unique per account.
  if (!salt.some(b => b !== 0)) for (let i = 0; i < salt.length; i++) salt[i] = Math.floor(Math.random() * 256);
  return salt;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new DeviceAccountError('This device cannot create a secure account. Sign in to cloud sync instead.', 'unsupported');
  const material = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(bits);
}

/** Length-independent, value-independent comparison (no early exit). */
function safeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ---- storage ------------------------------------------------------------------------------- */

function safeStorage(kind: 'local' | 'session' = 'local'): Storage | null {
  try { return kind === 'local' ? localStorage : sessionStorage; } catch { return null; }
}

export function readStoredAccount(): StoredDeviceAccount | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(LOCAL_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDeviceAccount;
    // `v` was added in 3.1.0; a record written by an earlier build is a valid v1 shape, so upgrade it
    // instead of locking the user out of the account they already created.
    if (parsed && parsed.v === undefined) parsed.v = 1;
    if (!parsed || parsed.v !== 1) return null;
    if (!parsed.email || !parsed.salt || !parsed.hash || !Number.isFinite(parsed.iterations)) return null;
    return {
      ...parsed,
      failures: Number.isFinite(parsed.failures) ? parsed.failures : 0,
      lockedUntil: Number.isFinite(parsed.lockedUntil) ? parsed.lockedUntil : 0,
    };
  } catch { return null; }
}

function writeStoredAccount(account: StoredDeviceAccount | null): void {
  const store = safeStorage();
  if (!store) throw new DeviceAccountError('This device is blocking app storage.', 'storage');
  try {
    if (account) store.setItem(LOCAL_ACCOUNT_KEY, JSON.stringify(account));
    else store.removeItem(LOCAL_ACCOUNT_KEY);
  } catch {
    throw new DeviceAccountError('This device is blocking app storage.', 'storage');
  }
}

/** Who the account belongs to, or null when this device has no account yet. */
export function deviceAccountInfo(): DeviceAccountInfo | null {
  const account = readStoredAccount();
  if (!account) return null;
  return { name: account.name, email: account.email, createdAt: account.createdAt, lockedUntil: account.lockedUntil };
}

/* ---- create / verify ----------------------------------------------------------------------- */

export interface NewAccountInput { name: string; email: string; password: string }

export async function createAccount({ name, email, password }: NewAccountInput): Promise<DeviceAccountInfo> {
  if (!isValidEmail(email)) throw new DeviceAccountError('Enter a valid email address.', 'invalid_email');
  const problem = passwordProblem(password);
  if (problem) throw new DeviceAccountError(problem, 'weak_password');
  if (readStoredAccount()) throw new DeviceAccountError('This device already has an account. Sign in instead.', 'exists');

  const salt = randomSalt();
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  const now = Date.now();
  const account: StoredDeviceAccount = {
    v: 1,
    name: (name ?? '').trim().slice(0, 60) || normalizeEmail(email).split('@')[0],
    email: normalizeEmail(email),
    salt: bytesToBase64(salt),
    hash: bytesToBase64(hash),
    iterations: PBKDF2_ITERATIONS,
    createdAt: now,
    updatedAt: now,
    failures: 0,
    lockedUntil: 0,
  };
  writeStoredAccount(account);
  return { name: account.name, email: account.email, createdAt: account.createdAt, lockedUntil: 0 };
}

export type VerifyResult =
  | { ok: true; info: DeviceAccountInfo }
  | { ok: false; reason: 'no_account' | 'mismatch' | 'locked' | 'invalid_email' | 'unsupported'; message: string; retryAt?: number };

export async function verifyPassword(email: string, password: string): Promise<VerifyResult> {
  const account = readStoredAccount();
  if (!account) {
    return { ok: false, reason: 'no_account', message: 'No account exists on this device yet. Create one first - it takes a few seconds and works offline.' };
  }
  if (!isValidEmail(email)) return { ok: false, reason: 'invalid_email', message: 'Enter the email you created this account with.' };

  const now = Date.now();
  if (account.lockedUntil > now) {
    const seconds = Math.max(1, Math.ceil((account.lockedUntil - now) / 1000));
    return { ok: false, reason: 'locked', message: `Too many wrong passwords. Try again in ${seconds}s.`, retryAt: account.lockedUntil };
  }

  let hash: Uint8Array;
  try {
    hash = await derive(password, base64ToBytes(account.salt), account.iterations);
  } catch {
    return { ok: false, reason: 'unsupported', message: 'This device cannot check the password. Sign in to cloud sync instead.' };
  }

  const emailMatches = normalizeEmail(email) === account.email;
  const passwordMatches = safeEqual(hash, base64ToBytes(account.hash));

  if (emailMatches && passwordMatches) {
    if (account.failures || account.lockedUntil) writeStoredAccount({ ...account, failures: 0, lockedUntil: 0 });
    return { ok: true, info: { name: account.name, email: account.email, createdAt: account.createdAt, lockedUntil: 0 } };
  }

  // One generic answer for both "wrong email" and "wrong password": never reveal which one matched.
  const failures = account.failures + 1;
  const lockedUntil = failures >= MAX_ATTEMPTS ? now + LOCKOUT_MS : 0;
  writeStoredAccount({ ...account, failures: lockedUntil ? 0 : failures, lockedUntil });
  return {
    ok: false,
    reason: lockedUntil ? 'locked' : 'mismatch',
    message: lockedUntil
      ? `Too many wrong passwords. Try again in ${Math.round(LOCKOUT_MS / 1000)}s.`
      : `Wrong email or password. ${Math.max(0, MAX_ATTEMPTS - failures)} attempt${MAX_ATTEMPTS - failures === 1 ? '' : 's'} left.`,
    retryAt: lockedUntil || undefined,
  };
}

/** Change the password of the device account (the old one must be correct). */
export async function changePassword(current: string, next: string): Promise<void> {
  const account = readStoredAccount();
  if (!account) throw new DeviceAccountError('No account exists on this device.', 'no_account');
  const check = await verifyPassword(account.email, current);
  if (!check.ok) throw new DeviceAccountError(check.reason === 'locked' ? check.message : 'Current password is wrong.', check.reason === 'locked' ? 'locked' : 'mismatch');
  const problem = passwordProblem(next);
  if (problem) throw new DeviceAccountError(problem, 'weak_password');
  const salt = randomSalt();
  const hash = await derive(next, salt, PBKDF2_ITERATIONS);
  writeStoredAccount({
    ...account, salt: bytesToBase64(salt), hash: bytesToBase64(hash), iterations: PBKDF2_ITERATIONS,
    updatedAt: Date.now(), failures: 0, lockedUntil: 0,
  });
}

export function renameAccount(name: string): DeviceAccountInfo | null {
  const account = readStoredAccount();
  if (!account) return null;
  const clean = (name ?? '').trim().slice(0, 60);
  if (!clean) return deviceAccountInfo();
  writeStoredAccount({ ...account, name: clean, updatedAt: Date.now() });
  return { name: clean, email: account.email, createdAt: account.createdAt, lockedUntil: account.lockedUntil };
}

/** Deletes the account only. Every quiz, note and setting on the device is untouched. */
export function deleteAccount(): void {
  writeStoredAccount(null);
  clearSession();
}

/* ---- session ("this device is signed in") --------------------------------------------------- */

export interface DeviceSession { email: string; since: number; remember: boolean }

export function readSession(): DeviceSession | null {
  for (const kind of ['local', 'session'] as const) {
    const store = safeStorage(kind);
    if (!store) continue;
    try {
      const raw = store.getItem(DEVICE_SESSION_KEY);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as DeviceSession;
      if (parsed && typeof parsed.email === 'string' && Number.isFinite(parsed.since)) return parsed;
    } catch { /* keep looking */ }
  }
  return null;
}

export function startSession(email: string, remember: boolean): DeviceSession {
  const session: DeviceSession = { email: normalizeEmail(email), since: Date.now(), remember };
  try {
    const local = safeStorage('local');
    const temp = safeStorage('session');
    local?.removeItem(DEVICE_SESSION_KEY);
    temp?.removeItem(DEVICE_SESSION_KEY);
    (remember ? local : temp)?.setItem(DEVICE_SESSION_KEY, JSON.stringify(session));
  } catch { /* in-memory only; the store keeps the state */ }
  return session;
}

export function clearSession(): void {
  for (const kind of ['local', 'session'] as const) {
    try { safeStorage(kind)?.removeItem(DEVICE_SESSION_KEY); } catch { /* ignore */ }
  }
}

/* ---- niceties ------------------------------------------------------------------------------ */

export function rememberEmail(email: string): void {
  try {
    const clean = normalizeEmail(email);
    if (clean) localStorage.setItem(LAST_EMAIL_KEY, clean);
  } catch { /* ignore */ }
}

export function lastEmail(): string {
  try { return localStorage.getItem(LAST_EMAIL_KEY) ?? ''; } catch { return ''; }
}

/** A stable, non-secret id for this on-device account (used for display and diagnostics). */
export function deviceAccountId(email: string): string {
  let hash = 0x811c9dc5;
  const value = normalizeEmail(email);
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `device_${hash.toString(36)}`;
}

/**
 * A one-line, non-secret verdict for the diagnostics report: does the account storage make sense?
 * Catches the two failures that are impossible to debug from a user's description - a session
 * pointing at an account that no longer exists, and an unreadable record.
 */
export function accountHealth(): { state: 'none' | 'ok' | 'session-orphan' | 'unreadable'; detail: string } {
  let raw: string | null = null;
  try { raw = safeStorage()?.getItem(LOCAL_ACCOUNT_KEY) ?? null; } catch { return { state: 'unreadable', detail: 'device storage is blocked' }; }
  if (!raw) {
    const session = readSession();
    if (session) return { state: 'session-orphan', detail: `a saved session for ${session.email} exists but no account does` };
    return { state: 'none', detail: 'no account on this device' };
  }
  const account = readStoredAccount();
  if (!account) return { state: 'unreadable', detail: 'the stored account record is damaged' };
  const session = readSession();
  if (session && session.email !== account.email) {
    return { state: 'session-orphan', detail: `a saved session for ${session.email} does not match ${account.email}` };
  }
  return { state: 'ok', detail: `${account.email} · hashed with ${account.iterations} PBKDF2 rounds` };
}
