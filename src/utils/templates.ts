import { QuizSettings } from '../types/quiz';
import { PRACTICE_MODES } from './examModes';

const TEMPLATES_KEY = 'qmp_user_templates';

export interface QuizTemplate {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  patch: Partial<QuizSettings>;
  isBuiltIn?: boolean;
  createdAt: number;
  updatedAt: number;
}

function genId() {
  return `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Built-in templates (cannot be edited/deleted) ─────────────────────────
// Exactly three practice modes: Normal, NORCET, AAO (see utils/examModes.ts).
export const BUILT_IN_TEMPLATES: QuizTemplate[] = PRACTICE_MODES.map(m => ({
  id: `builtin_${m.id}`, emoji: m.emoji, label: m.label, desc: m.desc,
  patch: m.patch, isBuiltIn: true, createdAt: 0, updatedAt: 0,
}));

// ─── Load / Save ───────────────────────────────────────────────────────────
export function loadUserTemplates(): QuizTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function save(templates: QuizTemplate[]) {
  try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)); } catch {}
}

export function getAllTemplates(): QuizTemplate[] {
  return [...BUILT_IN_TEMPLATES, ...loadUserTemplates()];
}

// ─── CRUD ──────────────────────────────────────────────────────────────────
export function createTemplate(
  label: string, desc: string, emoji: string, patch: Partial<QuizSettings>
): QuizTemplate {
  const now = Date.now();
  const tpl: QuizTemplate = { id: genId(), emoji, label, desc, patch, createdAt: now, updatedAt: now };
  const all = loadUserTemplates();
  all.push(tpl);
  save(all);
  return tpl;
}

export function updateTemplate(
  id: string, updates: Partial<Pick<QuizTemplate, 'label' | 'desc' | 'emoji' | 'patch'>>
): void {
  const all = loadUserTemplates();
  const idx = all.findIndex(t => t.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates, updatedAt: Date.now() };
  save(all);
}

export function deleteTemplate(id: string): void {
  save(loadUserTemplates().filter(t => t.id !== id));
}

export function duplicateTemplate(id: string): QuizTemplate | null {
  const all = [...BUILT_IN_TEMPLATES, ...loadUserTemplates()];
  const src = all.find(t => t.id === id);
  if (!src) return null;
  return createTemplate(`${src.label} (copy)`, src.desc, src.emoji, { ...src.patch });
}
