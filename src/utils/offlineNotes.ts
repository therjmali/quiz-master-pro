// Offline premium notes generator — converts MCQ data into textbook-style study notes
import { QuizQuestion } from '../types/quiz';

export type NoteEntry = {
  number: number;
  heading: string;       // declarative statement derived from question + answer
  bullets: string[];     // 1–3 bullet points from rationale
  answerWord: string;    // the correct answer (to highlight in red)
  difficulty: string;
};

function capitalizeFirst(s: string): string {
  if (!s) return s;
  const r = s.charAt(0).toUpperCase() + s.slice(1);
  return r.length > 80 ? r.slice(0, 77) + '...' : r;
}

function buildHeading(question: string, answer: string): string {
  const q = question.trim();
  const a = answer.trim();

  // Rule 3 — blank ___
  if (/_{2,}/.test(q)) {
    const h = q.replace(/_{2,}/g, a).replace(/[?:]+$/, '').trim();
    return capitalizeFirst(h);
  }

  // Rule 1 — ends with "is:" / "are:" / "was:"
  if (/\b(is|are|was):?\s*$/i.test(q)) {
    const h = q.replace(/\b(is|are|was):?\s*$/i, (_, verb) => `${verb} ${a}`);
    return capitalizeFirst(h.replace(/[?]+$/, '').trim());
  }

  // Rule 2 — starts with question word
  if (/^(which|what|who|where|when|how)\b/i.test(q)) {
    const core = q.replace(/^(which|what|who|where|when|how)\s+/i, '').replace(/[?]+$/, '').trim();
    return capitalizeFirst(`${a} — ${core}`);
  }

  // Rule 4 — fallback
  const base = q.replace(/[?]+$/, '').trim().toLowerCase();
  return capitalizeFirst(`${a} is ${base}`);
}

function buildBullets(q: QuizQuestion): string[] {
  const rationale = (q.rationale || '').trim();
  if (rationale.length > 14) {
    const sentences = rationale
      .split(/[.;]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10);
    if (sentences.length > 0) return sentences.slice(0, 3); // Max 3 bullet points
  }
  // Meaningful fallback when rationale is empty
  const base = q.question.replace(/[?:]+$/, '').trim().toLowerCase();
  return [`${q.correctAnswer} is the correct answer for: ${base}`];
}

/** Convert MCQ questions into structured NoteEntry[] */
export function generateOfflineNotes(
  questions: QuizQuestion[],
  subject?: string,
  title?: string
): NoteEntry[] {
  return questions.map((q, i) => ({
    number: i + 1,
    heading: buildHeading(q.question, q.correctAnswer),
    bullets: buildBullets(q),
    answerWord: q.correctAnswer.trim(),
    difficulty: q.difficulty,
  }));
}

// ─── Highlight helpers ────────────────────────────────────────────────────────

/** Highlight answerWord in already-escaped HTML text (case-insensitive, red bold span, preserves original case) */
function highlightHtml(escapedText: string, rawAnswerWord: string): string {
  if (!rawAnswerWord) return escapedText;
  const escapedAnswer = esc(rawAnswerWord);
  if (!escapedAnswer) return escapedText;
  const regexSafe = escapedAnswer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${regexSafe})`, 'gi');
  return escapedText.replace(re, match => `<span class="answer-word">${match}</span>`);
}

/** Highlight answerWord in plain text (ALL CAPS, adds ← Answer on first occurrence per entry) */
function highlightText(text: string, answerWord: string, addMarker = false): string {
  if (!answerWord) return text;
  const escaped = answerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(${escaped})`, 'gi');
  let firstDone = false;
  return text.replace(re, (match) => {
    const upper = match.toUpperCase();
    if (!firstDone && addMarker) {
      firstDone = true;
      return `${upper} (← Answer)`;
    }
    return upper;
  });
}

function getFormattedDate(): string {
  return (
    new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' }) +
    ' · ' +
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
  );
}

