import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDebounce } from 'use-debounce';
import { useAuth } from 'zitejs/auth';
import { Search, X, CornerDownLeft } from 'lucide-react';
import { useCloudSync } from '../../hooks/useCloudSync';
import type { AppTheme, QuizResult } from '../../types/quiz';
import { SettingsQueryContext, Highlight } from './settings/controls';
import { searchSettings, SECTION_META, SECTION_ORDER, type SectionId } from './settings/settingsSearch';
import { AppearanceSection, QuizStudySection } from './settings/sectionsA';
import { CloudSection } from './settings/sectionsCloud';
import { AccessibilitySection } from './settings/sectionsAccessibility';
import { UpdatesSection } from './settings/sectionsUpdates';
import { ReportsSection } from './settings/sectionsReports';
import { AutoBackupSection, RemindersSection, DataSection, DeviceSection } from './settings/sectionsPlatform';
import { AISection, LibrarySection, NotificationsSection, GesturesSection, AccountSection, AdvancedSection, type ProfileTabLink } from './settings/sectionsB';

export interface BackupPrefs {
  autoDriveBackup?: boolean;
  allowDriveRestore?: boolean;
  autoCloudBackup: boolean;
  allowCloudRestore: boolean;
}

interface Props {
  theme: AppTheme;
  onThemeChange: (t: AppTheme) => void;
  isLoggedIn?: boolean;
  history?: QuizResult[];
  onCloudDirty?: (category: 'settings' | 'quiz' | 'flashcards' | 'filemanager' | 'library', priority?: 'background' | 'immediate' | 'critical') => void;
  /** Jump to another Profile tab (API keys, templates, trash, downloads) */
  onOpenTab?: (tab: ProfileTabLink) => void;
}

const OPEN_KEY = 'qmp_settings_open';
const EMPTY: QuizResult[] = [];
/** Status-tile / banner keys -> the Settings section that owns them. */
const DEEP_LINKS: Record<string, SectionId> = {
  updates: 'updates', about: 'updates', backup: 'autobackup', data: 'data', notifications: 'notifications', reminders: 'reminders',
  appearance: 'appearance', reports: 'reports', ai: 'ai', account: 'account', device: 'device',
};
type OpenMap = Record<SectionId, boolean>;

