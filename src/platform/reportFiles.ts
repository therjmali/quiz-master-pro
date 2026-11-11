/**
 * Saving reports the user asked for - fully offline.
 *  - Installed Android app: written to Downloads/R.J QUIZ through MediaStore (no storage permission), then a system
 *    notification "Report saved" that opens the file when tapped. Falls back to the share sheet if that is unavailable.
 *  - Browser / PWA: a normal download (+ a notification when the browser allows it).
 * The last saved reports are remembered (name, size, where) so they can be opened or shared again later, offline.
 */
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { LocalNotifications } from '@capacitor/local-notifications';
import { isNative } from './native';
import { getPermission, requestPermission } from './notify/notifier';

export interface SavedReport {
  id: string;
  name: string;
  mime: string;
  size: number;
  savedAt: number;
  /** content:// URI on Android, empty for browser downloads. */
  uri: string;
  where: string;
  kind?: string;
  pages?: number;
}

const LIST_KEY = 'qm-saved-reports-v1';
const PREFS_KEY = 'qm-report-notify-v1';
const MAX_KEPT = 40;
const CHANNEL_ID = 'report-downloads';
const ID_BASE = 8_000_000;

interface ReportBridge {
  saveReport?: (name: string, mime: string, base64: string) => string;
  openReport?: (uri: string, mime: string) => boolean;
  shareReport?: (uri: string, mime: string, title: string) => boolean;
  reportExists?: (uri: string) => boolean;
  deleteReport?: (uri: string) => boolean;
}
const bridge = (): ReportBridge | undefined => (typeof window === 'undefined' ? undefined : (window as unknown as { QmNative?: ReportBridge }).QmNative);
export const hasNativeReportSaver = (): boolean => isNative() && typeof bridge()?.saveReport === 'function';

export const MIME = { pdf: 'application/pdf', doc: 'application/msword', text: 'text/plain', html: 'text/html' } as const;

export function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/* ───────────── remembered list ───────────── */
export function listSavedReports(): SavedReport[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LIST_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter(r => r && typeof r.name === 'string') : [];
  } catch { return []; }
}
function writeList(list: SavedReport[]): void {
  try { localStorage.setItem(LIST_KEY, JSON.stringify(list.slice(0, MAX_KEPT))); } catch { /* full */ }
  try { window.dispatchEvent(new Event('qm:reports-changed')); } catch { /* ignore */ }
}
export function rememberReport(r: SavedReport): void { writeList([r, ...listSavedReports().filter(x => x.id !== r.id)]); }
export function forgetReport(id: string): void { writeList(listSavedReports().filter(r => r.id !== id)); }
export function clearReportList(): void { writeList([]); }

/** Drops list entries whose file was deleted outside the app (Android only). */
export function pruneMissingReports(): void {
  const b = bridge();
  if (!hasNativeReportSaver() || !b?.reportExists) return;
  const list = listSavedReports();
  const kept = list.filter(r => !r.uri || b.reportExists!(r.uri));
  if (kept.length !== list.length) writeList(kept);
}

/* ───────────── notification preference ───────────── */
export const getReportNotifyEnabled = (): boolean => { try { return localStorage.getItem(PREFS_KEY) !== 'off'; } catch { return true; } };
export const setReportNotifyEnabled = (on: boolean): void => { try { localStorage.setItem(PREFS_KEY, on ? 'on' : 'off'); } catch { /* ignore */ } };

/* ───────────── saving ───────────── */
export interface SaveOptions {
  name: string;
  mime: string;
  bytes?: Uint8Array;
  text?: string;
  kind?: string;
  pages?: number;
  notify?: boolean;
}

export class ReportSaveError extends Error {}

function triggerBrowserDownload(name: string, mime: string, bytes: Uint8Array): void {
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15_000);
}

