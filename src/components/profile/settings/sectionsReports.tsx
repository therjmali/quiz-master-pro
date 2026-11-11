import { memo, useEffect, useState } from 'react';
import { FileText, Share2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SettingsSection, SettingRow, Segmented, Toggle, SubHeading } from './controls';
import type { SectionProps } from './sectionsA';
import { DEFAULT_REPORT_PREFS, useReportPrefs } from '../../../utils/reports/reportPrefs';
import {
  clearReportList, deleteSavedReport, getReportNotifyEnabled, hasNativeReportSaver, listSavedReports, openSavedReport, setReportNotifyEnabled, shareSavedReport, type SavedReport,
} from '../../../platform/reportFiles';

const when = (t: number) => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const size = (n: number) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1)} MB`);

/** Settings -> Reports & downloads: how reports look, where they go, and the files already saved. */
export const ReportsSection = memo(function ReportsSection({ open, onToggle }: SectionProps) {
  const [prefs, setPrefs] = useReportPrefs();
  const [notify, setNotify] = useState(getReportNotifyEnabled);
  const [saved, setSaved] = useState<SavedReport[]>(listSavedReports);
  const [brand, setBrand] = useState(prefs.brand);
  useEffect(() => { setBrand(prefs.brand); }, [prefs.brand]);
  useEffect(() => {
    const on = () => setSaved(listSavedReports());
    window.addEventListener('qm:reports-changed', on);
    return () => window.removeEventListener('qm:reports-changed', on);
  }, []);
  const native = hasNativeReportSaver();
  const changed = JSON.stringify(prefs) !== JSON.stringify(DEFAULT_REPORT_PREFS) || !notify;

  return (
    <SettingsSection id="reports" icon={<FileText className="w-[18px] h-[18px]" />} open={open} onToggle={onToggle}
      onReset={changed ? () => { setPrefs(DEFAULT_REPORT_PREFS); setReportNotifyEnabled(true); setNotify(true); toast.success('Report settings reset'); } : undefined}>
      <SubHeading>Layout</SubHeading>
      <SettingRow id="reportColumns" title="Columns" hint="Two columns fit more on a page; one column is easier to annotate" inline={false}
        control={<Segmented label="Columns" value={String(prefs.columns) as '1' | '2'} options={[{ value: '2', label: '2 columns' }, { value: '1', label: '1 column' }]} onChange={v => setPrefs({ columns: v === '1' ? 1 : 2 })} />} />
      <SettingRow id="reportText" title="Text size" hint="Applies to PDF, preview and printouts" inline={false}
        control={<Segmented label="Text size" value={prefs.fontSize} options={[{ value: 'sm', label: 'Small' }, { value: 'md', label: 'Medium' }, { value: 'lg', label: 'Large' }]} onChange={v => setPrefs({ fontSize: v })} />} />
      <SettingRow id="reportPaper" title="Paper size" hint="A4 for India and most of the world, Letter for the US" inline={false}
        control={<Segmented label="Paper size" value={prefs.paper} options={[{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }]} onChange={v => setPrefs({ paper: v })} />} />
      <SettingRow id="reportUserAnswer" title="Show your answer" hint="Adds “Your answer” under each answer in full and mistakes reports"
        control={<Toggle label="Show your answer" checked={prefs.showUserAnswer} onChange={v => setPrefs({ showUserAnswer: v })} />} />
      <SettingRow id="reportBrand" title="Footer name" hint="Printed at the bottom right of every page" inline={false}
        control={<input value={brand} maxLength={28} onChange={e => setBrand(e.target.value)} onBlur={() => setPrefs({ brand })} aria-label="Footer name"
          className="w-full rounded-xl border border-border bg-foreground/[0.04] px-3 py-2.5 text-sm font-bold text-foreground outline-none focus:border-primary/50" />} />
      <p className="text-[11px] text-foreground/40 pb-1">Explanations follow the 📖 / 💡 rationale switches and the Book / Attempt order on the report screen.</p>

      <SubHeading>Downloads</SubHeading>
      <SettingRow id="reportNotify" title="Notify when a report is saved" hint={native ? 'A notification opens the file when you tap it' : 'Shown by your browser when allowed'}
        control={<Toggle label="Notify when saved" checked={notify} onChange={v => { setNotify(v); setReportNotifyEnabled(v); }} />} />
      <SettingRow id="reportWhere" title="Saved to" hint={native ? 'Downloads / R.J QUIZ on this phone. Works with no internet.' : 'Your browser’s download folder. Works with no internet.'} control={null} />

      <SubHeading>Recently saved</SubHeading>
      {saved.length === 0 ? <p className="text-[12px] text-foreground/45 py-2">Nothing yet. Reports you download appear here.</p> : (
        <ul className="space-y-1.5">
          {saved.slice(0, 8).map(r => (
            <li key={r.id} className="flex items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2">
              <span className="min-w-0 flex-1"><span className="block truncate text-[12px] font-bold text-foreground">{r.name}</span><span className="block text-[10px] text-foreground/40">{when(r.savedAt)} · {size(r.size)}</span></span>
              {native && r.uri && (
                <>
                  <button type="button" onClick={async () => { if (!(await openSavedReport(r))) toast.error('Could not open it — the file may have been moved. Try Share.'); }} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold active:scale-95">Open</button>
                  <button type="button" aria-label={`Share ${r.name}`} onClick={() => void shareSavedReport(r)} className="grid h-7 w-7 place-items-center rounded-lg border border-border active:scale-95"><Share2 className="h-3.5 w-3.5" /></button>
                </>
              )}
              <button type="button" aria-label={`Remove ${r.name} from the list`} onClick={() => void deleteSavedReport(r, false)} className="grid h-7 w-7 place-items-center rounded-lg border border-border text-foreground/50 active:scale-95"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      {saved.length > 0 && <button type="button" onClick={() => { clearReportList(); toast.success('List cleared (files stay in Downloads)'); }} className="mt-2 text-[11px] font-bold text-foreground/45 underline">Clear list</button>}
    </SettingsSection>
  );
});
