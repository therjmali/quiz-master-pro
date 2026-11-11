import { useCallback, useEffect, useState } from 'react';
import type { ReportStyle } from './pdf/types';
import { DEFAULT_STYLE } from './pdf/types';

const KEY = 'qm-report-prefs-v1';
export type ReportPrefs = Pick<ReportStyle, 'columns' | 'fontSize' | 'paper' | 'brand' | 'showUserAnswer'>;
export const DEFAULT_REPORT_PREFS: ReportPrefs = { columns: DEFAULT_STYLE.columns, fontSize: DEFAULT_STYLE.fontSize, paper: DEFAULT_STYLE.paper, brand: DEFAULT_STYLE.brand, showUserAnswer: DEFAULT_STYLE.showUserAnswer };

export function sanitizePrefs(raw: unknown): ReportPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const brand = typeof r.brand === 'string' ? r.brand.replace(/[\u0000-\u001f]/g, '').trim().slice(0, 28) : '';
  return {
    columns: r.columns === 1 ? 1 : 2,
    fontSize: r.fontSize === 'sm' || r.fontSize === 'lg' ? r.fontSize : 'md',
    paper: r.paper === 'letter' ? 'letter' : 'a4',
    brand: brand || DEFAULT_REPORT_PREFS.brand,
    showUserAnswer: r.showUserAnswer === false ? false : true,
  };
}

export function loadReportPrefs(): ReportPrefs {
  try { return sanitizePrefs(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return { ...DEFAULT_REPORT_PREFS }; }
}
export function saveReportPrefs(p: ReportPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(sanitizePrefs(p))); window.dispatchEvent(new Event('qm:report-prefs')); } catch { /* ignore */ }
}

export function useReportPrefs(): [ReportPrefs, (patch: Partial<ReportPrefs>) => void] {
  const [prefs, setPrefs] = useState<ReportPrefs>(loadReportPrefs);
  useEffect(() => {
    const on = () => setPrefs(loadReportPrefs());
    window.addEventListener('qm:report-prefs', on);
    return () => window.removeEventListener('qm:report-prefs', on);
  }, []);
  const update = useCallback((patch: Partial<ReportPrefs>) => { const next = sanitizePrefs({ ...loadReportPrefs(), ...patch }); saveReportPrefs(next); setPrefs(next); }, []);
  return [prefs, update];
}
