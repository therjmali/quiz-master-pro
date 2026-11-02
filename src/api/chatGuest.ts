import { enrichCurrentUser } from '../lib/currentUser';
import { z } from 'zod';
import { zite } from 'zitejs/db';
import { createEndpoint } from 'zitejs/backend';
import Anthropic from '@anthropic-ai/sdk';

function parseJsonSafe(str: string | undefined | null): any {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

function getToday(tz: string) {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now); // YYYY-MM-DD
}

function getWeekStart(tz: string) {
  const today = new Date(getToday(tz));
  const day = today.getDay();
  today.setDate(today.getDate() - day);
  return today.toISOString().split('T')[0];
}

function buildQuestionDetails(record: any): string {
  const quizData = parseJsonSafe(record.quizDataJson);
  const userAnswers = parseJsonSafe(record.userAnswersJson);
  if (!quizData || !Array.isArray(quizData)) return '';

  const lines: string[] = [];
  for (let i = 0; i < quizData.length; i++) {
    const q = quizData[i];
    const userAns = userAnswers ? (Array.isArray(userAnswers) ? userAnswers[i] : userAnswers[String(i)]) : null;
    const correct = q.correctAnswer || q.answer || q.correct;
    const isCorrect = userAns != null && String(userAns).trim().toLowerCase() === String(correct).trim().toLowerCase();
    const isSkipped = userAns == null || userAns === '' || userAns === -1;
    const status = isSkipped ? '⏭ SKIPPED' : isCorrect ? '✅ CORRECT' : '❌ WRONG';

    lines.push(`  Q${i + 1}: ${(q.question || '').slice(0, 200)}`);
    if (q.options && Array.isArray(q.options)) {
      q.options.forEach((opt: string, j: number) => {
        lines.push(`    ${String.fromCharCode(65 + j)}) ${(opt || '').slice(0, 120)}`);
      });
    }
    lines.push(`    Your Answer: ${isSkipped ? 'SKIPPED' : userAns} | Correct: ${correct} | ${status}`);
    if (q.rationale) lines.push(`    Rationale: ${(q.rationale || '').slice(0, 200)}`);
  }
  return lines.join('\n');
}

