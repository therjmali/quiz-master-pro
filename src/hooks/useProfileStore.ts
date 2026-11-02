import { useState, useCallback, useEffect } from 'react';

const KEY = 'rjquiz:profile';

export interface FeatureVisibility {
  // Dashboard Widgets
  dashboardWidgets: boolean;
  dailyChallenge: boolean;
  examCountdown: boolean;
  spacedRepetition: boolean;
  weakTopics: boolean;
  mistakePatterns: boolean;
  prediction: boolean;
  studyPlan: boolean;
  smartNudge: boolean;
  examReadiness: boolean;
  performanceRating: boolean;

  // Quiz Behavior
  quizBehavior: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  confidenceTracking: boolean;
  adaptiveMode: boolean;
  flagging: boolean;

  // AI Features
  aiFeatures: boolean;
  aiRationale: boolean;
  aiStudyStrategy: boolean;
  aiExplainAll: boolean;
  bgRationale: boolean;

  // Reports
  reports: boolean;
  pdfReports: boolean;
  emailReports: boolean;
  revisionSheets: boolean;
  reportPreview: boolean;

  // Notifications
  notifications: boolean;
  studyReminders: boolean;
  weeklyEmail: boolean;

  // Quiz Setup
  quizSetup: boolean;
  templates: boolean;
  folderSelector: boolean;
  photoQuiz: boolean;
  highlighter: boolean;
  csvImport: boolean;
}

export const DEFAULT_VISIBILITY: FeatureVisibility = {
  dashboardWidgets: true,
  dailyChallenge: true,
  examCountdown: true,
  spacedRepetition: true,
  weakTopics: true,
  mistakePatterns: true,
  prediction: true,
  studyPlan: true,
  smartNudge: true,
  examReadiness: true,
  performanceRating: true,

  quizBehavior: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  confidenceTracking: true,
  adaptiveMode: true,
  flagging: true,

  aiFeatures: true,
  aiRationale: true,
  aiStudyStrategy: true,
  aiExplainAll: true,
  bgRationale: true,

  reports: true,
  pdfReports: true,
  emailReports: true,
  revisionSheets: true,
  reportPreview: true,

  notifications: true,
  studyReminders: true,
  weeklyEmail: true,

  quizSetup: true,
  templates: true,
  folderSelector: true,
  photoQuiz: true,
  highlighter: true,
  csvImport: true,
};

export interface ProfileData {
  displayName: string;
  accentColor: string;
  avatarEmoji: string;
  avatarUrl: string;
  dailyGoal: number;
  weeklyGoal: number;
  dailyQuestionGoal: number;
  weeklyQuestionGoal: number;
  showScoreOnCards: boolean;
  showTimeOnCards: boolean;
  showDecimalPct: boolean;
  cardDensity: 'comfortable' | 'compact';
  featureVisibility: FeatureVisibility;
}

const DEFAULTS: ProfileData = {
  displayName: '',
  accentColor: '#6366F1',
  avatarEmoji: '🧑‍⚕️',
  avatarUrl: '',
  dailyGoal: 5,
  weeklyGoal: 50,
  dailyQuestionGoal: 25,
  weeklyQuestionGoal: 150,
  showScoreOnCards: true,
  showTimeOnCards: true,
  showDecimalPct: false,
  cardDensity: 'comfortable',
  featureVisibility: { ...DEFAULT_VISIBILITY },
};

/** Pre-defined HSL values for the accent colour swatches. */
const COLOR_TO_HSL: Record<string, string> = {
  '#6366F1': '239 84% 67%',
  '#8B5CF6': '262 83% 65%',
  '#06B6D4': '192 91% 43%',
  '#F43F5E': '350 89% 60%',
  '#10B981': '160 84% 39%',
  '#F59E0B': '38 92% 50%',
};

/** Write the chosen accent colour to the CSS --primary variable so it takes
 *  effect immediately across the whole app. */
function applyAccentColor(hex: string) {
  const hsl = COLOR_TO_HSL[hex];
  if (hsl) document.documentElement.style.setProperty('--primary', hsl);
}

/** Notify all other useProfileStore instances in the same tab */
function broadcastProfileChange() {
  window.dispatchEvent(new Event('qmp-profile-change'));
}

export function useProfileStore() {
  const [profile, setProfile] = useState<ProfileData>(() => {
    try {
      const s = localStorage.getItem(KEY);
      const raw = s ? JSON.parse(s) : {};
      const data: ProfileData = {
        ...DEFAULTS,
        ...raw,
        featureVisibility: { ...DEFAULT_VISIBILITY, ...(raw.featureVisibility || {}) },
      };
      applyAccentColor(data.accentColor);
      return data;
    } catch { return DEFAULTS; }
  });

  // Re-read from localStorage when any other instance writes
  useEffect(() => {
    const handler = () => {
      try {
        const s = localStorage.getItem(KEY);
        if (!s) return;
        const raw = JSON.parse(s);
        const data: ProfileData = {
          ...DEFAULTS,
          ...raw,
          featureVisibility: { ...DEFAULT_VISIBILITY, ...(raw.featureVisibility || {}) },
        };
        setProfile(data);
      } catch {}
    };
    window.addEventListener('qmp-profile-change', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('qmp-profile-change', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  const update = useCallback((updates: Partial<ProfileData>) => {
    setProfile(prev => {
      const next = {
        ...prev,
        ...updates,
        featureVisibility: updates.featureVisibility
          ? { ...prev.featureVisibility, ...updates.featureVisibility }
          : prev.featureVisibility,
      };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      if (updates.accentColor !== undefined) applyAccentColor(next.accentColor);
      broadcastProfileChange();
      return next;
    });
  }, []);

  const updateVisibility = useCallback((updates: Partial<FeatureVisibility>) => {
    setProfile(prev => {
      const next = {
        ...prev,
        featureVisibility: { ...prev.featureVisibility, ...updates },
      };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      broadcastProfileChange();
      return next;
    });
  }, []);

  return { profile, update, updateVisibility };
}
