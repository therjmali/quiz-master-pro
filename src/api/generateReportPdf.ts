import { z } from 'zod';
import { rationaleHtmlList, cleanExplanationBlock } from '../lib/rationaleFormat';
import { createEndpoint } from 'zitejs/backend';
import { ZitePdf } from 'zitejs/pdf';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';

const QuestionSchema = z.object({
  question: z.string(),
  options: z.array(z.string()),
  correctAnswer: z.string(),
  difficulty: z.string().optional(),
  rationale: z.string().optional(),
  imageUrl: z.string().optional(),
});

const ResultSchema = z.object({
  quizTitle: z.string().optional(),
  subject: z.string().optional(),
  percentage: z.number(),
  netScore: z.number(),
  maxScore: z.number(),
  correct: z.number(),
  wrong: z.number(),
  skipped: z.number(),
  totalQuestions: z.number(),
  accuracy: z.number(),
  gain: z.number(),
  penalty: z.number(),
  timeTaken: z.number(),
  timestamp: z.number(),
  passMark: z.number().optional(),
  quizData: z.array(QuestionSchema),
  userAnswers: z.array(z.string().nullable()),
});

export default createEndpoint({
  description: 'Generate a professional PDF report for quiz results',
  inputSchema: z.object({
    results: z.array(ResultSchema),
    filter: z.enum(['all', 'correct', 'wrong', 'skipped']).default('all'),
    reportType: z.enum(['full', 'notes', 'exam']).default('full'),
    rationaleCache: z.record(z.string(), z.string()).optional(),
    includeRationale: z.boolean().default(true),
  }),
  outputSchema: z.object({ url: z.string(), filename: z.string() }),
  async execute({ input }) {
    const esc = (s: unknown) =>
      String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#39;');

    const safeNum = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? v : 0; };

    const { results, filter, reportType, includeRationale } = input;
    const rationaleCache = { ...(input.rationaleCache || {}) };

    // ── Server-side AI rationale generation for uncached questions ──
    if (includeRationale) {
      const uncached: { question: string; correctAnswer: string; userAnswer: string | null; options: string[] }[] = [];
      results.forEach(r => {
        r.quizData.forEach((q, i) => {
          if (!rationaleCache[q.question] && !q.rationale?.trim()) {
            uncached.push({ question: q.question, correctAnswer: q.correctAnswer, userAnswer: r.userAnswers[i], options: q.options });
          }
        });
      });

      if (uncached.length > 0) {
        const generateOne = async (item: typeof uncached[0]): Promise<void> => {
          const prompt = `Question: "${item.question}"\nOptions:\n${item.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}\nCorrect Answer: "${item.correctAnswer}"\n\nExplain concisely why the correct answer is right. Write 2 to 3 short plain-text points, one per line. No emojis, no symbols, no bullet characters, no markdown, no bold. Each point is one or two sentences.`;
          // Try Anthropic first, then Gemini
          try {
            const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN! });
            const msg = await client.messages.create({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: prompt }] });
            const block = msg.content[0];
            if (block.type === 'text' && block.text.trim()) { rationaleCache[item.question] = cleanExplanationBlock(block.text); return; }
          } catch {}
          try {
            const genAI = new GoogleGenerativeAI(process.env.ZITE_GEMINI_ACCESS_TOKEN!);
            const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { maxOutputTokens: 300, temperature: 0.2 } });
            const res = await model.generateContent(prompt);
            const text = res.response.text()?.trim();
            if (text) { rationaleCache[item.question] = cleanExplanationBlock(text); return; }
          } catch {}
        };

        // Process in parallel batches of 5
        const BATCH = 5;
        for (let i = 0; i < uncached.length; i += BATCH) {
          await Promise.allSettled(uncached.slice(i, i + BATCH).map(generateOne));
        }
      }
    }

    // ── Aggregate stats ──
    let totalQ = 0, correct = 0, wrong = 0, skipped = 0, timeTaken = 0, gain = 0, penalty = 0;
    results.forEach(r => {
      totalQ += safeNum(r.totalQuestions);
      correct += safeNum(r.correct);
      wrong += safeNum(r.wrong);
      skipped += safeNum(r.skipped);
      timeTaken += safeNum(r.timeTaken);
      gain += safeNum(r.gain);
      penalty += safeNum(r.penalty);
    });
    const pct = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
    const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
    const title = results.length === 1 ? (results[0].quizTitle || 'Quiz Report') : 'Performance Report';
    const subject = results[0]?.subject || '';
    const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const grade = pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B' : pct >= 60 ? 'C' : pct >= 50 ? 'D' : 'F';
    const gradeColor = pct >= 90 ? '#10b981' : pct >= 80 ? '#10b981' : pct >= 70 ? '#3b82f6' : pct >= 60 ? '#f59e0b' : pct >= 50 ? '#f97316' : '#ef4444';
    const scoreColor = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    const passMark = results[0]?.passMark ?? 50;
    const isPassed = pct >= passMark;
    const mins = Math.floor(timeTaken / 60);
    const secs = timeTaken % 60;
    const timeStr = timeTaken > 0 ? `${mins}m ${String(secs).padStart(2, '0')}s` : '—';
    const avgTimeSec = timeTaken > 0 && totalQ > 0 ? Math.round(timeTaken / totalQ) : 0;
    const avgTimeStr = avgTimeSec > 0 ? `${Math.floor(avgTimeSec / 60)}m ${avgTimeSec % 60}s` : '—';

    // ── Subject breakdown ──
    const subjMap = new Map<string, { correct: number; total: number }>();
    results.forEach(r => {
      const key = r.subject?.trim() || 'General';
      const e = subjMap.get(key) || { correct: 0, total: 0 };
      e.correct += safeNum(r.correct);
      e.total += safeNum(r.totalQuestions);
      subjMap.set(key, e);
    });
    const subjectBreakdown = Array.from(subjMap.entries())
      .map(([s, { correct: c, total: t }]) => ({ subject: s, correct: c, total: t, accuracy: t > 0 ? Math.round((c / t) * 100) : 0 }))
      .sort((a, b) => b.accuracy - a.accuracy);

    // ── SVG helpers ──
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
      const cx = 70, cy = 70, r = 54;
      const end = pct >= 100 ? 359.9 : (pct / 100) * 360;
      const d = arcPath(cx, cy, r, 0, end);
      return `<svg viewBox="0 0 140 140" width="120" height="120">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="11"/>
        <path d="${d}" fill="none" stroke="${scoreColor}" stroke-width="11" stroke-linecap="round"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${scoreColor}" font-size="24" font-weight="900" font-family="Arial,sans-serif">${pct}%</text>
        <text x="${cx}" y="${cy + 13}" text-anchor="middle" fill="#9ca3af" font-size="9" font-weight="700" font-family="Arial,sans-serif">SCORE</text>
      </svg>`;
    })();

    // Donut chart SVG
    const donutSvg = (() => {
      const total = correct + wrong + skipped;
      if (!total) return '';
      const cx = 52, cy = 52, r = 39;
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
        return `<path d="${d}" fill="none" stroke="${seg.color}" stroke-width="13" stroke-linecap="butt"/>`;
      }).join('');
      const legend = [
        { color: '#10b981', label: 'Correct', count: correct },
        { color: '#ef4444', label: 'Wrong', count: wrong },
        { color: '#d1d5db', label: 'Skipped', count: skipped },
      ].filter(l => l.count > 0).map(l =>
        `<div style="display:flex;align-items:center;gap:6px;margin:3px 0;">
          <div style="width:9px;height:9px;border-radius:50%;background:${l.color};flex-shrink:0;"></div>
          <span style="font-size:11px;color:#374151;font-family:Arial,sans-serif;">${l.label}: <strong>${l.count}</strong> <span style="color:#9ca3af;">(${Math.round(l.count / total * 100)}%)</span></span>
        </div>`
      ).join('');
      return `<div style="display:flex;align-items:center;gap:16px;">
        <svg viewBox="0 0 104 104" width="100" height="100" style="flex-shrink:0;">
          <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="13"/>
          ${paths}
          <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="#111827" font-size="14" font-weight="900" font-family="Arial,sans-serif">${total}</text>
          <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="#9ca3af" font-size="8" font-family="Arial,sans-serif">TOTAL</text>
        </svg>
        <div>${legend}</div>
      </div>`;
    })();

    // Subject accuracy bars
    const subjectBarsHtml = subjectBreakdown.length > 0 ? subjectBreakdown.map(b => {
      const color = b.accuracy >= 75 ? '#10b981' : b.accuracy >= 50 ? '#f59e0b' : '#ef4444';
      const label = b.accuracy >= 75 ? 'Strong' : b.accuracy >= 50 ? 'Practice' : 'Review';
      const labelBg = b.accuracy >= 75 ? '#d1fae5' : b.accuracy >= 50 ? '#fef3c7' : '#fee2e2';
      const labelTx = b.accuracy >= 75 ? '#065f46' : b.accuracy >= 50 ? '#92400e' : '#991b1b';
      return `<div style="margin:5px 0;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px;">
          <span style="font-size:11px;font-weight:700;color:#374151;font-family:Arial,sans-serif;max-width:150px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${esc(b.subject)}</span>
          <div style="display:flex;align-items:center;gap:5px;">
            <span style="font-size:8px;font-weight:800;color:${labelTx};background:${labelBg};padding:2px 7px;border-radius:99px;border:1px solid ${color}40;font-family:Arial,sans-serif;">${label}</span>
            <span style="font-size:11px;font-weight:900;color:${color};font-family:Arial,sans-serif;">${b.accuracy}%</span>
          </div>
        </div>
        <div style="background:#f3f4f6;border-radius:99px;height:6px;overflow:hidden;">
          <div style="height:100%;width:${b.accuracy}%;background:${color};border-radius:99px;"></div>
        </div>
        <div style="font-size:9px;color:#9ca3af;margin-top:1px;font-family:Arial,sans-serif;">${b.correct}/${b.total} correct</div>
      </div>`;
    }).join('') : '<p style="color:#9ca3af;font-size:11px;text-align:center;">No subject data.</p>';

    // ── Question cards ──
    const buildQuestionCards = () => {
      const cards: string[] = [];
      let globalIdx = 0;
      results.forEach(r => {
        r.quizData.forEach((q, i) => {
          const ua = r.userAnswers[i];
          const status = ua === null ? 'skipped' : ua === q.correctAnswer ? 'correct' : 'wrong';
          if (filter !== 'all' && status !== filter) return;
          globalIdx++;

          const borderColor = status === 'correct' ? '#10b981' : status === 'wrong' ? '#ef4444' : '#9ca3af';
          const statusBadgeBg = status === 'correct' ? '#d1fae5' : status === 'wrong' ? '#fee2e2' : '#f3f4f6';
          const statusBadgeTx = status === 'correct' ? '#065f46' : status === 'wrong' ? '#991b1b' : '#6b7280';
          const statusBadgeBrd = status === 'correct' ? '#a7f3d0' : status === 'wrong' ? '#fca5a5' : '#e5e7eb';
          const statusLabel = status === 'correct' ? '✓ Correct' : status === 'wrong' ? '✗ Wrong' : '⏭ Skipped';

          const diff = (q.difficulty || 'medium').toLowerCase();
          const diffLabel = diff === 'easy' ? 'EASY' : diff === 'hard' ? 'HARD' : 'MEDIUM';
          const diffBg = diff === 'easy' ? '#d1fae5' : diff === 'hard' ? '#fee2e2' : '#fef3c7';
          const diffTx = diff === 'easy' ? '#065f46' : diff === 'hard' ? '#991b1b' : '#92400e';
          const diffBrd = diff === 'easy' ? '#a7f3d0' : diff === 'hard' ? '#fca5a5' : '#fcd34d';

          // 2-column options grid
          const optsHtml = q.options.map((opt, oi) => {
            const isCor = opt === q.correctAnswer;
            const isUsr = opt === ua;
            const isWrongUser = isUsr && !isCor;
            const letter = String.fromCharCode(65 + oi);

            let optBg = 'transparent';
            let optBorder = 'transparent';
            let keyColor = '#777';
            let tag = '';

            if (status === 'skipped') {
              if (isCor) {
                optBg = '#ecfdf5'; optBorder = '#a7f3d0'; keyColor = '#059669';
                tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#d1fae5;color:#065f46;white-space:nowrap;margin-left:3px;font-family:Arial,sans-serif;">← Answer</span>`;
              }
            } else if (isCor && isUsr) {
              optBg = '#ecfdf5'; optBorder = '#6ee7b7'; keyColor = '#059669';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#d1fae5;color:#065f46;white-space:nowrap;margin-left:3px;font-family:Arial,sans-serif;">✓ Correct</span>`;
            } else if (isCor) {
              optBg = '#ecfdf5'; optBorder = '#6ee7b7'; keyColor = '#059669';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#d1fae5;color:#065f46;white-space:nowrap;margin-left:3px;font-family:Arial,sans-serif;">← Answer</span>`;
            } else if (isWrongUser) {
              optBg = '#fff1f2'; optBorder = '#fca5a5'; keyColor = '#dc2626';
              tag = `<span style="font-size:8px;font-weight:900;padding:2px 6px;border-radius:99px;background:#fee2e2;color:#991b1b;white-space:nowrap;margin-left:3px;font-family:Arial,sans-serif;">✗ Yours</span>`;
            }

            return `<div style="display:flex;align-items:flex-start;gap:7px;padding:6px 10px;border-radius:7px;font-size:12px;line-height:1.5;background:${optBg};border:1.5px solid ${optBorder};">
              <span style="font-size:10px;font-weight:800;min-width:22px;flex-shrink:0;margin-top:1px;font-family:'Courier New',monospace;color:${keyColor};">(${letter})</span>
              <span style="flex:1;">${esc(opt)}</span>${tag}
            </div>`;
          }).join('');

          const skipNotice = status === 'skipped'
            ? `<div style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:10px;color:#9ca3af;font-style:italic;font-family:Arial,sans-serif;">⏭ This question was not attempted</div>`
            : '';

          // Rationale — server-generated AI fills gaps
          const bookRat = includeRationale ? (q.rationale?.trim() || '') : '';
          const aiRat = includeRationale ? (rationaleCache[q.question]?.trim() || '') : '';
          let ratHtml = '';
          if (bookRat || aiRat) {
            ratHtml = '<div style="margin-top:10px;display:flex;flex-direction:column;gap:5px;">';
            if (bookRat) {
              ratHtml += `<div style="padding:10px 14px;border-radius:0 8px 8px 0;font-size:11.5px;line-height:1.5;border-left:4px solid #f59e0b;background:#fffbeb;color:#78350f;">
                <span style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#b45309;display:block;margin-bottom:4px;font-family:Arial,sans-serif;">Rationale</span>
                ${rationaleHtmlList(bookRat)}
              </div>`;
            }
            if (aiRat) {
              ratHtml += `<div style="padding:10px 14px;border-radius:0 8px 8px 0;font-size:11.5px;line-height:1.5;border-left:4px solid #7c3aed;background:#f5f3ff;color:#4c1d95;">
                <span style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#6d28d9;display:block;margin-bottom:4px;font-family:Arial,sans-serif;">AI Explanation</span>
                ${rationaleHtmlList(aiRat)}
              </div>`;
            }
            ratHtml += '</div>';
          }

          const imgHtml = q.imageUrl ? `<div style="text-align:center;margin-bottom:8px;"><img src="${esc(q.imageUrl)}" alt="" style="max-width:100%;max-height:140px;border-radius:6px;border:1px solid #e5e7eb;" /></div>` : '';

          cards.push(`<div style="border:1.5px solid #e5e7eb;border-left:5px solid ${borderColor};border-radius:10px;padding:14px 16px;margin-bottom:10px;page-break-inside:avoid;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.04);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span style="font-size:10px;font-weight:900;color:#6b7280;font-family:Arial,sans-serif;">Q.${globalIdx}</span>
              <div style="display:flex;gap:4px;">
                <span style="font-size:8.5px;font-weight:800;padding:2px 8px;border-radius:99px;background:${statusBadgeBg};color:${statusBadgeTx};border:1px solid ${statusBadgeBrd};font-family:Arial,sans-serif;">${statusLabel}</span>
                <span style="font-size:8.5px;font-weight:800;padding:2px 8px;border-radius:99px;background:${diffBg};color:${diffTx};border:1px solid ${diffBrd};font-family:Arial,sans-serif;">${diffLabel}</span>
              </div>
            </div>
            ${imgHtml}
            <p style="font-size:13px;font-weight:700;color:#111;line-height:1.7;margin-bottom:10px;font-family:'Segoe UI',Arial,sans-serif;">${esc(q.question)}</p>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin:8px 0 6px;">${optsHtml}</div>
            ${skipNotice}
            ${ratHtml}
          </div>`);
        });
      });
      return { html: cards.join(''), count: globalIdx };
    };

    const { html: questionsHtml, count: qCount } = buildQuestionCards();
    const filterLabel = filter === 'all' ? 'All Questions' : filter === 'correct' ? 'Correct Answers' : filter === 'wrong' ? 'Mistakes' : 'Skipped';

    // ── Insights & Weak Areas ──
    const weakAreas = subjectBreakdown.filter(b => b.accuracy < 50);
    const strongArea = subjectBreakdown.find(b => b.accuracy >= 75);
    const insightsRows = subjectBreakdown.map(b => {
      const color = b.accuracy >= 75 ? '#10b981' : b.accuracy >= 50 ? '#f59e0b' : '#ef4444';
      const status = b.accuracy >= 75 ? '✓ Mastered' : b.accuracy >= 50 ? '📖 Practice' : '⚠ Needs Work';
      const bgC = b.accuracy >= 75 ? '#d1fae5' : b.accuracy >= 50 ? '#fef3c7' : '#fee2e2';
      const txC = b.accuracy >= 75 ? '#065f46' : b.accuracy >= 50 ? '#92400e' : '#991b1b';
      return `<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;border:1px solid #f0f0f0;background:#fafafa;margin-bottom:5px;">
        <span style="font-size:11px;font-weight:700;color:#374151;flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-family:Arial,sans-serif;">${esc(b.subject)}</span>
        <div style="flex:2;background:#e5e7eb;border-radius:99px;height:6px;overflow:hidden;"><div style="height:100%;width:${b.accuracy}%;background:${color};border-radius:99px;"></div></div>
        <span style="font-size:11px;font-weight:900;min-width:36px;text-align:right;color:${color};font-family:Arial,sans-serif;">${b.accuracy}%</span>
        <span style="font-size:8px;font-weight:800;padding:2px 8px;border-radius:99px;white-space:nowrap;background:${bgC};color:${txC};border:1px solid ${color}40;font-family:Arial,sans-serif;">${status}</span>
      </div>`;
    }).join('');

    let insightsCallouts = '';
    if (weakAreas.length) {
      insightsCallouts += `<div style="margin-top:10px;padding:10px 14px;background:#fff7ed;border-left:4px solid #f59e0b;border-radius:0 8px 8px 0;">
        <div style="font-size:8px;font-weight:900;color:#b45309;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;font-family:Arial,sans-serif;">⚠️ Priority Review Areas</div>
        <p style="font-size:11.5px;color:#78350f;font-family:Arial,sans-serif;margin:0;">Focus on: ${weakAreas.map(w => `<strong>${esc(w.subject)}</strong> (${w.accuracy}%)`).join(', ')}</p>
      </div>`;
    }
    if (strongArea) {
      insightsCallouts += `<div style="margin-top:7px;padding:10px 14px;background:#ecfdf5;border-left:4px solid #10b981;border-radius:0 8px 8px 0;">
        <div style="font-size:8px;font-weight:900;color:#065f46;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;font-family:Arial,sans-serif;">✅ Strongest Area</div>
        <p style="font-size:11.5px;color:#064e3b;font-family:Arial,sans-serif;margin:0;"><strong>${esc(strongArea.subject)}</strong> — Keep it up!</p>
      </div>`;
    }
    insightsCallouts += `<div style="margin-top:7px;padding:10px 14px;background:#eff6ff;border-left:4px solid #3b82f6;border-radius:0 8px 8px 0;">
      <div style="font-size:8px;font-weight:900;color:#1d4ed8;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:3px;font-family:Arial,sans-serif;">⏰ Time Management</div>
      <p style="font-size:11.5px;color:#1e40af;font-family:Arial,sans-serif;margin:0;">Total: ${timeStr} · Avg. ${avgTimeStr} per question</p>
    </div>`;

    // ── Answer Key Appendix ──
    const appendixRows: string[] = [];
    let akIdx = 0;
    results.forEach(r => {
      r.quizData.forEach((q, i) => {
        const ua = r.userAnswers[i];
        const status = ua === null ? 'skipped' : ua === q.correctAnswer ? 'correct' : 'wrong';
        if (filter !== 'all' && status !== filter) return;
        akIdx++;
        const corrIdx = q.options.indexOf(q.correctAnswer);
        const userIdx = ua ? q.options.indexOf(ua) : -1;
        const tdBg = status === 'correct' ? '#ecfdf5' : status === 'wrong' ? '#fff1f2' : '#fafafa';
        const tdColor = status === 'correct' ? '#065f46' : status === 'wrong' ? '#991b1b' : '#9ca3af';
        const icon = status === 'correct' ? '✓' : status === 'wrong' ? '✗' : '—';
        appendixRows.push(`<tr>
          <td style="text-align:center;font-weight:700;padding:5px 8px;border-bottom:1px solid #f0f0f0;">${akIdx}</td>
          <td style="max-width:240px;padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#374151;">${esc(q.question.slice(0, 65))}${q.question.length > 65 ? '…' : ''}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;color:#374151;">${corrIdx >= 0 ? `(${String.fromCharCode(65 + corrIdx)})` : ''} ${esc(q.correctAnswer.slice(0, 30))}</td>
          <td style="padding:5px 8px;border-bottom:1px solid #f0f0f0;background:${tdBg};color:${tdColor};font-weight:800;">${ua ? (userIdx >= 0 ? `(${String.fromCharCode(65 + userIdx)})` : '') + ' ' + esc(ua.slice(0, 30)) : '—'}</td>
          <td style="text-align:center;padding:5px 8px;border-bottom:1px solid #f0f0f0;background:${tdBg};color:${tdColor};font-weight:900;font-size:13px;">${icon}</td>
        </tr>`);
      });
    });

    const accColor = accuracy >= 75 ? '#10b981' : accuracy >= 50 ? '#f59e0b' : '#ef4444';

    const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: a4; margin: 16mm 14mm; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; color: #1a1a1a; font-size: 11pt; line-height: 1.7; margin: 0; padding: 0; }
  * { box-sizing: border-box; }
