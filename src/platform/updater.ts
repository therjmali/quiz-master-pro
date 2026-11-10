/**
 * In-app updates (modelled on RJ Tracker).
 *
 *  - Installed Android app: checks this project's GitHub releases, downloads the new APK INSIDE the app
 *    (live progress), verifies SHA-256 + package name + version + signing key natively (ApkUpdater.java),
 *    then hands it to Android's installer. Android itself still asks the user to confirm - that cannot be skipped.
 *  - Web / installed PWA: updates itself through the service worker (see platform/pwa.ts).
 *
 * Only public release information is fetched - no account, no token. Fully optional and offline-safe:
 * with no connection it reports "offline" and the app keeps working.
 */
import { useSyncExternalStore } from 'react';
import { appVersion, isNative } from './native';

export const REPO = 'therjmali/quiz-master-pro';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = 'qmp_update_check_v1';
const DISMISS_KEY = 'qmp_update_dismissed_v1';
const AUTO_CHECK_MS = 12 * 60 * 60 * 1000;
/** Fired (on window) to ask the app to open Settings -> App updates. */
export const OPEN_UPDATES_EVENT = 'qm:open-updates';

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string | null;
  pageUrl: string;
  publishedAt: string | null;
  sizeBytes: number | null;
  /** Lower-case hex SHA-256 published by GitHub for the APK asset, when available. */
  sha256: string | null;
}
export type UpdateResult =
  | { status: 'update'; current: string; latest: UpdateInfo; checkedAt: number }
  | { status: 'latest'; current: string; latest: UpdateInfo; checkedAt: number }
  | { status: 'offline'; current: string; checkedAt: number }
  | { status: 'error'; current: string; message: string; checkedAt: number };

/* ───────────────────────────── pure helpers (unit-tested) ───────────────────────────── */

