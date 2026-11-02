import { useState, useEffect, useRef } from 'react';
import { LayoutDashboard, BookOpen, Plus, BarChart2, User } from 'lucide-react';
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

export default function BottomNav({ screen, onHome, onCreate, onLibrary, onStats, onProfile, quizCount, bookmarkCount }: Props) {
  const activeKey = getActiveKey(screen);
  const hidden = useAutoHide();

  const leftTabs = [
    { key: 'home',    label: 'Home',    icon: LayoutDashboard, onClick: () => { hapticTap(); onHome(); }    },
    { key: 'library', label: 'Library', icon: BookOpen,        onClick: () => { hapticTap(); onLibrary(); }, badge: quizCount > 0 ? Math.min(quizCount, 99) : undefined },
  ];
  const rightTabs = [
    { key: 'stats',   label: 'Stats',   icon: BarChart2, onClick: () => { hapticTap(); onStats(); }, badge: undefined as number | undefined   },
    { key: 'profile', label: 'Profile', icon: User,      onClick: () => { hapticTap(); onProfile(); }, badge: bookmarkCount && bookmarkCount > 0 ? Math.min(bookmarkCount, 99) : undefined },
  ];

  return (
    <nav
      className={`bottom-nav transition-transform duration-300 ease-out ${hidden ? 'translate-y-full' : 'translate-y-0'}`}
      role="navigation"
      aria-label="Main navigation"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div className="flex items-end" style={{ height: 64 }}>

        {/* Left tabs */}
        {leftTabs.map(({ key, label, icon: Icon, onClick, badge }) => {
          const isActive = activeKey === key;
          return (
            <button
              key={key}
              onClick={onClick}
              className={`flex-1 flex flex-col items-center justify-center gap-1 pb-2 pt-1.5 transition-all duration-200 relative active:scale-95 ${isActive ? 'text-primary' : 'text-foreground/40'}`}
              style={{ minHeight: 56 }}
              aria-label={`${label}${badge ? ` (${badge})` : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary animate-scale-in" aria-hidden="true" />
              )}
              <div className={`relative transition-all duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                <Icon className="w-5 h-5" aria-hidden="true" strokeWidth={isActive ? 2.5 : 1.8} />
                {badge !== undefined && (
                  <span
                    className="absolute -top-2 -right-3 bg-primary text-primary-foreground text-[8px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-sm"
                    aria-hidden="true"
                  >
                    {badge}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider transition-all leading-none ${isActive ? 'text-primary' : 'text-foreground/35'}`} aria-hidden="true">
                {label}
              </span>
            </button>
          );
        })}

        {/* Center FAB — Create */}
        <div className="flex flex-col items-center justify-end pb-1.5 px-2 flex-shrink-0">
          <button
            onClick={() => { hapticTap(); onCreate(); }}
            className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-all active:scale-90 -translate-y-2 bg-primary shadow-lg shadow-primary/25 ${activeKey === 'create' ? 'fab-ring-pulse' : ''}`}
            aria-label="Create new quiz"
            aria-current={activeKey === 'create' ? 'page' : undefined}
          >
            <Plus className="w-5.5 h-5.5 text-primary-foreground" aria-hidden="true" strokeWidth={2.5} />
          </button>
          <span className={`text-[9px] font-bold uppercase tracking-wider leading-none mt-0.5 transition-colors ${activeKey === 'create' ? 'text-primary' : 'text-foreground/35'}`}>
            Create
          </span>
        </div>

        {/* Right tabs */}
        {rightTabs.map(({ key, label, icon: Icon, onClick, badge }) => {
          const isActive = activeKey === key;
          return (
            <button
              key={key}
              onClick={onClick}
              className={`flex-1 flex flex-col items-center justify-center gap-1 pb-2 pt-1.5 transition-all duration-200 relative active:scale-95 ${isActive ? 'text-primary' : 'text-foreground/40'}`}
              style={{ minHeight: 56 }}
              aria-label={`${label}${badge ? ` (${badge})` : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary animate-scale-in" aria-hidden="true" />
              )}
              <div className={`relative transition-all duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                <Icon className="w-5 h-5" aria-hidden="true" strokeWidth={isActive ? 2.5 : 1.8} />
                {badge !== undefined && (
                  <span className="absolute -top-2 -right-3 bg-accent text-accent-foreground text-[8px] font-black rounded-full min-w-[16px] h-4 flex items-center justify-center px-1 leading-none shadow-sm" aria-hidden="true">
                    {badge}
                  </span>
                )}
              </div>
              <span className={`text-[9px] font-bold uppercase tracking-wider leading-none transition-all ${isActive ? 'text-primary' : 'text-foreground/35'}`} aria-hidden="true">
                {label}
              </span>
            </button>
          );
        })}

      </div>
    </nav>
  );
}