</style>
</head>
<body>

<!-- ═══ COVER ═══ -->
<div style="border:2px solid #1a1a1a;border-radius:4px;padding:20px 24px;margin-bottom:16px;">
  <div style="font-size:8px;font-weight:800;letter-spacing:0.22em;text-transform:uppercase;color:#888;text-align:center;margin-bottom:10px;font-family:Arial,sans-serif;">🎓 Quiz Master Pro — Performance Report</div>
  <div style="border-top:1px solid #ddd;margin:6px 0 14px;"></div>
  <div style="display:flex;gap:20px;align-items:center;">
    <div style="flex:1;min-width:220px;">
      <h1 style="font-size:18px;font-weight:900;line-height:1.3;margin:0 0 10px;font-family:Arial,sans-serif;color:#111;">${esc(title)}</h1>
      <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:12px;">
        ${subject ? `<span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">📚 ${esc(subject)}</span>` : ''}
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">📅 ${esc(date)}</span>
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">${totalQ} Questions</span>
        <span style="font-size:9px;font-weight:700;padding:3px 10px;border-radius:99px;border:1px solid #e5e7eb;background:#f8fafc;color:#555;font-family:Arial,sans-serif;">📝 ${esc(filterLabel)}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:${gradeColor};font-family:Arial,sans-serif;">${grade}</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Grade</div>
        </div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:#10b981;font-family:Arial,sans-serif;">${correct}/${totalQ}</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Correct</div>
        </div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:#ef4444;font-family:Arial,sans-serif;">${wrong}</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Wrong</div>
        </div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:#f59e0b;font-family:Arial,sans-serif;">${skipped}</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Skipped</div>
        </div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:${scoreColor};font-family:Arial,sans-serif;">${accuracy}%</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Accuracy</div>
        </div>
        <div style="border:1.5px solid #e5e7eb;border-radius:10px;padding:8px 14px;text-align:center;min-width:62px;background:#fafafa;">
          <div style="font-size:16px;font-weight:900;color:#8b5cf6;font-family:Arial,sans-serif;">${timeStr}</div>
          <div style="font-size:7px;letter-spacing:0.06em;text-transform:uppercase;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Time</div>
        </div>
      </div>
      <span style="display:inline-block;padding:5px 14px;border-radius:99px;font-size:11px;font-weight:800;font-family:Arial,sans-serif;border:1.5px solid ${isPassed ? '#a7f3d0' : '#fca5a5'};background:${isPassed ? '#d1fae5' : '#fee2e2'};color:${isPassed ? '#065f46' : '#991b1b'};">
        ${isPassed ? '✅ PASSED' : '❌ FAILED'} · ${pct}%
      </span>
      <div style="margin-top:10px;padding:8px 12px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;font-size:11px;font-family:Arial,sans-serif;color:#6b7280;">
        <strong style="color:#374151;">Score:</strong>
        <span style="color:#10b981;font-weight:800;">${safeNum(gain).toFixed(1)} Gain</span>
        <span style="color:#9ca3af;"> − </span>
        <span style="color:#ef4444;font-weight:800;">${safeNum(penalty).toFixed(1)} Penalty</span>
        <span style="color:#9ca3af;"> = </span>
        <span style="color:${scoreColor};font-weight:900;">${safeNum(results[0]?.netScore).toFixed(1)} Net</span>
      </div>
    </div>
    <div style="flex-shrink:0;">${gaugeSvg}</div>
  </div>
