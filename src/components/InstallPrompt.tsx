import { useState, useEffect, useRef } from 'react';
import { Download, X } from 'lucide-react';

/**
 * PWA Install Prompt — listens for beforeinstallprompt and shows a custom banner.
 */
export default function InstallPrompt() {
  const [show, setShow] = useState(false);
  const deferredPromptRef = useRef<any>(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem('qmp_install_dismissed') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    // Check if already installed (standalone mode)
    if (window.matchMedia('(display-mode: standalone)').matches) return;
    if (dismissed) return;

    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e;
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [dismissed]);

  const handleInstall = async () => {
    if (!deferredPromptRef.current) return;
    deferredPromptRef.current.prompt();
    const result = await deferredPromptRef.current.userChoice;
    if (result.outcome === 'accepted') {
      setShow(false);
    }
    deferredPromptRef.current = null;
  };

  const handleDismiss = () => {
    setShow(false);
    setDismissed(true);
    try { localStorage.setItem('qmp_install_dismissed', 'true'); } catch {}
  };

  if (!show) return null;

  return (
    <div className="relative flex items-center gap-3 bg-gradient-to-r from-primary/15 via-primary/10 to-accent/10 border border-primary/20 rounded-2xl px-4 py-3 animate-slide-up">
      <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center flex-shrink-0">
        <Download className="w-5 h-5 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">Install Quiz Master Pro</p>
        <p className="text-[11px] text-foreground/40 mt-0.5">Add to home screen for offline access & faster loading</p>
      </div>
      <button
        onClick={handleInstall}
        className="flex-shrink-0 bg-primary text-primary-foreground text-xs font-bold px-4 py-2 rounded-xl shadow-md shadow-primary/25 transition-all active:scale-95"
      >
        Install
      </button>
      <button onClick={handleDismiss} className="absolute top-2 right-2 text-foreground/20 hover:text-foreground/50 transition-colors">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
