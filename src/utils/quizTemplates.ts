/**
 * Quiz templates: one-tap sets of rules (style, timer, marking, pass mark, rationale) for the Create screen.
 *
 *  - three built-ins: Default (used when you paste and press Start), Practice, Exam
 *  - every template can be edited or deleted (at least one must stay), new ones can be created, duplicated and reordered
 *  - the default template is applied automatically for a new quiz, so "paste 50 questions -> Start" just works
 *
 * Templates are stored as simple `rules`; `rulesToPatch` turns them into the quiz settings they set.
 */
import type { QuizSettings, RationalePrefs } from '../types/quiz';

export type TimerKind = 'off' | 'question' | 'total' | 'scaled';

export interface TemplateRules {
  /** submit = classic exam (answers and score only at the end), live = instant feedback after every question */
  style: 'submit' | 'live';
  timer: TimerKind;
  /** timer = question: seconds for each question */
  perQuestionSeconds: number;
  /** timer = total: one fixed clock, in minutes */
  totalMinutes: number;
  /** timer = scaled: the clock is (number of questions x this many minutes), e.g. 1 -> 50 questions = 50 minutes */
  minutesPerQuestion: number;
  marksPerQuestion: number;
  negativeMarking: boolean;
  /** marks taken for a wrong answer (positive number: 0.25 means -0.25) */
  negativeMarks: number;
  passMark: number;
  showLiveMarks: boolean;
  /** rationale choice this template also applies; null = leave your current choice alone */
  rationale: RationalePrefs | null;
}

export interface QuizTemplate {
  id: string;
  emoji: string;
  name: string;
  /** shown under the name; empty = worked out from the rules */
  desc: string;
  rules: TemplateRules;
  /** which factory template this started as (so "Restore factory templates" knows it) */
  builtIn?: 'default' | 'practice' | 'exam';
  createdAt: number;
  updatedAt: number;
}

export interface TemplateStore { v: 2; defaultId: string; items: QuizTemplate[] }

export const TEMPLATE_STORE_KEY = 'qmp_quiz_templates_v2';
const LEGACY_KEY = 'qmp_user_templates';
export const TEMPLATES_EVENT = 'qmp-templates-changed';
export const MAX_TEMPLATES = 12;

const BASE_RULES: TemplateRules = {
  style: 'submit', timer: 'off', perQuestionSeconds: 60, totalMinutes: 30, minutesPerQuestion: 1,
  marksPerQuestion: 1, negativeMarking: true, negativeMarks: 0.25, passMark: 50, showLiveMarks: false, rationale: null,
};

const factory = (): QuizTemplate[] => [
  { id: 'default', emoji: '🧭', name: 'Default', desc: '', builtIn: 'default', createdAt: 0, updatedAt: 0,
    rules: { ...BASE_RULES, style: 'submit', timer: 'scaled', minutesPerQuestion: 1 } },
  { id: 'practice', emoji: '🎯', name: 'Practice', desc: 'Instant feedback · both rationales', builtIn: 'practice', createdAt: 0, updatedAt: 0,
    rules: { ...BASE_RULES, style: 'live', timer: 'off', showLiveMarks: true, rationale: { showBook: true, showAi: true } } },
  { id: 'exam', emoji: '🏥', name: 'Exam', desc: '1 min per Q · auto-next · submit at end', builtIn: 'exam', createdAt: 0, updatedAt: 0,
    rules: { ...BASE_RULES, style: 'submit', timer: 'question', perQuestionSeconds: 60, showLiveMarks: false } },
];
export const FACTORY_TEMPLATES: readonly QuizTemplate[] = Object.freeze(factory());

/* ───────── rules <-> settings ───────── */

const num = (v: unknown, fallback: number, min: number, max: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};

