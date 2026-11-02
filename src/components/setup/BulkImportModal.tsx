import { useState, useRef, useCallback } from 'react';
import { Upload, X, AlertTriangle, Check, FileSpreadsheet, ChevronDown, Download } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@project/components/ui/dialog';
import { QuizQuestion } from '../../types/quiz';
import { parseCSVText, autoMapColumns, validateAndConvert, ColumnMapping, RowError } from '../../utils/csvParser';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onClose: () => void;
  onImport: (questions: QuizQuestion[]) => void;
  onSaveAsCollection?: (questions: QuizQuestion[], name: string) => void;
}

type Step = 'upload' | 'preview' | 'result';

export default function BulkImportModal({ open, onClose, onImport, onSaveAsCollection }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<ColumnMapping>({
    question: -1, optionA: -1, optionB: -1, optionC: -1, optionD: -1,
    correctAnswer: -1, explanation: -1, difficulty: -1, subject: -1, imageUrl: -1,
  });
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [errors, setErrors] = useState<RowError[]>([]);
  const [collectionName, setCollectionName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setHeaders([]);
    setRows([]);
    setQuestions([]);
    setErrors([]);
    setCollectionName('');
  };

  const handleClose = () => { reset(); onClose(); };

  const handleFileOrText = useCallback((text: string) => {
    const parsed = parseCSVText(text);
    if (parsed.headers.length < 2 || parsed.rows.length === 0) {
      toast.error('Could not parse CSV. Ensure it has a header row and data rows.');
      return;
    }
    setHeaders(parsed.headers);
    setRows(parsed.rows);
    const autoMap = autoMapColumns(parsed.headers);
    setMapping(prev => ({ ...prev, ...autoMap }));
    setStep('preview');
  }, []);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      handleFileOrText(text);
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleValidate = () => {
    const { questions: qs, errors: errs } = validateAndConvert(rows, mapping);
    setQuestions(qs);
    setErrors(errs);
    setStep('result');
  };

  const handleStartQuiz = () => {
    if (questions.length === 0) { toast.error('No valid questions to import.'); return; }
    onImport(questions);
    handleClose();
    toast.success(`🎉 Imported ${questions.length} questions!`);
  };

  const handleSaveCollection = () => {
    if (!collectionName.trim()) { toast.error('Enter a collection name.'); return; }
    if (questions.length === 0) return;
    onSaveAsCollection?.(questions, collectionName.trim());
    handleClose();
    toast.success(`📁 Saved "${collectionName.trim()}" with ${questions.length} questions!`);
  };

  const downloadErrorCSV = () => {
    if (!errors.length) return;
    const csv = 'Row,Errors\n' + errors.map(e => `${e.row},"${e.errors.join('; ')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'import-errors.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  const colOptions = [{ value: -1, label: '— Skip —' }, ...headers.map((h, i) => ({ value: i, label: h }))];

  const mappingFields: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
    { key: 'question', label: 'Question', required: true },
    { key: 'optionA', label: 'Option A', required: true },
    { key: 'optionB', label: 'Option B', required: true },
    { key: 'optionC', label: 'Option C', required: false },
    { key: 'optionD', label: 'Option D', required: false },
    { key: 'correctAnswer', label: 'Correct Answer', required: true },
    { key: 'explanation', label: 'Explanation', required: false },
    { key: 'difficulty', label: 'Difficulty', required: false },
    { key: 'subject', label: 'Subject', required: false },
    { key: 'imageUrl', label: 'Image URL', required: false },
  ];

  const canValidate = mapping.question >= 0 && mapping.optionA >= 0 && mapping.optionB >= 0 && mapping.correctAnswer >= 0;

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="bg-card border-border text-foreground rounded-2xl max-w-lg mx-4 max-h-[85vh] overflow-y-auto p-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border">
          <DialogTitle className="text-foreground font-bold text-left flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-primary" />
            {step === 'upload' && 'Bulk Import Questions'}
            {step === 'preview' && 'Map Columns'}
            {step === 'result' && 'Import Results'}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Upload ── */}
        {step === 'upload' && (
          <div className="space-y-4 px-5 pb-5 pt-4">
            <p className="text-sm text-foreground/50 leading-relaxed">
              Upload a CSV file with your quiz questions. The file should have a header row with columns like
              Question, Option A, Option B, Option C, Option D, Correct Answer, etc.
            </p>

            <div className="border-2 border-dashed border-border rounded-2xl p-8 flex flex-col items-center gap-3 hover:border-primary/30 transition-colors">
              <Upload className="w-8 h-8 text-foreground/20" />
              <p className="text-sm font-bold text-foreground/50">Drop a CSV file or click to browse</p>
              <label className="cursor-pointer bg-primary text-primary-foreground text-sm font-bold px-5 py-2.5 rounded-xl transition-all active:scale-95">
                Choose CSV File
                <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv" className="hidden" onChange={handleFile} />
              </label>
            </div>

            <div className="relative flex items-center gap-3 py-2">
              <div className="flex-1 border-t border-border" />
              <span className="text-[10px] font-bold text-foreground/30 uppercase">or paste CSV text</span>
              <div className="flex-1 border-t border-border" />
            </div>

            <textarea
              rows={6}
              placeholder={'Question,Option A,Option B,Option C,Option D,Correct Answer\n"What is 2+2?","3","4","5","6","B"'}
              className="w-full p-4 rounded-2xl bg-muted/30 border border-border text-foreground placeholder-foreground/25 focus:outline-none focus:border-primary/40 resize-none text-sm font-mono"
              onKeyDown={e => {
                if (e.key === 'Enter' && e.metaKey) {
                  const ta = e.currentTarget;
                  if (ta.value.trim()) handleFileOrText(ta.value);
                }
              }}
              onBlur={e => {
                const val = e.currentTarget.value.trim();
                if (val && val.includes(',') && val.includes('\n')) handleFileOrText(val);
              }}
            />

            <div className="glass-card p-3">
              <p className="text-[10px] font-black text-foreground/40 uppercase tracking-widest mb-2">Supported Columns</p>
              <div className="flex flex-wrap gap-1.5">
                {['Question*', 'Option A*', 'Option B*', 'Option C', 'Option D', 'Correct Answer*', 'Explanation', 'Difficulty', 'Subject', 'Image URL'].map(c => (
                  <span key={c} className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${c.includes('*') ? 'bg-primary/10 border-primary/20 text-primary/80' : 'bg-muted/30 border-border text-foreground/40'}`}>
                    {c.replace('*', '')} {c.includes('*') && <span className="text-red-400">*</span>}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Step 2: Preview & Map ── */}
        {step === 'preview' && (
          <div className="space-y-4 px-5 pb-5 pt-4">
            <p className="text-sm text-foreground/50">
              Found <span className="font-bold text-foreground">{rows.length} rows</span> and <span className="font-bold text-foreground">{headers.length} columns</span>. Map each column to its field:
            </p>

            {/* Column mapping */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {mappingFields.map(({ key, label, required }) => (
                <div key={key} className="flex items-center gap-2">
                  <span className={`text-xs font-bold w-28 text-right flex-shrink-0 ${required ? 'text-foreground' : 'text-foreground/40'}`}>
                    {label} {required && <span className="text-red-400">*</span>}
                  </span>
                  <div className="relative flex-1">
                    <select
                      value={mapping[key]}
                      onChange={e => setMapping(m => ({ ...m, [key]: Number(e.target.value) }))}
                      className="w-full bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground focus:outline-none focus:border-primary/40 appearance-none pr-8"
                    >
                      {colOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-foreground/30 pointer-events-none" />
                  </div>
                </div>
              ))}
            </div>

            {/* Preview table */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="px-3 py-2 text-left font-black text-foreground/40">#</th>
                    {headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-black text-foreground/50 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, ri) => (
                    <tr key={ri} className="border-b border-border/50">
                      <td className="px-3 py-2 text-foreground/30 font-bold">{ri + 1}</td>
                      {row.map((cell, ci) => (
                        <td key={ci} className="px-3 py-2 text-foreground/70 max-w-[200px] truncate">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 5 && (
                <p className="text-center text-[10px] text-foreground/30 py-2">+ {rows.length - 5} more rows</p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={() => setStep('upload')} className="flex-1 text-sm font-bold py-3 rounded-xl border border-border text-foreground/50 hover:text-foreground transition-all">
                Back
              </button>
              <button
                onClick={handleValidate}
                disabled={!canValidate}
                className={`flex-1 text-sm font-bold py-3 rounded-xl transition-all active:scale-[0.98] ${canValidate ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground/30 cursor-not-allowed'}`}
              >
                Validate & Import
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3: Results ── */}
        {step === 'result' && (
          <div className="space-y-4 px-5 pb-5 pt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Check className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <span className="text-xl font-black text-emerald-400">{questions.length}</span>
                  <p className="text-[10px] text-foreground/40 font-bold">Valid Questions</p>
                </div>
              </div>
              <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <span className="text-xl font-black text-red-400">{errors.length}</span>
                  <p className="text-[10px] text-foreground/40 font-bold">Errors</p>
                </div>
              </div>
            </div>

            {/* Errors */}
            {errors.length > 0 && (
              <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-red-400">Row Errors</p>
                  <button onClick={downloadErrorCSV} className="flex items-center gap-1 text-[10px] font-bold text-red-400/70 hover:text-red-400 transition-colors">
                    <Download className="w-3 h-3" /> Download Report
                  </button>
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {errors.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-xs text-foreground/60">
                      <span className="font-bold text-red-400/70">Row {e.row}:</span> {e.errors.join(', ')}
                    </p>
                  ))}
                  {errors.length > 10 && <p className="text-[10px] text-foreground/30">+ {errors.length - 10} more errors</p>}
                </div>
              </div>
            )}

            {/* Actions */}
            {questions.length > 0 && (
              <div className="space-y-3">
                <button onClick={handleStartQuiz}
                  className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground font-bold text-sm py-3.5 rounded-xl shadow-lg shadow-primary/25 transition-all active:scale-[0.98]">
                  🚀 Start Quiz ({questions.length} Qs)
                </button>

                {onSaveAsCollection && (
                  <div className="flex gap-2">
                    <input
                      value={collectionName}
                      onChange={e => setCollectionName(e.target.value)}
                      placeholder="Collection name…"
                      className="flex-1 bg-muted/30 border border-border rounded-xl px-3 py-2.5 text-sm text-foreground placeholder-foreground/30 focus:outline-none focus:border-primary/40"
                    />
                    <button onClick={handleSaveCollection}
                      disabled={!collectionName.trim()}
                      className="text-sm font-bold px-5 py-2.5 rounded-xl border border-primary/30 text-primary hover:bg-primary/10 transition-all disabled:opacity-30">
                      📁 Save
                    </button>
                  </div>
                )}
              </div>
            )}

            <button onClick={reset} className="w-full text-sm font-bold py-3 rounded-xl border border-border text-foreground/50 hover:text-foreground transition-all">
              Import Another File
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