function loadOpen(): OpenMap {
  const base = Object.fromEntries(SECTION_ORDER.map(id => [id, id === 'appearance'])) as OpenMap;
  try { return { ...base, ...JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}') }; } catch { return base; }
}

export default function SettingsTab({ theme, onThemeChange, isLoggedIn = false, history = EMPTY, onOpenTab }: Props) {
  const { user } = useAuth();
  const cloudSync = useCloudSync(user, !!user);
  const syncRef = useRef(cloudSync.markDirty);
  syncRef.current = cloudSync.markDirty;
  const markDirty = useCallback(() => syncRef.current('settings', 'background'), []);
  const openTabRef = useRef(onOpenTab);
  openTabRef.current = onOpenTab;
  const openTab = useCallback((t: ProfileTabLink) => openTabRef.current?.(t), []);

  const [open, setOpen] = useState<OpenMap>(loadOpen);
  useEffect(() => { try { sessionStorage.setItem(OPEN_KEY, JSON.stringify(open)); } catch {} }, [open]);
  const toggle = useCallback((id: SectionId) => setOpen(p => ({ ...p, [id]: !p[id] })), []);

  // ── Search ──
  const [input, setInput] = useState('');
  const [query] = useDebounce(input, 150);
  const q = query.trim();
  const hits = useMemo(() => searchSettings(q), [q]);
  const matchedSections = useMemo(() => new Set(hits.map(h => h.entry.section)), [hits]);
  const inputRef = useRef<HTMLInputElement>(null);
  const searching = q.length > 0;

  const effectiveOpen = useCallback((id: SectionId) => (searching ? matchedSections.has(id) : open[id]), [searching, matchedSections, open]);
  const visible = useCallback((id: SectionId) => !searching || matchedSections.has(id), [searching, matchedSections]);

  const flashTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(flashTimer.current), []);

  const goTo = useCallback((id: string, section: SectionId) => {
    // Persist the section as open so it stays open after the search is cleared
    setOpen(p => ({ ...p, [section]: true }));
    setInput('');
    inputRef.current?.blur();
    // Wait for the section to expand before scrolling
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`setting-${id}`);
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
      el.classList.remove('setting-flash');
      void el.offsetWidth;
      el.classList.add('setting-flash');
      clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => el.classList.remove('setting-flash'), 1800);
    }));
  }, []);

  // Deep links from elsewhere in the app (sign-in prompts, status tiles, the update banner) land here and open the right section.
  useEffect(() => {
    const run = () => {
      let wanted: string | null = null;
      try { wanted = sessionStorage.getItem('qm-open-section'); sessionStorage.removeItem('qm-open-section'); } catch { /* ignore */ }
      if (!wanted) return;
      if (wanted === 'cloud') { goTo('cloudAccount', 'cloud'); return; }
      const section = DEEP_LINKS[wanted];
      if (!section) return;
      setOpen(p => ({ ...p, [section]: true }));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const el = document.getElementById(`section-${section}`);
        if (!el) return;
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }));
    };
    run();
    window.addEventListener('qm:open-settings', run);
    return () => window.removeEventListener('qm:open-settings', run);
  }, [goTo]);

  const clear = () => { setInput(''); inputRef.current?.focus(); };
  const sectionProps = (id: SectionId) => ({ open: effectiveOpen(id), onToggle: toggle });

  return (
    <SettingsQueryContext.Provider value={q}>
      <div className="space-y-3">
        {/* Sticky search */}
        <div className="sticky top-0 z-20 -mx-1 px-1 pt-1 pb-2 bg-background/85 backdrop-blur-md">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40 pointer-events-none" />
            <input
              ref={inputRef} type="search" value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') setInput('');
                if (e.key === 'Enter' && hits[0]) goTo(hits[0].entry.id, hits[0].entry.section);
              }}
              placeholder="Search settings — theme, email, haptics…" aria-label="Search settings"
              autoComplete="off" spellCheck={false}
              className="w-full h-11 pl-10 pr-10 rounded-2xl bg-card border border-border focus:border-primary/50 focus:ring-2 focus:ring-primary/15 text-sm text-foreground placeholder:text-foreground/35 focus:outline-none transition-shadow [&::-webkit-search-cancel-button]:hidden"
            />
            {input && (
              <button type="button" onClick={clear} aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-foreground/45 hover:text-foreground hover:bg-foreground/[0.06]">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {searching && (
            <div className="mt-2 rounded-2xl border border-border bg-card shadow-lg overflow-hidden" role="listbox" aria-label="Matching settings">
              {hits.length ? (
                <ul className="max-h-72 overflow-y-auto divide-y divide-border/70">
                  {hits.slice(0, 8).map(({ entry }, i) => (
                    <li key={entry.id}>
                      <button type="button" role="option" aria-selected={i === 0} onClick={() => goTo(entry.id, entry.section)}
                        className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left hover:bg-foreground/[0.04] focus-visible:bg-foreground/[0.06] focus-visible:outline-none">
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-bold text-foreground truncate"><Highlight text={entry.title} /></span>
                          <span className="block text-[11px] text-foreground/45 truncate">{SECTION_META[entry.section].title} · <Highlight text={entry.hint} /></span>
                        </span>
                        {i === 0 && <CornerDownLeft className="w-3.5 h-3.5 text-foreground/30 flex-shrink-0 hidden sm:block" />}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm font-bold text-foreground">No settings match “{q}”</p>
                  <p className="text-[11px] text-foreground/45 mt-1">Try a different word, like “dark”, “email” or “vibration”.</p>
                  <button type="button" onClick={clear} className="mt-3 h-8 px-4 rounded-lg bg-foreground/[0.06] text-xs font-bold text-foreground hover:bg-foreground/[0.1]">Clear search</button>
                </div>
              )}
            </div>
          )}
        </div>

        {visible('updates') && <UpdatesSection {...sectionProps('updates')} />}
        {visible('appearance') && <AppearanceSection {...sectionProps('appearance')} theme={theme} onThemeChange={onThemeChange} />}
        {visible('accessibility') && <AccessibilitySection {...sectionProps('accessibility')} />}
        {visible('reports') && <ReportsSection {...sectionProps('reports')} />}
        {visible('quiz') && <QuizStudySection {...sectionProps('quiz')} />}
        {visible('ai') && <AISection {...sectionProps('ai')} onOpenTab={openTab} />}
        {visible('library') && <LibrarySection {...sectionProps('library')} onOpenTab={openTab} isLoggedIn={isLoggedIn} history={history} />}
        {visible('autobackup') && <AutoBackupSection {...sectionProps('autobackup')} />}
        {visible('data') && <DataSection {...sectionProps('data')} onOpenTab={openTab} />}
        {visible('notifications') && <NotificationsSection {...sectionProps('notifications')} markDirty={markDirty} />}
        {visible('reminders') && <RemindersSection {...sectionProps('reminders')} />}
        {visible('gestures') && <GesturesSection {...sectionProps('gestures')} />}
        {visible('cloud') && <CloudSection {...sectionProps('cloud')} />}
        {visible('account') && <AccountSection {...sectionProps('account')} markDirty={markDirty} />}
        {visible('device') && <DeviceSection {...sectionProps('device')} />}
        {visible('advanced') && <AdvancedSection {...sectionProps('advanced')} />}
      </div>
    </SettingsQueryContext.Provider>
  );
}
