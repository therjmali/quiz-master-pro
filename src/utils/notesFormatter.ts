/**
 * Overhauls Notes & Revision output for maximum readability:
 * - Uses clean structured bullet points for all concept entries
 * - Automatically bolds important keywords, concept titles, and terms
 * - Adds background highlighting (<mark>) and rich styling for critical key terms
 */

export function formatNotesForReadability(raw: string): string {
  if (!raw || !raw.trim()) return '';
  const lines = raw.split('\n');
  const formatted: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      formatted.push('');
      continue;
    }

    // Preserve headings
    if (line.startsWith('#')) {
      formatted.push(line);
      continue;
    }

    // Preserve horizontal rules
    if (line === '---' || line === '***' || line === '___') {
      formatted.push('---');
      continue;
    }

    // Preserve blockquotes
    if (line.startsWith('>')) {
      formatted.push(line);
      continue;
    }

    // Convert plain text paragraph lines into clean bullet points if not already a list item
    const isBullet = line.startsWith('- ') || line.startsWith('* ') || line.startsWith('• ') || /^\d+[.)]\s+/.test(line);
    if (!isBullet) {
      line = `• ${line}`;
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      line = `• ${line.slice(2)}`;
    }

    // Auto-bold key terms before colon or dash: e.g. "Term - definition" -> "**Term** - definition"
    // Also "Q1: explanation" -> "**Q1:** explanation"
    line = line.replace(/^(•|\d+[.)])\s+([A-Za-z0-9\s()/_]{2,30})\s*([:-])\s+/g, (match, prefix, term, sep) => {
      const cleanTerm = term.trim();
      if (cleanTerm.startsWith('**') && cleanTerm.endsWith('**')) return match;
      return `${prefix} **${cleanTerm}** ${sep} `;
    });

    // Add background highlighting (<mark>) to high-yield keyword anchors for a rich-text feel
    line = line.replace(/\b(Key Fact|Key Concept|Memory Aid|Important|Rule|Formula|Quick Recall|Common Mistake|Core Principle|Exam Tip|Mnemonics?)\b/gi, '<mark>$1</mark>');

    formatted.push(line);
  }

  return formatted.join('\n');
}
