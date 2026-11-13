/**
 * In-app diagnostics: why did it lag, and why did it crash?
 *
 * A phone in someone's hand is the only place that knows. This module keeps a tiny, bounded ring of
 * the last errors (window errors, unhandled rejections, React render errors) plus the facts a support
 * conversation always needs: platform, WebView version, memory, cores, storage headroom, how much
 * data is held and which performance budget is active. Everything stays on the device until the user
 * presses "Copy report" - there is no upload, and no quiz content is ever recorded.
 *
 * Deliberately dependency-free and defensive: it is installed first at boot, so it must never throw.
 */
import { appVersion, isNative, platformName } from './native';
import { currentMode } from './perfMode';

export const LOG_KEY = 'qmp-error-log-v1';
export const MAX_ENTRIES = 40;

export interface ErrorEntry {
  at: number;
  kind: 'error' | 'rejection' | 'react' | 'memory';
  message: string;
  source?: string;
}

let installed = false;

function clip(value: unknown, max = 300): string {
  const text = typeof value === 'string' ? value : (() => { try { return String(value); } catch { return 'unknown'; } })();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function readLog(): ErrorEntry[] {
  try {
    const raw = localStorage.getItem(LOG_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch { return []; }
}

function writeLog(entries: ErrorEntry[]): void {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(entries.slice(-MAX_ENTRIES))); } catch { /* storage full: drop */ }
}

export function recordError(entry: Omit<ErrorEntry, 'at'>): ErrorEntry {
  const full: ErrorEntry = { ...entry, at: Date.now(), message: clip(entry.message) };
  const next = [...readLog(), full];
  writeLog(next);
  return full;
}

export function getErrorLog(): ErrorEntry[] { return readLog(); }
export function clearErrorLog(): void { try { localStorage.removeItem(LOG_KEY); } catch { /* ignore */ } }

/** Storage used by this origin, in bytes (localStorage estimate; IDB included in `quota`). */
export interface StorageReport { usedBytes: number; quotaBytes: number; localBytes: number }

export async function storageReport(): Promise<StorageReport> {
  let quota = 0, used = 0;
  try {
    const est = await navigator.storage?.estimate?.();
    quota = Number(est?.quota ?? 0);
    used = Number(est?.usage ?? 0);
  } catch { /* not supported */ }
  let local = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      local += key.length + (localStorage.getItem(key)?.length ?? 0);
    }
  } catch { /* storage blocked */ }
  return { usedBytes: used, quotaBytes: quota, localBytes: local * 2 };
}

export interface DiagnosticsReport {
  generatedAt: string;
  appVersion: string;
  platform: string;
  native: boolean;
  userAgent: string;
  language: string;
  screen: string;
  devicePixelRatio: number;
  cores: number | null;
  deviceMemoryGb: number | null;
  online: boolean;
  perfMode: 'high' | 'low';
  prefersLowMotion: boolean;
  storage: StorageReport;
  localKeys: number;
  errors: ErrorEntry[];
  displayMode: string;
}

export async function collectDiagnostics(): Promise<DiagnosticsReport> {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & {
    hardwareConcurrency?: number; deviceMemory?: number; userAgent?: string; language?: string;
  };
  let localKeys = 0;
  try { localKeys = localStorage.length; } catch { /* blocked */ }
  return {
    generatedAt: new Date().toISOString(),
    appVersion: appVersion(),
    platform: platformName(),
    native: isNative(),
    userAgent: clip(nav.userAgent ?? '', 220),
    language: nav.language ?? '',
    screen: typeof window !== 'undefined' ? `${window.screen?.width ?? 0}x${window.screen?.height ?? 0}` : '',
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio ?? 1 : 1,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    deviceMemoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    online: typeof navigator !== 'undefined' ? navigator.onLine !== false : true,
    perfMode: currentMode(),
    prefersLowMotion: typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    storage: await storageReport(),
    localKeys,
    errors: readLog(),
    displayMode: typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches ? 'standalone' : 'browser',
  };
}

/** Human-readable text for the clipboard / e-mail - short enough to paste in a chat. */
export function formatDiagnostics(report: DiagnosticsReport): string {
  const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  const lines = [
    `R.J QUIZ diagnostics - v${report.appVersion}`,
    `When: ${report.generatedAt}`,
    `Platform: ${report.platform}${report.native ? ' (installed app)' : ''} · ${report.displayMode}`,
    `Device: ${report.screen} @${report.devicePixelRatio}x · ${report.cores ?? '?'} cores · ${report.deviceMemoryGb ?? '?'} GB RAM`,
    `Language: ${report.language} · Online: ${report.online ? 'yes' : 'no'}`,
    `Performance: ${report.perfMode === 'low' ? 'battery saver (blur off)' : 'full glass'}${report.prefersLowMotion ? ' · reduced motion' : ''}`,
    `Storage: ${mb(report.storage.usedBytes)} of ${mb(report.storage.quotaBytes)} used · localStorage ${mb(report.storage.localBytes)} in ${report.localKeys} keys`,
    `Engine: ${report.userAgent}`,
  ];
  if (report.errors.length === 0) lines.push('Recent problems: none recorded');
  else {
    lines.push(`Recent problems (${report.errors.length}, newest last):`);
    for (const e of report.errors.slice(-10)) {
      const when = new Date(e.at).toISOString().replace('T', ' ').slice(0, 19);
      lines.push(`  • ${when} [${e.kind}] ${e.message}${e.source ? ` (${e.source})` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Install global handlers once, at boot, before React renders. Keeps the app running: nothing here
 * throws, and a crashing render still leaves a record for the next start.
 */
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  window.addEventListener('error', event => {
    // Resource load failures (a missing image) are not app crashes; only script errors are recorded.
    if (!event.error && !event.message) return;
    recordError({
      kind: 'error',
      message: event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : String(event.message ?? 'Script error'),
      source: `${event.filename ?? ''}:${event.lineno ?? 0}`.replace(/^:/, ''),
    });
  });

  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason as { name?: string; message?: string } | string | undefined;
    const message = typeof reason === 'string' ? reason : reason?.message ? `${reason.name ?? 'Error'}: ${reason.message}` : 'Unhandled promise rejection';
    recordError({ kind: 'rejection', message });
  });

  // A WebView under memory pressure gives us one warning before it dies - keep it, it explains crashes.
  const perf = window.performance as Performance & {
    memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number };
    addEventListener?: (type: string, cb: () => void) => void;
  };
  const checkMemory = () => {
    const mem = perf?.memory;
    if (!mem || !mem.jsHeapSizeLimit) return;
    const ratio = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    if (ratio < 0.9) return;
    const log = readLog();
    const last = log[log.length - 1];
    if (last?.kind === 'memory' && Date.now() - last.at < 60_000) return;
    recordError({ kind: 'memory', message: `High memory use: ${Math.round(ratio * 100)}% of the JS heap` });
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) checkMemory(); });
}
