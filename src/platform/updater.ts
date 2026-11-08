/**
 * In-app update check. The Android APK is published as a GitHub Release; this compares the running
 * version with the latest release and hands back the APK link. Nothing is downloaded or installed
 * silently - the user taps "Download", the system downloads the file, and Android asks to install it.
 * Fully optional and offline-safe: with no connection it reports "offline" and the app keeps working.
 */
import { appVersion, isNative } from './native';

export const REPO = 'therjmali/quiz-master-pro';
export const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;
const CACHE_KEY = 'qmp_update_check_v1';
const DISMISS_KEY = 'qmp_update_dismissed_v1';
const AUTO_CHECK_MS = 12 * 60 * 60 * 1000;

export interface UpdateInfo {
  version: string;
  notes: string;
  apkUrl: string | null;
  pageUrl: string;
  publishedAt: string | null;
  sizeBytes: number | null;
}
export type UpdateResult =
  | { status: 'update'; current: string; latest: UpdateInfo; checkedAt: number }
  | { status: 'latest'; current: string; latest: UpdateInfo; checkedAt: number }
  | { status: 'offline'; current: string; checkedAt: number }
  | { status: 'error'; current: string; message: string; checkedAt: number };

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

interface GhRelease {
  tag_name?: string; html_url?: string; body?: string; published_at?: string; draft?: boolean; prerelease?: boolean;
  assets?: { name?: string; browser_download_url?: string; size?: number }[];
}

/** Turns the GitHub API payload into UpdateInfo, or null when it is not a usable release. */
export function parseRelease(r: GhRelease | null | undefined): UpdateInfo | null {
  if (!r || typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null;
  const version = r.tag_name.replace(/^v/i, '').trim();
  if (!/^\d+\.\d+(\.\d+)?/.test(version)) return null;
  const apk = (r.assets || []).find(a => typeof a.name === 'string' && /\.apk$/i.test(a.name) && a.browser_download_url);
  return {
    version,
    notes: String(r.body || '').trim().slice(0, 1200),
    apkUrl: apk?.browser_download_url ?? null,
    pageUrl: typeof r.html_url === 'string' && r.html_url.startsWith('https://github.com/') ? r.html_url : RELEASES_PAGE,
    publishedAt: r.published_at ?? null,
    sizeBytes: typeof apk?.size === 'number' ? apk.size : null,
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
    if (!res.ok) return { status: 'error', current, message: res.status === 403 ? 'GitHub is limiting requests right now - try again in a few minutes.' : `Update server answered ${res.status}.`, checkedAt };
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

/** Opens the APK download (system browser / download manager). Returns false when nothing could be opened. */
export function openDownload(info: UpdateInfo): boolean {
  const url = info.apkUrl || info.pageUrl;
  try {
    const w = window.open(url, '_blank', 'noopener,noreferrer');
    if (w) return true;
    window.location.href = url;
    return true;
  } catch { return false; }
}

/** Updates only make sense for the installed Android app; the web/PWA version updates itself. */
export const canSelfUpdate = (): boolean => isNative();