/** Numeric semver compare (ignores a leading "v" and any -pre/+build suffix). >0 when a is newer. */
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => String(v).trim().replace(/^v/i, '').split(/[-+]/)[0].split('.').map(n => parseInt(n, 10) || 0);
  const x = parse(a), y = parse(b);
  for (let i = 0; i < Math.max(x.length, y.length, 3); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** "sha256:ABC..." or bare 64-hex -> lower-case 64-hex, otherwise null. */
export function normalizeDigest(d: unknown): string | null {
  const m = /^(?:sha256:)?([0-9a-fA-F]{64})$/.exec(String(d ?? '').trim());
  return m ? m[1].toLowerCase() : null;
}

/** Only ever download updates from this project's own GitHub releases, over HTTPS. */
export function isTrustedDownloadUrl(url: string | null | undefined, repo: string = REPO): boolean {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${repo}/releases/download/`);
  } catch { return false; }
}

/** Release notes -> a short plain-text summary (drops the boilerplate intro, keeps headings and bullets). */
export function summarizeNotes(body: unknown, maxLines = 16): string {
  const lines = String(body ?? '').replace(/\r/g, '').split('\n').map(l => l.trimEnd());
  const start = lines.findIndex(l => /^#{2,3}\s*what'?s new/i.test(l));
  const useful = (start >= 0 ? lines.slice(start + 1) : lines).filter(l => l.trim() !== '');
  return useful.slice(0, maxLines).join('\n').slice(0, 1200).trim();
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

interface GhRelease {
  tag_name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number; digest?: string }[];
}

/** Turns the GitHub API payload into UpdateInfo, or null when it is not a usable release. */
export function parseRelease(r: GhRelease | null | undefined): UpdateInfo | null {
  if (!r || typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null;
  const version = r.tag_name.replace(/^v/i, '').trim();
  if (!/^\d+\.\d+(\.\d+)?/.test(version)) return null;
  const apks = (r.assets || []).filter(a => typeof a.name === 'string' && /\.apk$/i.test(a.name) && a.browser_download_url && !/debug|unsigned/i.test(a.name));
  const apk = apks.find(a => /RJ[-_ ]?QUIZ/i.test(a.name || '')) ?? apks[0];
  return {
    version,
    notes: summarizeNotes(r.body),
    apkUrl: apk?.browser_download_url ?? null,
    pageUrl: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/') ? r.html_url : RELEASES_PAGE,
    publishedAt: r.published_at ?? null,
    sizeBytes: typeof apk?.size === 'number' ? apk.size : null,
    sha256: normalizeDigest(apk?.digest),
  };
}

type FetchLike = (url: string, init?: { signal?: AbortSignal; headers?: Record<string, string> }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export async function checkForUpdate(opts: { fetchImpl?: FetchLike; current?: string; timeoutMs?: number; online?: boolean } = {}): Promise<UpdateResult> {
  const current = opts.current ?? appVersion();
  const checkedAt = Date.now();
  const online = opts.online ?? (typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  if (!online) return { status: 'offline', current, checkedAt };
  const f: FetchLike = opts.fetchImpl ?? ((url, init) => fetch(url, init) as unknown as ReturnType<FetchLike>);
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10_000) : null;
  try {
    const res = await f(RELEASES_API, { signal: ctrl?.signal, headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) {
      const message = res.status === 403 || res.status === 429 ? 'GitHub is limiting requests right now - try again in a few minutes.'
        : res.status === 404 ? 'No release has been published yet.'
        : `Update server answered ${res.status}.`;
      return { status: 'error', current, message, checkedAt };
    }
    const latest = parseRelease((await res.json()) as GhRelease);
    if (!latest) return { status: 'error', current, message: 'Could not read the latest release.', checkedAt };
    const result: UpdateResult = compareVersions(latest.version, current) > 0
      ? { status: 'update', current, latest, checkedAt }
      : { status: 'latest', current, latest, checkedAt };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(result)); } catch { /* storage full/blocked */ }
    return result;
  } catch (e) {
    const aborted = (e as { name?: string })?.name === 'AbortError';
    return { status: 'error', current, message: aborted ? 'The update server took too long to answer.' : 'Could not reach the update server.', checkedAt };
  } finally { if (timer) clearTimeout(timer); }
}

export function readCachedResult(): UpdateResult | null {
  try {
    const r = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as UpdateResult | null;
    if (!r || (r.status !== 'update' && r.status !== 'latest')) return null;
    // A cached "update" is stale once the app has been updated to (or past) that version.
    if (r.status === 'update' && compareVersions(r.latest.version, appVersion()) <= 0) return null;
    return r;
  } catch { return null; }
}

export function shouldAutoCheck(now = Date.now()): boolean {
  try {
    const r = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { checkedAt?: number } | null;
    return !r?.checkedAt || now - r.checkedAt > AUTO_CHECK_MS || now < r.checkedAt;
  } catch { return true; }
}

export const isDismissed = (version: string): boolean => { try { return localStorage.getItem(DISMISS_KEY) === version; } catch { return false; } };
export const dismissUpdate = (version: string): void => { try { localStorage.setItem(DISMISS_KEY, version); } catch { /* ignore */ } };

/** Opens the release page / APK in the system browser. Fallback for devices where the in-app installer is unavailable. */
export function openDownload(info: UpdateInfo): boolean {
  const url = info.apkUrl || info.pageUrl;
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) return true;
    window.location.href = url;
    return true;
  } catch { return false; }
}

/** Update checks only make sense for the installed Android app; the web/PWA version updates itself. */
export const canSelfUpdate = (): boolean => isNative();

/* ───────────────────────────── live update state ───────────────────────────── */

export type UpdatePhase =
  | 'idle' | 'checking' | 'uptodate' | 'available' | 'downloading' | 'verifying'
  | 'ready' | 'needs-permission' | 'installing' | 'offline' | 'error';

export interface UpdateState {
  phase: UpdatePhase;
  current: string;
  /** The newest release seen (even when it is not newer than the running app). */
  info: UpdateInfo | null;
  /** 0..1 while downloading. */
  progress: number;
  doneBytes: number;
  totalBytes: number;
  error: string | null;
  checkedAt: number | null;
}

interface NativeUpdater {
  downloadUpdate?: (url: string, sha256: string) => void;
  installUpdate?: () => void;
  openInstallPermission?: () => void;
}
const nativeBridge = (): NativeUpdater | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { QmNative?: NativeUpdater }).QmNative);
const BUSY: UpdatePhase[] = ['checking', 'downloading', 'verifying', 'installing'];
export const isBusyPhase = (p: UpdatePhase): boolean => BUSY.includes(p);

function initialState(): UpdateState {
  const cached = readCachedResult();
  return {
    phase: cached?.status === 'update' ? 'available' : cached?.status === 'latest' ? 'uptodate' : 'idle',
    current: appVersion(),
    info: cached && (cached.status === 'update' || cached.status === 'latest') ? cached.latest : null,
    progress: 0, doneBytes: 0, totalBytes: 0, error: null,
    checkedAt: cached?.checkedAt ?? null,
  };
}

let state: UpdateState = initialState();
const listeners = new Set<() => void>();
function set(patch: Partial<UpdateState>): void { state = { ...state, ...patch }; listeners.forEach(l => l()); }

export const getUpdateState = (): UpdateState => state;
export const subscribeUpdate = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export const useUpdateState = (): UpdateState => useSyncExternalStore(subscribeUpdate, getUpdateState, getUpdateState);
/** True when a newer version than the running app is known (also while it downloads / waits to be installed). */
export const hasUpdate = (s: UpdateState = state): boolean => !!s.info && compareVersions(s.info.version, s.current) > 0 && s.phase !== 'uptodate';
/** True when this build can download and install an APK by itself. */
export const isNativeUpdater = (): boolean => isNative() && typeof nativeBridge()?.downloadUpdate === 'function';

/** Test hook: puts the store into a known state. */
export function __resetUpdateState(next: Partial<UpdateState> = {}): void {
  state = { phase: 'idle', current: appVersion(), info: null, progress: 0, doneBytes: 0, totalBytes: 0, error: null, checkedAt: null, ...next };
  listeners.forEach(l => l());
}

const isOffline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Checks GitHub and updates the live state. Never throws. */
export async function runUpdateCheck(opts: { silent?: boolean; fetchImpl?: FetchLike } = {}): Promise<UpdateState> {
  if (isBusyPhase(state.phase) || state.phase === 'ready' || state.phase === 'needs-permission') return state;
  if (isOffline()) {
    if (!opts.silent) set({ phase: 'offline', error: null });
    return state;
  }
  const before = state.phase;
  set({ phase: 'checking', error: null });
  const r = await checkForUpdate({ fetchImpl: opts.fetchImpl, current: state.current, online: true });
  if (r.status === 'update') set({ phase: 'available', info: r.latest, checkedAt: r.checkedAt, error: null });
  else if (r.status === 'latest') set({ phase: 'uptodate', info: r.latest, checkedAt: r.checkedAt, error: null });
  else if (r.status === 'offline') set({ phase: opts.silent ? before : 'offline', checkedAt: r.checkedAt });
  else set({ phase: opts.silent ? (before === 'checking' ? 'idle' : before) : 'error', error: opts.silent ? null : r.message, checkedAt: r.checkedAt });
  return state;
}

/** Quiet background check at most every 12 h (installed app only); calls `onFound` once per new version. */
export function scheduleUpdateCheck(onFound?: (info: UpdateInfo) => void, delayMs = 5000): () => void {
  if (!canSelfUpdate() || !shouldAutoCheck()) return () => undefined;
  const t = setTimeout(async () => {
    const known = state.info?.version;
    const s = await runUpdateCheck({ silent: true });
    if (s.phase === 'available' && s.info && s.info.version !== known && !isDismissed(s.info.version)) onFound?.(s.info);
  }, delayMs);
  return () => clearTimeout(t);
}

/* ───────────────────────────── Android download + install ───────────────────────────── */

/** Called by the native layer: { state, done, total, error }. */
export function onNativeUpdateEvent(msg: { state?: string; done?: number; total?: number; error?: string | null }): void {
  const total = Number(msg.total) || state.totalBytes;
  const done = Number(msg.done) || 0;
  switch (msg.state) {
    case 'downloading': set({ phase: 'downloading', doneBytes: done, totalBytes: total, progress: total > 0 ? Math.min(1, done / total) : 0 }); break;
    case 'verifying': set({ phase: 'verifying', progress: 1 }); break;
    case 'ready': set({ phase: 'ready', progress: 1 }); break;
    case 'needs_permission': set({ phase: 'needs-permission' }); break;
    case 'installing': set({ phase: 'installing' }); break;
    case 'error': set({ phase: 'error', error: msg.error || 'The update could not be installed.' }); break;
  }
}
if (typeof window !== 'undefined') (window as unknown as { __qmUpdate?: typeof onNativeUpdateEvent }).__qmUpdate = onNativeUpdateEvent;

/** Starts "download -> verify -> install" inside the app. Fails with a clear message, never silently. */
export function startNativeUpdate(): void {
  const info = state.info;
  const bridge = nativeBridge();
  if (!info?.apkUrl || !bridge?.downloadUpdate) { set({ phase: 'error', error: 'This version cannot be updated inside the app. Open the release page instead.' }); return; }
  if (!isTrustedDownloadUrl(info.apkUrl)) { set({ phase: 'error', error: 'The update link is not from the official release page, so it was blocked.' }); return; }
  if (isOffline()) { set({ phase: 'error', error: 'You are offline. Connect to the internet to download the update.' }); return; }
  set({ phase: 'downloading', progress: 0, doneBytes: 0, totalBytes: info.sizeBytes ?? 0, error: null });
  try { bridge.downloadUpdate(info.apkUrl, info.sha256 ?? ''); }
  catch (e) { set({ phase: 'error', error: (e as Error)?.message || 'Could not start the download.' }); }
}
export function installDownloadedUpdate(): void { try { nativeBridge()?.installUpdate?.(); } catch { /* ignore */ } }
export function openInstallPermission(): void { try { nativeBridge()?.openInstallPermission?.(); } catch { /* ignore */ } }
/** Back to a neutral state after an error so the user can retry. */
export function dismissUpdateError(): void { set({ phase: state.info && compareVersions(state.info.version, state.current) > 0 ? 'available' : 'idle', error: null }); }
