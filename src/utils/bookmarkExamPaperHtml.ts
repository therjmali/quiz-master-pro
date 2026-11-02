/**
 * Client-side HTML builder for bookmark exam papers.
 * Mirrors the exam paper section's workflow — builds inline HTML
 * for SmartPreviewModal (srcDoc), not a server-generated PDF URL.
 */

import { FileNode } from './fileTree';
import { formatRationale, rationaleHtmlList } from '../lib/rationaleFormat';

interface BookmarkItem {
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string | null;
  rationale?: string;
  aiRationale?: string;
  difficulty?: string;
  questionType?: string;
  quizTitle: string;
  subject: string;
}

export interface BookmarkViewOpts {
  showAnswers: boolean;
  showBookRat: boolean;
  showAiRat: boolean;
  difficultyFilter: 'all' | 'easy' | 'medium' | 'hard';
}

function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function fileNodesToBookmarkItems(nodes: FileNode[]): BookmarkItem[] {
  return nodes
    .filter(n => n.bookmarkData)
    .map(n => ({
      question: n.bookmarkData!.question,
      options: n.bookmarkData!.options,
      correctAnswer: n.bookmarkData!.correctAnswer,
      userAnswer: n.bookmarkData!.userAnswer,
      rationale: n.bookmarkData!.rationale,
      aiRationale: (n.bookmarkData as any)?.aiRationale,
      difficulty: n.bookmarkData!.difficulty,
      questionType: n.bookmarkData!.questionType,
      quizTitle: n.bookmarkData!.quizTitle,
      subject: n.bookmarkData!.subject,
    }));
}

