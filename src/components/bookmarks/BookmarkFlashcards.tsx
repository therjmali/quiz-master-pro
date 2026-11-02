import { useState, useCallback } from 'react';
import AiRationaleText from '../AiRationaleText';
import { ArrowLeft, ChevronLeft, ChevronRight, Shuffle } from 'lucide-react';
import { FileNode } from '../../utils/fileTree';

interface Props {
  bookmarks: FileNode[];
  subject?: string;
  quizTitle?: string;
  onBack: () => void;
}

export default function BookmarkFlashcards({ bookmarks, subject, quizTitle, onBack }: Props) {
  const [cards] = useState(() => {
    const shuffled = [...bookmarks].sort(() => Math.random() - 0.5);
    return shuffled.filter(b => b.bookmarkData);
  });
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const card = cards[idx]?.bookmarkData;
  if (!card || cards.length === 0) {
    return (
      <div className="py-12 text-center">
        <span className="text-3xl block mb-3">🃏</span>
        <p className="text-sm font-bold text-foreground/40">No flashcards available</p>
        <button onClick={onBack} className="mt-3 text-xs font-bold text-primary">← Back</button>
      </div>
    );
  }

  const diffDot = (card.difficulty || 'medium').toLowerCase() === 'hard' ? '🔴' :
    (card.difficulty || 'medium').toLowerCase() === 'easy' ? '🟢' : '🟡';

  return (
    <div className="animate-fade-in pb-4">
      <div className="flex items-center justify-between mb-3">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs font-bold text-foreground/40 hover:text-foreground transition-colors">
          <ArrowLeft className="w-3.5 h-3.5" /> Back
        </button>
        <span className="text-[10px] font-black text-foreground/25 tabular-nums">{idx + 1}/{cards.length}</span>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🃏</span>
        <div>
          <h3 className="text-sm font-black text-foreground">Bookmark Flashcards</h3>
          <p className="text-[10px] text-foreground/35">{subject}{quizTitle ? ` · ${quizTitle}` : ''}</p>
        </div>
      </div>

      {/* Progress */}
      <div className="h-1 bg-foreground/5 rounded-full overflow-hidden mb-4">
        <div className="h-full bg-primary/60 rounded-full transition-all" style={{ width: `${((idx + 1) / cards.length) * 100}%` }} />
      </div>

      {/* Card */}
      <button onClick={() => setFlipped(f => !f)} className="w-full text-left" style={{ perspective: '1000px' }}>
        <div className="relative w-full min-h-[340px] transition-transform duration-500"
          style={{ transformStyle: 'preserve-3d', transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* Front */}
          <div className="absolute inset-0 rounded-2xl bg-card border border-border p-5 flex flex-col"
            style={{ backfaceVisibility: 'hidden' }}>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className="text-[9px] font-bold text-foreground/30">{diffDot} {card.difficulty || 'Medium'}</span>
              {card.subject && <span className="text-[9px] font-bold text-primary/60 bg-primary/10 px-2 py-0.5 rounded border border-primary/15">{card.subject}</span>}
            </div>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-black text-foreground/20 uppercase tracking-widest mb-3">QUESTION</span>
              <p className="text-base font-bold text-foreground leading-relaxed">{card.question}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {card.options.map((opt, i) => (
                  <span key={i} className="text-[10px] text-foreground/40 bg-foreground/5 border border-border px-2.5 py-1.5 rounded-lg">
                    ({String.fromCharCode(97 + i)}) {opt}
                  </span>
                ))}
              </div>
            </div>
            <p className="text-[9px] text-foreground/20 text-center mt-3">Tap to reveal answer →</p>
          </div>
          {/* Back */}
          <div className="absolute inset-0 rounded-2xl bg-card border-2 border-emerald-500/25 p-5 flex flex-col"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <span className="text-[9px] font-black text-emerald-400/60 uppercase tracking-widest mb-3">✓ ANSWER</span>
              <p className="text-lg font-black text-emerald-400 mb-4">{card.correctAnswer}</p>
              {card.rationale && (
                <div className="bg-amber-500/8 border border-amber-500/15 rounded-xl px-4 py-3 max-w-lg w-full text-left">
                  <p className="text-[9px] font-black text-amber-400/60 uppercase tracking-widest mb-1">📖 Rationale</p>
                  <AiRationaleText text={card.rationale} className="text-xs text-foreground/50" />
                </div>
              )}
            </div>
            <p className="text-[9px] text-foreground/20 text-center mt-3">Tap to see question ←</p>
          </div>
        </div>
      </button>

      {/* Nav */}
      <div className="flex items-center justify-between gap-2 mt-4">
        <button onClick={() => { setFlipped(false); setTimeout(() => setIdx(i => Math.max(0, i - 1)), 120); }}
          disabled={idx === 0}
          className="flex items-center gap-1.5 bg-card border border-border text-foreground/60 font-bold text-sm px-4 py-3 rounded-xl disabled:opacity-25 transition-all active:scale-[0.97]">
          <ChevronLeft className="w-4 h-4" /> Prev
        </button>
        <button onClick={() => { setFlipped(false); setTimeout(() => setIdx(i => Math.min(cards.length - 1, i + 1)), 120); }}
          disabled={idx >= cards.length - 1}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground font-bold text-sm px-4 py-3 rounded-xl disabled:opacity-25 transition-all active:scale-[0.97]">
          Next <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {idx === cards.length - 1 && flipped && (
        <div className="mt-4 bg-primary/10 border border-primary/25 rounded-xl p-4 text-center animate-fade-in">
          <p className="text-sm font-bold text-foreground">🎉 You reviewed all {cards.length} flashcards!</p>
        </div>
      )}
    </div>
  );
}
