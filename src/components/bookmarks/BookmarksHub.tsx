import { useState, useMemo, useCallback } from 'react';
import { ChevronRight, Home } from 'lucide-react';
import { loadFileTree, getAllBookmarks, FileNode } from '../../utils/fileTree';
import { groupBySubject, computeStats } from './bookmarkAnalytics';
import SubjectListView from './SubjectListView';
import SubjectDetailView from './SubjectDetailView';
import QuizDetailView from './QuizDetailView';
import BookmarkActionBar from './BookmarkActionBar';
import BookmarkFlashcards from './BookmarkFlashcards';
import RevisionNotesModal from './RevisionNotesModal';
import PdfControlsModal from './PdfControlsModal';
import { QuizQuestion } from '../../types/quiz';
import { ReportPreviewData } from '../reports/ReportPreviewPage';

type NavState =
  | { level: 'hub' }
  | { level: 'subject'; subject: string }
  | { level: 'quiz'; subject: string; quizTitle: string }
  | { level: 'flashcards'; bookmarks: FileNode[]; subject?: string; quizTitle?: string };

interface Props {
  onPractice: (questions: QuizQuestion[]) => void;
  onClose?: () => void;
  onOpenReportPreview?: (data: ReportPreviewData) => void;
}

export default function BookmarksHub({ onPractice, onClose, onOpenReportPreview }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [nav, setNav] = useState<NavState>({ level: 'hub' });
  const [notesModal, setNotesModal] = useState<{ open: boolean; bookmarks: FileNode[]; subject?: string; quizTitle?: string }>({ open: false, bookmarks: [] });
  const [pdfModal, setPdfModal] = useState<{ open: boolean; bookmarks: FileNode[]; title?: string }>({ open: false, bookmarks: [] });

  const tree = useMemo(() => loadFileTree(), [refreshKey]);
  const allBookmarks = useMemo(() => getAllBookmarks(tree), [tree]);
  const subjects = useMemo(() => groupBySubject(tree), [tree]);
  const globalStats = useMemo(() => computeStats(allBookmarks), [allBookmarks]);

  const currentSubjectGroup = useMemo(() => {
    if (nav.level === 'subject' || nav.level === 'quiz') {
      return subjects.find(s => s.subject === nav.subject) || null;
    }
    return null;
  }, [subjects, nav]);

  const currentQuizGroup = useMemo(() => {
    if (nav.level === 'quiz' && currentSubjectGroup) {
      return currentSubjectGroup.quizzes.find(q => q.quizTitle === nav.quizTitle) || null;
    }
    return null;
  }, [currentSubjectGroup, nav]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleBack = useCallback(() => {
    if (nav.level === 'flashcards') {
      const fc = nav as Extract<NavState, { level: 'flashcards' }>;
      if (fc.quizTitle && fc.subject) setNav({ level: 'quiz', subject: fc.subject, quizTitle: fc.quizTitle });
      else if (fc.subject) setNav({ level: 'subject', subject: fc.subject });
      else setNav({ level: 'hub' });
    } else if (nav.level === 'quiz') {
      setNav({ level: 'subject', subject: nav.subject });
    } else if (nav.level === 'subject') {
      setNav({ level: 'hub' });
    }
  }, [nav]);

  const openFlashcards = useCallback((bookmarks: FileNode[], subject?: string, quizTitle?: string) => {
    setNav({ level: 'flashcards', bookmarks, subject, quizTitle });
  }, []);

  const openNotes = useCallback((bookmarks: FileNode[], subject?: string, quizTitle?: string) => {
    setNotesModal({ open: true, bookmarks, subject, quizTitle });
  }, []);

  const openPdf = useCallback((bookmarks: FileNode[], title?: string) => {
    setPdfModal({ open: true, bookmarks, title });
  }, []);

  // Empty state
  if (allBookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mb-4">
          <span className="text-4xl">🔖</span>
        </div>
        <h3 className="text-lg font-black text-foreground mb-1">No Bookmarks Yet</h3>
        <p className="text-sm text-foreground/40 max-w-xs">
          Bookmark questions during quiz review to see them here. Tap the 🔖 icon on any question.
        </p>
        {onClose && <button onClick={onClose} className="mt-4 text-sm font-bold text-primary">← Go Back</button>}
      </div>
    );
  }

  // Flashcard mode
  if (nav.level === 'flashcards') {
    return (
      <BookmarkFlashcards
        bookmarks={nav.bookmarks}
        subject={nav.subject}
        quizTitle={nav.quizTitle}
        onBack={handleBack}
      />
    );
  }

  return (
    <div className="animate-fade-in pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {nav.level !== 'hub' && (
            <button onClick={handleBack}
              className="w-8 h-8 rounded-xl bg-card border border-border flex items-center justify-center text-foreground/50 hover:text-foreground transition-all active:scale-90 flex-shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="m15 18-6-6 6-6" /></svg>
            </button>
          )}
          <div className="min-w-0">
            <p className="text-[9px] font-black text-foreground/25 uppercase tracking-widest">Bookmarks</p>
            <h2 className="text-lg font-black text-foreground truncate">
              {nav.level === 'hub' ? '🔖 My Bookmarks' :
               nav.level === 'subject' ? nav.subject :
               nav.quizTitle}
            </h2>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-foreground/40 hover:text-foreground transition-all active:scale-95 flex-shrink-0 text-[11px] font-bold">
            <Home className="w-3.5 h-3.5" /> Home
          </button>
        )}
      </div>

      {/* Breadcrumbs */}
      {nav.level !== 'hub' && (
        <div className="flex items-center gap-1 mb-3 overflow-x-auto no-scrollbar text-[11px]">
          <button onClick={() => setNav({ level: 'hub' })} className="font-bold text-primary/70 hover:text-primary flex items-center gap-1 flex-shrink-0">
            <Home className="w-3 h-3" /> Bookmarks
          </button>
          {(nav.level === 'subject' || nav.level === 'quiz') && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground/15 flex-shrink-0" />
              <button onClick={() => setNav({ level: 'subject', subject: nav.subject })}
                className={`font-bold flex-shrink-0 truncate max-w-[120px] ${nav.level === 'subject' ? 'text-foreground' : 'text-foreground/40 hover:text-foreground/70'}`}>
                {nav.subject}
              </button>
            </>
          )}
          {nav.level === 'quiz' && (
            <>
              <ChevronRight className="w-3 h-3 text-foreground/15 flex-shrink-0" />
              <span className="font-bold text-foreground truncate max-w-[120px] flex-shrink-0">{nav.quizTitle}</span>
            </>
          )}
        </div>
      )}

      {/* Quick global actions on hub */}
      {nav.level === 'hub' && (
        <div className="mb-4">
          <BookmarkActionBar
            bookmarks={allBookmarks} stats={globalStats}
            onPractice={onPractice}
            onFlashcards={() => openFlashcards(allBookmarks)}
            onRevisionNotes={() => openNotes(allBookmarks)}
            onPdfExport={() => openPdf(allBookmarks, 'All Bookmarks')}
          />
        </div>
      )}

      {/* Content */}
      {nav.level === 'hub' && (
        <SubjectListView
          subjects={subjects}
          globalStats={globalStats}
          onSelectSubject={(s) => setNav({ level: 'subject', subject: s })}
        />
      )}

      {nav.level === 'subject' && currentSubjectGroup && (
        <SubjectDetailView
          group={currentSubjectGroup}
          onSelectQuiz={(q) => setNav({ level: 'quiz', subject: nav.subject, quizTitle: q })}
          onPractice={onPractice}
          onFlashcards={() => openFlashcards(currentSubjectGroup.bookmarks, currentSubjectGroup.subject)}
          onRevisionNotes={() => openNotes(currentSubjectGroup.bookmarks, currentSubjectGroup.subject)}
          onPdfExport={() => openPdf(currentSubjectGroup.bookmarks, `${currentSubjectGroup.subject} — Bookmarks`)}
        />
      )}

      {nav.level === 'quiz' && currentQuizGroup && currentSubjectGroup && (
        <QuizDetailView
          quiz={currentQuizGroup}
          subject={nav.subject}
          subjectIcon={currentSubjectGroup.icon}
          onPractice={onPractice}
          onFlashcards={() => openFlashcards(currentQuizGroup.bookmarks, nav.subject, currentQuizGroup.quizTitle)}
          onRevisionNotes={() => openNotes(currentQuizGroup.bookmarks, nav.subject, currentQuizGroup.quizTitle)}
          onPdfExport={() => openPdf(currentQuizGroup.bookmarks, `${nav.subject} — ${currentQuizGroup.quizTitle}`)}
          onBookmarkRemoved={handleRefresh}
        />
      )}

      {/* Modals */}
      <RevisionNotesModal
        open={notesModal.open}
        onClose={() => setNotesModal(m => ({ ...m, open: false }))}
        bookmarks={notesModal.bookmarks}
        subject={notesModal.subject}
        quizTitle={notesModal.quizTitle}
      />
      <PdfControlsModal
        open={pdfModal.open}
        onClose={() => setPdfModal(m => ({ ...m, open: false }))}
        bookmarks={pdfModal.bookmarks}
        title={pdfModal.title}
        onOpenReportPreview={onOpenReportPreview}
      />
    </div>
  );
}
