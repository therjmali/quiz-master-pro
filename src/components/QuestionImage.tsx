import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface Props {
  url: string;
  maxHeight?: string;
  className?: string;
}

export default function QuestionImage({ url, maxHeight = '200px', className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Reset states when URL changes
  useEffect(() => {
    setFailed(false);
    setLoading(true);
  }, [url]);

  if (!url || failed) return null;

  return (
    <div className={`flex justify-center mb-4 ${className}`}>
      <div className="relative">
        {loading && (
          <div
            className="flex items-center justify-center rounded-xl border border-border/30 bg-foreground/5"
            style={{ minHeight: '80px', minWidth: '120px', maxHeight, maxWidth: '100%' }}
          >
            <Loader2 className="w-5 h-5 text-foreground/30 animate-spin" />
          </div>
        )}
        <img
          key={url}
          src={url}
          alt="Question image"
          onError={() => { setFailed(true); setLoading(false); }}
          onLoad={() => setLoading(false)}
          className={`rounded-xl border border-border/30 object-contain shadow-sm ${loading ? 'absolute opacity-0' : ''}`}
          style={{ maxHeight, maxWidth: '100%' }}
        />
      </div>
    </div>
  );
}
