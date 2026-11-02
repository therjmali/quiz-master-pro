/**
 * PromptTool — responsive floating action button + modal.
 * Desktop: compact button in the corner with full modal.
 * Mobile Portrait: floating action button at bottom.
 * Mobile Landscape: slim horizontal bar.
 * Fully viewport-constrained — never clips.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Wand2, X, Send, Loader2, Copy, CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

const PROMPT_TEMPLATES = [
  { emoji: '📝', label: 'Generate MCQs', prompt: 'Generate 10 MCQ questions with 4 options each from the following notes:\n\n' },
  { emoji: '📖', label: 'Summarize Notes', prompt: 'Summarize the following study notes into key bullet points:\n\n' },
  { emoji: '🔍', label: 'Explain Topic', prompt: 'Explain the following topic in simple terms for exam preparation:\n\n' },
  { emoji: '💡', label: 'Memory Tricks', prompt: 'Create mnemonics and memory tricks for remembering:\n\n' },
  { emoji: '✅', label: 'Quick Quiz', prompt: 'Create a quick 5-question quiz to test understanding of:\n\n' },
  { emoji: '📊', label: 'Compare & Contrast', prompt: 'Create a comparison table between:\n\n' },
];

export default function PromptTool() {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const close = useCallback(() => { setOpen(false); }, []);

  // Focus textarea on open
  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 200);
  }, [open]);

  // Prevent body scroll when modal open on mobile
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleSubmit = async () => {
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setResult('');
    try {
      const { chatWithData } = await import('zitejs/api');
      const stream = chatWithData({
        message: prompt.trim(),
        conversationHistory: [],
        localSettings: '{}',
      });
      for await (const chunk of stream) {
        setResult(prev => prev + chunk);
      }
    } catch {
      setResult('❌ Failed to process. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      toast.success('Copied to clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch { toast.error('Could not copy'); }
  };

  const applyTemplate = (tmpl: typeof PROMPT_TEMPLATES[0]) => {
    setPrompt(tmpl.prompt);
    setResult('');
    setTimeout(() => textareaRef.current?.focus(), 100);
  };

  return (
    <>
      {/* ── Floating Trigger Button ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-[100] flex items-center justify-center bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:shadow-primary/50 transition-all active:scale-90 bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom,0px)+16px)] left-4 w-12 h-12 rounded-full md:bottom-6 md:left-6 md:w-auto md:h-auto md:rounded-2xl md:px-4 md:py-3"
          title="Quick Actions"
        >
          <Wand2 className="w-5 h-5 md:w-4 md:h-4 flex-shrink-0" />
          <span className="hidden md:inline ml-2 text-sm font-bold">Quick Actions</span>
        </button>
      )}

      {/* ── Modal ── */}
      {open && (
        <div className="fixed inset-0 z-[250] flex items-start justify-center pt-12 sm:pt-16 p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />

          {/* Modal Content — centered */}
          <div className="relative w-full bg-card border border-border rounded-2xl shadow-2xl max-h-[85vh] max-w-lg flex flex-col overflow-hidden animate-fade-in">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
                  <Wand2 className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-foreground">Quick Actions</h3>
                  <p className="text-[10px] text-foreground/40">Templates & tools</p>
                </div>
              </div>
              <button onClick={close}
                className="w-8 h-8 rounded-xl bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-destructive" />
              </button>
            </div>

            {/* Body — scrollable */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Templates */}
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-foreground/30 mb-2">Quick Templates</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {PROMPT_TEMPLATES.map((t, i) => (
                    <button key={i} onClick={() => applyTemplate(t)}
                      className="flex items-center gap-2 text-left text-[11px] font-semibold px-3 py-2.5 rounded-xl border border-border bg-foreground/[0.02] hover:bg-primary/10 hover:border-primary/20 text-foreground/60 hover:text-foreground transition-all active:scale-[0.97]">
                      <span className="text-base leading-none">{t.emoji}</span>
                      <span className="truncate">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Input */}
              <div>
                <textarea
                  ref={textareaRef}
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  placeholder="Type your prompt or paste study notes here…"
                  rows={4}
                  className="w-full bg-foreground/[0.03] border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Submit */}
              <button onClick={handleSubmit} disabled={!prompt.trim() || loading}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:brightness-110 text-primary-foreground font-bold text-sm py-3 rounded-xl transition-all active:scale-[0.97] disabled:opacity-40 disabled:cursor-not-allowed">
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Processing…</>
                  : <><Send className="w-4 h-4" /> Run Prompt</>
                }
              </button>

              {/* Result */}
              {result && (
                <div className="bg-foreground/[0.03] border border-border rounded-xl p-4 animate-fade-in">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-foreground/30">Result</p>
                    <button onClick={handleCopy}
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors">
                      {copied ? <><CheckCheck className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                  <div className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                    {result}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
