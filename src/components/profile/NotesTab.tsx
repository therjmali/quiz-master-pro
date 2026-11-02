import { useState, useMemo } from 'react';
import SearchInput, { SearchEmptyState } from '../shared/SearchInput';
import { usePersistedState } from '../../hooks/usePersistedState';
import { Sparkles, Download, FileText, Loader2, AlertCircle, WifiOff, Settings2, X, Search } from 'lucide-react';
import { Markdown } from '@project/components/markdown';
import { QuizResult } from '../../types/quiz';
import { getUserApiKeys, getActiveProvider, PROVIDER_INFO } from '../../utils/apiKeys';
import { generateOfflineNotes, noteEntriesToHtml, noteEntriesToText, NoteEntry } from '../../utils/offlineNotes';
import { generateNotes } from 'zitejs/api';
import { useNotesConfig } from '../../hooks/useNotesConfig';
import { toast } from 'sonner';

interface Props { history: QuizResult[]; rationaleCache: Record<string, string>; }
type NoteFilter = 'all' | 'wrong' | 'skipped';

function getFilename(subject?: string, ext = 'txt') {
  const d = new Date();
  return `${subject || 'Notes'}_${d.toISOString().slice(0, 10)}.${ext}`;
}

function stripMarkdown(text: string) {
  return text.replace(/^#{1,6}\s+/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/`([^`]+)`/g, '$1');
}

function downloadAsTxt(notes: string, subject?: string, entries?: NoteEntry[]) {
  const title = subject ? `${subject} – Study Notes` : 'Study Notes';
  const content = entries ? noteEntriesToText(entries, title).replace('\uFEFF', '') : stripMarkdown(notes);
  const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = getFilename(subject, 'txt'); a.click();
}

function openNotesAsPdf(notes: string, subject?: string, entries?: NoteEntry[]) {
  if (entries && entries.length > 0) {
    const title = subject ? `${subject} – Study Notes` : 'Study Notes';
    const html = noteEntriesToHtml(entries, title, false, subject);
    const win = window.open('', '_blank');
    if (!win) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = getFilename(subject, 'html'); a.click(); return; }
    win.document.open(); win.document.write(html); win.document.close();
    win.addEventListener('load', () => setTimeout(() => { win.focus(); win.print(); }, 600));
    return;
  }
  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const bodyHtml = notes.split('\n').map(l => l.startsWith('#') ? `<h${l.match(/^(#+)/)?.[0].length || 1}>${l.replace(/^#+\s/, '')}</h${l.match(/^(#+)/)?.[0].length || 1}>` : l.trim() ? `<p>${l.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>` : '').join('\n');
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Study Notes</title><style>body{font-family:serif;padding:40px;max-width:760px;margin:0 auto}h1,h2,h3{color:#1a40c8}@media print{@page{margin:15mm}}</style></head><body><div style="text-align:center;margin-bottom:24px"><h1>📚 Study Notes</h1><p style="color:#888">${dateStr}</p></div>${bodyHtml}</body></html>`;
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open(); win.document.write(html); win.document.close();
  win.addEventListener('load', () => setTimeout(() => { win.focus(); win.print(); }, 700));
}

export default function NotesTab({ history, rationaleCache }: Props) {
  const [filter, setFilter] = usePersistedState<NoteFilter>('notes_filter', 'all');
  const [selectedSubject, setSelectedSubject] = usePersistedState('notes_subject', 'all');
  const [questionCount, setQuestionCount] = usePersistedState('notes_q_count', '50');
  const [isGenerating, setIsGenerating] = useState(false);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [qCount, setQCount] = useState(0);
  const [isOffline, setIsOffline] = useState(false);
  const [noteEntries, setNoteEntries] = useState<NoteEntry[] | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const [noteSearch, setNoteSearch] = useState('');
  const { config, update: updateConfig, reset: resetConfig } = useNotesConfig();

  const subjects = useMemo(() => [...new Set(history.filter(r => r.subject).map(r => r.subject!))], [history]);
  const userKeys = getUserApiKeys();
  const provider = getActiveProvider(userKeys);
  const providerInfo = PROVIDER_INFO[provider];

  const styleToNoteType = (style: typeof config.style): 'compact' | 'detailed' => {
    return style === 'detailed' ? 'detailed' : 'compact';
  };

  const collectQuestions = () => {
    const qs: { question: string; correctAnswer: string; rationale?: string; subject?: string }[] = [];
    const seen = new Set<string>();
    const src = selectedSubject === 'all' ? history : history.filter(r => r.subject === selectedSubject);
    src.forEach(r => {
      (r.quizData || []).forEach((q, i) => {
        if (seen.has(q.question)) return;
        const ua = r.userAnswers[i];
        if (filter === 'wrong' && (ua === null || ua === q.correctAnswer)) return;
        if (filter === 'skipped' && ua !== null) return;
        seen.add(q.question);
        qs.push({ question: q.question, correctAnswer: q.correctAnswer, rationale: rationaleCache[q.question] || q.rationale, subject: r.subject });
      });
    });
    return qs.slice(0, parseInt(questionCount));
  };

  const handleGenerate = async () => {
    const questions = collectQuestions();
    if (!questions.length) { setError('No questions found with current filters.'); return; }
    setIsGenerating(true); setError(''); setNotes(''); setIsOffline(false); setNoteEntries(null);
    try {
      const data = await generateNotes({
        questions,
        subject: selectedSubject === 'all' ? undefined : selectedSubject,
        noteType: styleToNoteType(config.style),
        userGeminiKey: userKeys.gemini || undefined,
        userCohereKey: userKeys.cohere || undefined,
        userOpenaiKey: userKeys.openai || undefined,
      });
      setNotes(data.notes); setQCount(data.questionCount);
    } catch {
      try {
        const rawQs = collectQuestions().map(q => ({ question: q.question, options: ['N/A'], correctAnswer: q.correctAnswer, difficulty: 'medium' as const, rationale: q.rationale }));
        const subject = selectedSubject === 'all' ? undefined : selectedSubject;
        const entries = generateOfflineNotes(rawQs, subject, subject ? `${subject} – Study Notes` : 'Study Notes');
        setNoteEntries(entries);
        setNotes(noteEntriesToText(entries, subject ? `${subject} – Study Notes` : 'Study Notes').replace('\uFEFF', ''));
        setQCount(questions.length); setIsOffline(true);
      } catch (e2: any) { setError(e2.message || 'Failed to generate notes.'); }
    } finally { setIsGenerating(false); }
  };

  const filteredNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    if (!q || !notes) return notes;
    return notes.split('\n').filter(l => l.toLowerCase().includes(q)).join('\n');
  }, [notes, noteSearch]);

  return (
    <div className="space-y-4">
      {/* Provider badge */}
      <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${providerInfo.badge}`}>
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${provider !== 'system' ? 'bg-emerald-400' : 'bg-white/20'}`} />
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-bold ${providerInfo.color}`}>{providerInfo.label}</p>
          <p className="text-[10px] text-foreground/40">{provider !== 'system' ? 'Using your personal API key' : 'System key — add yours in API Keys tab'}</p>
        </div>
        <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${providerInfo.color}`} />
      </div>

      {/* Config Panel */}
      {showConfig && (
        <div className="bg-card rounded-2xl p-4 border border-primary/20 space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-foreground">⚙ Configure Notes</h3>
            <button onClick={() => setShowConfig(false)} className="text-foreground/30 hover:text-foreground/60"><X className="w-4 h-4" /></button>
          </div>

          {/* Style */}
          <div>
            <p className="text-[10px] text-foreground/40 font-black uppercase tracking-widest mb-2">Note Style</p>
            <div className="grid grid-cols-3 gap-2">
              {([['detailed', '📖 Detailed', 'Full explanation'], ['concise', '⚡ Concise', 'Key points only'], ['exam', '🎯 Exam Mode', 'High-yield bullets']] as [typeof config.style, string, string][]).map(([k, l, sub]) => (
                <button key={k} onClick={() => updateConfig({ style: k })}
                  className={`py-2.5 px-2 rounded-xl border text-center transition-all ${config.style === k ? 'bg-primary/15 border-primary/35' : 'bg-card border-white/8'}`}>
                  <p className="text-xs font-bold text-foreground">{l}</p>
                  <p className="text-[9px] text-foreground/35 mt-0.5">{sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div>
            <p className="text-[10px] text-foreground/40 font-black uppercase tracking-widest mb-2">Include Sections</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { key: 'includeExplanation' as const, label: '💡 Key Explanation' },
                { key: 'includeMnemonic'    as const, label: '🧠 Mnemonics' },
                { key: 'includeRelated'     as const, label: '🔗 Related Concepts' },
                { key: 'includeDifficulty'  as const, label: '📊 Difficulty Level' },
              ]).map(({ key, label }) => (
                <button key={key} onClick={() => updateConfig({ [key]: !config[key] })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all ${config[key] ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-card border-white/8'}`}>
                  <span className={`w-3 h-3 rounded-sm border flex-shrink-0 ${config[key] ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`} />
                  <span className="text-[11px] font-bold text-foreground/70">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group By */}
          <div>
            <p className="text-[10px] text-foreground/40 font-black uppercase tracking-widest mb-2">Group Notes By</p>
            <div className="flex gap-2">
              {([['subject', '🏷 Subject'], ['type', '📋 Type'], ['difficulty', '🎯 Difficulty']] as [typeof config.groupBy, string][]).map(([k, l]) => (
                <button key={k} onClick={() => updateConfig({ groupBy: k })}
                  className={`flex-1 text-xs font-bold py-2 rounded-xl border transition-all ${config.groupBy === k ? 'bg-primary/15 border-primary/35 text-foreground' : 'bg-card border-white/8 text-foreground/50'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button onClick={() => { resetConfig(); toast('Config reset to defaults'); }}
              className="flex-1 text-xs font-bold py-2.5 rounded-xl border border-white/10 text-foreground/50">Reset Defaults</button>
            <button onClick={() => { setShowConfig(false); toast.success('Config saved ✓'); }}
              className="flex-1 text-xs font-bold py-2.5 rounded-xl bg-primary text-primary-foreground">Save Config</button>
          </div>
        </div>
      )}

      {/* Filter controls */}
      <div className="bg-card rounded-2xl p-4 border border-white/5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-foreground/40">Generate Notes</h3>
          <button onClick={() => setShowConfig(!showConfig)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition-all ${showConfig ? 'bg-primary/15 border-primary/30 text-primary' : 'bg-foreground/5 border-border text-foreground/50 hover:text-foreground/70'}`}>
            <Settings2 className="w-3 h-3" /> Configure
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[9px] text-foreground/30 font-black uppercase tracking-wider mb-1.5">Questions From</label>
            <div className="space-y-1">
              {(['all', 'wrong', 'skipped'] as NoteFilter[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-primary/20 border border-primary/40 text-primary-foreground' : 'bg-foreground/5 border border-transparent text-foreground/50 hover:bg-foreground/10'}`}>
                  {f === 'all' ? '📚 All Questions' : f === 'wrong' ? '✗ Mistakes Only' : '⏭ Skipped Only'}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <div>
              <label className="block text-[9px] text-foreground/30 font-black uppercase tracking-wider mb-1.5">Subject</label>
              <select value={selectedSubject} onChange={e => setSelectedSubject(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:border-primary/40">
                <option value="all">All Subjects</option>
                {subjects.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[9px] text-foreground/30 font-black uppercase tracking-wider mb-1.5">Max Questions</label>
              <select value={questionCount} onChange={e => setQuestionCount(e.target.value)}
                className="w-full bg-card border border-border rounded-lg px-2.5 py-2 text-xs text-foreground focus:outline-none focus:border-primary/40">
                <option value="20">Last 20</option>
                <option value="50">Last 50</option>
                <option value="100">Last 100</option>
              </select>
            </div>
            <div className="flex items-center justify-between text-[10px] text-foreground/40 bg-white/3 rounded-lg px-2.5 py-2">
              <span>Style:</span>
              <span className="font-bold text-foreground/60 capitalize">{config.style}</span>
            </div>
          </div>
        </div>

        <button onClick={handleGenerate} disabled={isGenerating || !history.length}
          className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-primary hover:brightness-110 disabled:opacity-60 text-white font-black py-3.5 rounded-xl transition-all shadow-lg shadow-purple-900/30">
          {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating Notes…</> : <><Sparkles className="w-4 h-4" /> Generate Notes ✨</>}
        </button>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/25 rounded-xl text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
          </div>
        )}
      </div>

      {/* Notes Display */}
      {notes && (
        <div className="bg-card rounded-2xl border border-white/5 overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between p-4 border-b border-white/5 flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-foreground">📖 Study Notes</h3>
                {isOffline && (
                  <span className="flex items-center gap-1 text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
                    <WifiOff className="w-2.5 h-2.5" /> OFFLINE
                  </span>
                )}
              </div>
              <p className="text-[10px] text-foreground/40 mt-0.5">{qCount} questions · {selectedSubject === 'all' ? 'All Subjects' : selectedSubject}</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => downloadAsTxt(notes, selectedSubject === 'all' ? undefined : selectedSubject, noteEntries ?? undefined)}
                className="flex items-center gap-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-foreground/60 hover:text-foreground text-xs font-bold py-2 px-3 rounded-xl transition-all">
                <FileText className="w-3.5 h-3.5" /> TXT
              </button>
              <button onClick={() => openNotesAsPdf(notes, selectedSubject === 'all' ? undefined : selectedSubject, noteEntries ?? undefined)}
                className="flex items-center gap-1.5 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-bold py-2 px-3 rounded-xl transition-all">
                <Download className="w-3.5 h-3.5" /> PDF
              </button>
            </div>
          </div>

          {/* Search within notes */}
          <div className="px-4 pt-3 pb-0">
            <SearchInput size="sm" value={noteSearch} onChange={setNoteSearch} placeholder="Search within notes…" />
          </div>

          <div className="p-5 max-h-[520px] overflow-y-auto thin-scrollbar notes-book-page">
            {noteSearch.trim() && !filteredNotes ? (
              <SearchEmptyState query={noteSearch.trim()} onClear={() => setNoteSearch('')} noun="lines" />
            ) : (
            <Markdown className="prose-sm prose-invert max-w-none prose-headings:font-bold prose-h1:text-base prose-h2:text-sm prose-h3:text-sm prose-p:text-white/80 prose-p:leading-relaxed prose-strong:text-red-400 prose-strong:font-black prose-code:text-yellow-300 prose-code:bg-white/10 prose-code:px-1 prose-code:rounded prose-blockquote:border-l-violet-400 prose-blockquote:bg-violet-400/5 prose-blockquote:text-white/75 prose-blockquote:not-italic prose-table:text-xs prose-th:text-white prose-td:text-white/75 prose-hr:border-white/10 prose-li:text-white/70">
              {filteredNotes}
            </Markdown>
            )}
          </div>
        </div>
      )}

      {!notes && !isGenerating && (
        <div className="text-center py-10 text-foreground/20">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Configure options above and click Generate to create your personalized study notes.</p>
          <p className="text-xs mt-2 text-foreground/15">Works offline too — falls back to template-based notes if AI is unavailable.</p>
        </div>
      )}
    </div>
  );
}