/** Clamps every number and fixes anything missing, so a stored or typed template can never break a quiz. */
export function sanitizeRules(input: Partial<TemplateRules> | undefined): TemplateRules {
  const r = { ...BASE_RULES, ...(input || {}) };
  return {
    style: r.style === 'live' ? 'live' : 'submit',
    timer: (['off', 'question', 'total', 'scaled'] as const).includes(r.timer) ? r.timer : 'off',
    perQuestionSeconds: Math.round(num(r.perQuestionSeconds, 60, 5, 3600)),
    totalMinutes: Math.round(num(r.totalMinutes, 30, 1, 600)),
    minutesPerQuestion: Math.round(num(r.minutesPerQuestion, 1, 0.25, 30) * 100) / 100,
    marksPerQuestion: Math.round(num(r.marksPerQuestion, 1, 0.25, 100) * 100) / 100,
    negativeMarking: !!r.negativeMarking,
    negativeMarks: Math.round(num(r.negativeMarks, 0.25, 0, 100) * 100) / 100,
    passMark: Math.round(num(r.passMark, 50, 1, 100)),
    showLiveMarks: !!r.showLiveMarks,
    rationale: r.rationale && typeof r.rationale === 'object' ? { showBook: !!r.rationale.showBook, showAi: !!r.rationale.showAi } : null,
  };
}

/** The quiz settings a template sets. Everything not listed (difficulty, shuffles, title, subject) keeps your current value. */
export function rulesToPatch(rulesIn: TemplateRules, builtIn?: QuizTemplate['builtIn']): Partial<QuizSettings> {
  const r = sanitizeRules(rulesIn);
  const patch: Partial<QuizSettings> = {
    mode: r.style,
    timerMode: r.timer === 'off' ? 'off' : r.timer === 'question' ? 'per-question' : 'total',
    timerEnabled: r.timer !== 'off',
    marksPerQuestion: r.marksPerQuestion,
    negativeMarking: r.negativeMarking,
    negativeMarks: r.negativeMarks,
    passMark: r.passMark,
    showMarksInQuiz: r.showLiveMarks,
    mockExamMode: false,
    adaptiveMode: false,
    practiceMode: builtIn === 'practice' || builtIn === 'exam' ? builtIn : undefined,
    totalMinutesPerQuestion: r.timer === 'scaled' ? r.minutesPerQuestion : undefined,
  };
  if (r.style === 'live') patch.instantFeedbackDelay = 0;
  if (r.timer === 'question') { patch.timerValue = r.perQuestionSeconds; patch.timerUnit = 'sec'; }
  if (r.timer === 'total') { patch.totalTimerValue = r.totalMinutes; patch.totalTimerUnit = 'min'; }
  return patch;
}

/** The settings after applying a template (and which template it was). */
export function applyTemplateToSettings(settings: QuizSettings, t: QuizTemplate): QuizSettings {
  return { ...settings, ...rulesToPatch(t.rules, t.builtIn), templateId: t.id };
}