export async function saveReportFile(o: SaveOptions): Promise<SavedReport> {
  const bytes = o.bytes ?? new TextEncoder().encode(o.text ?? '');
  if (!bytes.length) throw new ReportSaveError('The report is empty, so nothing was saved.');
  const base: SavedReport = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: o.name, mime: o.mime, size: bytes.length, savedAt: Date.now(), uri: '', where: 'your device', kind: o.kind, pages: o.pages };

  let saved: SavedReport | null = null;
  if (hasNativeReportSaver()) {
    try {
      const res = JSON.parse(bridge()!.saveReport!(o.name, o.mime, toBase64(bytes))) as { ok: boolean; uri: string; where: string; error: string };
      if (res.ok) saved = { ...base, uri: res.uri, where: res.where };
      else console.warn('Report save failed natively:', res.error);
    } catch (e) { console.warn('Report save bridge error', e); }
    if (!saved && isNative() && Capacitor.isPluginAvailable('Filesystem')) {
      // Fallback: app cache + the system share sheet ("Save to Files", Drive, WhatsApp...).
      const written = await Filesystem.writeFile({ path: o.name, data: toBase64(bytes), directory: Directory.Cache });
      await Share.share({ title: o.name, files: [written.uri], dialogTitle: 'Save or share your report' });
      saved = { ...base, uri: written.uri, where: 'shared from the app' };
    }
    if (!saved) throw new ReportSaveError('Could not save the report on this device. Check free storage and try again.');
  } else {
    triggerBrowserDownload(o.name, o.mime, bytes);
    saved = { ...base, where: 'your browser downloads' };
  }
  rememberReport(saved);
  if (o.notify !== false && getReportNotifyEnabled()) void notifyReportSaved(saved);
  return saved;
}

/* ───────────── open / share / delete ───────────── */
export async function openSavedReport(r: SavedReport): Promise<boolean> {
  if (hasNativeReportSaver() && r.uri) return !!bridge()!.openReport?.(r.uri, r.mime);
  return false;
}
export async function shareSavedReport(r: SavedReport): Promise<boolean> {
  try {
    if (hasNativeReportSaver() && r.uri) return !!bridge()!.shareReport?.(r.uri, r.mime, r.name);
    if (isNative() && r.uri) { await Share.share({ title: r.name, files: [r.uri] }); return true; }
  } catch { /* cancelled */ }
  return false;
}
export async function deleteSavedReport(r: SavedReport, alsoFile: boolean): Promise<void> {
  if (alsoFile && hasNativeReportSaver() && r.uri) { try { bridge()!.deleteReport?.(r.uri); } catch { /* ignore */ } }
  forgetReport(r.id);
}

/* ───────────── notification ───────────── */
let counter = 0;
const prettySize = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

export async function notifyReportSaved(r: SavedReport): Promise<void> {
  const title = 'Report saved';
  const body = `${r.name} · ${prettySize(r.size)}${r.where ? ` · ${r.where}` : ''}`;
  try {
    if (isNative()) {
      let perm = await getPermission();
      if (perm === 'prompt') perm = await requestPermission();
      if (perm !== 'granted') return;
      try { await LocalNotifications.createChannel({ id: CHANNEL_ID, name: 'Report downloads', description: 'Tells you when a report has been saved', importance: 3, visibility: 1 }); } catch { /* exists */ }
      await LocalNotifications.schedule({ notifications: [{ id: ID_BASE + (counter++ % 90_000), title, body, channelId: CHANNEL_ID, schedule: { at: new Date(Date.now() + 400) }, extra: { reportId: r.id, uri: r.uri, mime: r.mime } }] });
    } else if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.showNotification(title, { body, tag: 'qm-report' }); else new Notification(title, { body });
    }
  } catch { /* notifications are a bonus, never a failure */ }
}

/** Opens the report when its notification is tapped. Call once at start-up. */
let listening = false;
export function initReportNotificationTap(): void {
  if (listening || !isNative()) return;
  listening = true;
  void LocalNotifications.addListener('localNotificationActionPerformed', ev => {
    const x = ev.notification?.extra as { uri?: string; mime?: string } | undefined;
    if (x?.uri) void openSavedReport({ id: '', name: '', mime: x.mime || MIME.pdf, size: 0, savedAt: 0, uri: x.uri, where: '' });
  });
}