function esc(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── HTML renderer ────────────────────────────────────────────────────────────

/** Convert NoteEntry[] to a complete HTML document matching the textbook screenshot */
export function noteEntriesToHtml(
  entries: NoteEntry[],
  title: string,
  forPrint = false,
  subject?: string
): string {
  const safeTitle = esc(title);
  const safeSubject = subject ? esc(subject) : '';

  // Build the subject/title header section
  const showSubject = safeSubject && safeSubject.toLowerCase().trim() !== safeTitle.toLowerCase().trim();
  const titleSectionHtml = showSubject
    ? `<div style="text-align:center;margin-bottom:36px;padding-bottom:16px;border-bottom:2.5px solid #1a56db;">
        <div style="font-size:9pt;font-weight:800;color:#6366f1;letter-spacing:0.18em;text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:6px;">📚 SUBJECT / TOPIC</div>
        <div style="font-size:22pt;font-weight:900;color:#1a56db;letter-spacing:0.04em;text-transform:uppercase;font-family:Arial,sans-serif;margin-bottom:8px;">${safeSubject}</div>
        <div style="font-size:12pt;font-weight:600;color:#374151;font-family:Arial,sans-serif;">${safeTitle}</div>
      </div>`
    : `<div class="notes-title">${safeTitle}</div>`;

  const entriesHtml = entries.map((entry) => {
    const headingHtml = highlightHtml(esc(entry.heading), entry.answerWord);
    const bulletsHtml = entry.bullets
      .slice(0, 3) // Max 3 bullets
      .map((b) => {
        const bHighlighted = highlightHtml(esc(b), entry.answerWord);
        return `<div class="note-bullet">
      <span class="bulb">•</span>
      <span class="bullet-text">${bHighlighted}</span>
    </div>`;
      })
      .join('');

    return `<div class="note-entry">
  <div class="note-heading"><span class="num">(${entry.number})</span> — ${headingHtml}</div>
  <div class="note-bullets">
    <div class="note-bullets-label">💡 Key Points:</div>
    ${bulletsHtml}
  </div>
</div>`;
  }).join('\n');

  const printBar = forPrint
    ? ''
    : `<div class="print-bar">
  <span>📄 ${safeTitle} — R.J Quiz Study Notes</span>
  <button class="print-btn" onclick="window.print()">🖨 Print / Save as PDF</button>
</div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${safeTitle}</title>
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Georgia','Times New Roman',Times,serif;font-size:12pt;line-height:1.8;color:#1a1a1a;background:#fffdf8;max-width:750px;margin:0 auto;padding:40px 50px 60px;border-left:1px solid #e8e0d4;border-right:1px solid #e8e0d4;box-shadow:0 0 40px rgba(0,0,0,0.05)}
  .print-bar{background:#1e3a8a;color:#fff;padding:10px 18px;border-radius:10px;margin-bottom:28px;display:flex;justify-content:space-between;align-items:center;font-size:12px}
  .print-btn{background:#3b82f6;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:700}
  .notes-title{text-align:center;font-size:18pt;font-weight:900;color:#1a56db;letter-spacing:.04em;text-transform:uppercase;margin-bottom:36px;padding-bottom:12px;border-bottom:2.5px solid #1a56db;font-family:'Arial',sans-serif}
  .note-entry{margin-bottom:32px}
  .note-heading{font-size:13pt;font-weight:700;color:#1a1a1a;margin-bottom:10px;font-family:'Georgia','Times New Roman',serif;line-height:1.5;border-left:3px solid #1a56db;padding-left:12px}
  .note-heading .num{color:#1a56db;font-weight:900;font-family:'Arial',sans-serif}
  .note-bullets{padding-left:20px;margin-top:6px;background:#f8f9fc;border-radius:8px;padding:10px 14px;border:1px solid #e8eaf0}
  .note-bullets-label{font-size:9pt;font-weight:800;color:#6366f1;letter-spacing:0.05em;margin-bottom:4px;display:flex;align-items:center;gap:6px}
  .note-bullet{display:flex;align-items:flex-start;gap:8px;margin-bottom:4px;font-size:11pt;line-height:1.7;color:#333}
  .note-bullet .bulb{font-size:9pt;flex-shrink:0;margin-top:5px;color:#6366f1;line-height:1}
  .note-bullet .bullet-text{flex:1}
  .answer-word{color:#dc2626;font-weight:900;font-style:normal;background:rgba(220,38,38,0.06);padding:0 3px;border-radius:3px}
  .notes-footer{margin-top:40px;padding-top:12px;border-top:1px solid #ccc;text-align:center;font-size:9pt;color:#888;font-family:Arial,sans-serif}
  @media print{
    body{padding:0;max-width:100%}
    .print-bar{display:none!important}
    .note-entry{page-break-inside:avoid}
    @page{size:A4;margin:18mm 15mm}
    -webkit-print-color-adjust:exact;print-color-adjust:exact
  }
</style>
</head>
<body>
${printBar}
${titleSectionHtml}
${entriesHtml}
<div class="notes-footer">
  Generated by R.J Quiz &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
  &nbsp;·&nbsp; Total: ${entries.length} notes
</div>
</body>
</html>`;
}

// ─── Text renderer ────────────────────────────────────────────────────────────

/** Convert NoteEntry[] to plain text with UTF-8 BOM (for Windows Notepad compat) */
export function noteEntriesToText(entries: NoteEntry[], title: string): string {
  const BOM = '\uFEFF';
  const hr = '══════════════════════════════════════════════════════';
  const lines: string[] = [
    hr,
    `  ${title.toUpperCase()}`,
    hr,
    `Generated: ${getFormattedDate()} · R.J Quiz Study Notes`,
    `Total: ${entries.length} notes`,
    hr,
    '',
    '',
  ];

  entries.forEach((entry) => {
    const headingHighlighted = highlightText(entry.heading, entry.answerWord, false);
    lines.push(`(${entry.number}) — ${headingHighlighted}`, '');
    lines.push('  💡 Key Points:');
    entry.bullets.slice(0, 3).forEach((b, bi) => {
      const highlighted = highlightText(b, entry.answerWord, bi === 0);
      lines.push(`     • ${highlighted}`);
    });
    lines.push('', '──────────────────────────────────────────────────────', '');
  });

  lines.push('──────────────────────────────────────────────────────');
  lines.push('  END OF NOTES · R.J Quiz');
  lines.push('──────────────────────────────────────────────────────');

  return BOM + lines.join('\n');
}

// ─── Legacy compat ────────────────────────────────────────────────────────────

export function generateOfflineNotesFromText(rawText: string): string {
  const textLines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const result: string[] = ['OFFLINE EXTRACTED NOTES', ''];
  let i = 0;
  textLines.forEach((line) => {
    if (line.length > 8 && !line.match(/^[(\d]/) && line.match(/^[A-Z]/)) {
      i++;
      result.push(`(${i}) ${line}`, '', `     ✓ ANSWER: `, '', '💡   Key point extracted from source', '');
      result.push('──────────────────────────────────────────────────────────', '');
    }
  });
  return result.join('\n') || rawText;
}
