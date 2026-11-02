/**
 * Quiz modes: Practice · Exam.
 *
 * Each mode is a one-tap preset applied to the quiz settings. Only the values listed in a mode's
 * patch are changed — everything else (difficulty, shuffles, pass mark display, etc.) keeps the
 * user's existing setting.
 *
 * Scoring for both modes:  +1 per correct answer, −0.25 per wrong answer, unanswered = 0.
 */
import type { QuizSettings, RationalePrefs } from '../types/quiz';

/** Shared scoring rules. */
const SCORING: Partial<QuizSettings> = {
  marksPerQuestion: 1,
  negativeMarking: true,
  negativeMarks: 0.25,
  passMark: 50,
};

/**
 * PRACTICE — learn as you go.
 *  • Instant Feedback (Training): the answer popup shows right after every question
 *  • Feedback popup shows BOTH rationales (book + AI)
 *  • Auto-advance is manual (✋ tap Next)
 *  • No timer
 */
const PRACTICE_PATCH: Partial<QuizSettings> = {
  ...SCORING,
  practiceMode: 'practice',
  mode: 'live',
  instantFeedbackDelay: 0,
  timerMode: 'off',
  timerEnabled: false,
  totalMinutesPerQuestion: undefined,
  mockExamMode: false,
  adaptiveMode: false,
};

/**
 * EXAM — one mode for NORCET / AAO style practice.
 *  • Classic Exam (submit at end): no answers, rationales or live score until you submit
 *  • 1 minute per question; when a question's minute ends it locks and moves to the next one
 *    automatically, and the exam submits itself after the last question
 */
const EXAM_PATCH: Partial<QuizSettings> = {
  ...SCORING,
  practiceMode: 'exam',
  mode: 'submit',
  timerMode: 'per-question',
  timerEnabled: true,
  timerValue: 60,
  timerUnit: 'sec',
  totalMinutesPerQuestion: undefined,
  showMarksInQuiz: false,
  mockExamMode: false,
  adaptiveMode: false,
};

export interface PracticeMode {
  id: 'practice' | 'exam';
  emoji: string;
  label: string;
  desc: string;
  patch: Partial<QuizSettings>;
  /** Rationale preference this mode also applies (kept outside QuizSettings). */
  rationale?: RationalePrefs;
}

export const PRACTICE_MODES: PracticeMode[] = [
  {
    id: 'practice', emoji: '🎯', label: 'Practice', desc: 'Instant feedback · both rationales',
    patch: PRACTICE_PATCH, rationale: { showBook: true, showAi: true },
  },
  {
    id: 'exam', emoji: '🏥', label: 'Exam', desc: '1 min per Q · auto-next · submit at end',
    patch: EXAM_PATCH,
  },
];

/** True when every value of the mode's patch (and its rationale choice) is currently in effect. */
export function isModeActive(mode: PracticeMode, settings: QuizSettings, rationalePrefs?: RationalePrefs): boolean {
  const settingsMatch = (Object.keys(mode.patch) as (keyof QuizSettings)[]).every(k => {
    const want = mode.patch[k];
    const have = settings[k];
    return want === have || (want === undefined && (have === undefined || have === null));
  });
  if (!settingsMatch) return false;
  if (mode.rationale && rationalePrefs) {
    return rationalePrefs.showBook === mode.rationale.showBook && rationalePrefs.showAi === mode.rationale.showAi;
  }
  return true;
}

/**
 * Total exam-clock seconds for the quiz that is about to start.
 * With `totalMinutesPerQuestion` the time scales with the question count (NORCET / AAO);
 * otherwise the fixed total from the Timer settings is used.
 */
export function totalTimerSeconds(s: QuizSettings, questionCount: number): number {
  if (s.timerMode !== 'total') return 0;
  if (s.totalMinutesPerQuestion && s.totalMinutesPerQuestion > 0 && questionCount > 0) {
    return Math.round(questionCount * s.totalMinutesPerQuestion * 60);
  }
  return (s.totalTimerValue ?? 30) * (s.totalTimerUnit === 'min' ? 60 : 1);
}
