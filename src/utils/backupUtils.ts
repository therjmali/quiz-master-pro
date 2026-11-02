/**
 * Unified Backup Utilities — handles V3, V5, and raw localStorage formats.
 * Shared by BackupSection, CloudDataManager, and any other import surface.
 */

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Types                                                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

export type BackupFormat = 'v3' | 'v5' | 'raw-localstorage' | 'quiz-export' | 'unknown';

export interface BackupPreview {
  format: BackupFormat;
  formatLabel: string;
  quizCount: number;
  settingsCount: number;
  subjects: string[];
  fileTreeItems: number;
  collectionItems: number;
  bookmarkCount: number;
  templateCount: number;
  dateRange: { oldest: Date; newest: Date } | null;
  avgScore: number;
  fullDataCount: number;
  summaryOnlyCount: number;
  hasTheme: boolean;
  hasApiKeys: boolean;
  hasProfile: boolean;
  hasExamDates: boolean;
  hasStudyPlan: boolean;
  rawSize: number;
}

export interface ParsedBackup {
  historyItems: any[];
  settings: Record<string, string | null>;
  preview: BackupPreview;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Helpers                                                                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function safeNum(v: any, fallback = 0): number {
  if (v == null) return fallback;
  const n = Number(v);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

export function tryParseJson(v: any): any {
  if (typeof v !== 'string') return undefined;
  try { return JSON.parse(v); } catch { return undefined; }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Stringify a value for localStorage — strings stay as-is, objects get JSON.stringify */
function stringify(v: any): string | null {
  if (v == null) return null;
  return typeof v === 'string' ? v : JSON.stringify(v);
}

function countArrayOrObject(v: any): number {
  if (!v) return 0;
  const parsed = typeof v === 'string' ? tryParseJson(v) : v;
  if (Array.isArray(parsed)) return parsed.length;
  if (typeof parsed === 'object' && parsed !== null) return Object.keys(parsed).length;
  return 0;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Format Detection                                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function detectFormat(data: any): BackupFormat {
  if (!data || typeof data !== 'object') return 'unknown';

  // V5: has _meta.version === 5 or nested quizHistory.records
  if (data._meta?.version === 5 || data._meta?.type === 'quiz-master-pro-full-backup') return 'v5';

  // V3: has top-level version === 3 or top-level `history` array + `settings`
  if (data.version === 3 || data.version === '3') return 'v3';
  if (Array.isArray(data.history) && (data.settings != null || data.collections != null)) return 'v3';

  // Quiz export format
  if (data.type === 'quiz-master-export' && Array.isArray(data.quizzes)) return 'quiz-export';

  // Raw localStorage: keys start with qmp_ or rjquiz:
  const keys = Object.keys(data);
  const qmpKeys = keys.filter(k => k.startsWith('qmp_') || k.startsWith('rjquiz:'));
  if (qmpKeys.length > 0 && qmpKeys.length >= keys.length * 0.5) return 'raw-localstorage';

  // V3 heuristic: has history array at top level
  if (Array.isArray(data.history)) return 'v3';

  return 'unknown';
}

const FORMAT_LABELS: Record<BackupFormat, string> = {
  v3: 'V3 (Legacy)',
  v5: 'V5 (Current)',
  'raw-localstorage': 'Raw LocalStorage',
  'quiz-export': 'Quiz Export',
  unknown: 'Unknown Format',
};

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Quiz Record Normalization                                                 */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function normalizeQuizRecord(item: any): any {
  if (!item || typeof item !== 'object') return item;
  const r = { ...item };

  if (!Array.isArray(r.quizData)) {
    const fromJson = tryParseJson(r.quizDataJson) ?? tryParseJson(r.quizData);
    if (Array.isArray(fromJson)) r.quizData = fromJson;
    else if (typeof fromJson === 'string') {
      const inner = tryParseJson(fromJson);
      r.quizData = Array.isArray(inner) ? inner : [];
    } else r.quizData = [];
  }

  if (!Array.isArray(r.userAnswers)) {
    const fromJson = tryParseJson(r.userAnswersJson) ?? tryParseJson(r.userAnswers);
    if (Array.isArray(fromJson)) r.userAnswers = fromJson;
    else if (typeof fromJson === 'string') {
      const inner = tryParseJson(fromJson);
      r.userAnswers = Array.isArray(inner) ? inner : [];
    } else r.userAnswers = [];
  }

  while (r.userAnswers.length < r.quizData.length) r.userAnswers.push(null);

  r.timeTaken = safeNum(r.timeTaken ?? r.timeTakenSeconds, 0);
  r.correct = safeNum(r.correct ?? r.correctCount, 0);
  r.wrong = safeNum(r.wrong ?? r.wrongCount, 0);
  r.skipped = safeNum(r.skipped ?? r.skippedCount, 0);
  r.netScore = safeNum(r.netScore ?? r.score, 0);
  r.score = r.netScore;
  r.maxScore = safeNum(r.maxScore, r.quizData.length);
  r.percentage = safeNum(r.percentage, r.maxScore > 0 ? Math.round((r.netScore / r.maxScore) * 100) : 0);
  r.gain = safeNum(r.gain, r.netScore);
  r.penalty = safeNum(r.penalty, 0);
  r.totalQuestions = safeNum(r.totalQuestions, r.quizData.length);
  const answered = r.correct + r.wrong;
  r.accuracy = safeNum(r.accuracy, answered > 0 ? Math.round((r.correct / answered) * 100) : 0);

  if (r.timestamp == null && r.createdAt)
    r.timestamp = typeof r.createdAt === 'string' ? new Date(r.createdAt).getTime() : r.createdAt;
  if (r.timestamp == null && r.localTimestamp) r.timestamp = r.localTimestamp;
  r.timestamp = safeNum(r.timestamp, Date.now());
  if (!r.difficulty) r.difficulty = 'Mixed';

  return r;
}

export function isValidQuizRecord(item: any): boolean {
  if (!item || typeof item !== 'object') return false;
  if (Array.isArray(item.quizData) && item.quizData.length > 0) return true;
  if (typeof item.quizDataJson === 'string' && item.quizDataJson.length > 10) return true;
  if (typeof item.quizData === 'string' && item.quizData.length > 10) return true;
  if (typeof item.timestamp === 'number' && (
    typeof item.correct === 'number' || typeof item.correctCount === 'number' ||
    typeof item.percentage === 'number' ||
    typeof item.netScore === 'number' || typeof item.score === 'number'
  )) return true;
  if (item.createdAt && (
    typeof item.correctCount === 'number' || typeof item.percentage === 'number' ||
    typeof item.score === 'number'
  )) return true;
  return false;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  History Extraction (all formats)                                          */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function extractHistoryFromBackup(data: any): any[] {
  if (Array.isArray(data)) return data.filter(isValidQuizRecord).map(normalizeQuizRecord);
  if (typeof data !== 'object' || data === null) return [];

  // quiz-master-export format
  if (data?.type === 'quiz-master-export' && Array.isArray(data.quizzes)) {
    const results = data.quizzes
      .filter((q: any) => Array.isArray(q.questions) && q.questions.length > 0)
      .map((q: any, idx: number) => normalizeQuizRecord({
        quizData: q.questions,
        userAnswers: q.questions.map(() => null),
        totalQuestions: q.questionCount || q.questions.length,
        correct: 0, wrong: 0, skipped: q.questions.length,
        score: 0, maxScore: q.questions.length, percentage: 0,
        netScore: 0, gain: 0, penalty: 0,
        timestamp: Date.now() - (idx * 1000),
        quizTitle: q.title, subject: q.subject, difficulty: q.difficulty,
        timeTaken: 0,
      }));
    if (results.length > 0) return results;
  }

  // Raw localStorage: check qmp_history key
  if (data.qmp_history != null) {
    const parsed = typeof data.qmp_history === 'string' ? tryParseJson(data.qmp_history) : data.qmp_history;
    if (Array.isArray(parsed)) {
      const valid = parsed.filter(isValidQuizRecord);
      if (valid.length > 0) return valid.map(normalizeQuizRecord);
    }
  }

  // Known candidate paths
  const candidates = [
    data.history, data.quizHistory?.records, data.quizHistory,
    data.quiz_history, data.results, data.quizResults, data.records,
    data.items, data.data?.history, data.data?.quizHistory?.records,
    data.data?.quizHistory, data.data?.records, data.data?.items,
    data.data, data.QuizHistory?.records, data.QuizHistory,
    data.localHistory,
  ];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      const v = c.filter(isValidQuizRecord);
      if (v.length > 0) return v.map(normalizeQuizRecord);
    }
    // Also try parsing if it's a JSON string
    if (typeof c === 'string') {
      const parsed = tryParseJson(c);
      if (Array.isArray(parsed)) {
        const v = parsed.filter(isValidQuizRecord);
        if (v.length > 0) return v.map(normalizeQuizRecord);
      }
    }
  }

  // Deep scan
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (Array.isArray(val) && val.length > 0 && isValidQuizRecord(val[0]))
      return val.filter(isValidQuizRecord).map(normalizeQuizRecord);
    if (val && typeof val === 'object' && !Array.isArray(val) && Array.isArray(val.records)) {
      const recs = val.records.filter(isValidQuizRecord);
      if (recs.length > 0) return recs.map(normalizeQuizRecord);
    }
  }
  return [];
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Complete A-Z Settings Extraction (all formats)                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

/** Complete V3 field → localStorage key mapping */
const V3_FIELD_MAP: Record<string, string> = {
  // Core settings
  settings: 'qmp_settings',
  aiPrefs: 'qmp_ai_prefs',
  rationalePrefs: 'qmp_rationale_prefs',
  collections: 'qmp_library_tree',
  fileTree: 'qmp_file_tree',
  fileTrash: 'qmp_file_trash',
  rjProfile: 'rjquiz:profile',
  // Theme & appearance
  theme: 'qmp_theme',
  accentHsl: 'qmp_accent_hsl',
  accentHex: 'qmp_accent_hex',
  fontSize: 'qmp_font_size',
  glassIntensity: 'qmp_glass_intensity',
  haptics: 'qmp_haptics',
  fmView: 'qmp_fm_view',
  // UI state
  gesturesSeen: 'qmp_gestures_seen',
  installDismissed: 'qmp_install_dismissed',
  templatesExpanded: 'qmp_templates_expanded',
  draftText: 'qmp_input',
  trainingRationale: 'qmp_training_rationale',
  // Quiz customization
  quizSkins: 'qmp_quiz_skins',
  quizSkin: 'qmp_quiz_skin',
  examDates: 'qmp_exam_dates',
  weeklyEmail: 'qmp_weekly_email',
  backupPrefs: 'qmp_backup_prefs',
  // Analytics & tracking
  difficultyRatings: 'qmp_difficulty_ratings',
  disputes: 'qmp_disputes',
  confidenceHistory: 'qmp_confidence_history',
  rationaleCache: 'qmp_rationale_cache',
  spacedRepetition: 'qmp_spaced_rep',
  studyReminders: 'qmp_study_reminders',
  // User data
  pinnedQuizzes: 'qmp_pinned',
  bookmarks: 'qmp_bookmarks',
  bookmarksV2: 'qmp_bookmarks_v2',
  profile: 'qmp_profile',
  apiKeys: 'qmp_api_keys',
  autoBackup: 'qmp_auto_backup',
  notesConfig: 'qmp_notes_config',
  // Study & learning
  studyPlan: 'qmp_study_plan',
  studyTracker: 'qmp_study_tracker',
  dailyChallenge: 'qmp_daily_challenge',
  mistakePatterns: 'qmp_mistake_patterns',
  flashcardSessions: 'qmp_flashcard_sessions',
  offlineNotes: 'qmp_offline_notes',
  streakTargets: 'qmp_streak_targets',
  negativeMarking: 'qmp_negative_marking',
  // App state
  onboardingDone: 'qmp_onboarding_done',
  checklistDismissed: 'qmp_checklist_dismissed',
  usedFlashcards: 'qmp_used_flashcards',
  hideZiteBadge: 'qmp_hide_zite_badge',
  driveLinked: 'qmp_drive_linked',
  lastCloudSync: 'qmp_last_cloud_sync',
  lastDriveBackup: 'qmp_last_drive_backup',
  lastDriveLink: 'qmp_last_drive_link',
  lastLocalBackup: 'qmp_last_local_backup',
  // Misc
  templates: 'qmp_templates',
  notes: 'qmp_notes_config',
  preferredEmail: 'qmp_preferred_email',
  customApiKeys: 'qmp_api_keys',
  localHistory: 'qmp_history',
  chatBtnPos: 'qmp_chat_btn_pos',
  globalMistakes: 'qmp_global_mistakes_v1',
  userSubjects: 'qmp_user_subjects',
};

/** V5 appSettings → localStorage key mapping */
const V5_APP_SETTINGS_MAP: Record<string, string> = {
  quizSettings: 'qmp_settings',
  aiPreferences: 'qmp_ai_prefs',
  rationalePreferences: 'qmp_rationale_prefs',
  theme: 'qmp_theme',
  accentColor: 'qmp_accent_hsl',
  accentHex: 'qmp_accent_hex',
  fontSize: 'qmp_font_size',
  glassIntensity: 'qmp_glass_intensity',
  autoBackupEnabled: 'qmp_auto_backup',
  notesConfig: 'qmp_notes_config',
  haptics: 'qmp_haptics',
  fmView: 'qmp_fm_view',
  chatBtnPos: 'qmp_chat_btn_pos',
  gesturesSeen: 'qmp_gestures_seen',
  installDismissed: 'qmp_install_dismissed',
  templatesExpanded: 'qmp_templates_expanded',
  hideZiteBadge: 'qmp_hide_zite_badge',
  driveLinked: 'qmp_drive_linked',
  onboardingDone: 'qmp_onboarding_done',
  checklistDismissed: 'qmp_checklist_dismissed',
  usedFlashcards: 'qmp_used_flashcards',
  preferredEmail: 'qmp_preferred_email',
  backupPrefs: 'qmp_backup_prefs',
  weeklyEmail: 'qmp_weekly_email',
};

export function extractSettings(data: any): Record<string, string | null> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
  const map: Record<string, string | null> = {};

  const format = detectFormat(data);

  // ─── Raw localStorage format: keys are already qmp_ prefixed ───
  if (format === 'raw-localstorage') {
    for (const [key, value] of Object.entries(data)) {
      if (key.startsWith('qmp_') || key.startsWith('rjquiz:')) {
        map[key] = stringify(value);
      }
    }
    return map;
  }

  // ─── V3 / V5 / Unknown: apply field mappings ───

  // 1. Direct field mapping (works for V3 top-level keys AND V5 top-level keys)
  for (const [jsonKey, lsKey] of Object.entries(V3_FIELD_MAP)) {
    if (data[jsonKey] != null && !map[lsKey]) {
      map[lsKey] = stringify(data[jsonKey]);
    }
  }

  // 2. V5 appSettings nested object
  const as = data.appSettings;
  if (as && typeof as === 'object') {
    for (const [key, lsKey] of Object.entries(V5_APP_SETTINGS_MAP)) {
      if (as[key] != null && !map[lsKey]) map[lsKey] = stringify(as[key]);
    }
  }

  // 3. V5 fileManager nested object
  const fm = data.fileManager;
  if (fm && typeof fm === 'object') {
    if (fm.fileTree != null && !map['qmp_file_tree']) map['qmp_file_tree'] = stringify(fm.fileTree);
    if (fm.fileTrash != null && !map['qmp_file_trash']) map['qmp_file_trash'] = stringify(fm.fileTrash);
  }

  // 4. V5 library nested object
  const lib = data.library;
  if (lib && typeof lib === 'object') {
    if (lib.tree != null && !map['qmp_library_tree']) map['qmp_library_tree'] = stringify(lib.tree);
    if (lib.collections != null && !map['qmp_library_tree']) map['qmp_library_tree'] = stringify(lib.collections);
  }

  // 5. V5 syncMeta
  const sm = data.syncMeta;
  if (sm && typeof sm === 'object') {
    if (sm.lastCloudSync && !map['qmp_last_cloud_sync']) map['qmp_last_cloud_sync'] = stringify(sm.lastCloudSync);
    if (sm.lastDriveBackup && !map['qmp_last_drive_backup']) map['qmp_last_drive_backup'] = stringify(sm.lastDriveBackup);
    if (sm.lastDriveLink && !map['qmp_last_drive_link']) map['qmp_last_drive_link'] = stringify(sm.lastDriveLink);
    if (sm.lastLocalBackup && !map['qmp_last_local_backup']) map['qmp_last_local_backup'] = stringify(sm.lastLocalBackup);
  }

  return map;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Unified Parse — single entry point for any backup file                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function parseBackupFile(raw: string, fileSize: number): ParsedBackup | { error: string } {
  let data: any;
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  try {
    data = JSON.parse(cleaned);
  } catch {
    try {
      data = JSON.parse(cleaned.replace(/,\s*([\]}])/g, '$1'));
    } catch {
      return { error: 'Invalid JSON file' };
    }
  }

  const format = detectFormat(data);
  const historyItems = extractHistoryFromBackup(data);
  const settings = extractSettings(data);

  if (historyItems.length === 0 && Object.keys(settings).length === 0) {
    return { error: 'No valid quiz data or settings found in this file' };
  }

  // Build preview
  const subjects = [...new Set(historyItems.map((r: any) => r.subject).filter(Boolean))] as string[];
  const fullDataCount = historyItems.filter((r: any) => Array.isArray(r.quizData) && r.quizData.length > 0).length;
  const summaryOnlyCount = historyItems.length - fullDataCount;
  const avgScore = historyItems.length > 0
    ? Math.round(historyItems.reduce((a: number, r: any) => a + (r.percentage || 0), 0) / historyItems.length)
    : 0;

  const timestamps = historyItems.map((r: any) => r.timestamp).filter((t: any) => typeof t === 'number' && t > 0);
  const dateRange = timestamps.length > 0
    ? { oldest: new Date(Math.min(...timestamps)), newest: new Date(Math.max(...timestamps)) }
    : null;

  const preview: BackupPreview = {
    format,
    formatLabel: FORMAT_LABELS[format],
    quizCount: historyItems.length,
    settingsCount: Object.values(settings).filter(Boolean).length,
    subjects,
    fileTreeItems: countArrayOrObject(settings['qmp_file_tree'] ?? data.fileTree ?? data.fileManager?.fileTree),
    collectionItems: countArrayOrObject(settings['qmp_library_tree'] ?? data.collections ?? data.library?.tree),
    bookmarkCount: countArrayOrObject(settings['qmp_bookmarks'] ?? data.bookmarks) +
      countArrayOrObject(settings['qmp_bookmarks_v2'] ?? data.bookmarksV2),
    templateCount: countArrayOrObject(settings['qmp_templates'] ?? data.templates),
    dateRange,
    avgScore,
    fullDataCount,
    summaryOnlyCount,
    hasTheme: !!(settings['qmp_theme'] || data.theme),
    hasApiKeys: !!(settings['qmp_api_keys'] || data.apiKeys),
    hasProfile: !!(settings['qmp_profile'] || data.profile || settings['rjquiz:profile'] || data.rjProfile),
    hasExamDates: !!(settings['qmp_exam_dates'] || data.examDates),
    hasStudyPlan: !!(settings['qmp_study_plan'] || data.studyPlan),
    rawSize: fileSize,
  };

  return { historyItems, settings, preview };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  All localStorage keys used by the app                                     */
/* ═══════════════════════════════════════════════════════════════════════════ */

export const ALL_APP_KEYS = [
  'qmp_history', 'qmp_profile', 'qmp_pinned', 'qmp_api_keys',
  'qmp_library_tree', 'qmp_templates', 'qmp_settings', 'qmp_ai_prefs',
  'qmp_rationale_prefs', 'qmp_notes_config', 'qmp_theme', 'qmp_accent_hsl',
  'qmp_font_size', 'qmp_glass_intensity', 'qmp_spaced_rep', 'qmp_study_reminders',
  'qmp_auto_backup', 'qmp_chat_btn_pos', 'qmp_training_rationale',
  'qmp_file_tree', 'qmp_file_trash', 'qmp_bookmarks', 'qmp_bookmarks_v2',
  'qmp_haptics', 'qmp_fm_view', 'qmp_accent_hex', 'qmp_gestures_seen',
  'qmp_install_dismissed', 'qmp_templates_expanded', 'qmp_input',
  'qmp_quiz_skins', 'qmp_quiz_skin', 'qmp_exam_dates', 'qmp_weekly_email', 'qmp_backup_prefs',
  'qmp_difficulty_ratings', 'qmp_disputes', 'qmp_confidence_history',
  'qmp_rationale_cache', 'qmp_preferred_email',
  'rjquiz:profile',
  'qmp_study_plan', 'qmp_streak_targets', 'qmp_daily_challenge',
  'qmp_mistake_patterns', 'qmp_negative_marking', 'qmp_offline_notes',
  'qmp_flashcard_sessions', 'qmp_study_tracker',
  'qmp_onboarding_done', 'qmp_checklist_dismissed', 'qmp_used_flashcards',
  'qmp_hide_zite_badge', 'qmp_drive_linked', 'qmp_last_cloud_sync',
  'qmp_last_drive_backup', 'qmp_last_drive_link', 'qmp_last_local_backup',
  'qmp_global_mistakes_v1', 'qmp_user_subjects',
];

/* ═══════════════════════════════════════════════════════════════════════════ */
/*  Gather all local data (for building backup client-side)                   */
/* ═══════════════════════════════════════════════════════════════════════════ */

export function gatherAllLocalData(): Record<string, string | undefined> {
  const g = (k: string) => localStorage.getItem(k) || undefined;
  return {
    settings: g('qmp_settings'), aiPrefs: g('qmp_ai_prefs'),
    rationalePrefs: g('qmp_rationale_prefs'), libraryTree: g('qmp_library_tree'),
    templates: g('qmp_templates'), notes: g('qmp_notes_config'),
    spacedRepetition: g('qmp_spaced_rep'), studyReminders: g('qmp_study_reminders'),
    pinnedQuizzes: g('qmp_pinned'), theme: g('qmp_theme'),
    accentHsl: g('qmp_accent_hsl'), accentHex: g('qmp_accent_hex'),
    fontSize: g('qmp_font_size'), glassIntensity: g('qmp_glass_intensity'),
    autoBackup: g('qmp_auto_backup'), notesConfig: g('qmp_notes_config'),
    rationaleCache: g('qmp_rationale_cache'), draftText: g('qmp_input'),
    fileTree: g('qmp_file_tree'), fileTrash: g('qmp_file_trash'),
    bookmarks: g('qmp_bookmarks'), bookmarksV2: g('qmp_bookmarks_v2'),
    profile: g('qmp_profile'), haptics: g('qmp_haptics'), fmView: g('qmp_fm_view'),
    chatBtnPos: g('qmp_chat_btn_pos'), gesturesSeen: g('qmp_gestures_seen'),
    installDismissed: g('qmp_install_dismissed'),
    templatesExpanded: g('qmp_templates_expanded'),
    trainingRationale: g('qmp_training_rationale'),
    quizSkins: g('qmp_quiz_skins'), quizSkin: g('qmp_quiz_skin'), examDates: g('qmp_exam_dates'),
    weeklyEmail: g('qmp_weekly_email'), backupPrefs: g('qmp_backup_prefs'),
    difficultyRatings: g('qmp_difficulty_ratings'),
    disputes: g('qmp_disputes'), confidenceHistory: g('qmp_confidence_history'),
    negativeMarking: g('qmp_negative_marking'),
    rjProfile: g('rjquiz:profile'),
    apiKeys: g('qmp_api_keys'), customApiKeys: g('qmp_api_keys'),
    preferredEmail: g('qmp_preferred_email'),
    studyPlan: g('qmp_study_plan'), studyTracker: g('qmp_study_tracker'),
    dailyChallenge: g('qmp_daily_challenge'), mistakePatterns: g('qmp_mistake_patterns'),
    flashcardSessions: g('qmp_flashcard_sessions'), offlineNotes: g('qmp_offline_notes'),
    streakTargets: g('qmp_streak_targets'),
    onboardingDone: g('qmp_onboarding_done'), checklistDismissed: g('qmp_checklist_dismissed'),
    usedFlashcards: g('qmp_used_flashcards'), hideZiteBadge: g('qmp_hide_zite_badge'),
    driveLinked: g('qmp_drive_linked'), lastCloudSync: g('qmp_last_cloud_sync'),
    lastDriveBackup: g('qmp_last_drive_backup'), lastDriveLink: g('qmp_last_drive_link'),
    lastLocalBackup: g('qmp_last_local_backup'),
    localHistory: g('qmp_history'),
    globalMistakes: g('qmp_global_mistakes_v1'),
    userSubjects: g('qmp_user_subjects'),
  };
}

/**
 * Enhanced version: pulls from IDB for stores that use IDB as primary storage
 * (fileTree, bookmarks, globalMistakes). Falls back to localStorage if IDB fails.
 * This ensures the backup captures the authoritative data, not a stale LS mirror.
 */
export async function gatherAllLocalDataWithIDB(
  idbGetFn: <T>(key: string) => Promise<T | undefined>,
): Promise<Record<string, string | undefined>> {
  const base = gatherAllLocalData();

  // Overwrite with IDB-authoritative data where available
  const idbOverrides: Array<{ idbKey: string; field: string; lsFallbackKey?: string }> = [
    { idbKey: 'qmp_file_tree_idb', field: 'fileTree', lsFallbackKey: 'qmp_file_tree' },
    { idbKey: 'qmp_file_trash_idb', field: 'fileTrash', lsFallbackKey: 'qmp_file_trash' },
    { idbKey: 'qmp_bookmarks_idb', field: 'bookmarksV2', lsFallbackKey: 'qmp_bookmarks_v2' },
    { idbKey: 'qmp_mistakes_idb', field: 'globalMistakes', lsFallbackKey: 'qmp_global_mistakes_v1' },
  ];

  for (const { idbKey, field, lsFallbackKey } of idbOverrides) {
    try {
      const idbData = await idbGetFn<any>(idbKey);
      if (idbData != null) {
        base[field] = typeof idbData === 'string' ? idbData : JSON.stringify(idbData);
      }
    } catch {
      // IDB failed — keep localStorage value from base
    }
  }

  return base;
}

/** Build the V5 backup JSON object client-side from cloud records + local data */
export function buildBackupPayload(opts: {
  cloudRecords: any[];
  localData: Record<string, string | undefined>;
  userEmail: string;
  userName: string;
}): any {
  const { cloudRecords, localData, userEmail, userName } = opts;
  const now = new Date().toISOString();
  const tryParse = (s?: string) => { try { return s ? JSON.parse(s) : null; } catch { return s || null; } };
  const ld = localData;

  const active = cloudRecords.filter(r => !r.isTrashed);

  const backup: Record<string, any> = {
    _meta: {
      version: 5,
      type: 'quiz-master-pro-full-backup',
      exportedAt: now,
      appName: 'Quiz Master Pro — Premium Edition',
      userEmail,
      userName,
      backupScope: 'A-Z complete',
      dataIntegrity: {
        totalRecords: cloudRecords.length,
        activeQuizzes: active.length,
        trashedQuizzes: cloudRecords.length - active.length,
        checksums: {
          recordCount: cloudRecords.length,
          fullDataCount: cloudRecords.filter((r: any) => Array.isArray(r.quizData) && r.quizData.length > 0).length,
          totalQuizDataItems: cloudRecords.reduce((sum: number, r: any) => sum + (Array.isArray(r.quizData) ? r.quizData.length : 0), 0),
          settingsKeys: Object.keys(localData).filter(k => localData[k] != null).length,
        },
      },
    },
    quizHistory: {
      totalQuizzes: cloudRecords.length,
      activeQuizzes: active.length,
      trashedQuizzes: cloudRecords.length - active.length,
      records: cloudRecords,
    },
  };

  // Add all local settings
  backup.appSettings = {
    quizSettings: tryParse(ld.settings),
    aiPreferences: tryParse(ld.aiPrefs),
    rationalePreferences: tryParse(ld.rationalePrefs),
    theme: ld.theme || null,
    accentColor: ld.accentHsl || null,
    accentHex: ld.accentHex || null,
    fontSize: ld.fontSize || null,
    glassIntensity: ld.glassIntensity || null,
    autoBackupEnabled: ld.autoBackup || null,
    notesConfig: tryParse(ld.notesConfig),
    haptics: ld.haptics || null,
    fmView: ld.fmView || null,
    chatBtnPos: ld.chatBtnPos || null,
    gesturesSeen: ld.gesturesSeen || null,
    installDismissed: ld.installDismissed || null,
    templatesExpanded: ld.templatesExpanded || null,
    hideZiteBadge: ld.hideZiteBadge || null,
    driveLinked: ld.driveLinked || null,
    onboardingDone: ld.onboardingDone || null,
    checklistDismissed: ld.checklistDismissed || null,
    usedFlashcards: ld.usedFlashcards || null,
    backupPrefs: tryParse(ld.backupPrefs),
    weeklyEmail: tryParse(ld.weeklyEmail),
    preferredEmail: ld.preferredEmail || null,
  };
  backup.fileManager = { fileTree: tryParse(ld.fileTree), fileTrash: tryParse(ld.fileTrash) };
  backup.library = { tree: tryParse(ld.libraryTree), collections: tryParse(ld.libraryTree) };
  backup.templates = tryParse(ld.templates);
  backup.spacedRepetition = tryParse(ld.spacedRepetition);
  backup.studyReminders = tryParse(ld.studyReminders);
  backup.pinnedQuizzes = tryParse(ld.pinnedQuizzes);
  backup.rationaleCache = tryParse(ld.rationaleCache);
  backup.bookmarks = tryParse(ld.bookmarks);
  backup.bookmarksV2 = tryParse(ld.bookmarksV2);
  backup.profile = tryParse(ld.profile);
  backup.trainingRationale = tryParse(ld.trainingRationale);
  backup.draftText = ld.draftText || null;
  backup.quizSkins = tryParse(ld.quizSkins);
  backup.quizSkin = ld.quizSkin || null;
  backup.examDates = tryParse(ld.examDates);
  backup.difficultyRatings = tryParse(ld.difficultyRatings);
  backup.disputes = tryParse(ld.disputes);
  backup.confidenceHistory = tryParse(ld.confidenceHistory);
  backup.negativeMarking = tryParse(ld.negativeMarking);
  backup.apiKeys = tryParse(ld.apiKeys);
  backup.rjProfile = tryParse(ld.rjProfile);
  backup.studyPlan = tryParse(ld.studyPlan);
  backup.studyTracker = tryParse(ld.studyTracker);
  backup.dailyChallenge = tryParse(ld.dailyChallenge);
  backup.mistakePatterns = tryParse(ld.mistakePatterns);
  backup.flashcardSessions = tryParse(ld.flashcardSessions);
  backup.offlineNotes = tryParse(ld.offlineNotes);
  backup.streakTargets = tryParse(ld.streakTargets);
  backup.localHistory = tryParse(ld.localHistory);
  backup.globalMistakes = tryParse(ld.globalMistakes);
  backup.userSubjects = tryParse(ld.userSubjects);

  backup.summary = {
    totalQuizzes: active.length,
    totalTrashed: cloudRecords.length - active.length,
    subjects: [...new Set(active.map((r: any) => r.subject).filter(Boolean))],
  };

  return backup;
}

/** Post-restore integrity check — compares actual vs expected counts */
export function checkRestoreIntegrity(expected?: {
  quizCount: number;
  fullDataCount: number;
  settingsCount: number;
}, actualHistory?: any[]): { ok: boolean; issues: string[]; restoredQuizCount: number; restoredFullDataCount: number } {
  const issues: string[] = [];

  // Count restored records from the provided array (authoritative)
  const history = actualHistory ?? [];
  const restoredQuizCount = history.length;
  const restoredFullDataCount = history.filter(
    (r: any) => Array.isArray(r.quizData) && r.quizData.length > 0,
  ).length;

  if (expected) {
    // Check total quiz count
    if (restoredQuizCount < expected.quizCount) {
      const missing = expected.quizCount - restoredQuizCount;
      issues.push(`${missing} quiz record(s) missing — expected ${expected.quizCount}, restored ${restoredQuizCount}`);
    }

    // Check full-data count
    if (expected.fullDataCount > 0 && restoredFullDataCount < expected.fullDataCount) {
      const missing = expected.fullDataCount - restoredFullDataCount;
      issues.push(`${missing} quiz(es) lost question data — expected ${expected.fullDataCount} with full data, got ${restoredFullDataCount}`);
    }

    // Check settings
    let settingsCount = 0;
    ALL_APP_KEYS.forEach(k => { if (localStorage.getItem(k) != null) settingsCount++; });
    if (expected.settingsCount > 0 && settingsCount < Math.floor(expected.settingsCount * 0.5)) {
      issues.push(`Settings may be incomplete — expected ~${expected.settingsCount} keys, found ${settingsCount}`);
    }
  }

  // Corruption checks
  try {
    const raw = localStorage.getItem('qmp_global_mistakes_v1');
    if (raw) { JSON.parse(raw); }
  } catch { issues.push('Global mistakes data is corrupted'); }

  try {
    const raw = localStorage.getItem('qmp_user_subjects');
    if (raw) { JSON.parse(raw); }
  } catch { issues.push('User subjects data is corrupted'); }

  try {
    const raw = localStorage.getItem('qmp_file_tree');
    if (raw) { JSON.parse(raw); }
  } catch { issues.push('File tree data is corrupted'); }

  if (restoredQuizCount === 0 && !localStorage.getItem('qmp_global_mistakes_v1') &&
      !localStorage.getItem('qmp_user_subjects') && !localStorage.getItem('qmp_file_tree')) {
    issues.push('No data found after restore — all stores are empty');
  }

  return {
    ok: issues.length === 0,
    issues,
    restoredQuizCount,
    restoredFullDataCount,
  };
}
