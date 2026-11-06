import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import {
  getZoom,
  setZoom,
  zoomIn,
  zoomOut,
  resetZoom,
  ZOOM_PRESETS,
  ZOOM_DEFAULT,
} from '../../platform/zoom';

/**
 * Floating Zoom In / Out / Reset control anchored just above the bottom-center
 * navigation bar.  Persists zoom level to localStorage and updates the CSS
 * `zoom` property on <html> so the whole quiz screen scales uniformly without
 * breaking layout or causing horizontal overflow.
 *
 * On hover / long-press the current zoom % and a fit-to-width hint are shown.
 */
export default function ZoomControl() {
  const [pct, setPct] = useState(getZoom);
  const [showLabel, setShowLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const labelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Subscribe to external zoom changes (e.g. from Settings)
    const el = document.documentElement;
    const observer = new MutationObserver(() => setPct(getZoom()));
    observer.observe(el, { attributes: true, attributeFilter: ['style'] });
    return () => observer.disconnect();
  }, []);

  // Sync with storage changes from other tabs / settings panel
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === 'qmp-ui-zoom-v1') setPct(getZoom());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  const updatePct = useCallback(() => setPct(getZoom()), []);

  const handleZoomIn = useCallback(() => {
    zoomIn();
    updatePct();
  }, [updatePct]);

  const handleZoomOut = useCallback(() => {
    zoomOut();
    updatePct();
  }, [updatePct]);

  const handleReset = useCallback(() => {
    resetZoom();
    updatePct();
  }, [updatePct]);

  const handleQuickPreset = useCallback((value: number) => {
    setZoom(value);
    updatePct();
  }, [updatePct]);

  const isDefault = pct === ZOOM_DEFAULT;

  // Show tooltip label on hover
  const handleMouseEnter = (e: React.MouseEvent, text: string) => {
    if (labelTimer.current) clearTimeout(labelTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setShowLabel({ x: rect.left + rect.width / 2, y: rect.top, text });
  };
  const handleMouseLeave = () => {
    labelTimer.current = setTimeout(() => setShowLabel(null), 200);
  };

  // Keyboard shortcuts (Ctrl/Cmd + =, -, 0) are handled app-wide by <ZoomShortcuts /> in App.

  return (
    <div
      className="zoom-control-group"
      role="group"
      aria-label="Zoom controls"
      style={{ touchAction: 'manipulation' }}
    >
      {/* Zoom Out */}
      <button
        onClick={handleZoomOut}
        aria-label="Zoom out"
        className="zoom-btn"
        onMouseEnter={e => handleMouseEnter(e, 'Zoom out — smaller text')}
        onMouseLeave={handleMouseLeave}
        title="Zoom out"
      >
        <ZoomOut className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Current level indicator */}
      <button
        onClick={handleReset}
        aria-label={isDefault ? 'Zoom is at default (100%)' : `Reset zoom to ${ZOOM_DEFAULT}%`}
        className={`zoom-btn zoom-btn-primary ${isDefault ? 'zoom-pct-default' : ''}`}
        onMouseEnter={e => handleMouseEnter(e, isDefault
          ? 'At default size — tap to keep'
          : `Click to reset to ${ZOOM_DEFAULT}%`)}
        onMouseLeave={handleMouseLeave}
        title={isDefault ? 'At 100% — default size' : `Click to reset to ${ZOOM_DEFAULT}%`}
      >
        <span className="text-[10px] font-black leading-none" style={{ lineHeight: 1 }}>
          {pct}
        </span>
        <span className="text-[8px] ml-0.5" aria-hidden="true">%</span>
        {!isDefault && (
          <RotateCcw className="w-3 h-3 absolute -top-0.5 -right-0.5 opacity-60" aria-hidden="true" />
        )}
      </button>

      {/* Zoom In */}
      <button
        onClick={handleZoomIn}
        aria-label="Zoom in"
        className="zoom-btn"
        onMouseEnter={e => handleMouseEnter(e, 'Zoom in — larger text')}
        onMouseLeave={handleMouseLeave}
        title="Zoom in"
      >
        <ZoomIn className="w-4 h-4" aria-hidden="true" />
      </button>

      {/* Quick-preset popover — shown on long-press / tap-hold on the % badge */}
      {showLabel && (
        <div
          className="zoom-label"
          style={{
            left: showLabel.x,
            top: showLabel.y,
            transform: 'translateX(-50%)',
            pointerEvents: 'none',
          }}
        >
          {showLabel.text}
        </div>
      )}

      {/* Hidden accessible live region */}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        Zoom {pct} percent
        {!isDefault ? ` — press reset to return to ${ZOOM_DEFAULT} percent` : ''}
      </span>
    </div>
  );
}
