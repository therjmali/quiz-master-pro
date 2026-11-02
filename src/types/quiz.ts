export type Screen = 'dashboard' | 'practice-dashboard' | 'setup' | 'quiz' | 'summary' | 'results' | 'profile' | 'library' | 'stats' | 'report-preview' | 'flashcards';

// ─── AI Source ────────────────────────────────────────────────────────────────
export type AIMode = 'off' | 'local' | 'cloud';

/** Controls which AI backend powers quiz gen & report helpers */
export interface AIPrefs {
  /** Q.H — Quiz Helper: which AI generates quizzes */
  quizHelper: AIMode;
  /** R.H — Report Helper: which AI generates rationale/explanations */
  reportHelper: AIMode;
}

export const DEFAULT_AI_PREFS: AIPrefs = {
  quizHelper: 'local',
  reportHelper: 'local',
};

// ─── Rationale Visibility ─────────────────────────────────────────────────────
/** Controls what rationale panels are visible in every review / report section */
export interface RationalePrefs {
  /** Show 📖 Book Rationale — extracted from source text or embedded in quiz data */
  showBook: boolean;
  /** Show 💡 AI Rationale — generated on-demand by Gemini / Claude */
  showAi: boolean;
}

export const DEFAULT_RATIONALE_PREFS: RationalePrefs = {
  showBook: true,
  showAi: true,
};

/** Only two themes exist: Light and AMOLED (pure black). Legacy 'dark' is migrated to 'amoled'. */
export type AppTheme = 'amoled' | 'light';

/**
 * Report ordering modes — fully independent from live-quiz shuffle.
 *   original = questions & options exactly as pasted (matches physical book)
 *   attempt  = questions & options as presented during the quiz attempt
 */
export type ReportOrder = 'original' | 'attempt';

export interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  /** For multi-answer questions — all correct option texts */
  correctAnswers?: string[];
  difficulty: 'easy' | 'medium' | 'hard';
  rationale?: string;
  /** Rationale as an array of trimmed, cleaned bullet strings (set by the parser). */
  rationaleBullets?: string[];
  /** Question type extracted from Q.[Type] bracket notation (e.g. "Pharmacology") */
  questionType?: string;
  shuffledOpts?: string[];
  imageUrl?: string;
  /**
   * Zero-based index of this question in the ORIGINAL (pre-shuffle) array.
   * Stamped by startQuiz() before any shuffling so reports can always restore
   * original order regardless of how the live quiz was ordered.
   */
  originalIndex?: number;
}

export interface QuizSettings {
  difficulty: 'all' | 'easy' | 'medium' | 'hard';
  mode: 'submit' | 'live';
  /** Timer mode — replaces old `timerEnabled` boolean */
  timerMode: 'off' | 'per-question' | 'total';
  timerEnabled: boolean; // kept for backward-compat; derived from timerMode
  timerValue: number;    // per-question time value
  timerUnit: 'sec' | 'min';
  totalTimerValue: number;  // total-quiz time value
  totalTimerUnit: 'sec' | 'min';
  /** When > 0 and timerMode is 'total', the exam clock = question count × this many minutes (legacy NORCET/AAO preset). */
  totalMinutesPerQuestion?: number;
  /** Which quiz-mode preset is applied (drives the highlighted card). */
  practiceMode?: 'practice' | 'exam';
  /** Seconds before auto-advancing in Instant Feedback mode. 0 = manual next. */
  instantFeedbackDelay: number;
  /** Whether the mark/flag button is visible during quiz (default: true) */
  markEnabled?: boolean;
  /** Training mode: show the live +/− score in the quiz header (default: true) */
  showMarksInQuiz?: boolean;
  /** Mock exam mode: no back navigation, no rationale, strict timer */
  mockExamMode?: boolean;
  /** Adaptive (CAT) mode: dynamically adjusts difficulty */
  adaptiveMode?: boolean;
  marksPerQuestion: number;
  negativeMarking: boolean;
  negativeMarks: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  quizTitle: string;
  passMark: number;
  subject: string;
}

export interface UploadedFile {
  base64: string;
  mimeType: string;
  name: string;
  size: number;
}

export interface ScoreResult {
  correct: number;
  wrong: number;
  skipped: number;
  gain: number;
  penalty: number;
  netScore: number;
  maxScore: number;
  percentage: number;
  accuracy: number;
}

/**
 * Lightweight summary for list views — quizData/userAnswers are optional.
 * The main history state holds QuizSummary[] (no heavy JSON from server).
 * Components that need full question data should use fetchFullDetail().
 */
export interface QuizSummary extends ScoreResult {
  id?: string;
  totalQuestions: number;
  /** Optional — only present if loaded from full detail or local save */
  quizData?: QuizQuestion[];
  /** Optional — only present if loaded from full detail or local save */
  userAnswers?: (string | null)[];
  score: number;
  timeTaken: number;
  difficulty?: string;
  timestamp: number;
  quizTitle?: string;
  subject?: string;
  passMark?: number;
  attemptType?: 'main' | 'practice';
  attemptNumber?: number;
  parentQuizTimestamp?: number;
  parentQuizId?: string;
  notes?: string;
  isMockExam?: boolean;
  isAdaptive?: boolean;
  adaptiveSkillLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
  isRetrySession?: boolean;
  flaggedQuestions?: boolean[];
  questionTimings?: number[];
  confidenceLevels?: ('sure' | 'guessing' | null)[];
}

export interface QuizResult extends ScoreResult {
  id?: string;
  totalQuestions: number;
  quizData: QuizQuestion[];
  userAnswers: (string | null)[];
  score: number;
  timeTaken: number;
  difficulty?: string;
  timestamp: number;
  quizTitle?: string;
  subject?: string;
  passMark?: number;
  isRetrySession?: boolean;
  flaggedQuestions?: boolean[];
  /** Seconds spent on each question (index-matched to quizData) */
  questionTimings?: number[];
  /** Confidence levels per question: 'sure' | 'guessing' | null */
  confidenceLevels?: ('sure' | 'guessing' | null)[];
  /** Whether this was a mock exam attempt */
  isMockExam?: boolean;
  /** Whether this was an adaptive (CAT) quiz */
  isAdaptive?: boolean;
  /** Calibrated skill level from adaptive quiz */
  adaptiveSkillLevel?: 'Beginner' | 'Intermediate' | 'Advanced';
  /** 'main' for original attempts, 'practice' for retries */
  attemptType?: 'main' | 'practice';
  /** Practice attempt number (1st, 2nd, 3rd...) */
  attemptNumber?: number;
  /** Timestamp of the parent/original quiz this practice is linked to */
  parentQuizTimestamp?: number;
  /** Cloud record ID of the parent quiz */
  parentQuizId?: string;
  /** User notes about this quiz */
  notes?: string;
}

