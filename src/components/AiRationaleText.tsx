/**
 * AiRationaleText — renders any rationale (book or AI) as a compact bullet list.
 *
 *   Every point is its own list item (6px gap, line-height 1.5, hanging indent).
 *   Text is cleaned of emoji/symbols; the bullet is drawn by the app.
 *   • Optional "Why correct" / "Other options" sections (AI explanations):
 *       - correct part is always visible
 *       - other options are collapsible
 */
import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { rationaleRows } from '../lib/rationaleFormat';

const OTHER_HEADING = /(?:^|\n)\s*[✗✘×]?\s*\**\s*Other\s*options?\s*\**\s*:?\s*\**\s*/im;
const CORRECT_HEADING = /(?:^|\n)\s*[✓✔]?\s*\**\s*Why\s*correct\s*\**\s*:?\s*\**\s*/im;

function splitSections(text: string): { correctPart: string; otherPart: string } {
  const cleaned = text.replace(/\r\n?/g, '\n').trim();
  const otherMatch = cleaned.match(OTHER_HEADING);
  let correctPart = cleaned;
  let otherPart = '';
  if (otherMatch && otherMatch.index !== undefined) {
    otherPart = cleaned.slice(otherMatch.index + otherMatch[0].length).trim();
    correctPart = cleaned.slice(0, otherMatch.index).trim();
  }
  return { correctPart: correctPart.replace(CORRECT_HEADING, '').trim(), otherPart };
}

function Point({ text, muted = false }: { text: string; muted?: boolean }) {
  return (
    <li className={`relative pl-4 leading-[1.5] break-words ${muted ? 'text-foreground/60' : ''}`}>
      <span className="absolute left-0 top-0 select-none" aria-hidden="true">•</span>
      {text}
    </li>
  );
}

export default function AiRationaleText({ text, className = '' }: { text?: string | string[] | null; className?: string }) {
  const [othersOpen, setOthersOpen] = useState(false);
  const { correctPart, otherPart } = splitSections(Array.isArray(text) ? text.join('\n') : (text || ''));
  const correctRows = rationaleRows(correctPart);
  const otherRows = rationaleRows(otherPart);

  return (
    <div className={className}>
      <ul className="space-y-1.5 list-none m-0 p-0">
        {correctRows.map((r, i) => <Point key={`c${i}`} text={r.text} />)}
      </ul>

      {otherRows.length > 0 && (
        <div className="mt-3">
          <button
            onClick={(e) => { e.stopPropagation(); setOthersOpen(o => !o); }}
            className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 font-bold text-[11px] uppercase tracking-wider transition-colors py-1 group"
          >
            <span className="text-xs">✗</span>
            <span>Other Options</span>
            {othersOpen
              ? <ChevronUp className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
              : <ChevronDown className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />}
          </button>
          {othersOpen && (
            <ul className="mt-1.5 space-y-1.5 list-none p-0 animate-fade-in">
              {otherRows.map((r, i) => <Point key={`o${i}`} text={r.text} muted />)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
