import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { loadFileTree, addBookmarkToTree, removeBookmarkNode, isQuestionBookmarked, getAllBookmarks, type FileNode, type BookmarkData } from '../utils/fileTree';
import type { QuizQuestion } from '../types/quiz';

/**
 * Bookmarks live in the file tree (Bookmarks / Subject / Quiz). One hook for every list that shows a 🔖 button,
 * so the per-quiz report and the Progress dashboard use the same set and the same toggle.
 */
export function useQuestionBookmarks() {
  const [fileTree, setFileTree] = useState<FileNode>(() => loadFileTree());
  const bookmarkedSet = useMemo(() => {
    const set = new Set<string>();
    getAllBookmarks(fileTree).forEach(b => { if (b.bookmarkData) set.add(b.bookmarkData.question); });
    return set;
  }, [fileTree]);

  const toggleBookmark = useCallback((q: QuizQuestion, userAnswer: string | null, ctx: { quizTitle?: string; subject?: string }) => {
    setFileTree(prev => {
      if (isQuestionBookmarked(prev, q.question)) {
        const target = getAllBookmarks(prev).find(b => b.bookmarkData?.question === q.question);
        if (!target) return prev;
        toast.success('🔖 Bookmark removed');
        return JSON.parse(JSON.stringify(removeBookmarkNode(prev, target.id)));
      }
      const data: BookmarkData = {
        question: q.question,
        options: q.options || [],
        correctAnswer: q.correctAnswer,
        userAnswer,
        rationale: q.rationale,
        difficulty: q.difficulty,
        questionType: q.questionType,
        quizTitle: ctx.quizTitle || 'Untitled Quiz',
        subject: ctx.subject || 'General',
        bookmarkedAt: Date.now(),
      };
      toast.success(`🔖 Saved to Bookmarks / ${ctx.subject || 'General'} / ${ctx.quizTitle || 'Quiz'}`);
      return JSON.parse(JSON.stringify(addBookmarkToTree(prev, data)));
    });
  }, []);

  return { bookmarkedSet, toggleBookmark };
}