export default createEndpoint({
  description: 'Smart AI chatbot with full quiz data access — questions, answers, rationales, today/week stats. Works for logged-in and guest users.',
  authenticated: false,
  stream: true,
  inputSchema: z.object({
    message: z.string(),
    conversationHistory: z.array(z.object({
      role: z.enum(['user', 'assistant']),
      content: z.string(),
    })).optional(),
    localSettings: z.string().optional(),
    localHistorySummary: z.string().optional(),
  }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ input, context, stream }) => {
    await enrichCurrentUser(context);
    const isLoggedIn = !!(context && context.user);
    let dataContext = '';
    const tz = 'Asia/Calcutta';
    const todayStr = getToday(tz);
    const weekStartStr = getWeekStart(tz);

    if (isLoggedIn && context.user) {
      const email = context.user.email;

      // Fetch recent quiz history (capped at 50 records to avoid timeout)
      const batch = await zite.quizHistory.findAll({
        filters: { userEmail: email, isTrashed: false },
        limit: 50,
      });
      const allRecords: any[] = batch.records;

      // Sort by date descending
      allRecords.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

      // ── LIFETIME STATS ──
      const totalQuizzes = allRecords.length;
      const totalCorrect = allRecords.reduce((s, r) => s + (r.correctCount || 0), 0);
      const totalWrong = allRecords.reduce((s, r) => s + (r.wrongCount || 0), 0);
      const totalSkipped = allRecords.reduce((s, r) => s + (r.skippedCount || 0), 0);
      const totalQuestions = allRecords.reduce((s, r) => s + (r.totalQuestions || 0), 0);
      const totalTime = allRecords.reduce((s, r) => s + (r.timeTakenSeconds || 0), 0);
      const totalGain = allRecords.reduce((s, r) => s + (r.gain || 0), 0);
      const totalPenalty = allRecords.reduce((s, r) => s + (r.penalty || 0), 0);
      const avgPct = totalQuizzes > 0 ? Math.round(allRecords.reduce((s, r) => s + (r.percentage || 0), 0) / totalQuizzes) : 0;
      const bestPct = totalQuizzes > 0 ? Math.round(Math.max(...allRecords.map((r: any) => r.percentage || 0))) : 0;
      const worstPct = totalQuizzes > 0 ? Math.round(Math.min(...allRecords.map((r: any) => r.percentage || 0))) : 0;
      const accuracy = (totalCorrect + totalWrong) > 0 ? Math.round(totalCorrect / (totalCorrect + totalWrong) * 100) : 0;

      // ── TODAY'S DATA ──
      const todayRecords = allRecords.filter(r => r.createdAt && r.createdAt.startsWith(todayStr));
      const todayCorrect = todayRecords.reduce((s, r) => s + (r.correctCount || 0), 0);
      const todayWrong = todayRecords.reduce((s, r) => s + (r.wrongCount || 0), 0);
      const todaySkipped = todayRecords.reduce((s, r) => s + (r.skippedCount || 0), 0);
      const todayTotalQs = todayRecords.reduce((s, r) => s + (r.totalQuestions || 0), 0);
      const todayAccuracy = (todayCorrect + todayWrong) > 0 ? Math.round(todayCorrect / (todayCorrect + todayWrong) * 100) : 0;
      const todayAvgPct = todayRecords.length > 0 ? Math.round(todayRecords.reduce((s, r) => s + (r.percentage || 0), 0) / todayRecords.length) : 0;
      const todayTime = todayRecords.reduce((s, r) => s + (r.timeTakenSeconds || 0), 0);
      const todaySubjects = [...new Set(todayRecords.map(r => r.subject).filter(Boolean))];

      // Today's question-level details
      let todayQuestionDetails = '';
      for (const r of todayRecords.slice(0, 10)) {
        todayQuestionDetails += `\n--- Quiz: "${r.quizTitle || r.subject || 'Untitled'}" (${r.percentage}%, ${r.difficulty || 'mixed'}) ---\n`;
        todayQuestionDetails += buildQuestionDetails(r);
      }

      // ── THIS WEEK'S DATA ──
      const weekRecords = allRecords.filter(r => r.createdAt && r.createdAt.split('T')[0] >= weekStartStr);
      const weekCorrect = weekRecords.reduce((s, r) => s + (r.correctCount || 0), 0);
      const weekWrong = weekRecords.reduce((s, r) => s + (r.wrongCount || 0), 0);
      const weekSkipped = weekRecords.reduce((s, r) => s + (r.skippedCount || 0), 0);
      const weekTotalQs = weekRecords.reduce((s, r) => s + (r.totalQuestions || 0), 0);
      const weekAccuracy = (weekCorrect + weekWrong) > 0 ? Math.round(weekCorrect / (weekCorrect + weekWrong) * 100) : 0;
      const weekAvgPct = weekRecords.length > 0 ? Math.round(weekRecords.reduce((s, r) => s + (r.percentage || 0), 0) / weekRecords.length) : 0;

      // ── SUBJECT BREAKDOWN ──
      const subjectMap = new Map<string, { count: number; pctSum: number; correct: number; wrong: number; total: number }>();
      for (const r of allRecords) {
        const subj = r.subject?.trim();
        if (!subj) continue;
        const e = subjectMap.get(subj) || { count: 0, pctSum: 0, correct: 0, wrong: 0, total: 0 };
        e.count++; e.pctSum += r.percentage || 0; e.correct += r.correctCount || 0; e.wrong += r.wrongCount || 0; e.total += r.totalQuestions || 0;
        subjectMap.set(subj, e);
      }
      const subjects = [...subjectMap.entries()].map(([name, d]) => ({ name, ...d, avgPct: Math.round(d.pctSum / d.count) })).sort((a, b) => b.count - a.count);
      const weakSubjects = [...subjects].filter(s => s.total >= 3).sort((a, b) => a.avgPct - b.avgPct).slice(0, 5);

      // ── STREAK ──
      const dailyDates = [...new Set(allRecords.filter(r => r.createdAt).map(r => r.createdAt!.split('T')[0]))].sort((a, b) => b.localeCompare(a));
      let streak = 0;
      const yFmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
      const yesterday = yFmt.format(new Date(Date.now() - 86400000));
      if (dailyDates.length > 0 && (dailyDates[0] === todayStr || dailyDates[0] === yesterday)) {
        streak = 1;
        for (let i = 1; i < dailyDates.length; i++) {
          const diff = (new Date(dailyDates[i - 1]).getTime() - new Date(dailyDates[i]).getTime()) / 86400000;
          if (diff <= 1.5) streak++; else break;
        }
      }

      // ── LAST 3 QUIZZES — FULL QUESTION DETAILS ──
      let recentQuestionDetails = '';
      for (const r of allRecords.slice(0, 3)) {
        recentQuestionDetails += `\n--- Quiz: "${r.quizTitle || r.subject || 'Untitled'}" | ${r.percentage}% | ${r.correctCount}/${r.totalQuestions} | ${r.difficulty || 'mixed'} | ${r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : 'N/A'} ---\n`;
        recentQuestionDetails += buildQuestionDetails(r);
      }

      // ── DAILY BREAKDOWN (last 14 days) ──
      const dailyMap = new Map<string, { count: number; pctSum: number; correct: number; wrong: number }>();
      for (const r of allRecords) {
        if (!r.createdAt) continue;
        const day = r.createdAt.split('T')[0];
        const e = dailyMap.get(day) || { count: 0, pctSum: 0, correct: 0, wrong: 0 };
        e.count++; e.pctSum += r.percentage || 0; e.correct += r.correctCount || 0; e.wrong += r.wrongCount || 0;
        dailyMap.set(day, e);
      }
      const dailyEntries = [...dailyMap.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 14);

      // Recent 15 quiz summaries
      const recentSummary = allRecords.slice(0, 15).map(r =>
        `- ${r.quizTitle || r.subject || 'Quiz'} | ${r.percentage}% | ${r.correctCount}/${r.totalQuestions} correct | ${r.wrongCount} wrong | ${r.difficulty || 'mixed'} | ${r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : 'N/A'} | ${r.attemptType || 'Main'}`
      ).join('\n');

      dataContext = `
═══════════════════════════════════════
📅 TODAY'S PERFORMANCE (${todayStr})
═══════════════════════════════════════
- Quizzes Taken Today: ${todayRecords.length}
- Questions Attempted Today: ${todayTotalQs}
- Today Correct: ${todayCorrect} | Wrong: ${todayWrong} | Skipped: ${todaySkipped}
- Today Accuracy: ${todayAccuracy}%
- Today Average Score: ${todayAvgPct}%
- Today Study Time: ${Math.round(todayTime / 60)} minutes
- Today Subjects: ${todaySubjects.length > 0 ? todaySubjects.join(', ') : 'None'}
${todayRecords.length === 0 ? '⚠️ The user has NOT taken any quizzes today yet.' : ''}

${todayQuestionDetails ? `TODAY'S EVERY QUESTION (with user's answer & correct answer):\n${todayQuestionDetails}` : ''}

═══════════════════════════════════════
📊 THIS WEEK (${weekStartStr} to ${todayStr})
═══════════════════════════════════════
- Quizzes This Week: ${weekRecords.length}
- Questions This Week: ${weekTotalQs}
- Week Correct: ${weekCorrect} | Wrong: ${weekWrong} | Skipped: ${weekSkipped}
- Week Accuracy: ${weekAccuracy}%
- Week Average Score: ${weekAvgPct}%

═══════════════════════════════════════
🏆 LIFETIME STATS
═══════════════════════════════════════
- Name: ${context.user!.firstName || context.user!.displayName || email.split('@')[0]}
- Email: ${email}
- Total Quizzes: ${totalQuizzes} | Total Qs: ${totalQuestions}
- Correct: ${totalCorrect} | Wrong: ${totalWrong} | Skipped: ${totalSkipped}
- Accuracy: ${accuracy}% | Avg Score: ${avgPct}% | Best: ${bestPct}% | Worst: ${worstPct}%
- Study Time: ${Math.round(totalTime / 60)} min
- Gain: ${totalGain} | Penalty: ${totalPenalty} | Net: ${totalGain - totalPenalty}
- Current Streak: ${streak} day(s)

═══════════════════════════════════════
📚 SUBJECTS
═══════════════════════════════════════
${subjects.length > 0 ? subjects.slice(0, 20).map(s => `- ${s.name}: ${s.count} quizzes, Avg ${s.avgPct}%, ${s.correct} correct / ${s.wrong} wrong out of ${s.total}`).join('\n') : 'No subject data.'}

WEAKEST SUBJECTS:
${weakSubjects.length > 0 ? weakSubjects.map(s => `- ${s.name}: Avg ${s.avgPct}% (${s.wrong} wrong out of ${s.total})`).join('\n') : 'Not enough data.'}

═══════════════════════════════════════
📋 RECENT 15 QUIZ SUMMARIES
═══════════════════════════════════════
${recentSummary || 'No quizzes yet.'}

═══════════════════════════════════════
📝 LAST 3 QUIZZES — FULL QUESTION DETAILS
(Every question, options, user's answer, correct answer, rationale)
═══════════════════════════════════════
${recentQuestionDetails || 'No quiz data available.'}

═══════════════════════════════════════
📆 DAILY PERFORMANCE (last 14 days)
═══════════════════════════════════════
${dailyEntries.length > 0 ? dailyEntries.map(([day, d]) => `- ${day}: ${d.count} quiz(es), Avg ${Math.round(d.pctSum / d.count)}%, ${d.correct} correct / ${d.wrong} wrong`).join('\n') : 'No daily data.'}

${input.localSettings ? `\n═══════════════════════════════════════\n⚙️ USER SETTINGS\n═══════════════════════════════════════\n${input.localSettings}` : ''}
`;
    } else if (input.localHistorySummary) {
      dataContext = `
═══════════════════════════════════════
📊 USER QUIZ DATA (Local / Guest Mode)
═══════════════════════════════════════
${input.localHistorySummary}

${input.localSettings ? `\n⚙️ USER SETTINGS:\n${input.localSettings}` : ''}
`;
    } else {
      dataContext = `\n⚠️ No quiz data available. The user hasn't taken any quizzes yet.\n`;
    }

    const currentDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });

    const systemPrompt = `You are "QMP AI" — the ultra-smart personal study assistant inside Quiz Master Pro. You have COMPLETE access to the user's quiz data including every individual question, their answers, correct answers, rationales, scores, subjects, daily/weekly/lifetime stats, and settings.

═══ CRITICAL ANSWERING RULES ═══

1. **ANSWER THE EXACT QUESTION ASKED.** Do NOT give generic advice when they ask about specific data. If they ask "what is my today performance?" → give TODAY's numbers from the TODAY section. If they ask "what were my wrong answers today?" → list the actual questions marked ❌ WRONG from today's data.

2. **DATE-SPECIFIC QUERIES:**
   - "today" / "aaj" → Use ONLY the "TODAY'S PERFORMANCE" section. Today is ${todayStr}.
   - "this week" → Use ONLY the "THIS WEEK" section.
   - "overall" / "lifetime" / "total" → Use the "LIFETIME STATS" section.
   - If today has 0 quizzes, say clearly: "You haven't taken any quizzes today yet."

3. **QUESTION-LEVEL QUERIES:**
   - "What did I get wrong?" → List the actual questions marked ❌ WRONG with the correct answer.
   - "Show my incorrect answers" → List each wrong question with what they answered and what was correct.
   - "What topics am I weak in?" → Analyze the subjects AND the wrong questions to identify specific weak areas.
   - You have access to individual questions, options, user's answer, correct answer, and rationale for recent quizzes. USE THIS DATA.

4. **ACCURACY & PERCENTAGE:**
   - Accuracy = Correct / (Correct + Wrong) × 100. Skipped questions are excluded from accuracy.
   - Score percentage = what the quiz system calculated (shown in the data).
   - Always cite the exact numbers. Never estimate or round incorrectly.

5. **STYLE:**
   - Be warm, encouraging, and data-driven. Use emojis sparingly (1-2 per message max).
   - Use markdown formatting (bold, bullet points, tables) for readability.
   - Keep responses concise — 2-5 paragraphs max unless they ask for detailed analysis.
   - Cite specific numbers from the data. Never make up statistics.
   - If asked something not in your data, say honestly what data you DO have.

6. **STUDY TIPS:** When giving study advice, base it on the user's ACTUAL weak subjects and wrong answers from the data, not generic tips.

${isLoggedIn ? '✅ User is logged in — you have full cloud data with question-level details.' : '⚠️ Guest mode — limited local data. Encourage sign-in for full analytics.'}

Current date: ${currentDate}
Timezone: ${tz}

${dataContext}`;

    // Build Anthropic conversation history
    const messages: Anthropic.MessageParam[] = [
      ...(input.conversationHistory || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: input.message },
    ];

    const client = new Anthropic({ apiKey: process.env.ZITE_ANTHROPIC_ACCESS_TOKEN! });
    const messageStream = client.messages.stream({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      temperature: 0.7,
    });

    let fullText = '';
    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        await stream.write(event.delta.text);
      }
    }

    return { text: fullText };
  },
});
