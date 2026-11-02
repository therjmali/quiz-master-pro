import { ChevronRight, Play, Layers, BookOpen, FileText } from 'lucide-react';
import { SubjectGroup, QuizGroup } from './bookmarkAnalytics';
import SubjectAnalyticsStrip from './SubjectAnalyticsStrip';
import BookmarkActionBar from './BookmarkActionBar';
import { FileNode } from '../../utils/fileTree';
import { QuizQuestion } from '../../types/quiz';

interface Props {
  group: SubjectGroup;
  onSelectQuiz: (quizTitle: string) => void;
  onPractice: (qs: QuizQuestion[]) => void;
  onFlashcards: () => void;
  onRevisionNotes: () => void;
  onPdfExport: () => void;
}

function QuizCard({ quiz, onSelect }: { quiz: QuizGroup; onSelect: () => void }) {
  const { stats } = quiz;
  const pct = stats.accuracy;
  const accClr = pct >= 80 ? 'text-emerald-400' : pct >= 60 ? 'text-amber-400' : 'text-red-400';
  const ringColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const r = 16, c = 2 * Math.PI * r, offset = c - (pct / 100) * c;

  return (
    <button onClick={onSelect}
      className="w-full bg-card border border-border rounded-2xl p-4 hover:border-foreground/15 hover:shadow-md hover:shadow-black/5 transition-all active:scale-[0.98] text-left group">
      <div className="flex items-center gap-3">
        {/* Mini donut */}
        <div className="relative flex-shrink-0" style={{ width: 44, height: 44 }}>
          <svg className="-rotate-90" width={44} height={44} viewBox="0 0 44 44">
            <circle cx={22} cy={22} r={r} fill="none" stroke="currentColor" className="text-foreground/5" strokeWidth="2.5" />
            <circle cx={22} cy={22} r={r} fill="none" stroke={ringColor} strokeWidth="2.5" strokeLinecap="round"
              strokeDasharray={c} strokeDashoffset={offset} className="transition-all duration-500" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-[11px] font-black ${accClr}`}>{pct}%</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-foreground truncate leading-snug">{quiz.quizTitle}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">✓{stats.correct}</span>
            <span className="text-[9px] font-bold text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded-md">✗{stats.wrong}</span>
            <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">⏭{stats.skipped}</span>
            <span className="text-foreground/8 mx-0.5">|</span>
            {stats.easy > 0 && <span className="text-[8px] font-bold text-emerald-400/60">🟢{stats.easy}</span>}
            {stats.medium > 0 && <span className="text-[8px] font-bold text-amber-400/60">🟡{stats.medium}</span>}
            {stats.hard > 0 && <span className="text-[8px] font-bold text-red-400/60">🔴{stats.hard}</span>}
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-foreground/15 group-hover:text-foreground/40 flex-shrink-0 transition-colors" />
      </div>
      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-foreground/5 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: ringColor }} />
      </div>
    </button>
  );
}

export default function SubjectDetailView({ group, onSelectQuiz, onPractice, onFlashcards, onRevisionNotes, onPdfExport }: Props) {
  return (
    <div className="animate-fade-in">
      {/* Subject header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/15 flex items-center justify-center text-3xl shadow-sm">
          {group.icon}
        </div>
        <div>
          <h2 className="text-lg font-black text-foreground">{group.subject}</h2>
          <p className="text-[11px] text-foreground/35 mt-0.5">{group.stats.total} bookmarks · {group.quizzes.length} quiz{group.quizzes.length !== 1 ? 'zes' : ''}</p>
        </div>
      </div>

      {/* Analytics */}
      <SubjectAnalyticsStrip stats={group.stats} />

      {/* Action bar */}
      <div className="mb-5">
        <BookmarkActionBar
          bookmarks={group.bookmarks} stats={group.stats}
          onPractice={onPractice} onFlashcards={onFlashcards}
          onRevisionNotes={onRevisionNotes} onPdfExport={onPdfExport}
        />
      </div>

      {/* Quiz list */}
      <p className="text-[10px] font-black text-foreground/25 uppercase tracking-widest mb-2.5 px-1">
        Quizzes ({group.quizzes.length})
      </p>
      <div className="space-y-2">
        {group.quizzes.map(quiz => (
          <QuizCard key={quiz.quizTitle} quiz={quiz} onSelect={() => onSelectQuiz(quiz.quizTitle)} />
        ))}
      </div>
    </div>
  );
}
