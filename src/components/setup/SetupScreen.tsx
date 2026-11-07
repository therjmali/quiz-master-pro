import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Clipboard, Upload, X, Rocket, Play, BookOpen, Loader2, FileText, FileSpreadsheet, ChevronDown, ChevronRight, Camera, Check } from 'lucide-react';
import { toast } from 'sonner';
import { QuizQuestion, QuizSettings, UploadedFile, QuizResult, AIPrefs, RationalePrefs, AIMode } from '../../types/quiz';
import { localOfflineParser, looksLikeMCQ, parseMcqText, MCQ_SAMPLE, COPY_PROMPT_TEXT } from '../../utils/quizParser';
import { getUserApiKeys } from '../../utils/apiKeys';
import { loadFileTree, createFile, ROOT_ID, saveFileTree, findNode, FileNode } from '../../utils/fileTree';
import { getHistorySync, setHistory } from '../../utils/historyStore';
import SettingsPanel from './SettingsPanel';
import SubjectManager from './SubjectManager';
import { syncSubjectsFromHistory, getUserSubjects } from '../../utils/subjects';
import ShuffleControlsButton from '../ShuffleControlsButton';
import AISourceControls from '../AISourceControls';

import BulkImportModal from './BulkImportModal';
import PhotoQuizModal from './PhotoQuizModal';
import QuizExportImportModal from '../QuizExportImportModal';
import HighlighterView from './HighlighterView';
import GenerationErrorCard from './GenerationErrorCard';
import FormatGuideModal from './FormatGuideModal';
import { generateQuiz } from 'zitejs/api';
import { PRACTICE_MODES, isModeActive, PracticeMode } from '../../utils/examModes';
import { FeatureVisibility } from '../../hooks/useProfileStore';

interface Props {
  settings: QuizSettings;
  onSettingsChange: (s: QuizSettings) => void;
  onStartQuiz: (questions: QuizQuestion[], targetFolderId?: string | null) => void;
  history: QuizResult[];
  hasSavedSession?: boolean;
  onResumeSession?: () => void;
  onDiscardSession?: () => void;
  aiPrefs: AIPrefs;
  onAiPrefsChange: (p: AIPrefs) => void;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
  onReportHelperChange: (m: AIMode) => void;
  /** True when user came here from an active quiz to edit settings */
  isEditingActiveQuiz?: boolean;
  /** Callback to go back to the active quiz with updated settings */
  onReturnToQuiz?: () => void;
  /** Feature visibility toggles from settings */
  featureVisibility?: FeatureVisibility;
}

const QUIZ_TYPES = [
  { emoji: '🎯', label: 'Daily Practice' },
  { emoji: '📚', label: 'Chapter Review' },
  { emoji: '📝', label: 'Mock Exam' },
  { emoji: '✏️', label: 'Class Test' },
  { emoji: '🔁', label: 'Revision Quiz' },
];

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em] mb-2.5 flex items-center gap-1.5">
      {children}
    </p>
  );
}

