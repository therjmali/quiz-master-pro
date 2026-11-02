import { useState, useRef, useCallback } from 'react';
import { Plus, Minus } from 'lucide-react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
const STEP = 0.25;

/**
 * Hook to share zoom state between header buttons and the image display.
 */
export function useImageZoom() {
  const scaleRef = useRef(1);
  const [scale, setScaleState] = useState(1);

  const zoomIn = useCallback(() => {
    const next = Math.min(scaleRef.current + STEP, MAX_SCALE);
    scaleRef.current = next;
    setScaleState(next);
  }, []);

  const zoomOut = useCallback(() => {
    const next = Math.max(scaleRef.current - STEP, MIN_SCALE);
    scaleRef.current = next;
    setScaleState(next);
  }, []);

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    setScaleState(1);
  }, []);

  return { scale, zoomIn, zoomOut, resetZoom, atMin: scale <= MIN_SCALE, atMax: scale >= MAX_SCALE };
}

interface Props {
  src: string;
  alt?: string;
}

/**
 * Zoomable image viewer for image-based quiz questions.
 * Renders a scrollable image container (zoom is controlled externally via useImageZoom).
 */
export default function ImageWithZoom({ src, alt = 'Question illustration' }: Props) {
  const [failed, setFailed] = useState(false);

  if (failed) return null;

  return (
    <div className="mb-5 animate-fade-in">
      <div className="overflow-auto rounded-xl border border-border/30 bg-black/20 max-h-[300px] flex items-center justify-center">
        <img
          src={src}
          alt={alt}
          onError={() => setFailed(true)}
          className="rounded-lg object-contain"
          style={{
            maxWidth: '100%',
            maxHeight: '280px',
          }}
          loading="lazy"
        />
      </div>
    </div>
  );
}
