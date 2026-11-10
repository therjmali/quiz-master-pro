import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, BookOpen, Plus, BarChart2, Gauge, type LucideIcon } from 'lucide-react';
import { hapticTap } from '../utils/haptics';

interface Props {
  screen: string;
  onHome: () => void;
  onCreate: () => void;
  onLibrary: () => void;
  onStats: () => void;
  onProfile: () => void;
  quizCount: number;
  bookmarkCount?: number;
}

function getActiveKey(screen: string): string {
  if (screen === 'dashboard' || screen === 'practice-dashboard') return 'home';
  if (screen === 'setup') return 'create';
  if (screen === 'library') return 'library';
  if (screen === 'stats') return 'stats';
  if (screen === 'profile' || screen === 'results') return 'profile';
  return '';
}

/** Auto-hide bottom nav on scroll down, show on scroll up */
function useAutoHide() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastScrollY.current;
        // Hide when scrolling down > 12px, show when scrolling up > 8px or near top
        if (delta > 12 && y > 100) setHidden(true);
        else if (delta < -8 || y < 60) setHidden(false);
        lastScrollY.current = y;
        ticking.current = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return hidden;
}

const ORDER = ['home', 'library', 'create', 'stats', 'profile'] as const;

export default function BottomNav({ screen, onHome, onCreate, onLibrary, onStats, onProfile, quizCount, bookmarkCount }: Props) {
  const activeKey = getActiveKey(screen);
  const hidden = useAutoHide();
  const activeIndex = ORDER.indexOf(activeKey as typeof ORDER[number]);

  // Lets other bars (e.g. the Create screen's action bar) glide down when the dock tucks away.
  useEffect(() => {
    document.documentElement.dataset.dockHidden = hidden ? 'true' : 'false';
    return () => { delete document.documentElement.dataset.dockHidden; };
  }, [hidden]);

  const tabs: { key: typeof ORDER[number]; label: string; icon: LucideIcon; onClick: () => void; badge?: number; badgeTone?: 'primary' | 'accent' }[] = [
    { key: 'home',    label: 'Home',    icon: LayoutDashboard, onClick: () => { hapticTap(); onHome(); } },
    { key: 'library', label: 'Library', icon: BookOpen,        onClick: () => { hapticTap(); onLibrary(); }, badge: quizCount > 0 ? Math.min(quizCount, 99) : undefined, badgeTone: 'primary' },
    { key: 'create',  label: 'Create',  icon: Plus,            onClick: () => { hapticTap(); onCreate(); } },
    { key: 'stats',   label: 'Stats',   icon: BarChart2,       onClick: () => { hapticTap(); onStats(); } },
    { key: 'profile', label: 'Progress', icon: Gauge,            onClick: () => { hapticTap(); onProfile(); }, badge: bookmarkCount && bookmarkCount > 0 ? Math.min(bookmarkCount, 99) : undefined, badgeTone: 'accent' },
  ];

  return (
    <nav
      className={`qmp-dock ${hidden ? 'qmp-dock-hidden' : ''}`}
      role="navigation"
      aria-label="Main navigation"
    >
      <div className="qmp-dock-bar" style={{ ['--dock-i' as string]: activeIndex >= 0 ? activeIndex : 0 }}>
        {/* Soft glow that glides under the selected tab */}
        <span className={`qmp-dock-glow ${activeIndex >= 0 ? 'is-on' : ''}`} aria-hidden="true" />

        {tabs.map(({ key, label, icon: Icon, onClick, badge, badgeTone }) => {
          const isActive = activeKey === key;
          const isCreate = key === 'create';
          return (
            <button
              key={key}
              type="button"
              onClick={onClick}
              className={`qmp-dock-item ${isActive ? 'is-active' : ''} ${isCreate ? 'is-create' : ''}`}
              aria-label={`${isCreate ? 'Create new quiz' : label}${badge ? ` (${badge})` : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <span className={`qmp-dock-icon ${isCreate && isActive ? 'fab-ring-pulse' : ''}`}>
                <Icon className="qmp-dock-svg" aria-hidden="true" strokeWidth={isActive || isCreate ? 2.5 : 1.9} />
                {badge !== undefined && (
                  <span className={`qmp-dock-badge ${badgeTone === 'accent' ? 'is-accent' : ''}`} aria-hidden="true">{badge}</span>
                )}
              </span>
              <span className="qmp-dock-label" aria-hidden="true">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
