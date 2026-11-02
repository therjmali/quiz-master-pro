/**
 * Convert revision-sheet markdown into styled HTML for in-app preview & download.
 * Mirrors the styling from the revisionSheetPdf backend endpoint.
 */

function escapeHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function processInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>');
}

export function buildRevisionSheetHtml(
  markdownContent: string,
  opts?: { quizTitle?: string; subject?: string },
): string {
  const lines = markdownContent.split('\n');
  let bodyHtml = '';
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      continue;
    }
    if (trimmed.startsWith('## ')) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      bodyHtml += `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      continue;
    }
    if (trimmed.startsWith('### ')) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      const text = escapeHtml(trimmed.slice(4));
      let cls = 'section-default';
      if (text.includes('📌')) cls = 'section-facts';
      else if (text.includes('🧠')) cls = 'section-memory';
      else if (text.includes('❌')) cls = 'section-mistakes';
      else if (text.includes('⚡')) cls = 'section-recall';
      bodyHtml += `<h3 class="${cls}">${text}</h3>`;
      continue;
    }
    if (trimmed.startsWith('> ')) {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      bodyHtml += `<blockquote>${processInline(escapeHtml(trimmed.slice(2)))}</blockquote>`;
      continue;
    }
    if (trimmed === '---' || trimmed === '***') {
      if (inList) { bodyHtml += '</ul>'; inList = false; }
      bodyHtml += '<hr />';
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inList) { bodyHtml += '<ul>'; inList = true; }
      bodyHtml += `<li>${processInline(escapeHtml(trimmed.slice(2)))}</li>`;
      continue;
    }
    if (inList) { bodyHtml += '</ul>'; inList = false; }
    bodyHtml += `<p>${processInline(escapeHtml(trimmed))}</p>`;
  }
  if (inList) bodyHtml += '</ul>';

  const title = opts?.quizTitle ? escapeHtml(opts.quizTitle) : 'Revision Sheet';
  const subtitle = opts?.subject ? `<p class="subtitle">${escapeHtml(opts.subject)}</p>` : '';
  const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4; margin: 0.5in; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0c0e1a;
    color: #d4d4dc;
    font-size: 13px;
    line-height: 1.75;
    padding: 28px 32px;
  }
  .header {
    text-align: center;
    margin-bottom: 22px;
    padding-bottom: 16px;
    border-bottom: 2px solid #1e2040;
  }
  .header h1 {
    font-size: 22px;
    font-weight: 900;
    color: #ffffff;
    letter-spacing: -0.02em;
    margin-bottom: 4px;
  }
  .header .subtitle {
    font-size: 12px;
    color: #a78bfa;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
  }
  .header .date {
    font-size: 10px;
    color: #64668a;
  }
  h2 {
    font-size: 17px;
    font-weight: 900;
    color: #ffffff;
    margin: 20px 0 10px;
    padding-top: 8px;
    border-top: 1px solid #1e2040;
  }
  h3 {
    font-size: 14px;
    font-weight: 800;
    margin: 16px 0 8px;
    padding: 6px 12px;
    border-radius: 6px;
  }
  .section-facts { background: #1a1640; color: #818cf8; border-left: 3px solid #818cf8; }
  .section-memory { background: #1a2a1a; color: #4ade80; border-left: 3px solid #4ade80; }
  .section-mistakes { background: #2a1a1a; color: #f87171; border-left: 3px solid #f87171; }
  .section-recall { background: #2a2210; color: #fbbf24; border-left: 3px solid #fbbf24; }
  .section-default { background: #1a1e30; color: #94a3b8; border-left: 3px solid #94a3b8; }
  p { margin: 6px 0; color: #b0b0c0; }
  ul { margin: 6px 0 6px 8px; padding-left: 16px; }
  li { margin: 4px 0; color: #b0b0c0; padding-left: 4px; }
  li::marker { color: #6366f1; }
  strong, b { color: #f59e0b; font-weight: 700; }
  em, i { color: #a78bfa; font-style: italic; }
  blockquote {
    margin: 10px 0;
    padding: 8px 14px;
    border-left: 3px solid #6366f1;
    background: #12142a;
    border-radius: 0 6px 6px 0;
    color: #a0a0c0;
    font-style: italic;
  }
  hr { border: none; border-top: 1px solid #1e2040; margin: 16px 0; }
  code {
    background: #1a1e30;
    color: #e879f9;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 11px;
  }
  .footer {
    margin-top: 24px;
    padding-top: 10px;
    border-top: 1px solid #1e2040;
    text-align: center;
    font-size: 9px;
    color: #44466a;
  }
</style>
</head>
<body>
  <div class="header">
    <h1>📝 ${title}</h1>
    ${subtitle}
    <p class="date">Generated on ${escapeHtml(dateStr)}</p>
  </div>
  ${bodyHtml}
  <div class="footer">Quiz Master Pro — Revision Sheet</div>
</body>
</html>`;
}

/** Extract plain text from revision markdown for TXT download */
export function buildRevisionSheetText(markdownContent: string): string {
  return markdownContent;
}
