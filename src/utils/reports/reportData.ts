export type ExportFormat = 'pdf' | 'html' | 'text' | 'doc';
export type QuestionFilter = 'all' | 'correct' | 'wrong' | 'skipped';
export type ReportCardType = QuestionFilter | 'notes' | 'exam' | 'revision';

export interface ReportSections {
  cover: boolean;
  dashboard: boolean;
  review: boolean;
  insights: boolean;
  appendix: boolean;
}

export const DEFAULT_SECTIONS: ReportSections = {
  cover: true,
  dashboard: true,
  review: true,
  insights: true,
  appendix: false,
};

export interface SubjectBreakdown {
  subject: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ReportMeta {
  title: string;
  subject: string;
  date: string;
  grade: string;
  gradeColor: string;
  scoreColor: string;
  isPassed: boolean;
  totalQ: number;
  correct: number;
  wrong: number;
  skipped: number;
  percentage: number;
  accuracy: number;
  timeTaken: number;
  quizCount: number;
  subjectBreakdown: SubjectBreakdown[];
  passMark: number;
}
