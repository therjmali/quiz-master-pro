import { Play, RotateCcw, BookOpen, FileText, Layers, Copy, MessageSquare } from 'lucide-react';
import { formatRationale } from '../../lib/rationaleFormat';
import { toast } from 'sonner';
import { FileNode } from '../../utils/fileTree';
import { QuizQuestion } from '../../types/quiz';
import type { BookmarkStats } from './bookmarkAnalytics';

interface Props {
  bookmarks: FileNode[];
  stats: BookmarkStats;
  onPractice: (questions: QuizQuestion[]) => void;
  onFlashcards: () => void;
  onRevisionNotes: () => void;
  onPdfExport: () => void;
  onOpenChat?: (context: string) => void;
  compact?: boolean;
}

function toQuizQ(nodes: FileNode[]): QuizQuestion[] {
  return nodes.filter(b => b.bookmarkData).map(b => ({
    question: b.bookmarkData!.question,
    options: b.bookmarkData!.options,
    correctAnswer: b.bookmarkData!.correctAnswer,
    difficulty: (b.bookmarkData!.difficulty as 'easy' | 'medium' | 'hard') || 'medium',
    rationale: b.bookmarkData!.rationale,
    questionType: b.bookmarkData!.questionType,
  }));
}

function copyForAI(bookmarks: FileNode[]) {
  const items = bookmarks.filter(b => b.bookmarkData);
  if (!items.length) { toast.info('No bookmarks to copy'); return; }
  const lines = items.map((b, i) => {
    const d = b.bookmarkData!;
    const opts = d.options.map((o: string, j: number) => `   (${String.fromCharCode(97 + j)}) ${o}`).join('\n');
    const status = d.userAnswer === null ? '⏭ Skipped' : d.userAnswer === d.correctAnswer ? '✅ Correct' : '❌ Wrong';
    return `${i + 1}. ${d.question}\n${opts}\n   Answer: ${d.correctAnswer}${d.userAnswer ? `\n   Your answer: ${d.userAnswer} (${status})` : `\n   ${status}`}${d.rationale ? `\n   Rationale:\n   ${formatRationale(d.rationale).replace(/\n/g, '\n   ')}` : ''}${(d as any).aiRationale ? `\n   AI Explanation:\n   ${formatRationale((d as any).aiRationale).replace(/\n/g, '\n   ')}` : ''}`;
  }).join('\n\n');
  const text = `📋 Bookmarked Questions (${items.length})\n${'─'.repeat(40)}\n\n${lines}\n\n${'─'.repeat(40)}\nPlease analyze these questions. Help me understand the concepts, identify patterns in my mistakes, and suggest what I should study more.`;
  navigator.clipboard.writeText(text)
    .then(() => toast.success(`📋 ${items.length} questions copied for AI!`))
    .catch(() => toast.error('Copy failed'));
}

function ActionBtn({ icon, label, count, onClick, variant }: {
  icon: React.ReactNode; label: string; count?: number;
  onClick: () => void;
  variant: 'primary' | 'violet' | 'emerald' | 'red' | 'muted' | 'gradient';
}) {
  const styles = {
    primary: 'bg-primary/10 border-primary/25 text-primary hover:bg-primary/20 shadow-primary/5',
    violet: 'bg-violet-500/10 border-violet-500/25 text-violet-400 hover:bg-violet-500/20 shadow-violet-500/5',
    emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-400 hover:bg-emerald-500/20 shadow-emerald-500/5',
    red: 'bg-red-500/10 border-red-500/25 text-red-400 hover:bg-red-500/20 shadow-red-500/5',
    muted: 'bg-foreground/5 border-border text-foreground/50 hover:text-foreground/70 hover:bg-foreground/8 shadow-foreground/3',
    gradient: 'bg-gradient-to-r from-violet-500/15 to-primary/15 border-primary/25 text-primary hover:from-violet-500/25 hover:to-primary/25 shadow-primary/5',
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 text-[11px] font-bold px-3.5 py-2.5 rounded-xl border shadow-sm transition-all active:scale-[0.96] ${styles[variant]}`}>
      {icon}
      <span>{label}</span>
      {count !== undefined && <span className="text-[9px] opacity-60 font-black ml-0.5">{count}</span>}
    </button>
  );
}

export default function BookmarkActionBar({ bookmarks, stats, onPractice, onFlashcards, onRevisionNotes, onPdfExport, onOpenChat, compact }: Props) {
  const wrongNodes = bookmarks.filter(b => b.bookmarkData && b.bookmarkData.userAnswer !== null && b.bookmarkData.userAnswer !== b.bookmarkData.correctAnswer);

  const buildChatContext = () => {
    const items = bookmarks.filter(b => b.bookmarkData);
    return items.map((b, i) => {
      const d = b.bookmarkData!;
      return `Q${i + 1}: ${d.question}\nOptions: ${d.options.join(' | ')}\nCorrect: ${d.correctAnswer}\nUser: ${d.userAnswer || 'skipped'}`;
    }).join('\n\n');
  };

  return (
    <div className="flex flex-wrap gap-2">
      <ActionBtn icon={<Play className="w-3.5 h-3.5" />} label="Practice" count={stats.total} onClick={() => { const qs = toQuizQ(bookmarks); if (qs.length) onPractice(qs); else toast.info('No questions'); }} variant="primary" />
      <ActionBtn icon={<Layers className="w-3.5 h-3.5" />} label="Flashcards" onClick={onFlashcards} variant="violet" />
      <ActionBtn icon={<BookOpen className="w-3.5 h-3.5" />} label="Revision Notes" onClick={onRevisionNotes} variant="emerald" />
      <ActionBtn icon={<FileText className="w-3.5 h-3.5" />} label="PDF" onClick={onPdfExport} variant="muted" />
      <ActionBtn icon={<Copy className="w-3.5 h-3.5" />} label="Copy for AI" onClick={() => copyForAI(bookmarks)} variant="gradient" />
      {onOpenChat && (
        <ActionBtn icon={<MessageSquare className="w-3.5 h-3.5" />} label="Chat" onClick={() => onOpenChat(buildChatContext())} variant="violet" />
      )}
      {wrongNodes.length > 0 && (
        <ActionBtn icon={<RotateCcw className="w-3.5 h-3.5" />} label="Mistakes" count={wrongNodes.length} onClick={() => onPractice(toQuizQ(wrongNodes))} variant="red" />
      )}
    </div>
  );
}