export function buildBookmarkExamPaperHtml(
  bmsRaw: BookmarkItem[],
  title: string | undefined,
  opts: BookmarkViewOpts,
): string {
  const { showAnswers, showBookRat: showBookR, showAiRat: showAiR, difficultyFilter: diffFilter } = opts;

  let bms = bmsRaw;
  if (diffFilter !== 'all') {
    bms = bms.filter(b => (b.difficulty || 'medium').toLowerCase() === diffFilter);
  }

  const total = bms.length;
  const correct = bms.filter(b => b.userAnswer === b.correctAnswer).length;
  const wrong = bms.filter(b => b.userAnswer !== null && b.userAnswer !== b.correctAnswer).length;
  const skipped = bms.filter(b => b.userAnswer === null).length;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const easy = bms.filter(b => (b.difficulty || '').toLowerCase() === 'easy').length;
  const medium = bms.filter(b => (b.difficulty || 'medium').toLowerCase() === 'medium').length;
  const hard = bms.filter(b => (b.difficulty || '').toLowerCase() === 'hard').length;

  // Group by subject
  const bySubject = new Map<string, BookmarkItem[]>();
  for (const bm of bms) {
    const s = bm.subject || 'General';
    if (!bySubject.has(s)) bySubject.set(s, []);
    bySubject.get(s)!.push(bm);
  }

  const subjects = Array.from(bySubject.keys());
  const subjectLabel = subjects.length === 1 ? subjects[0] : subjects.join(', ');

  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const titleText = title || '🔖 Bookmarked Questions';

  const scoreColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
  const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
  const gradeColor = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
  const isPassed = pct >= 50;
  const accColor = accuracy >= 75 ? '#10b981' : accuracy >= 50 ? '#f59e0b' : '#ef4444';

  // SVG gauge helpers
  const polarToXY = (cx: number, cy: number, r: number, deg: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  };
  const arcPath = (cx: number, cy: number, r: number, startDeg: number, endDeg: number) => {
    const end = Math.min(endDeg, startDeg + 359.9);
    const s = polarToXY(cx, cy, r, startDeg);
    const e = polarToXY(cx, cy, r, end);
    const large = (end - startDeg) > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  };

  // Score gauge SVG
  const gaugeSvg = (() => {
    const cx = 65, cy = 65, r = 50;
    const end = pct >= 100 ? 359.9 : (pct / 100) * 360;
    const d = arcPath(cx, cy, r, 0, end);
    return `<svg viewBox="0 0 130 130" width="110" height="110">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="10"/>
      <path d="${d}" fill="none" stroke="${scoreColor}" stroke-width="10" stroke-linecap="round"/>
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${scoreColor}" font-size="22" font-weight="900" font-family="Arial,sans-serif">${pct}%</text>
      <text x="${cx}" y="${cy + 12}" text-anchor="middle" fill="#9ca3af" font-size="8" font-weight="700" font-family="Arial,sans-serif">SCORE</text>
    </svg>`;
  })();

  // Donut chart SVG
  const donutSvg = (() => {
    if (!total) return '';
    const cx = 48, cy = 48, r = 36;
    const segments = [
      { count: correct, color: '#10b981' },
      { count: wrong, color: '#ef4444' },
      { count: skipped, color: '#d1d5db' },
    ].filter(s => s.count > 0);
    let cursor = 0;
    const paths = segments.map(seg => {
      const span = (seg.count / total) * 360;
      const d = arcPath(cx, cy, r, cursor, cursor + span);
      cursor += span;
      return `<path d="${d}" fill="none" stroke="${seg.color}" stroke-width="12" stroke-linecap="butt"/>`;
    }).join('');
    const legend = [
      { color: '#10b981', label: 'Correct', count: correct },
      { color: '#ef4444', label: 'Wrong', count: wrong },
      { color: '#d1d5db', label: 'Skipped', count: skipped },
    ].filter(l => l.count > 0).map(l =>
      `<div style="display:flex;align-items:center;gap:5px;margin:2px 0;">
        <div style="width:8px;height:8px;border-radius:50%;background:${l.color};flex-shrink:0;"></div>
        <span style="font-size:10px;color:#374151;">${l.label}: <strong>${l.count}</strong> <span style="color:#9ca3af;">(${Math.round(l.count / total * 100)}%)</span></span>
      </div>`
    ).join('');
    return `<div style="display:flex;align-items:center;gap:14px;">
      <svg viewBox="0 0 96 96" width="90" height="90" style="flex-shrink:0;">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="12"/>
        ${paths}
        <text x="${cx}" y="${cy - 3}" text-anchor="middle" fill="#111827" font-size="13" font-weight="900" font-family="Arial,sans-serif">${total}</text>
        <text x="${cx}" y="${cy + 9}" text-anchor="middle" fill="#9ca3af" font-size="7" font-family="Arial,sans-serif">TOTAL</text>
      </svg>
      <div>${legend}</div>
    </div>`;
  })();

  // Subject accuracy bars
  const subjectBarsHtml = Array.from(bySubject.entries()).map(([subj, sbms]) => {
    const c = sbms.filter(b => b.userAnswer === b.correctAnswer).length;
    const t = sbms.length;
    const acc = t > 0 ? Math.round((c / t) * 100) : 0;
    const color = acc >= 75 ? '#10b981' : acc >= 50 ? '#f59e0b' : '#ef4444';
    return `<div style="margin:4px 0;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
        <span style="font-size:10px;font-weight:700;color:#374151;max-width:140px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(subj)}</span>
        <span style="font-size:10px;font-weight:900;color:${color};">${acc}%</span>
      </div>
      <div style="background:#f3f4f6;border-radius:99px;height:5px;overflow:hidden;">
        <div style="height:100%;width:${acc}%;background:${color};border-radius:99px;"></div>
      </div>
      <div style="font-size:8px;color:#9ca3af;margin-top:1px;">${c}/${t} correct</div>
    </div>`;
  }).join('');

  // Build questions HTML
  let questionsHtml = '';
  let answerKeyRows = '';
  let qNum = 0;

  for (const [subject, sbms] of bySubject) {
    const byQuiz = new Map<string, BookmarkItem[]>();
    for (const bm of sbms) {
      const qt = bm.quizTitle || 'Untitled Quiz';
      if (!byQuiz.has(qt)) byQuiz.set(qt, []);
      byQuiz.get(qt)!.push(bm);
    }

    for (const [quizTitle, questions] of byQuiz) {
      if (bySubject.size > 1 || byQuiz.size > 1) {
        questionsHtml += `<div style="margin:20px 0 12px;page-break-inside:avoid;">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
            <span style="font-size:7px;font-weight:900;text-transform:uppercase;letter-spacing:0.15em;color:#9ca3af;font-family:Arial,sans-serif;">📚 ${esc(subject)}</span>
            <div style="flex:1;height:1px;background:#e5e7eb;"></div>
          </div>
          <div style="font-size:10px;font-weight:700;color:#374151;padding-left:4px;border-left:3px solid #1a1a1a;font-family:Arial,sans-serif;">${esc(quizTitle)}</div>
        </div>`;
      }

      for (const bm of questions) {
        qNum++;
        const ua = bm.userAnswer;
        const status = ua === null ? 'skipped' : ua === bm.correctAnswer ? 'correct' : 'wrong';

        const diff = (bm.difficulty || 'medium').toLowerCase();
        const diffLabel = diff === 'easy' ? 'EASY' : diff === 'hard' ? 'HARD' : 'MEDIUM';
        const diffBg = diff === 'easy' ? '#d1fae5' : diff === 'hard' ? '#fee2e2' : '#fef3c7';
        const diffTx = diff === 'easy' ? '#065f46' : diff === 'hard' ? '#991b1b' : '#92400e';
        const diffBrd = diff === 'easy' ? '#a7f3d0' : diff === 'hard' ? '#fca5a5' : '#fcd34d';

        const statusLabel = status === 'correct' ? '✓ Correct' : status === 'wrong' ? '✗ Wrong' : '⏭ Skipped';
        const statusBg = status === 'correct' ? '#d1fae5' : status === 'wrong' ? '#fee2e2' : '#f3f4f6';
        const statusTx = status === 'correct' ? '#065f46' : status === 'wrong' ? '#991b1b' : '#6b7280';
        const statusBrd = status === 'correct' ? '#a7f3d0' : status === 'wrong' ? '#fca5a5' : '#e5e7eb';
        const borderColor = status === 'correct' ? '#10b981' : status === 'wrong' ? '#ef4444' : '#9ca3af';

        const optsHtml = bm.options.map((opt, i) => {
          const letter = String.fromCharCode(65 + i);
          const isCor = opt === bm.correctAnswer;
          const isUsr = opt === bm.userAnswer;
          const isWrongUser = isUsr && !isCor;

          let optBg = 'transparent';
          let optBorder = 'transparent';
          let keyColor = '#555';
          let tag = '';

          if (showAnswers) {
            if (isCor && isUsr) {
              optBg = '#ecfdf5'; optBorder = '#6ee7b7'; keyColor = '#059669';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#d1fae5;color:#065f46;white-space:nowrap;margin-left:4px;">✓ Correct</span>`;
            } else if (isCor) {
              optBg = '#ecfdf5'; optBorder = '#6ee7b7'; keyColor = '#059669';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#d1fae5;color:#065f46;white-space:nowrap;margin-left:4px;">← Answer</span>`;
            } else if (isWrongUser) {
              optBg = '#fff1f2'; optBorder = '#fca5a5'; keyColor = '#dc2626';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#fee2e2;color:#991b1b;white-space:nowrap;margin-left:4px;">✗ Yours</span>`;
            }
          }

          return `<div style="display:flex;align-items:flex-start;gap:8px;padding:6px 12px;border-radius:6px;font-size:12px;line-height:1.6;background:${optBg};border:1.5px solid ${optBorder};margin-bottom:3px;">
            <span style="font-size:11px;font-weight:800;min-width:24px;flex-shrink:0;margin-top:1px;font-family:'Courier New',monospace;color:${keyColor};">(${letter})</span>
            <span style="flex:1;color:#1a1a1a;">${esc(opt)}</span>${tag}
          </div>`;
        }).join('');

        const skipNotice = status === 'skipped' && showAnswers
          ? `<div style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:10px;color:#9ca3af;font-style:italic;">⏭ This question was not attempted</div>`
          : '';

        let ratHtml = '';
        if (showBookR && bm.rationale) {
          ratHtml += `<div style="margin-top:10px;padding:12px 16px;border-radius:0 8px 8px 0;font-size:11px;line-height:1.5;border-left:4px solid #f59e0b;background:#fffbeb;color:#78350f;">
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#b45309;margin-bottom:5px;font-family:Arial,sans-serif;">RATIONALE</div>
            ${rationaleHtmlList(bm.rationale)}
          </div>`;
        }
        if (showAiR && bm.aiRationale) {
          ratHtml += `<div style="margin-top:8px;padding:12px 16px;border-radius:0 8px 8px 0;font-size:11px;line-height:1.5;border-left:4px solid #7c3aed;background:#f5f3ff;color:#4c1d95;">
            <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.12em;color:#6d28d9;margin-bottom:5px;font-family:Arial,sans-serif;">AI EXPLANATION</div>
            ${rationaleHtmlList(bm.aiRationale)}
          </div>`;
        }

        questionsHtml += `<div style="border:1.5px solid #e5e7eb;border-left:5px solid ${borderColor};border-radius:10px;padding:16px 18px;margin-bottom:12px;page-break-inside:avoid;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.03);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:11px;font-weight:900;color:#374151;font-family:Arial,sans-serif;">Q.${qNum}</span>
            <div style="display:flex;gap:4px;">
              ${showAnswers ? `<span style="font-size:8px;font-weight:800;padding:2px 8px;border-radius:99px;background:${statusBg};color:${statusTx};border:1px solid ${statusBrd};font-family:Arial,sans-serif;">${statusLabel}</span>` : ''}
              <span style="font-size:8px;font-weight:800;padding:2px 8px;border-radius:99px;background:${diffBg};color:${diffTx};border:1px solid ${diffBrd};font-family:Arial,sans-serif;">${diffLabel}</span>
            </div>
          </div>
          <p style="font-size:13px;font-weight:700;color:#111;line-height:1.7;margin:0 0 12px;font-family:'Segoe UI',Arial,sans-serif;">${esc(bm.question)}</p>
          <div style="margin:0 0 6px;">${optsHtml}</div>
          ${skipNotice}
          ${ratHtml}
        </div>`;

        // Answer key row
        const corrIdx = bm.options.indexOf(bm.correctAnswer);
        const userIdx = ua ? bm.options.indexOf(ua) : -1;
        const tdBg = status === 'correct' ? '#ecfdf5' : status === 'wrong' ? '#fff1f2' : '#fafafa';
        const tdColor = status === 'correct' ? '#065f46' : status === 'wrong' ? '#991b1b' : '#9ca3af';
        const icon = status === 'correct' ? '✓' : status === 'wrong' ? '✗' : '—';
        answerKeyRows += `<tr>
          <td style="text-align:center;font-weight:700;padding:5px 8px;border-bottom:1px solid #f0f0f0;font-size:10px;">${qNum}</td>
          <td style="max-width:220px;padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#374151;font-size:10px;">${esc(bm.question.slice(0, 60))}${bm.question.length > 60 ? '…' : ''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#374151;font-size:10px;">${corrIdx >= 0 ? `(${String.fromCharCode(65 + corrIdx)})` : ''} ${esc(bm.correctAnswer.slice(0, 28))}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;background:${tdBg};color:${tdColor};font-weight:800;font-size:10px;">${ua ? (userIdx >= 0 ? `(${String.fromCharCode(65 + userIdx)})` : '') + ' ' + esc(ua.slice(0, 28)) : '—'}</td>
          <td style="text-align:center;padding:5px 8px;border-bottom:1px solid #f0f0f0;background:${tdBg};color:${tdColor};font-weight:900;font-size:13px;">${icon}</td>
        </tr>`;
      }
    }
  }

  // Toggle labels
  const toggleLabels: string[] = [];
  if (showAnswers) toggleLabels.push('Answers ✓');
  else toggleLabels.push('Answers ✗');
  if (showBookR) toggleLabels.push('📖 Book ✓');
  if (showAiR) toggleLabels.push('✨ AI ✓');
  if (diffFilter !== 'all') toggleLabels.push(`Difficulty: ${diffFilter}`);

  // Subject insights
  const subjectInsights = Array.from(bySubject.entries()).map(([subj, sbms]) => {
    const c = sbms.filter(b => b.userAnswer === b.correctAnswer).length;
    const t = sbms.length;
    const acc = t > 0 ? Math.round((c / t) * 100) : 0;
    const color = acc >= 75 ? '#10b981' : acc >= 50 ? '#f59e0b' : '#ef4444';
    const statusT = acc >= 75 ? '✓ Strong' : acc >= 50 ? '📖 Practice' : '⚠ Review';
    const bgC = acc >= 75 ? '#d1fae5' : acc >= 50 ? '#fef3c7' : '#fee2e2';
    const txC = acc >= 75 ? '#065f46' : acc >= 50 ? '#92400e' : '#991b1b';
    return `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:8px;border:1px solid #f0f0f0;background:#fafafa;margin-bottom:4px;">
      <span style="font-size:10px;font-weight:700;color:#374151;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(subj)}</span>
      <div style="flex:2;background:#e5e7eb;border-radius:99px;height:5px;overflow:hidden;"><div style="height:100%;width:${acc}%;background:${color};border-radius:99px;"></div></div>
      <span style="font-size:10px;font-weight:900;min-width:34px;text-align:right;color:${color};">${acc}%</span>
      <span style="font-size:7px;font-weight:800;padding:2px 7px;border-radius:99px;white-space:nowrap;background:${bgC};color:${txC};border:1px solid ${color}40;">${statusT}</span>
    </div>`;
  }).join('');

  return `<!doctype html>
<html>
<head><meta charset="utf-8"/>
<style>
  @page { size: a4; margin: 16mm 14mm; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.7; margin: 0; padding: 16px; background: #fff; }
  * { box-sizing: border-box; }
</style>
</head>
<body>

<!-- EXAM PAPER COVER -->
<div style="border:2px solid #1a1a1a;border-radius:4px;padding:20px 24px;margin-bottom:16px;">
  <div style="font-size:8px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#888;text-align:center;margin-bottom:10px;font-family:Arial,sans-serif;">🎓 Quiz Master Pro — Bookmark Exam Paper</div>
  <div style="border-top:1px solid #ddd;margin:6px 0 14px;"></div>
  <div style="display:flex;gap:20px;align-items:center;">
    <div style="flex:1;min-width:220px;">
      <h1 style="font-size:18px;font-weight:900;line-height:1.3;margin:0 0 10px;font-family:Arial,sans-serif;color:#111;">${esc(titleText)}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">
        ${subjectLabel ? `<span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">📚 ${esc(subjectLabel)}</span>` : ''}
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">📅 ${esc(date)}</span>
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">${total} Questions (MCQ)</span>
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">🔖 Bookmarked</span>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:12px;">
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 12px;text-align:center;background:#fafafa;"><div style="font-size:16px;font-weight:900;color:${gradeColor};font-family:Arial,sans-serif;">${grade}</div><div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Grade</div></div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 12px;text-align:center;background:#fafafa;"><div style="font-size:16px;font-weight:900;color:#10b981;font-family:Arial,sans-serif;">${correct}/${total}</div><div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Correct</div></div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 12px;text-align:center;background:#fafafa;"><div style="font-size:16px;font-weight:900;color:#ef4444;font-family:Arial,sans-serif;">${wrong}</div><div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Wrong</div></div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 12px;text-align:center;background:#fafafa;"><div style="font-size:16px;font-weight:900;color:#f59e0b;font-family:Arial,sans-serif;">${skipped}</div><div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Skipped</div></div>
      </div>
      <span style="display:inline-block;padding:5px 14px;border-radius:99px;font-size:11px;font-weight:800;font-family:Arial,sans-serif;border:1.5px solid ${isPassed ? '#a7f3d0' : '#fca5a5'};background:${isPassed ? '#d1fae5' : '#fee2e2'};color:${isPassed ? '#065f46' : '#991b1b'};">
        ${isPassed ? '✅ PASSED' : '❌ FAILED'} · ${pct}%
      </span>
      <div style="margin-top:8px;font-size:8px;color:#9ca3af;font-family:Arial,sans-serif;">${toggleLabels.join(' · ')}</div>
    </div>
    <div style="flex-shrink:0;">${gaugeSvg}</div>
  </div>
</div>

<!-- INSTRUCTIONS -->
<div style="background:#f8fafc;border:1.5px solid #e5e7eb;border-radius:8px;padding:12px 16px;margin-bottom:16px;page-break-inside:avoid;">
  <div style="font-size:9px;font-weight:900;color:#374151;margin-bottom:6px;font-family:Arial,sans-serif;text-transform:uppercase;letter-spacing:0.08em;">Instructions:</div>
  <div style="font-size:10px;color:#555;line-height:1.8;font-family:Arial,sans-serif;">
    1. All questions are from your bookmarked collection. &nbsp;&nbsp;
    2. Each question carries <strong>1 mark</strong>. &nbsp;&nbsp;
    3. Select the most appropriate answer from the given options.
    ${showAnswers ? '&nbsp;&nbsp; 4. Correct answers and your responses are highlighted.' : ''}
    ${showBookR ? '&nbsp;&nbsp; 5. Book rationale is shown below each question.' : ''}
    ${showAiR ? '&nbsp;&nbsp; 6. AI-generated explanations are included.' : ''}
  </div>
</div>

<!-- PERFORMANCE DASHBOARD -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
  <div style="display:flex;align-items:center;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📊 Performance Dashboard</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px;">
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#3b82f6;font-family:Arial,sans-serif;">${total}</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Total</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#10b981;font-family:Arial,sans-serif;">${correct}</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Correct</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#ef4444;font-family:Arial,sans-serif;">${wrong}</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Wrong</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#f59e0b;font-family:Arial,sans-serif;">${skipped}</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Skipped</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:${scoreColor};font-family:Arial,sans-serif;">${pct}%</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Score</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:${accColor};font-family:Arial,sans-serif;">${accuracy}%</div><div style="font-size:7px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Accuracy</div></div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
    <div style="font-size:9px;font-weight:700;color:#6b7280;min-width:55px;font-family:Arial,sans-serif;">Score</div>
    <div style="flex:1;background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${scoreColor};border-radius:99px;"></div></div>
    <div style="font-size:10px;font-weight:900;min-width:34px;text-align:right;color:${scoreColor};font-family:Arial,sans-serif;">${pct}%</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:6px;">
    <div style="font-size:9px;font-weight:700;color:#6b7280;min-width:55px;font-family:Arial,sans-serif;">Accuracy</div>
    <div style="flex:1;background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;"><div style="height:100%;width:${accuracy}%;background:${accColor};border-radius:99px;"></div></div>
    <div style="font-size:10px;font-weight:900;min-width:34px;text-align:right;color:${accColor};font-family:Arial,sans-serif;">${accuracy}%</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
    <div style="background:#fafafa;border:1.5px solid #f0f0f0;border-radius:10px;padding:14px;">
      <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:8px;font-family:Arial,sans-serif;">Answer Breakdown</div>
      ${donutSvg}
    </div>
    <div style="background:#fafafa;border:1.5px solid #f0f0f0;border-radius:10px;padding:14px;">
      <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:8px;font-family:Arial,sans-serif;">Subject Accuracy</div>
      ${subjectBarsHtml}
    </div>
  </div>
  <div style="margin-top:12px;padding-top:10px;border-top:1px solid #f3f4f6;text-align:center;font-size:10px;color:#555;font-family:Arial,sans-serif;">
    🟢 Easy: <strong>${easy}</strong> &nbsp;&nbsp; 🟡 Medium: <strong>${medium}</strong> &nbsp;&nbsp; 🔴 Hard: <strong>${hard}</strong>
  </div>
</div>

<!-- QUESTIONS -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📝 Question-by-Question Review</span>
    <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:99px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">${total} Questions</span>
  </div>
  ${questionsHtml || '<p style="color:#9ca3af;text-align:center;padding:24px;font-family:Arial,sans-serif;">No bookmarked questions match this filter.</p>'}
</div>

<!-- INSIGHTS -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
  <div style="display:flex;align-items:center;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">🎯 Subject Insights</span>
  </div>
  ${subjectInsights}
</div>

<!-- ANSWER KEY -->
${showAnswers ? `<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:16px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📑 Answer Key</span>
    <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:99px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">${total} Questions</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;">
    <thead><tr>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:center;width:30px;font-family:Arial,sans-serif;">#</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Question</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Correct</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Your Answer</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:center;font-family:Arial,sans-serif;">Result</th>
    </tr></thead>
    <tbody>${answerKeyRows}</tbody>
  </table>
</div>` : ''}

<!-- FOOTER -->
<div style="text-align:center;padding:14px;margin-top:16px;border-top:1.5px solid #e5e7eb;font-size:10px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;">
  Generated by <strong>Quiz Master Pro</strong> · ${esc(date)} · ${total} bookmarked questions reviewed
</div>

</body>
</html>`;
}

/** Build plain-text version for TXT export */
export function buildBookmarkExamPaperText(bmsRaw: BookmarkItem[], title: string | undefined, opts: BookmarkViewOpts): string {
  let bms = bmsRaw;
  if (opts.difficultyFilter !== 'all') {
    bms = bms.filter(b => (b.difficulty || 'medium').toLowerCase() === opts.difficultyFilter);
  }
  const lines: string[] = [];
  lines.push('═'.repeat(50));
  lines.push(title || 'Bookmarked Questions — Exam Paper');
  lines.push('═'.repeat(50));
  lines.push(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`);
  lines.push(`Total: ${bms.length} Questions`);
  lines.push('');

  let qNum = 0;
  for (const bm of bms) {
    qNum++;
    lines.push(`Q.${qNum}  ${bm.question}`);
    bm.options.forEach((o, i) => {
      const letter = String.fromCharCode(65 + i);
      const mark = opts.showAnswers && o === bm.correctAnswer ? ' ← Answer' : opts.showAnswers && o === bm.userAnswer ? ' ← Yours' : '';
      lines.push(`   (${letter}) ${o}${mark}`);
    });
    if (opts.showBookRat && bm.rationale) lines.push(`   Rationale:\n   ${formatRationale(bm.rationale).replace(/\n/g, '\n   ')}`);
    if (opts.showAiRat && bm.aiRationale) lines.push(`   AI Explanation:\n   ${formatRationale(bm.aiRationale).replace(/\n/g, '\n   ')}`);
    lines.push('');
  }
  lines.push('─'.repeat(50));
  lines.push('Generated by Quiz Master Pro');
  return lines.join('\n');
}
