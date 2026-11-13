/**
 * Overlay — the one popup primitive used across the app.
 *
 * Renders through a portal on `document.body`, so it is never trapped by a `backdrop-filter`/`transform`
 * ancestor (every glass card in this app creates one). It owns the backdrop, the layer z-index, the scroll
 * lock, Escape, the Android back button, focus handling and the close button — so no screen can get it wrong.
 *
 *   <Overlay open={open} onClose={close} kind="sheet" label="Order controls">
 *     <OverlayHeader title="Order Controls" subtitle="Question & option ordering" icon={<Shuffle />} onClose={close} />
 *     <OverlayBody>…</OverlayBody>
 *     <OverlayFooter>…</OverlayFooter>
 *   </Overlay>
 */
import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { LAYER_Z, lockPageScroll, unlockPageScroll, pushOverlay, popOverlay, requestClose } from '../../lib/overlayStack';

/**
 * Carries the z-index of the overlay a popup was opened from, so nested popups always stack above their
 * parent (a confirmation inside a sheet inside a full-screen panel still wins). Full-screen panels wrap their
 * content in <OverlayLayer> so their children know where they sit.
 */
export const OverlayParentZ = createContext(0);

export function OverlayLayer({ layer, children }: { layer: OverlayLayerName; children: React.ReactNode }) {
  return <OverlayParentZ.Provider value={LAYER_Z[layer] ?? LAYER_Z.sheet}>{children}</OverlayParentZ.Provider>;
}

type OverlayLayerName = OverlayLayer;

export type OverlayKind = 'center' | 'sheet' | 'right' | 'full';
export type OverlayLayer = 'sheet' | 'menu' | 'dialog' | 'panel' | 'blocking';

export interface OverlayProps {
  open: boolean;
  /** Omit to make the overlay non-dismissable (a mandatory choice). */
  onClose?: () => void;
  /** center = fits-content dialog · sheet = bottom sheet on phones, centred on desktop · right = side panel · full = full screen. */
  kind?: OverlayKind;
  /** Stacking layer. Defaults to `sheet`; confirmations must use `dialog` so they sit above a sheet. */
  layer?: OverlayLayer;
  /** Class names for the panel (the white card). */
  className?: string;
  /** Accessible name when there is no visible heading id. */
  label?: string;
  /** id of the element that labels the panel (see OverlayHeader's `titleId`). */
  labelledBy?: string;
  /** Tap the dimmed backdrop to close (default true when onClose is given). */
  closeOnBackdrop?: boolean;
  /** Hide the built-in close button (only for panels that provide their own, e.g. full screens). */
  hideClose?: boolean;
  /** Disable the entrance animation (used by full-screen panels that already animate). */
  noAnimation?: boolean;
  /** Element to focus when the overlay opens; falls back to the first field / the panel itself. */
  initialFocus?: React.RefObject<HTMLElement>;
  children: React.ReactNode;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export default function Overlay({
  open, onClose, kind = 'sheet', layer = 'sheet', className = '', label, labelledBy,
  closeOnBackdrop, hideClose = false, noAnimation = false, initialFocus, children,
}: OverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);
  const [z, setZ] = useState<number | null>(null);
  const parentZ = useContext(OverlayParentZ);
  const lastFocus = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const dismissable = typeof onClose === 'function';
  const canBackdropClose = closeOnBackdrop ?? dismissable;

  /* register + scroll lock + focus */
  useEffect(() => {
    if (!open) { setZ(null); return; }
    lockPageScroll();
    const { id, z: zIndex } = pushOverlay(dismissable ? () => closeRef.current?.() : undefined, layer, parentZ);
    idRef.current = id;
    setZ(zIndex);
    lastFocus.current = (document.activeElement as HTMLElement | null) ?? null;
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const target = initialFocus?.current ?? el.querySelector<HTMLElement>('[data-overlay-autofocus]') ?? el;
      try { target.focus({ preventScroll: true }); } catch { /* older WebView */ }
    }, 40);
    return () => {
      window.clearTimeout(t);
      popOverlay(id);
      setZ(null);
      unlockPageScroll();
      const prev = lastFocus.current;
      if (prev && document.contains(prev)) { try { prev.focus({ preventScroll: true }); } catch { /* ignore */ } }
    };
    // `dismissable` follows onClose; both are stable for the life of an open overlay.
  }, [open, layer, parentZ]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Escape closes the top-most overlay only + focus trap */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (requestClose(idRef.current)) { e.preventDefault(); e.stopPropagation(); }
        return;
      }
      if (e.key !== 'Tab') return;
      const el = panelRef.current;
      if (!el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(n => n.offsetParent !== null || n === el);
      if (!items.length) { e.preventDefault(); el.focus(); return; }
      const first = items[0];
      const last = items[items.length - 1];
      if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !el.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const layerClass = layer === 'dialog' ? 'qmp-layer-dialog' : layer === 'panel' ? 'qmp-layer-panel' : layer === 'blocking' ? 'qmp-layer-blocking' : layer === 'menu' ? 'qmp-layer-menu' : 'qmp-layer-sheet';

  return createPortal(
    <div
      className={`qmp-overlay ${layerClass} qmp-overlay-${kind}`}
      data-overlay-layer={layer}
      data-overlay-kind={kind}
      style={{ zIndex: z ?? undefined }}
    >
      <div
        className="qmp-overlay-backdrop"
        aria-hidden="true"
        onClick={canBackdropClose ? () => closeRef.current?.() : undefined}
        data-overlay-backdrop
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className={`qmp-panel qmp-panel-${kind} ${noAnimation ? 'qmp-panel-static' : ''} ${className}`}
        onClick={e => e.stopPropagation()}
      >
        {dismissable && !hideClose && (
          <button type="button" className="qmp-panel-close" onClick={() => closeRef.current?.()} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        )}
        <OverlayParentZ.Provider value={z ?? LAYER_Z[layer] ?? LAYER_Z.sheet}>{children}</OverlayParentZ.Provider>
      </div>
    </div>,
    document.body,
  );
}

/* ───────────────────────────── composition helpers ───────────────────────────── */

export function OverlayHeader({ title, subtitle, icon, onClose, titleId }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  onClose?: () => void;
  titleId?: string;
}) {
  return (
    <div className="qmp-panel-header">
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/15 text-primary">{icon}</div>}
        <div className="min-w-0">
          <p id={titleId} className="truncate text-[13px] font-black leading-tight text-foreground">{title}</p>
          {subtitle && <p className="mt-0.5 truncate text-[9.5px] font-bold uppercase tracking-[0.12em] text-foreground/40">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Close" className="qmp-panel-close-inline">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function OverlayBody({ children, className = '', padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return <div className={`qmp-panel-body ${padded ? 'p-4' : ''} ${className}`}>{children}</div>;
}

export function OverlayFooter({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`qmp-panel-footer ${className}`}>{children}</div>;
}