</div>

<!-- ═══ DASHBOARD ═══ -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:14px;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📊 Performance Dashboard</span>
  </div>
  <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin-bottom:12px;">
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#3b82f6;font-family:Arial,sans-serif;">${totalQ}</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Total</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#10b981;font-family:Arial,sans-serif;">${correct}</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Correct</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#ef4444;font-family:Arial,sans-serif;">${wrong}</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Wrong</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#f59e0b;font-family:Arial,sans-serif;">${skipped}</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Skipped</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:${scoreColor};font-family:Arial,sans-serif;">${pct}%</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Score</div></div>
    <div style="text-align:center;padding:10px 4px;border-radius:8px;border:1.5px solid #e5e7eb;background:#fafafa;"><div style="font-size:18px;font-weight:900;color:#8b5cf6;font-family:Arial,sans-serif;">${accuracy}%</div><div style="font-size:8px;text-transform:uppercase;letter-spacing:0.07em;color:#9ca3af;font-weight:700;font-family:Arial,sans-serif;">Accuracy</div></div>
  </div>

  <!-- Progress bars -->
  <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
    <div style="font-size:10px;font-weight:700;color:#6b7280;min-width:58px;font-family:Arial,sans-serif;">Score</div>
    <div style="flex:1;background:#f3f4f6;border-radius:99px;height:7px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${scoreColor};border-radius:99px;"></div></div>
    <div style="font-size:11px;font-weight:900;min-width:36px;text-align:right;color:${scoreColor};font-family:Arial,sans-serif;">${pct}%</div>
  </div>
  <div style="display:flex;align-items:center;gap:10px;margin-top:8px;padding-top:8px;border-top:1px solid #f3f4f6;">
    <div style="font-size:10px;font-weight:700;color:#6b7280;min-width:58px;font-family:Arial,sans-serif;">Accuracy</div>
    <div style="flex:1;background:#f3f4f6;border-radius:99px;height:7px;overflow:hidden;"><div style="height:100%;width:${accuracy}%;background:${accColor};border-radius:99px;"></div></div>
    <div style="font-size:11px;font-weight:900;min-width:36px;text-align:right;color:${accColor};font-family:Arial,sans-serif;">${accuracy}%</div>
  </div>

  <!-- Charts row: donut + subject bars -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:14px;">
    <div style="background:#fafafa;border:1.5px solid #f0f0f0;border-radius:10px;padding:14px;">
      <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:10px;font-family:Arial,sans-serif;">Answer Breakdown</div>
      ${donutSvg}
    </div>
    <div style="background:#fafafa;border:1.5px solid #f0f0f0;border-radius:10px;padding:14px;">
      <div style="font-size:8px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#9ca3af;margin-bottom:10px;font-family:Arial,sans-serif;">Subject Accuracy</div>
      ${subjectBarsHtml}
    </div>
  </div>