/** True while every value the template sets is still in effect (a manual change in Settings & Rules switches it off). */
export function isTemplateActive(t: QuizTemplate, settings: QuizSettings, rationalePrefs?: RationalePrefs): boolean {
  if (settings.templateId !== t.id) return false;
  const patch = rulesToPatch(t.rules, t.builtIn);
  const same = (Object.keys(patch) as (keyof QuizSettings)[]).every(k => {
    const want = patch[k]; const have = settings[k];
    return want === have || (want === undefined && (have === undefined || have === null));
  });
  if (!same) return false;
  const rat = sanitizeRules(t.rules).rationale;
  if (rat && rationalePrefs) return rationalePrefs.showBook === rat.showBook && rationalePrefs.showAi === rat.showAi;
  return true;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** "Total time 1 min/Q · submit at end · +1 / −0.25 · pass 50%" */
export function describeRules(rulesIn: TemplateRules): string {
  const r = sanitizeRules(rulesIn);
  const timer = r.timer === 'off' ? 'No timer' : r.timer === 'question' ? `${r.perQuestionSeconds >= 60 && r.perQuestionSeconds % 60 === 0 ? `${r.perQuestionSeconds / 60} min` : `${r.perQuestionSeconds}s`} per Q`
    : r.timer === 'total' ? `${r.totalMinutes} min total` : `${fmt(r.minutesPerQuestion)} min per Q (total)`;
  return [timer, r.style === 'submit' ? 'Submit at end' : 'Instant feedback', `+${fmt(r.marksPerQuestion)}${r.negativeMarking ? ` / −${fmt(r.negativeMarks)}` : ''}`, `Pass ${r.passMark}%`].join(' · ');
}

export const templateDescription = (t: QuizTemplate): string => (t.desc.trim() ? t.desc.trim() : describeRules(t.rules));

/** Seconds of exam clock for a quiz about to start, from the rules (same rule the quiz engine uses). */
export function totalSecondsFor(rulesIn: TemplateRules, questionCount: number): number {
  const r = sanitizeRules(rulesIn);
  if (r.timer === 'scaled') return Math.round(questionCount * r.minutesPerQuestion * 60);
  if (r.timer === 'total') return r.totalMinutes * 60;
  return 0;
}

/* ───────── store ───────── */

let cache: TemplateStore | null = null;
/** the stored text `cache` was built from: when something else (a cloud sync) rewrites the key, the next read notices */
let cacheRaw: string | null = null;
const genId = () => `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function normalizeItem(raw: unknown): QuizTemplate | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<QuizTemplate>;
  if (typeof o.id !== 'string' || !o.id) return null;
  const builtIn = o.builtIn === 'default' || o.builtIn === 'practice' || o.builtIn === 'exam' ? o.builtIn : undefined;
  return { id: o.id, emoji: (typeof o.emoji === 'string' && o.emoji.trim()) || '📝', name: (typeof o.name === 'string' && o.name.trim()) || 'Template', desc: typeof o.desc === 'string' ? o.desc : '', rules: sanitizeRules(o.rules), builtIn, createdAt: Number(o.createdAt) || 0, updatedAt: Number(o.updatedAt) || 0 };
}

/** Older versions kept user templates as raw settings patches. */
function migrateLegacy(): QuizTemplate[] {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as { id?: string; emoji?: string; label?: string; desc?: string; patch?: Partial<QuizSettings>; createdAt?: number; updatedAt?: number }[];
    return (Array.isArray(list) ? list : []).filter(t => t && t.patch).map(t => {
      const p = t.patch!;
      const timer: TimerKind = p.timerMode === 'per-question' ? 'question' : p.timerMode === 'total' ? (p.totalMinutesPerQuestion ? 'scaled' : 'total') : 'off';
      const rules = sanitizeRules({
        style: p.mode === 'live' ? 'live' : 'submit', timer,
        perQuestionSeconds: (p.timerValue ?? 60) * (p.timerUnit === 'min' ? 60 : 1),
        totalMinutes: (p.totalTimerValue ?? 30) * (p.totalTimerUnit === 'sec' ? 1 / 60 : 1),
        minutesPerQuestion: p.totalMinutesPerQuestion ?? 1,
        marksPerQuestion: p.marksPerQuestion ?? 1, negativeMarking: !!p.negativeMarking, negativeMarks: p.negativeMarks ?? 0.25, passMark: p.passMark ?? 50,
        showLiveMarks: p.showMarksInQuiz ?? false,
      });
      return { id: String(t.id || genId()), emoji: t.emoji || '📝', name: t.label || 'Template', desc: t.desc || '', rules, createdAt: t.createdAt || Date.now(), updatedAt: t.updatedAt || Date.now() } as QuizTemplate;
    });
  } catch { return []; }
}

function seedStore(): TemplateStore {
  return { v: 2, defaultId: 'default', items: [...factory(), ...migrateLegacy()].slice(0, MAX_TEMPLATES) };
}

/** Always returns at least one template and a valid default. */
function repair(store: TemplateStore): TemplateStore {
  const seen = new Set<string>();
  const items = store.items.filter(t => (seen.has(t.id) ? false : (seen.add(t.id), true)));
  const out = items.length ? items : factory().slice(0, 1);
  const defaultId = out.some(t => t.id === store.defaultId) ? store.defaultId : out[0].id;
  return { v: 2, defaultId, items: out };
}

export function loadTemplateStore(): TemplateStore {
  let raw: string | null = null;
  try { raw = localStorage.getItem(TEMPLATE_STORE_KEY); } catch { /* private mode: use the in-memory copy */ }
  if (cache && (raw === cacheRaw || raw === null)) return cache;
  try {
    if (raw) {
      const p = JSON.parse(raw) as Partial<TemplateStore>;
      if (p && Array.isArray(p.items)) {
        cache = repair({ v: 2, defaultId: String(p.defaultId || ''), items: p.items.map(normalizeItem).filter((t): t is QuizTemplate => !!t) });
        cacheRaw = raw;
        return cache;
      }
    }
  } catch { /* fall through to the seed */ }
  cache = repair(seedStore());
  persist(cache, false);
  return cache;
}

function persist(store: TemplateStore, notify = true) {
  cache = store;
  const raw = JSON.stringify(store);
  cacheRaw = raw;
  try { localStorage.setItem(TEMPLATE_STORE_KEY, raw); } catch { /* storage full: the in-memory copy still works */ }
  if (notify && typeof window !== 'undefined') window.dispatchEvent(new Event(TEMPLATES_EVENT));
}

/** Test helper / "reload from storage" (after a cloud sync wrote the key). */
export function resetTemplateCache() { cache = null; cacheRaw = null; }

export const getTemplates = (): QuizTemplate[] => loadTemplateStore().items;
export const getDefaultTemplate = (): QuizTemplate => { const s = loadTemplateStore(); return s.items.find(t => t.id === s.defaultId) || s.items[0]; };

/** Create (no id) or update a template. Returns it. */
export function saveTemplate(input: { id?: string; emoji: string; name: string; desc?: string; rules: Partial<TemplateRules> }): QuizTemplate {
  const s = loadTemplateStore();
  const now = Date.now();
  const name = input.name.trim() || 'Template';
  const rules = sanitizeRules(input.rules);
  const existing = input.id ? s.items.find(t => t.id === input.id) : undefined;
  if (existing) {
    const next: QuizTemplate = { ...existing, emoji: input.emoji.trim() || existing.emoji, name, desc: (input.desc ?? existing.desc).trim(), rules, updatedAt: now };
    persist(repair({ ...s, items: s.items.map(t => (t.id === existing.id ? next : t)) }));
    return next;
  }
  if (s.items.length >= MAX_TEMPLATES) throw new Error(`You can keep up to ${MAX_TEMPLATES} templates.`);
  const t: QuizTemplate = { id: genId(), emoji: input.emoji.trim() || '📝', name, desc: (input.desc ?? '').trim(), rules, createdAt: now, updatedAt: now };
  persist({ ...s, items: [...s.items, t] });
  return t;
}

export function duplicateTemplate(id: string): QuizTemplate | null {
  const s = loadTemplateStore();
  const src = s.items.find(t => t.id === id);
  if (!src || s.items.length >= MAX_TEMPLATES) return null;
  const now = Date.now();
  const copy: QuizTemplate = { ...src, id: genId(), name: `${src.name} copy`, builtIn: undefined, rules: { ...src.rules }, createdAt: now, updatedAt: now };
  const at = s.items.findIndex(t => t.id === id) + 1;
  persist({ ...s, items: [...s.items.slice(0, at), copy, ...s.items.slice(at)] });
  return copy;
}

/** Deleting is allowed for every template (built-ins too) except the last one. Deleting the default makes the first remaining one the default. */
export function deleteTemplate(id: string): boolean {
  const s = loadTemplateStore();
  if (s.items.length <= 1 || !s.items.some(t => t.id === id)) return false;
  persist(repair({ ...s, items: s.items.filter(t => t.id !== id) }));
  return true;
}

export function setDefaultTemplate(id: string) {
  const s = loadTemplateStore();
  if (s.items.some(t => t.id === id)) persist({ ...s, defaultId: id });
}

export function moveTemplate(id: string, dir: -1 | 1) {
  const s = loadTemplateStore();
  const i = s.items.findIndex(t => t.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.items.length) return;
  const items = [...s.items];
  [items[i], items[j]] = [items[j], items[i]];
  persist({ ...s, items });
}

/** Brings the three factory templates back to how they shipped (edited or deleted ones). Your own templates stay. */
export function restoreFactoryTemplates() {
  const s = loadTemplateStore();
  const fresh = factory();
  const own = s.items.filter(t => !t.builtIn);
  const items = [...fresh, ...own].slice(0, MAX_TEMPLATES);
  persist({ v: 2, defaultId: 'default', items });
}

/** Rules of a template found by id (or the default). */
export const findTemplate = (id?: string | null): QuizTemplate | undefined => (id ? loadTemplateStore().items.find(t => t.id === id) : undefined);

/** The rationale choice a template applies (null = none). */
export const templateRationale = (t: QuizTemplate): RationalePrefs | null => sanitizeRules(t.rules).rationale;
