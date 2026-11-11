import type { QuizResult, RationalePrefs, ReportOrder } from '../../types/quiz';
import type { Difficulty } from '../../utils/reports/pdf/model';
import type { ReportKind } from '../../utils/reports/pdf/types';

/** Everything the full-page preview needs to (re)build any report, offline. */
export interface ReportSession {
  scope: 'quiz' | 'profile';
  /** Results with their full question data. */
  results: QuizResult[];
  rationaleCache: Record<string, string>;
  kind: ReportKind;
  order: ReportOrder;
  difficulty: Difficulty;
  rationale: RationalePrefs;
  onRationalePrefsChange?: (p: RationalePrefs) => void;
  onOrderChange?: (o: ReportOrder) => void;
  /** Revision sheet markdown (cached or AI-generated on the device). */
  getRevisionMarkdown?: () => Promise<string>;
  getAiRationale?: (q: string, correct: string, user: string | null, status: 'correct' | 'wrong' | 'skipped', options?: string[]) => Promise<string>;
}

export interface ReportPreviewData {
  title: string;
  /** New offline report preview. */
  session?: ReportSession;
  /** Legacy screens (bookmarks) that still build HTML: shown through the same page viewer. */
  html?: string;
  activeCard?: string;
  showAnswers?: boolean;
  showBookRat?: boolean;
  showAiRat?: boolean;
  onRegenerate?: (opts: unknown) => string;
  onExplainAll?: (opts: unknown) => Promise<string>;
  onDownload?: (fmt: 'pdf' | 'html' | 'text' | 'doc', editedHtml?: string) => void;
  availableReports?: { key: string; label: string; icon?: string }[];
  onSwitchReport?: (key: string) => void;
}