</div>

<!-- ═══ QUESTIONS ═══ -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:14px;page-break-before:always;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📝 Question-by-Question Review</span>
    <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:99px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">${qCount} Questions — ${esc(filterLabel)}</span>
  </div>
  ${questionsHtml || '<p style="color:#9ca3af;text-align:center;padding:24px;font-family:Arial,sans-serif;">No questions match this filter.</p>'}
</div>

<!-- ═══ INSIGHTS & WEAK AREAS ═══ -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:14px;page-break-before:always;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">🎯 Insights &amp; Weak Areas</span>
  </div>
  ${insightsRows || '<p style="color:#9ca3af;font-size:12px;font-family:Arial,sans-serif;">Complete more quizzes to see insights.</p>'}
  ${insightsCallouts}
</div>

<!-- ═══ ANSWER KEY APPENDIX ═══ -->
<div style="background:#fff;border:1.5px solid #e5e7eb;border-radius:12px;padding:18px 20px;margin-bottom:14px;page-break-before:always;">
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;padding-bottom:9px;border-bottom:2px solid #1a1a1a;">
    <span style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.14em;color:#333;font-family:Arial,sans-serif;">📑 Answer Key / Appendix</span>
    <span style="font-size:9px;font-weight:700;padding:3px 9px;border-radius:99px;background:#f3f4f6;color:#6b7280;border:1px solid #e5e7eb;font-family:Arial,sans-serif;">${akIdx} Questions</span>
  </div>
  <table style="width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums;">
    <thead><tr>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:center;width:32px;font-family:Arial,sans-serif;">#</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Question</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Correct Answer</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:left;font-family:Arial,sans-serif;">Your Answer</th>
      <th style="background:#1a1a1a;color:#fff;font-weight:800;font-size:8px;text-transform:uppercase;letter-spacing:0.07em;padding:7px 8px;text-align:center;font-family:Arial,sans-serif;">Result</th>
    </tr></thead>
    <tbody>${appendixRows.join('')}</tbody>
  </table>
</div>

<!-- ═══ FOOTER ═══ -->
<div style="text-align:center;padding:14px;margin-top:20px;border-top:1.5px solid #e5e7eb;font-size:10px;color:#9ca3af;line-height:1.7;font-family:Arial,sans-serif;">
  Generated by <strong>Quiz Master Pro</strong> · ${esc(date)} · ${qCount} questions reviewed
</div>

</body>
</html>`;

    const subjectSlug = subject ? `_${subject.replace(/[^a-zA-Z0-9]/g, '')}` : '';
    const dateSlug = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `QMP_${reportType === 'full' ? 'Report' : reportType === 'notes' ? 'Notes' : 'Exam'}${subjectSlug}_${dateSlug}.pdf`;

    const { url } = await ZitePdf.renderHtml({ html, filename });

    return { url, filename };
  },
});
