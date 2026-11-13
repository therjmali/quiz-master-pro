import { useState } from 'react';
import Overlay from '../ui/Overlay';
import { X, Copy, Check } from 'lucide-react';
import { MCQ_SAMPLE, MCQ_RULES } from '../../utils/quizParser';

interface Props {
  open: boolean;
  onClose: () => void;
}

const EXAMPLE_MCQ = MCQ_SAMPLE;

const SECTIONS = [
  {
    id: 'format',
    emoji: '📋',
    title: 'Required MCQ Format',
    content: (
      <div className="space-y-3">
        <p className="text-xs text-foreground/60 leading-relaxed">
          Pasted MCQs must follow this exact format. Only questions that match it are counted and loaded:
        </p>
        <div className="space-y-2 text-[11px] text-foreground/70">
          {MCQ_RULES.map(r => <FormatRule key={r.label} label={r.label} example={r.example} />)}
        </div>
      </div>
    ),
  },
  {
    id: 'files',
    emoji: '📁',
    title: 'Supported File Types',
    content: (
      <div className="grid grid-cols-2 gap-2">
        {[
          { icon: '📄', ext: 'PDF', desc: 'Scanned or text PDFs' },
          { icon: '🖼️', ext: 'Images', desc: 'JPG, PNG, WebP' },
          { icon: '📝', ext: 'DOCX', desc: 'Word documents' },
          { icon: '📃', ext: 'TXT / MD', desc: 'Plain text & Markdown' },
        ].map(f => (
          <div key={f.ext} className="flex items-center gap-2 bg-foreground/[0.04] border border-border rounded-xl px-3 py-2.5">
            <span className="text-base">{f.icon}</span>
            <div>
              <p className="text-xs font-bold text-foreground/80">{f.ext}</p>
              <p className="text-[10px] text-foreground/40">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'ai',
    emoji: '🤖',
    title: 'How AI Generation Works',
    content: (
      <div className="space-y-2 text-xs text-foreground/60 leading-relaxed">
        <p><strong className="text-foreground/80">From Notes:</strong> Paste any study notes, textbook content, or lecture material. The AI reads it and generates MCQs with correct answers, distractors, and rationales.</p>
        <p><strong className="text-foreground/80">From Files:</strong> Upload PDFs or images of textbook pages. The AI extracts text via OCR and generates questions.</p>
        <p><strong className="text-foreground/80">Difficulty:</strong> Set difficulty in settings — AI adjusts question complexity accordingly.</p>
        <div className="bg-primary/8 border border-primary/15 rounded-xl p-2.5 mt-2">
          <p className="text-[10px] font-bold text-primary/80">💡 The AI prompt instructs the model to return a JSON array of questions with options, correct answers, difficulty levels, and rationales.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'offline',
    emoji: '⚡',
    title: 'Offline Parser',
    content: (
      <div className="space-y-2 text-xs text-foreground/60 leading-relaxed">
        <p>If your text follows the required MCQ format, the <strong className="text-foreground/80">offline parser</strong> loads it <em>instantly</em> — no AI, no internet needed!</p>
        <p>Any question that doesn't match the format is skipped, and the paste box tells you which one and why, so you can fix it.</p>
        <div className="flex items-center gap-2 bg-emerald-500/8 border border-emerald-500/15 rounded-xl p-2.5">
          <span className="text-sm">⚡</span>
          <p className="text-[10px] font-bold text-emerald-400/80">Look for the green "questions detected" badge — the number is exactly how many questions will load.</p>
        </div>
      </div>
    ),
  },
  {
    id: 'tips',
    emoji: '💡',
    title: 'Pro Tips',
    content: (
      <div className="space-y-2">
        {[
          { tip: 'Add "Topic: Chapter 5" at the top', desc: 'Auto-fills the quiz name' },
          { tip: 'Add "Subject: Biology" at the top', desc: 'Auto-fills the subject field' },
          { tip: 'Paste multiple MCQ sets at once', desc: 'Parser handles them all in one go' },
          { tip: 'Use CSV Import for spreadsheet MCQs', desc: 'Supports question,optA,optB,optC,optD,answer columns' },
          { tip: 'Upload up to 5 files at once', desc: 'Mix PDFs, images, and text (max 10MB each)' },
        ].map((t, i) => (
          <div key={i} className="flex items-start gap-2 bg-foreground/[0.03] border border-border rounded-xl px-3 py-2.5">
            <span className="text-amber-400 text-xs mt-0.5">✦</span>
            <div>
              <p className="text-xs font-bold text-foreground/80">{t.tip}</p>
              <p className="text-[10px] text-foreground/40">{t.desc}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
];

function FormatRule({ label, example }: { label: string; example: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] font-black text-primary/60 uppercase tracking-wider w-20 flex-shrink-0 pt-0.5">{label}</span>
      <code className="text-[10px] bg-foreground/[0.06] border border-border px-2 py-1 rounded-lg font-mono text-foreground/60 flex-1">{example}</code>
    </div>
  );
}

export default function FormatGuideModal({ open, onClose }: Props) {
  const [copied, setCopied] = useState(false);
  const [activeSection, setActiveSection] = useState('format');

  if (!open) return null;

  const handleCopyExample = () => {
    navigator.clipboard.writeText(EXAMPLE_MCQ).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  const currentSection = SECTIONS.find(s => s.id === activeSection) || SECTIONS[0];

  return (
    <Overlay open onClose={onClose} kind="sheet" layer="sheet" className="max-w-lg" label="Quiz format guide">
      <div className="flex min-h-0 flex-col">
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border/50 px-5 pb-3 pt-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center">
              <span className="text-base">📋</span>
            </div>
            <div>
              <h3 className="text-sm font-black text-foreground">Quiz Format Guide</h3>
              <p className="text-[10px] text-foreground/40 font-bold">How to create quizzes like a pro</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="qmp-panel-close-inline">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Section tabs */}
        <div className="flex gap-1 px-4 py-2.5 overflow-x-auto no-scrollbar border-b border-border/30 flex-shrink-0">
          {SECTIONS.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                activeSection === s.id
                  ? 'bg-primary/15 border border-primary/30 text-foreground'
                  : 'text-foreground/40 hover:text-foreground/60 border border-transparent'
              }`}
            >
              <span className="text-xs">{s.emoji}</span>
              {s.title}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="qmp-panel-body thin-scrollbar px-5 py-4">
          <div className="animate-fade-in" key={activeSection}>
            <h4 className="text-xs font-black text-foreground/60 uppercase tracking-widest mb-3 flex items-center gap-2">
              <span className="text-base">{currentSection.emoji}</span>
              {currentSection.title}
            </h4>
            {currentSection.content}
          </div>

          {/* Example MCQ block — always visible */}
          {activeSection === 'format' && (
            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[9px] font-black text-foreground/30 uppercase tracking-widest">Example</p>
                <button
                  onClick={handleCopyExample}
                  className="flex items-center gap-1 text-[10px] font-bold text-primary/70 hover:text-primary transition-colors"
                >
                  {copied ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy Example</>}
                </button>
              </div>
              <pre className="text-[10px] font-mono text-foreground/60 bg-foreground/[0.04] border border-border rounded-xl p-3 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                {EXAMPLE_MCQ}
              </pre>
            </div>
          )}
        </div>
      </div>
    </Overlay>
  );
}
