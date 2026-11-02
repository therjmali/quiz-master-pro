/**
 * MobilePopover — always opens as a centered modal dialog.
 * ❌ close button in top-right corner.
 * Clicking outside (backdrop) auto-closes.
 */
import { useRef, useEffect } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  desktopWidth?: string;
}

export default function MobilePopover({
  open, onClose, children, title, subtitle, icon,
  desktopWidth = 'w-[340px]',
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Prevent body scroll when open
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-12 sm:pt-16 p-4">
      {/* Backdrop — click to close */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Centered card */}
      <div
        ref={ref}
        className={`relative ${desktopWidth} max-w-[95vw] max-h-[80vh] overflow-y-auto bg-card border border-border rounded-2xl shadow-2xl z-[301] animate-fade-in`}
      >
        {/* Header with ❌ close */}
        {title && (
          <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border sticky top-0 bg-card z-10 rounded-t-2xl">
            <div className="flex items-center gap-3">
              {icon && (
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center flex-shrink-0">
                  {icon}
                </div>
              )}
              <div>
                <p className="text-sm font-black text-foreground leading-tight">{title}</p>
                {subtitle && <p className="text-[10px] text-foreground/40 font-semibold uppercase tracking-widest mt-0.5">{subtitle}</p>}
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4 text-destructive" />
            </button>
          </div>
        )}

        {/* Close button even if no title */}
        {!title && (
          <button
            onClick={onClose}
            className="absolute top-3 right-3 w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-colors z-10"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-destructive" />
          </button>
        )}

        {/* Content */}
        <div className="pb-4">{children}</div>
      </div>
    </div>
  );
}