/** Practice-mode presets: Normal · NORCET · AAO. One tap applies the whole configuration. */
function TemplateSlider({ settings, onSettingsChange, rationalePrefs, onRationalePrefsChange }: {
  settings: QuizSettings;
  onSettingsChange: (s: QuizSettings) => void;
  rationalePrefs: RationalePrefs;
  onRationalePrefsChange: (p: RationalePrefs) => void;
}) {
  const [expanded, setExpanded] = useState(() => {
    const stored = localStorage.getItem('qmp_templates_expanded');
    return stored !== null ? stored === 'true' : true;
  });

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    localStorage.setItem('qmp_templates_expanded', String(next));
  };

  const applyMode = (m: PracticeMode) => {
    onSettingsChange({ ...settings, ...m.patch });
    if (m.rationale) onRationalePrefsChange({ ...rationalePrefs, ...m.rationale });
    toast.success(`${m.emoji} ${m.label} mode applied`);
  };

  return (
    <div>
      <button onClick={toggle} className="flex items-center gap-1.5 mb-2.5 group w-full text-left">
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-foreground/30" />
          : <ChevronRight className="w-3.5 h-3.5 text-foreground/30" />}
        <span className="text-[10px] font-black text-foreground/40 uppercase tracking-[0.12em]">🎮 Quick Mode</span>
        <span className="text-[10px] font-bold text-foreground/15 ml-1">{PRACTICE_MODES.length}</span>
        {!expanded && (
          <span className="ml-auto text-[9px] text-foreground/20 font-medium group-hover:text-foreground/40 transition-colors">tap to expand</span>
        )}
      </button>

      {expanded && (
        <div className="grid grid-cols-2 gap-2.5 animate-fade-in">
          {PRACTICE_MODES.map(m => {
            const active = isModeActive(m, settings, rationalePrefs);
            return (
              <button
                key={m.id}
                onClick={() => applyMode(m)}
                aria-pressed={active}
                className={`relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all active:scale-95 text-center ${
                  active
                    ? 'border-primary/60 bg-primary/10 shadow-sm shadow-primary/10'
                    : 'border-border bg-foreground/[0.03] hover:bg-foreground/[0.07] hover:border-foreground/20'
                }`}
              >
                {active && <Check className="absolute top-1.5 right-1.5 w-3 h-3 text-primary" aria-hidden="true" />}
                <span className="text-lg leading-none">{m.emoji}</span>
                <span className={`text-[11px] font-black leading-tight ${active ? 'text-primary' : 'text-foreground/70'}`}>{m.label}</span>
                <span className="text-[9px] text-foreground/35 leading-tight line-clamp-2">{m.desc}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Compact horizontal folder selector grid */
function FolderSelector({ selectedId, onSelect }: { selectedId: string | null; onSelect: (id: string | null) => void }) {
  const tree = loadFileTree();
  const rootFolders = (tree.children || []).filter(c => c.type === 'folder');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (rootFolders.length === 0) return null;

  const expandedNode = expandedId ? findNode(tree, expandedId) : null;
  const subfolders = expandedNode?.children?.filter(c => c.type === 'folder') || [];

  return (
    <div>
      <SectionLabel>📁 Save to Folder <span className="text-foreground/20 normal-case font-normal tracking-normal">— optional</span></SectionLabel>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
        <button
          onClick={() => { onSelect(null); setExpandedId(null); }}
          className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
            !selectedId ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-foreground/[0.04] border-border text-foreground/45 hover:text-foreground/65'
          }`}
        >
          <span className="text-sm">🏠</span> None
        </button>
        {rootFolders.map(f => {
          const isSelected = selectedId === f.id;
          const hasChildren = (f.children || []).some(c => c.type === 'folder');
          return (
            <button
              key={f.id}
              onClick={() => {
                if (hasChildren) {
                  setExpandedId(prev => prev === f.id ? null : f.id);
                }
                onSelect(f.id);
              }}
              className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl border transition-all active:scale-95 ${
                isSelected ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-foreground/[0.04] border-border text-foreground/45 hover:text-foreground/65'
              }`}
            >
              <span className="text-sm">{f.icon || '📁'}</span>
              <span className="max-w-[80px] truncate">{f.name}</span>
              {hasChildren && <ChevronDown className={`w-3 h-3 transition-transform ${expandedId === f.id ? 'rotate-180' : ''}`} />}
            </button>
          );
        })}
      </div>
      {expandedId && subfolders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mt-2 ml-4 -mx-1 px-1 animate-fade-in">
          {subfolders.map(sf => (
            <button
              key={sf.id}
              onClick={() => onSelect(sf.id)}
              className={`flex-shrink-0 flex items-center gap-1.5 text-[10px] font-bold px-2.5 py-1.5 rounded-lg border transition-all active:scale-95 ${
                selectedId === sf.id ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300' : 'bg-foreground/[0.03] border-border text-foreground/40 hover:text-foreground/60'
              }`}
            >
              <span className="text-xs">{sf.icon || '📂'}</span>
              <span className="max-w-[70px] truncate">{sf.name}</span>
            </button>
          ))}
        </div>
      )}
      {selectedId && (() => {
        const node = findNode(tree, selectedId);
        return node ? (
          <p className="text-[10px] text-emerald-400/70 mt-1.5 ml-1 font-semibold">
            ✓ Quiz will be saved to &ldquo;{node.name}&rdquo;
          </p>
        ) : null;
      })()}
    </div>
  );
}

