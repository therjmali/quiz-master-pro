/**
 * App-wide zoom keyboard shortcuts (Ctrl/Cmd + "+", "-", "0"), mounted once in App.
 * Importing the zoom engine here also guarantees the saved zoom is applied at startup on every
 * screen - not only after the quiz screen has loaded.
 */
import { useEffect } from 'react';
import { zoomIn, zoomOut, resetZoom, zoomActionForKey } from '../../platform/zoom';

export default function ZoomShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const action = zoomActionForKey(e);
      if (!action) return;
      e.preventDefault();
      if (action === 'in') zoomIn(); else if (action === 'out') zoomOut(); else resetZoom();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return null;
}
