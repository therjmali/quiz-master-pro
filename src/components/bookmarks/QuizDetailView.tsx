import { useState, useCallback } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { FileNode, removeBookmarkNode, loadFileTree, saveFileTree } from '../../utils/fileTree';
import { QuizGroup } from './bookmarkAnalytics';
import SubjectAnalyticsStrip from './SubjectAnalyticsStrip';
import BookmarkActionBar from './BookmarkActionBar';
import BookmarkQuestionCard from './BookmarkQuestionCard';
import { QuizQuestion } from '../../types/quiz';

interface Props {
  quiz: QuizGroup;
  subject: string;
  subjectIcon: string;
  onPractice: (qs: QuizQuestion[]) => void;
  onFlashcards: () => void;
  onRevisionNotes: () => void;
  onPdfExport: () => void;
  onBookmarkRemoved: () => void;
}

export default function QuizDetailView({ quiz, subject, subjectIcon, onPractice, onFlashcards, onRevisionNotes, onPdfExport, onBookmarkRemoved }: Props) {
  const [showRationale, setShowRationale] = useState(true);
  const [showAiRationale, setShowAiRationale] = useState(false);

  const handleRemove = useCallback((nodeId: string) => {
    const tree = loadFileTree();
    const updated = removeBookmarkNode(tree, nodeId);
    saveFileTree(updated);
    onBookmarkRemoved();
    toast.success('🔖 Bookmark removed');
  }, [onBookmarkRemoved]);

  return (
    <div className="animate-fade-in">
      {/* Quiz header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/8 border border-primary/10 flex items-center justify-center text-lg flex-shrink-0">
          📝
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-black text-foreground truncate">{quiz.quizTitle}</h2>
          <p className="text-[10px] text-foreground/35 flex items-center gap-1">
            <span>{subjectIcon}</span>
            <span>{subject}</span>
            <span className="mx-1">·</span>
            <span>{quiz.stats.total} questions</span>
          </p>
        </div>
      </div>

      {/* Analytics */}
      <SubjectAnalyticsStrip stats={quiz.stats} />

      {/* Action bar */}
      <div className="mb-4">
        <BookmarkActionBar
          bookmarks={quiz.bookmarks} stats={quiz.stats}
          onPractice={onPractice} onFlashcards={onFlashcards}
          onRevisionNotes={onRevisionNotes} onPdfExport={onPdfExport}
          compact
        />
      </div>

      {/* Rationale toggles */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={() => setShowRationale(v => !v)}
          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${showRationale ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-card border-border text-foreground/30'}`}>
          📖 Book
        </button>
        <button onClick={() => setShowAiRationale(v => !v)}
          className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all ${showAiRationale ? 'bg-violet-500/15 border-violet-500/30 text-violet-400' : 'bg-card border-border text-foreground/30'}`}>
          💡 AI
        </button>
        <span className="text-[9px] text-foreground/20 ml-auto">{quiz.stats.total} questions</span>
      </div>

      {/* Questions */}
      <div className="space-y-2">
        {quiz.bookmarks.map(bm => (
          <BookmarkQuestionCard
            key={bm.id}
            node={bm}
            showRationale={showRationale}
            showAiRationale={showAiRationale}
            selectMode={false}
            selected={false}
            onToggleSelect={() => {}}
            onRemove={() => handleRemove(bm.id)}
          />
        ))}
      </div>
    </div>
  );
}