/** Professional Copy Prompt button with shimmer feedback */
function CopyPromptButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const prompt = COPY_PROMPT_TEXT;
    navigator.clipboard.writeText(prompt).then(() => {
      setCopied(true);
      toast.success('MCQ format prompt copied');
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => toast.error('Copy failed'));
  }, []);

  return (
    <button
      onClick={handleCopy}
      className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-xl transition-all active:scale-95 shadow-md border relative overflow-hidden ${
        copied
          ? 'bg-emerald-600 border-emerald-500/40 text-white shadow-emerald-500/20'
          : 'text-white bg-gradient-to-r from-violet-600 to-primary border-primary/30 shadow-primary/20 hover:shadow-lg'
      }`}
      title="Copy professional AI prompt for ChatGPT, Claude, or Gemini"
    >
      {copied ? (
        <>
          <Check className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Copied!</span>
        </>
      ) : (
        <>
          <span className="relative z-10">📋</span>
          <span className="hidden xs:inline relative z-10">Copy Prompt</span>
          {/* Shimmer effect */}
          <span className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
        </>
      )}
    </button>
  );
}

export default function SetupScreen({
  settings, onSettingsChange, onStartQuiz, history,
  hasSavedSession, onResumeSession, onDiscardSession,
  aiPrefs, onAiPrefsChange,
  rationalePrefs, onRationalePrefsChange, onReportHelperChange,
  isEditingActiveQuiz, onReturnToQuiz, featureVisibility,
}: Props) {
  const [text, setText] = useState(() => localStorage.getItem('qmp_input') || '');
  const hasSavedDraft = !text.trim() && !!(localStorage.getItem('qmp_input')?.trim());
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [showPhotoQuiz, setShowPhotoQuiz] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [showHighlighter, setShowHighlighter] = useState(false);
  const [showFormatGuide, setShowFormatGuide] = useState(false);
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  // Track whether user manually selected subject/folder (never override manual)
  const manualSubjectRef = useRef(false);
  const manualFolderRef = useRef(false);
  const [autoMatchedFolderName, setAutoMatchedFolderName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [advancedSettingsOpen, setAdvancedSettingsOpen] = useState(false);

  // Suggest "Daily Practice" as default quiz name if not set
  useEffect(() => {
    if (!settings.quizTitle && !isEditingActiveQuiz) {
      onSettingsChange({ ...settings, quizTitle: 'Daily Practice' });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-focus textarea on mount (only if no active quiz editing)
  useEffect(() => {
    if (!isEditingActiveQuiz && !hasSavedSession) {
      const t = setTimeout(() => textareaRef.current?.focus(), 300);
      return () => clearTimeout(t);
    }
  }, []); // eslint-disable-line

  useEffect(() => { localStorage.setItem('qmp_input', text); }, [text]);

  // ── Sync subjects from history on mount ──
  useEffect(() => {
    try {
      const raw = getHistorySync();
      if (raw) {
        const parsed = raw;
        if (Array.isArray(parsed)) {
          syncSubjectsFromHistory(parsed);
        }
      }
    } catch { /* ignore */ }
  }, []);

  // ── Smart auto-select Subject & Folder from quiz title ──
  const prevAutoMatchTitle = useRef('');
  useEffect(() => {
    const title = settings.quizTitle?.trim();
    if (!title || title.length < 2) {
      setAutoMatchedFolderName(null);
      return;
    }
    if (prevAutoMatchTitle.current === title) return;
    prevAutoMatchTitle.current = title;

    // Normalize: split title into tokens (letters/digits), lowercase
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/gi, ' ').trim();
    const titleNorm = normalize(title);
    const titleTokens = titleNorm.split(/\s+/).filter(t => t.length >= 2);

    // Match against subjects
    if (!manualSubjectRef.current && !settings.subject) {
      const subjects = getUserSubjects();
      for (const subj of subjects) {
        const subjNorm = normalize(subj);
        // Exact token match — a subject token must appear in the title
        if (titleTokens.some(t => t === subjNorm || subjNorm.includes(t) && t.length >= 3) || titleNorm.includes(subjNorm)) {
          set({ subject: subj });
          toast.success(`🎯 Auto-detected subject: ${subj}`, { duration: 2000, id: 'auto-subject' });
          break;
        }
      }
    }

    // Match against top-level folders
    if (!manualFolderRef.current && !targetFolderId) {
      try {
        const tree = loadFileTree();
        const rootFolders = (tree.children || []).filter(c => c.type === 'folder');
        for (const folder of rootFolders) {
          const folderNorm = normalize(folder.name);
          if (folderNorm.length < 2) continue;
          // Check if any title token exactly matches folder name (or vice versa)
          const match = titleTokens.some(t => t === folderNorm || (t.length >= 3 && folderNorm === t)) || titleNorm.includes(folderNorm);
          if (match) {
            setTargetFolderId(folder.id);
            setAutoMatchedFolderName(folder.name);
            toast.success(`📁 Auto-selected folder: ${folder.name}`, { duration: 2000, id: 'auto-folder' });
            break;
          }
          // Also check subfolders (one level deep)
          for (const sub of (folder.children || []).filter(c => c.type === 'folder')) {
            const subNorm = normalize(sub.name);
            if (subNorm.length < 2) continue;
            if (titleTokens.some(t => t === subNorm || (t.length >= 3 && subNorm === t)) || titleNorm.includes(subNorm)) {
              setTargetFolderId(sub.id);
              setAutoMatchedFolderName(`${folder.name} / ${sub.name}`);
              toast.success(`📁 Auto-selected: ${folder.name} / ${sub.name}`, { duration: 2000, id: 'auto-folder' });
              break;
            }
          }
          if (targetFolderId) break;
        }
      } catch {}
    }
  }, [settings.quizTitle]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Live "how many questions were detected" while pasting (debounced, parse-only, no AI) ──
  const [debouncedText, setDebouncedText] = useState(text);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedText(text), 300);
    return () => clearTimeout(t);
  }, [text]);
  const detection = useMemo(() => {
    const raw = debouncedText;
    if (raw.trim().length <= 20) return null;
    const { questions, issues, duplicates } = parseMcqText(raw);
    const words = (raw.trim().match(/\S+/g) || []).length;
    return { total: questions.length, issues, duplicates, words, pending: raw !== text };
  }, [debouncedText, text]);

  // ── Auto-detect Topic & Subject from pasted text ──
  const autoDetectedForTextRef = useRef('');
  useEffect(() => {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 30) return;
    // Only detect once per unique text content (first 200 chars as fingerprint)
    const fingerprint = trimmed.slice(0, 200);
    if (autoDetectedForTextRef.current === fingerprint) return;

    const lines = text.split('\n').slice(0, 30);
    let detectedTopic = '';
    let detectedSubject = '';

    for (const line of lines) {
      const tl = line.trim();
      const sepChars = String.fromCharCode(45,58,61,0x2013,0x2014);
      const topicMatch = tl.match(new RegExp('^(?:Topic|Title|Chapter|Unit|Lesson)\\s*[' + sepChars + ']\\s*(.+)', 'i'));
      if (topicMatch && topicMatch[1].trim() && !detectedTopic) {
        detectedTopic = topicMatch[1].trim().replace(/^\*+|\*+$/g, '').slice(0, 60);
      }
      const subjectMatch = tl.match(new RegExp('^(?:Subject|Sub|Course|Class|Stream)\\s*[' + sepChars + ']\\s*(.+)', 'i'));
      if (subjectMatch && subjectMatch[1].trim() && !detectedSubject) {
        detectedSubject = subjectMatch[1].trim().replace(/^\*+|\*+$/g, '').slice(0, 30);
      }
    }

    if (detectedTopic || detectedSubject) {
      autoDetectedForTextRef.current = fingerprint;
      const patch: Partial<QuizSettings> = {};
      const parts: string[] = [];

      if (detectedTopic && !settings.quizTitle) {
        patch.quizTitle = detectedTopic;
        parts.push(detectedTopic);
      }
      if (detectedSubject && !settings.subject) {
        patch.subject = detectedSubject;
        parts.push(detectedSubject);
      }

      if (Object.keys(patch).length > 0) {
        onSettingsChange({ ...settings, ...patch });
        toast.success(`✨ Auto-detected: ${parts.join(' · ')}`, { duration: 3000 });
      }
    }
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset auto-detect when text is cleared
  useEffect(() => {
    if (!text.trim()) autoDetectedForTextRef.current = '';
  }, [text]);

  const set = (patch: Partial<QuizSettings>) => onSettingsChange({ ...settings, ...patch });

  const getFileMimeType = (file: File): string => {
    if (file.type && file.type !== 'application/octet-stream') return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      txt: 'text/plain',
      md: 'text/markdown',
      jpg: 'image/jpeg', jpeg: 'image/jpeg',
      png: 'image/png', gif: 'image/gif', webp: 'image/webp',
    };
    return map[ext] || 'application/octet-stream';
  };

  const isTextFile = (file: File): boolean => {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    return ext === 'txt' || ext === 'md' || file.type === 'text/plain' || file.type === 'text/markdown';
  };

  const handleFileAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (files.length + newFiles.length > 5) { toast.error('Max 5 files.'); return; }
    newFiles.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { toast.error(`${file.name} exceeds 10MB`); return; }
      if (isTextFile(file)) {
        const reader = new FileReader();
        reader.onload = ev => {
          const content = ev.target?.result as string;
          setText(prev => prev ? `${prev}\n\n--- ${file.name} ---\n${content}` : content);
          toast.success(`📃 ${file.name} — added to text area`);
        };
        reader.readAsText(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = ev => {
        const b64 = (ev.target?.result as string).split(',')[1];
        const mimeType = getFileMimeType(file);
        setFiles(p => [...p, { base64: b64, mimeType, name: file.name, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleGenerate = async () => {
    if (!text.trim() && files.length === 0) { setError('Paste text or upload a file first.'); return; }
    setLoading(true); setError(''); setRetryCount(0);
    try {
      let questions: QuizQuestion[] = [];
      if (!files.length && looksLikeMCQ(text)) {
        try { questions = localOfflineParser(text); } catch {}
      }
      if (!questions.length && aiPrefs.quizHelper !== 'off') {
        const userKeys = getUserApiKeys();
        const useCustomKey = aiPrefs.quizHelper === 'cloud';
        const data = await generateQuiz({
          text: text || undefined,
          files: files.map(f => ({ base64: f.base64, mimeType: f.mimeType })),
          difficulty: settings.difficulty,
          userGeminiKey: useCustomKey ? (userKeys.gemini || undefined) : undefined,
          userCohereKey: useCustomKey ? (userKeys.cohere || undefined) : undefined,
          userOpenaiKey: useCustomKey ? (userKeys.openai || undefined) : undefined,
        });
        questions = data.questions as QuizQuestion[];
        // Auto-fill topic/subject from AI response if not already set
        const firstWithTopic = data.questions.find((q: any) => q.topic?.trim());
        const firstWithSubject = data.questions.find((q: any) => q.subject?.trim());
        if (firstWithTopic && !settings.quizTitle) {
          set({ quizTitle: (firstWithTopic as any).topic.trim().slice(0, 60) });
        }
        if (firstWithSubject && !settings.subject) {
          set({ subject: (firstWithSubject as any).subject.trim().slice(0, 30) });
        }
      } else if (!questions.length) {
        try { questions = localOfflineParser(text); } catch {}
        if (!questions.length) {
          setError('🚫 AI is off. Paste MCQs in the required format (Q1(E). Question · (a)–(d) · Answer - (b) text · • explanation) and they will load instantly.');
          setLoading(false);
          return;
        }
      }
      const filtered = settings.difficulty === 'all' ? questions : questions.filter(q => q.difficulty === settings.difficulty);
      if (filtered.length === 0 && questions.length > 0) {
        toast('No questions matched that difficulty. Using all.');
        onStartQuiz(questions, targetFolderId);
      } else {
        onStartQuiz(filtered.length > 0 ? filtered : questions, targetFolderId);
      }
    } catch (e: any) {
      // ── Offline fallback: try local parser when AI fails ──
      if (text.trim() && looksLikeMCQ(text)) {
        try {
          const fallbackQs = localOfflineParser(text);
          if (fallbackQs.length > 0) {
            toast.success(`⚡ AI unavailable — parsed ${fallbackQs.length} questions offline!`);
            const filtered = settings.difficulty === 'all' ? fallbackQs : fallbackQs.filter(q => q.difficulty === settings.difficulty);
            onStartQuiz(filtered.length > 0 ? filtered : fallbackQs, targetFolderId);
            setLoading(false);
            return;
          }
        } catch { /* fallback also failed, show original error */ }
      }
      setRetryCount(prev => prev + 1);
      const msg = String(e?.message || '');
      if (msg.includes('quota') || msg.includes('spending cap') || msg.includes('billing') || msg.includes('🚫')) {
        setError('🚫 AI quota exceeded.');
      } else if (msg.includes('timed out') || msg.includes('⏱️')) {
        setError('⏱️ AI timed out.');
      } else if (msg.includes('overloaded')) {
        setError('AI service is busy.');
      } else {
        setError(msg || 'Failed to generate quiz.');
      }
    } finally { setLoading(false); }
  };

  const hasContent = text.trim().length > 0 || files.length > 0;

  return (
    <div className="animate-fade-in max-w-4xl mx-auto space-y-3">

      {/* ── Editing Active Quiz Banner ── */}
      {isEditingActiveQuiz && onReturnToQuiz && (
        <div className="flex flex-col xs:flex-row items-start xs:items-center gap-3 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl px-4 py-4 animate-fade-in">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xl flex-shrink-0">⚙️</span>
            <div>
              <p className="font-black text-foreground text-sm">Editing Active Quiz</p>
              <p className="text-xs text-foreground/50 mt-0.5">
                Modify your settings below, then return to your quiz.
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full xs:w-auto">
            <button
              onClick={() => { if (onDiscardSession) onDiscardSession(); }}
              className="flex-1 xs:flex-none text-xs text-foreground/35 hover:text-foreground/70 px-3 py-2.5 rounded-xl border border-border transition-colors"
            >
              Discard Quiz
            </button>
            <button
              onClick={onReturnToQuiz}
              className="flex-1 xs:flex-none flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/25 active:scale-[0.98]"
            >
              <Play className="w-4 h-4" /> Return to Quiz
            </button>
          </div>
        </div>
      )}

      {/* ── Session Recovery Banner (normal — not mid-edit) ── */}
      {hasSavedSession && !isEditingActiveQuiz && onResumeSession && (
        <div className="flex flex-col xs:flex-row items-start xs:items-center gap-3 bg-primary/10 border border-primary/20 rounded-2xl px-4 py-4">
          <div className="flex items-center gap-3 flex-1">
            <span className="text-xl flex-shrink-0">💾</span>
            <div>
              <p className="font-black text-foreground text-sm">Quiz in progress</p>
              <p className="text-xs text-foreground/50 mt-0.5">Resume where you left off, or start fresh.</p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full xs:w-auto">
            <button
              onClick={() => { if (onDiscardSession) onDiscardSession(); else { localStorage.removeItem('qmp_active_session'); window.location.reload(); } }}
              className="flex-1 xs:flex-none text-xs text-foreground/35 hover:text-foreground/70 px-3 py-2.5 rounded-xl border border-border transition-colors"
            >
              Discard
            </button>
            <button
              onClick={onResumeSession}
              className="flex-1 xs:flex-none flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-primary/25 active:scale-[0.98]"
            >
              <Play className="w-4 h-4" /> Resume
            </button>
          </div>
        </div>
      )}

      {/* Bulk Import Modal */}
      <BulkImportModal
        open={showBulkImport}
        onClose={() => setShowBulkImport(false)}
        onImport={onStartQuiz}
        onSaveAsCollection={(qs, name) => {
          createFile(loadFileTree(), ROOT_ID, name, qs, settings.subject ? [settings.subject] : []);
        }}
      />

      {/* Highlighter View */}
      {showHighlighter && (
        <div className="glass-card p-5 mb-4">
          <HighlighterView
            text={text}
            onGenerate={async (highlighted) => {
              setShowHighlighter(false);
              setText(highlighted);
              // Trigger generate with the highlighted text
            }}
            onClose={() => setShowHighlighter(false)}
            loading={loading}
          />
        </div>
      )}

      {/* Format Guide Modal */}
      <FormatGuideModal open={showFormatGuide} onClose={() => setShowFormatGuide(false)} />

      {/* Photo Quiz Modal (OCR) */}
      <PhotoQuizModal
        open={showPhotoQuiz}
        onClose={() => setShowPhotoQuiz(false)}
        onImport={onStartQuiz}
      />

      {/* Export & Import Modal */}
      <QuizExportImportModal
        open={showExportImport}
        onClose={() => setShowExportImport(false)}
        history={history}
        onStartQuiz={onStartQuiz}
        initialTab="import"
        onImportToHistory={(records) => {
          // Merge imported results into localStorage
          let existing: QuizResult[] = [];
          try { existing = getHistorySync(); } catch { /* */ }
          const merged = new Map<number, QuizResult>();
          for (const r of existing) merged.set(r.timestamp, r);
          for (const r of records) merged.set(r.timestamp, r);
          const arr = Array.from(merged.values()).sort((a, b) => b.timestamp - a.timestamp).slice(0, 200);
          setHistory(arr);
        }}
      />

      {/* ── Top Action Row ── */}
      <div className="space-y-2 px-1">
        <div className="flex items-center gap-2">
          <span className="text-base leading-none">📝</span>
          <span className="text-[11px] font-black text-foreground/40 uppercase tracking-[0.12em]">Custom Quiz</span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-0.5">
          {/* ── Left: AI & Controls ── */}
          <AISourceControls prefs={aiPrefs} onChange={(p) => { onAiPrefsChange(p); if (p.reportHelper !== aiPrefs.reportHelper) onReportHelperChange(p.reportHelper); }} />
          <ShuffleControlsButton
            shuffleQuestions={settings.shuffleQuestions}
            shuffleOptions={settings.shuffleOptions}
            onToggleQuestions={v => set({ shuffleQuestions: v })}
            onToggleOptions={v => set({ shuffleOptions: v })}
          />
          {featureVisibility?.photoQuiz !== false && (
            <button
              onClick={() => setShowPhotoQuiz(true)}
              className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-foreground/10 px-2.5 py-2 rounded-xl transition-all active:scale-95"
              title="Quick quiz from photo (OCR)"
            >
              📷 <span className="hidden xs:inline">Photo</span>
            </button>
          )}
          {featureVisibility?.highlighter !== false && (
            <button
              onClick={() => { if (text.trim().length > 10) setShowHighlighter(true); else toast('📖 Paste at least 10 characters first', { duration: 2000 }); }}
              className={`flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-2 rounded-xl transition-all active:scale-95 ${
                text.trim().length > 10
                  ? 'text-amber-400/70 hover:text-amber-400 bg-amber-500/5 border border-amber-500/20'
                  : 'text-foreground/20 bg-foreground/3 border border-foreground/5 cursor-not-allowed'
              }`}
              title="Highlight text to create targeted quiz"
            >
              📖 <span className="hidden xs:inline">Highlight</span>
            </button>
          )}
          <CopyPromptButton />
          <button
              onClick={() => setShowFormatGuide(true)}
              className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-foreground/10 px-2.5 py-2 rounded-xl transition-all active:scale-95"
              title="Quiz format guide & tips"
            >
              📋 <span className="hidden xs:inline">Format</span>
            </button>

          {/* ── Separator ── */}
          <div className="flex-shrink-0 w-px h-6 bg-border/60 mx-0.5" />

          {/* ── Right: Import & Export ── */}
          {featureVisibility?.csvImport !== false && (
            <button
              onClick={() => setShowBulkImport(true)}
              className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-foreground/10 px-2.5 py-2 rounded-xl transition-all active:scale-95"
              title="Bulk import from CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> <span className="hidden xs:inline">CSV</span>
            </button>
          )}
          <button
              onClick={() => setShowExportImport(true)}
              className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-bold text-foreground/40 hover:text-foreground/70 bg-foreground/5 border border-foreground/10 px-2.5 py-2 rounded-xl transition-all active:scale-95"
              title="Export & Import quizzes"
            >
              ↔️ <span className="hidden xs:inline">Export/Import</span>
            </button>
        </div>
      </div>

      {/* ── Main Form Card ── */}
      <div className="glass-card overflow-hidden">

        {/* Section 1: Identity */}
        <div className="px-4 sm:px-6 md:px-8 pt-6 pb-5 space-y-4">
          {/* Quiz Name */}
          <div>
            <SectionLabel><BookOpen className="w-3 h-3" /> Quiz Name <span className="text-foreground/20 normal-case font-normal tracking-normal">— optional</span></SectionLabel>
            <div className="relative">
              <input
                type="text"
                value={settings.quizTitle}
                onChange={e => set({ quizTitle: e.target.value.slice(0, 60) })}
                placeholder="e.g. Chapter 5 · Mock Exam 1 · Daily Practice"
                maxLength={60}
                className="w-full bg-foreground/[0.04] border border-foreground/[0.08] hover:border-foreground/15 focus:border-primary/50 rounded-xl px-4 py-3.5 text-sm text-foreground placeholder-foreground/25 focus:outline-none transition-colors pr-14"
              />
              <span className={`absolute right-3.5 top-1/2 -translate-y-1/2 text-[10px] font-bold tabular-nums pointer-events-none ${settings.quizTitle.length > 50 ? 'text-amber-400' : 'text-foreground/20'}`}>
                {settings.quizTitle.length}/60
              </span>
            </div>
            {/* Quiz type chips — Horizontal Swipe Row */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 -mx-1 px-1 scroll-smooth mt-3">
              {QUIZ_TYPES.map(s => {
                const full = s.label;
                const isActive = settings.quizTitle === full || settings.quizTitle === `${s.emoji} ${s.label}`;
                return (
                  <button
                    key={s.label}
                    onClick={() => set({ quizTitle: isActive ? '' : full })}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 text-xs font-semibold border px-3 py-2 rounded-xl transition-all active:scale-95 ${
                      isActive
                        ? 'bg-primary/20 border-primary/40 text-foreground shadow-sm'
                        : 'bg-foreground/[0.04] border-border text-foreground/50 hover:text-foreground/75'
                    }`}
                  >
                    <span className="text-sm leading-none">{s.emoji}</span>
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Templates — Collapsible + Horizontal Slider */}
          {featureVisibility?.templates !== false && (
            <TemplateSlider
              settings={settings}
              onSettingsChange={onSettingsChange}
              rationalePrefs={rationalePrefs}
              onRationalePrefsChange={onRationalePrefsChange}
            />
          )}

          {/* Subject / Topic */}
          <SubjectManager
            selectedSubject={settings.subject}
            onSelect={(subj) => { manualSubjectRef.current = true; set({ subject: subj }); }}
          />

          {/* Folder Selector */}
          {featureVisibility?.folderSelector !== false && (
            <>
              <FolderSelector selectedId={targetFolderId} onSelect={(id) => { manualFolderRef.current = true; setTargetFolderId(id); setAutoMatchedFolderName(null); }} />
              {autoMatchedFolderName && targetFolderId && (
                <div className="flex items-center gap-1.5 mt-1.5 px-1 animate-fade-in">
                  <span className="text-[9px] font-bold text-emerald-400/80 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">🎯 Auto-matched: {autoMatchedFolderName}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Section 2: Content */}
        <div className="px-4 sm:px-6 md:px-8 py-5 space-y-3">
          {/* Supported types */}
          <div className="flex flex-wrap items-center gap-1 mb-1">
            <span className="text-[9px] text-foreground/25 font-medium">Supported:</span>
            {['📄 PDF', '🖼️ IMG', '📝 DOCX', '📃 TXT', '📋 MD'].map(t => (
              <span key={t} className="text-[9px] text-foreground/25 bg-foreground/[0.04] border border-foreground/[0.06] px-1.5 py-0.5 rounded-md font-medium">{t}</span>
            ))}
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={async () => {
                try {
                  const t = await navigator.clipboard.readText();
                  setText(t);
                  toast.success('Pasted!');
                } catch {
                  toast.error('Clipboard blocked — paste manually (Ctrl+V).');
                }
              }}
              disabled={loading}
              className="flex items-center gap-2 bg-foreground/5 border border-foreground/10 text-foreground/60 text-xs font-bold py-2.5 px-3 rounded-xl transition-all active:scale-95 active:bg-foreground/10 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Clipboard className="w-3.5 h-3.5" /> Paste
            </button>
            <label className={`flex items-center gap-2 bg-foreground/5 border border-foreground/10 text-foreground/60 text-xs font-bold py-2.5 px-3 rounded-xl transition-all active:scale-95 ${loading ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
              <Upload className="w-3.5 h-3.5" /> Upload
              <input
                ref={fileRef}
                type="file"
                accept="image/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown,.md,.txt,.doc,.docx"
                multiple
                className="hidden"
                onChange={handleFileAdd}
              />
            </label>
            {hasSavedDraft && (
              <button
                onClick={() => { const draft = localStorage.getItem('qmp_input') || ''; setText(draft); toast.success('📝 Draft loaded!'); }}
                className="flex items-center gap-1.5 text-xs text-primary/60 hover:text-primary bg-primary/5 border border-primary/15 py-2.5 px-3 rounded-xl transition-all active:scale-95 font-bold"
              >
                ↻ Load Draft
              </button>
            )}
            {(text || files.length > 0) && (
              <button
                onClick={() => { setText(''); setFiles([]); setError(''); localStorage.removeItem('qmp_input'); }}
                className="ml-auto flex items-center gap-1.5 text-xs text-foreground/25 active:text-red-400 transition-colors font-medium py-3 px-2"
              >
                <X className="w-3.5 h-3.5" /> Clear
              </button>
            )}
          </div>

          {/* Smart paste detection — live question count */}
          {detection && (() => {
            const isMcq = detection.total > 0;
            const bad = detection.issues.length;
            const formatOnly = !isMcq && bad > 0; // tried the MCQ format, but no question is valid
            return (
              <div className={`px-3 py-2.5 rounded-xl border text-[11px] font-bold animate-fade-in space-y-1.5 ${
                isMcq
                  ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                  : formatOnly
                    ? 'bg-amber-500/8 border-amber-500/25 text-amber-400'
                    : 'bg-primary/8 border-primary/20 text-primary/80'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-sm leading-none">{isMcq ? '⚡' : formatOnly ? '⚠️' : '🤖'}</span>
                  {isMcq ? (
                    <span className={detection.pending ? 'opacity-60' : ''}>
                      <span className="text-base font-black tabular-nums">{detection.total}</span>{' '}
                      question{detection.total !== 1 ? 's' : ''} detected — will load instantly (no AI needed)
                    </span>
                  ) : formatOnly ? (
                    <span>No question matches the required format yet</span>
                  ) : (
                    <span>Notes detected · {detection.words.toLocaleString()} words — AI will generate questions from your text</span>
                  )}
                </div>
                {bad > 0 && (
                  <div className="pl-6 space-y-0.5 text-amber-400 font-semibold">
                    <p>⚠ {bad} question{bad !== 1 ? 's' : ''} skipped — not in the required format:</p>
                    {detection.issues.slice(0, 5).map(iss => (
                      <p key={iss.line} className="text-[10px] text-amber-400/80">{iss.label}: {iss.reason} <span className="opacity-60">(line {iss.line})</span></p>
                    ))}
                    {bad > 5 && <p className="text-[10px] text-amber-400/60">…and {bad - 5} more</p>}
                  </div>
                )}
                {detection.duplicates.length > 0 && (
                  <div className="pl-6 space-y-0.5 text-amber-400 font-semibold">
                    <p>⚠ Duplicate question{detection.duplicates.length !== 1 ? 's' : ''}: {detection.duplicates.slice(0, 5).join(' · ')}{detection.duplicates.length > 5 ? ' …' : ''}</p>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => { setText(e.target.value); setError(''); }}
            disabled={loading}
            rows={5}
            placeholder={`Paste your MCQs here — works offline too!\n\n${MCQ_SAMPLE}\n\nOr paste study notes — AI will generate questions.`}
            className="w-full p-3 sm:p-4 rounded-2xl bg-foreground/[0.04] border border-foreground/[0.08] text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40 transition-colors resize-y thin-scrollbar leading-relaxed min-h-[120px]"
            style={{ fontSize: '16px' }}
          />

          {/* File attachments */}
          {files.length > 0 && (
            <div className="p-4 rounded-2xl bg-primary/[0.06] border border-primary/15">
              <div className="flex justify-between items-center mb-3">
                <span className="text-xs font-bold text-foreground/50">
                  Attached <span className="text-primary/60">({files.length}/5)</span>
                </span>
                <button onClick={() => setFiles([])} className="text-[10px] text-red-400/60 active:text-red-400 font-bold uppercase tracking-wider">
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-foreground/[0.05] border border-foreground/[0.08] px-3 py-2 rounded-xl max-w-[200px]">
                    <span className="text-sm leading-none flex-shrink-0">
                      {f.mimeType === 'application/pdf' ? '📄'
                        : f.mimeType.startsWith('image/') ? '🖼️'
                        : f.mimeType.includes('word') ? '📝'
                        : <FileText className="w-3.5 h-3.5" />}
                    </span>
                    <span className="text-xs font-semibold text-foreground/75 truncate flex-1">{f.name}</span>
                    <button
                      onClick={() => setFiles(p => p.filter((_, j) => j !== i))}
                      className="text-foreground/25 active:text-red-400 flex-shrink-0 transition-colors ml-1 p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <GenerationErrorCard
              error={error}
              retryCount={retryCount}
              hasText={!!text.trim()}
              onRetry={() => { setError(''); handleGenerate(); }}
              onRetrySimpler={() => {
                setError('');
                set({ difficulty: 'all' });
                toast('⚡ Switched to easier settings — retrying…');
                setTimeout(() => handleGenerate(), 100);
              }}
              onForceOffline={() => {
                setError('');
                if (!text.trim()) { setError('Paste text first.'); return; }
                try {
                  const qs = localOfflineParser(text);
                  toast.success(`⚡ Parsed ${qs.length} questions offline!`);
                  onStartQuiz(qs, targetFolderId);
                } catch (err: any) {
                  setError(`Could not load questions — ${err?.message || 'check the required format.'}`);
                }
              }}
            />
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Section 3: Generate CTA */}
        <div className="px-4 sm:px-6 md:px-8 py-5">
          <button
            onClick={handleGenerate}
            disabled={loading || !hasContent}
            className={`w-full flex items-center justify-center gap-2.5 font-black text-sm sm:text-base py-4 px-6 sm:px-8 rounded-2xl border transition-all ${
              hasContent && !loading
                ? 'bg-primary text-primary-foreground border-primary/20 shadow-lg shadow-primary/25 hover:brightness-110 active:scale-[0.99]'
                : 'bg-foreground/[0.04] border-foreground/[0.07] text-foreground/25 cursor-not-allowed'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Generating Quiz…</span>
              </>
            ) : (
              <>
                <Rocket className="w-5 h-5" />
                <span>Generate &amp; Start</span>
                {!hasContent && <span className="text-foreground/20 text-xs font-normal ml-1">(paste or upload first)</span>}
              </>
            )}
          </button>

          {history.length > 0 && (
            <p className="text-center text-[10px] text-foreground/25 font-medium mt-3">
              📊 {history.length} quiz{history.length !== 1 ? 'zes' : ''} in your history
            </p>
          )}
        </div>

        <div className="border-t border-border/50" />

        {/* Section 4: Settings & Rules — Ultra-premium Refined Toggle */}
        <div className="px-4 sm:px-6 md:px-8 py-4 bg-foreground/[0.015]">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setAdvancedSettingsOpen(p => !p)}
              className="flex items-center gap-2.5 text-left group flex-1 min-w-0"
            >
              <div className="w-8 h-8 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary group-hover:scale-105 transition-all shrink-0">
                <span className="text-sm">⚡</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-xs sm:text-sm font-black text-foreground">Settings &amp; Rules</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/20 shrink-0">
                    {advancedSettingsOpen ? 'Hide' : 'Customize'}
                  </span>
                </div>
                <p className="text-[10px] text-foreground/45 mt-0.5 font-medium truncate">
                  {settings.mode === 'live' ? '⚡ Instant' : '📋 Exam'} • {settings.difficulty === 'all' ? 'Mixed' : settings.difficulty} • {settings.timerMode === 'off' ? 'No timer' : settings.timerMode === 'per-question' ? `${settings.timerValue}${settings.timerUnit}/Q` : 'Total timer'} • {settings.marksPerQuestion}/Q{settings.negativeMarking ? ` (-${settings.negativeMarks})` : ''}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setAdvancedSettingsOpen(p => !p)}
              className="h-8 w-8 rounded-full border border-border/70 bg-card/60 flex items-center justify-center text-foreground/50 hover:text-foreground transition-all active:scale-95 shrink-0 ml-2"
              aria-label="Toggle settings"
            >
              <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${advancedSettingsOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {advancedSettingsOpen && (
            <div className="pt-3 animate-fade-in border-t border-border/40 mt-3">
              <SettingsPanel settings={settings} onChange={onSettingsChange} collapsible={true} />
            </div>
          )}
        </div>
      </div>

      {/* ── Sticky "Return to Quiz" FAB when editing active quiz ── */}
      {isEditingActiveQuiz && onReturnToQuiz && (
        <div className="sticky bottom-20 md:bottom-4 z-50 flex justify-center mt-4 pointer-events-none">
          <button
            onClick={onReturnToQuiz}
            className="pointer-events-auto flex items-center gap-2.5 bg-amber-500 hover:bg-amber-600 text-white font-black text-sm px-6 py-3.5 rounded-2xl shadow-2xl shadow-amber-500/40 transition-all active:scale-[0.97] animate-fade-in"
          >
            <Play className="w-4 h-4" />
            Return to Quiz
          </button>
        </div>
      )}
    </div>
  );
}
