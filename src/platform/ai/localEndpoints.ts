/**
 * In-app implementations of the AI endpoints, used when there is no backend (the standalone
 * GitHub / APK build) or the backend is unreachable. They reuse the very same prompts and parsers as
 * the server versions (src/lib/aiPrompts.ts & src/api/*.ts), so questions, notes, study plans,
 * OCR extraction, fact verification, and assistant chats work directly on the device with BYOK keys.
 */
import { buildExplainPrompt, buildQuizSystemPrompt, buildSimpleExplainPrompt, EXPLAIN_SYSTEM_PROMPT, extractJsonArray, validateAndMap } from '../../lib/aiPrompts';
import { cleanExplanationBlock } from '../../lib/rationaleFormat';
import { getHistorySync } from '../../utils/historyStore';
import {
  AiError,
  availableProviders,
  callProvider,
  providerSupportsFiles,
  withFallback,
  type ChatTurn,
  type InlineFile,
  type ProviderId,
} from './providers';

export interface KeyOverrides {
  userGeminiKey?: string;
  userCohereKey?: string;
  userOpenaiKey?: string;
  userAnthropicKey?: string;
}

function overrides(input?: KeyOverrides | null): Partial<Record<ProviderId, string | undefined>> {
  if (!input) return {};
  return { gemini: input.userGeminiKey, cohere: input.userCohereKey, openai: input.userOpenaiKey, anthropic: input.userAnthropicKey };
}

/* ── 1. generateQuiz ──────────────────────────────────────────────────────── */

export interface GenerateQuizInput extends KeyOverrides {
  text?: string;
  files?: InlineFile[];
  difficulty?: string;
}

export async function localGenerateQuiz(input: GenerateQuizInput, fetchImpl?: typeof fetch) {
  const files = input.files ?? [];
  let providers = availableProviders(overrides(input));
  if (files.length > 0) {
    providers = providers.filter(p => providerSupportsFiles(p.provider, files));
    if (providers.length === 0) {
      const hasPdf = files.some(f => !f.mimeType.toLowerCase().startsWith('image/'));
      throw new AiError(
        hasPdf
          ? 'Reading PDFs needs a Google Gemini key. Paste the text instead, or add a Gemini key in Settings -> AI.'
          : 'Reading images needs a Google Gemini, Anthropic Claude, or OpenAI key in Settings -> AI.',
        'unsupported',
      );
    }
  }
  const system = buildQuizSystemPrompt(input.difficulty || 'all');
  const content = input.text || 'Generate MCQs from the attached file(s).';
  const { value, provider } = await withFallback({
    providers,
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, system, prompt: `Content:\n${content}`, files, fetchImpl });
      const questions = validateAndMap(extractJsonArray(text));
      if (questions.length === 0) throw new AiError('No valid questions found. Try different content or paste MCQs directly.', 'bad_response', p.provider);
      return questions;
    },
  });
  return { questions: value, provider: `${provider}_device` };
}

/* ── 2. explainQuestion ───────────────────────────────────────────────────── */

export interface ExplainInput extends KeyOverrides {
  question: string;
  correctAnswer: string;
  userAnswer?: string;
  options?: string[];
  status: 'correct' | 'wrong' | 'skipped';
  style?: 'normal' | 'simple';
}

export async function localExplainQuestion(input: ExplainInput, fetchImpl?: typeof fetch) {
  const prompt = input.style === 'simple'
    ? buildSimpleExplainPrompt(input.question, input.correctAnswer)
    : buildExplainPrompt(input.question, input.correctAnswer, input.userAnswer, input.options, input.status);
  const { value, provider } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, system: EXPLAIN_SYSTEM_PROMPT, prompt, fetchImpl });
      const clean = cleanExplanationBlock(text);
      if (!clean) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return clean;
    },
  });
  return { rationale: value, provider: `${provider}_device` };
}

/* ── 3. generateRevisionSheet ─────────────────────────────────────────────── */

export interface RevisionInput extends KeyOverrides {
  wrongQuestions: { question: string; correctAnswer: string; userAnswer?: string; rationale?: string }[];
  subject?: string;
  quizTitle?: string;
}

/** Same prompt as the server endpoint (src/api/generateRevisionSheet.ts), run with the user's own key on the device. */
export function buildRevisionPrompt(input: RevisionInput): string {
  const questionsText = input.wrongQuestions.map((q, i) =>
    `Q${i + 1}: ${q.question}\nCorrect Answer: ${q.correctAnswer}${q.userAnswer ? `\nStudent Picked: ${q.userAnswer}` : ''}${q.rationale ? `\nRationale: ${q.rationale}` : ''}`).join('\n\n');
  return `You are an expert tutor creating a CONCISE REVISION SHEET for a student who got these questions wrong.

${input.subject ? `Subject: ${input.subject}` : ''}
${input.quizTitle ? `Quiz: ${input.quizTitle}` : ''}
Total wrong: ${input.wrongQuestions.length}

WRONG QUESTIONS:
${questionsText}

FORMAT RULES - FOLLOW EXACTLY:
- Use proper markdown formatting throughout
- Every bullet point MUST be on its own line
- Leave a blank line before every heading (### )
- Bold key terms with **double asterisks**
- Keep each bullet to 1-2 lines maximum - exam-focused, not verbose

PRODUCE THIS EXACT STRUCTURE:

## Quick Revision Sheet

### Key Facts

Write each concept the student got wrong as a bullet point. Start each bullet with the **key term** in bold, followed by a dash and a clear 1-line explanation. Group related facts together.

### Memory Aids

Create 2-3 memorable mnemonics or memory tricks for the hardest concepts. Format each one as:

- **MNEMONIC PHRASE** - What it helps you remember: explanation

### Common Mistakes

For each wrong answer the student gave, explain WHY it was wrong in 1 line:

- Q1: You picked "X" - this is wrong because [reason]. The answer is **Y** because [reason].

### Quick Recall

Bullet-point summary of the MOST critical facts (max 8 bullets). Each line:

- **Term** - one-line definition or fact

---

> Focus on the Common Mistakes section to understand your errors, then memorize the Quick Recall points.

IMPORTANT: Output ONLY the markdown. No extra commentary. No code blocks. Keep it concise and scannable.`;
}

export async function localGenerateRevisionSheet(input: RevisionInput, fetchImpl?: typeof fetch) {
  const prompt = buildRevisionPrompt(input);
  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = (await callProvider({ provider: p.provider, key: p.key, system: 'You are an expert exam tutor. Answer only with the requested markdown.', prompt, fetchImpl })).trim();
      if (!text) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return text.replace(/^```(?:markdown)?\s*|\s*```$/g, '');
    },
  });
  return { revisionSheet: value };
}

/* ── 4. generateNotes ─────────────────────────────────────────────────────── */

export interface GenerateNotesInput extends KeyOverrides {
  questions: { question: string; correctAnswer: string; rationale?: string; subject?: string }[];
  subject?: string;
  noteType?: 'compact' | 'detailed';
}

export async function localGenerateNotes(input: GenerateNotesInput, fetchImpl?: typeof fetch) {
  const qs = (input.questions || []).slice(0, 60);
  if (qs.length === 0) throw new AiError('No questions available to generate study notes from.', 'bad_response');
  const subjectHint = input.subject || 'Exam Preparation';
  const todayDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
  const questionsText = qs.map((q, i) =>
    `MCQ ${i + 1}:\nQ: ${q.question}\n✓ Answer: ${q.correctAnswer}${q.rationale ? `\nRationale: ${q.rationale}` : ''}`
  ).join('\n\n');

  const prompt = `You are an expert educational assistant designed to convert Multiple Choice Questions (MCQs) and their rationales into concise, highly readable study notes.

SUBJECT: ${subjectHint}
DATE: ${todayDate}
TOTAL: ${qs.length} questions

STRICT FORMATTING RULES — Follow exactly:
For every MCQ provided:
1. The Main Statement: Combine the core concept of the question and the correct answer into a single, declarative sentence on one line. Do NOT include wrong options or question marks. Number the statement (e.g., 1), 2)).
2. The Rationale: Condense the rationale into a maximum of 2 bullet points starting with: * 📖 - 
   Rationale bullet points must be PLAIN TEXT ONLY (no bold, no HTML tags).
3. Bold Keywords (Main Statement ONLY): Strategically highlight important keywords and core concepts using **bold markdown** in the numbered main statement line only.

REQUIRED OUTPUT STRUCTURE:
# 📄 ${subjectHint} — High-Yield Study Notes
### ${todayDate} · ${qs.length} Questions

---

1) [Single declarative statement with **answer/key terms** highlighted in bold]

* 📖 - [Most important fact — PLAIN TEXT ONLY]
* 📖 - [Second important fact — PLAIN TEXT ONLY]

---

[...continue for all questions...]

---

## 📊 Quick Revision Table

| # | Fact | Answer |
|---|------|--------|
| 1 | [concept] | **[answer]** |

---
> 📝 *R.J Quiz Study Notes · ${todayDate}*

- ${input.noteType === 'detailed' ? 'DETAILED: Include values, doses, classifications, mnemonics where relevant in the 2 bullets.' : 'COMPACT: Keep bullets focused on the single most important fact per bullet.'}
- NO markdown fences, NO preamble, NO HTML tags.

QUESTIONS TO CONVERT:
${questionsText}

Output ONLY the formatted Markdown. Start with # heading.`;

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, prompt, maxTokens: 8192, timeoutMs: 90_000, fetchImpl });
      const cleaned = text.trim().replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```\s*$/i, '');
      if (!cleaned) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return cleaned;
    },
  });
  return { notes: value, questionCount: qs.length };
}

/* ── 5. generateRevisionNotes ─────────────────────────────────────────────── */

export interface GenerateRevisionNotesInput extends KeyOverrides {
  questions: { question: string; options: string[]; correctAnswer: string; rationale?: string; difficulty?: string }[];
  subject?: string;
  quizTitle?: string;
}

export async function localGenerateRevisionNotes(input: GenerateRevisionNotesInput, fetchImpl?: typeof fetch) {
  const qs = input.questions || [];
  if (qs.length === 0) throw new AiError('No questions provided for revision notes.', 'bad_response');
  const qList = qs.map((q, i) =>
    `Q${i + 1}: ${q.question}\nAnswer: ${q.correctAnswer}${q.rationale ? `\nRationale: ${q.rationale}` : ''}${q.difficulty ? `\nDifficulty: ${q.difficulty}` : ''}`
  ).join('\n\n');

  const prompt = `You are a professional study notes generator. Given these ${qs.length} quiz questions${input.subject ? ` from "${input.subject}"` : ''}${input.quizTitle ? ` (Quiz: "${input.quizTitle}")` : ''} and their correct answers, generate concise, exam-focused revision notes.

RULES:
1. Organize by topic/concept clusters (not question-by-question)
2. Use clear bullet points with bold key terms
3. Include mnemonics or memory aids where helpful
4. Add "⚠️ Common Mistake" callouts for tricky concepts
5. Keep it concise — exam revision style, not textbook
6. Use markdown formatting (## headings, **bold**, - bullets)
7. End with a "🎯 Quick Recall Checklist" of the most important points

QUESTIONS:
${qList}

Generate the revision notes now:`;

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = (await callProvider({ provider: p.provider, key: p.key, prompt, maxTokens: 4096, fetchImpl })).trim();
      if (!text) throw new AiError('The AI answer was empty.', 'bad_response', p.provider);
      return text.replace(/^```(?:markdown)?\s*|\s*```$/g, '');
    },
  });
  return { notes: value };
}

/* ── 6. generateStudyPlan ─────────────────────────────────────────────────── */

export interface GenerateStudyPlanInput extends KeyOverrides {
  weakTopics: { subject: string; accuracy: number; totalQuestions: number }[];
  examDate?: string;
  hoursPerDay?: number;
  totalQuizzes: number;
  averageScore: number;
}

export async function localGenerateStudyPlan(input: GenerateStudyPlanInput, fetchImpl?: typeof fetch) {
  const hoursPerDay = input.hoursPerDay ?? 2;
  const daysUntilExam = input.examDate
    ? Math.max(1, Math.ceil((new Date(input.examDate).getTime() - Date.now()) / 86_400_000))
    : 14;
  const topicsList = (input.weakTopics || [])
    .map(t => `- ${t.subject}: ${t.accuracy}% accuracy (${t.totalQuestions} questions attempted)`)
    .join('\n');
  const todayIso = new Date().toISOString().split('T')[0];

  const prompt = `You are an expert exam study planner. Create a ${Math.min(daysUntilExam, 14)}-day study plan.

Student profile:
- Average quiz score: ${input.averageScore}%
- Total quizzes completed: ${input.totalQuizzes}
- Available study time: ${hoursPerDay} hours/day
- Days until exam: ${daysUntilExam}

Weak topics (need most focus):
${topicsList || '- No specific weak topics identified yet'}

Rules:
1. Prioritize weak topics (below 60% accuracy) heavily
2. Include review sessions for stronger topics too
3. Mix difficulty levels throughout the week
4. Add rest/light review days
5. Include practice quiz sessions

Return ONLY valid JSON (no markdown, no code blocks) in this exact format:
{
  "plan": [
    {"day": 1, "date": "${todayIso}", "subject": "Weak Topic", "activity": "Focus study: 30 practice questions + review wrong answers", "duration": "${hoursPerDay}h", "priority": "high"}
  ],
  "summary": "Brief 2-sentence summary of the plan strategy",
  "tips": ["tip1", "tip2", "tip3"]
}`;

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, prompt, fetchImpl });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new AiError('Could not parse study plan response.', 'bad_response', p.provider);
      const parsed = JSON.parse(jsonMatch[0]);
      const plan = Array.isArray(parsed.plan) && parsed.plan.length > 0
        ? parsed.plan.slice(0, 14).map((item: any, i: number) => ({
            day: Number(item.day) || i + 1,
            date: String(item.date || new Date(Date.now() + i * 86_400_000).toISOString().split('T')[0]),
            subject: String(item.subject || input.weakTopics[0]?.subject || 'General Review'),
            activity: String(item.activity || 'Study session'),
            duration: String(item.duration || `${hoursPerDay}h`),
            priority: ['high', 'medium', 'low'].includes(String(item.priority).toLowerCase()) ? String(item.priority).toLowerCase() : 'medium',
          }))
        : [{
            day: 1,
            date: todayIso,
            subject: input.weakTopics[0]?.subject || 'General Review',
            activity: 'Practice 30 questions on weak topics',
            duration: `${hoursPerDay}h`,
            priority: 'high',
          }];
      return {
        plan,
        summary: String(parsed.summary || 'Study plan generated based on your performance data.'),
        tips: Array.isArray(parsed.tips) ? parsed.tips.slice(0, 5).map(String) : ['Start with weak topics', 'Review mistakes immediately'],
      };
    },
  });
  return value;
}

/* ── 7. studyStrategy ─────────────────────────────────────────────────────── */

export interface StudyStrategyInput extends KeyOverrides {
  totalQuizzes: number;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  skippedCount: number;
  avgAccuracy: number;
  bestScore: number;
  streak: number;
  totalTimeSec: number;
  weakSubjects?: string[];
  strongSubjects?: string[];
  recentTrend: 'improving' | 'declining' | 'stable' | 'unknown';
}

export async function localStudyStrategy(input: StudyStrategyInput, fetchImpl?: typeof fetch) {
  const prompt = `You are an expert study coach. Based on this student's quiz performance data, write a personalized 3-paragraph study strategy. Be specific, actionable, and encouraging.

STUDENT DATA:
- Total Quizzes: ${input.totalQuizzes}
- Total Questions Attempted: ${input.totalQuestions}
- Correct: ${input.correctCount} | Wrong: ${input.wrongCount} | Skipped: ${input.skippedCount}
- Overall Accuracy: ${input.avgAccuracy}%
- Best Score: ${input.bestScore}%
- Current Streak: ${input.streak} day(s)
- Total Study Time: ${Math.round(input.totalTimeSec / 60)} minutes
- Recent Trend: ${input.recentTrend}
${input.weakSubjects?.length ? `- Weak Subjects: ${input.weakSubjects.join(', ')}` : ''}
${input.strongSubjects?.length ? `- Strong Subjects: ${input.strongSubjects.join(', ')}` : ''}

FORMAT:
**Paragraph 1 — Current Standing:** Analyze their performance honestly. Highlight strengths and areas for improvement.
**Paragraph 2 — Focused Strategy:** Give specific study techniques based on their weak areas. Mention spaced repetition, practice timing, and mistake review.
**Paragraph 3 — Action Plan:** Give a concrete weekly plan (e.g., "Take 2 quizzes daily focusing on X, review mistakes every evening").

Keep it under 250 words. Use bold for key terms. Be motivating but realistic.`;

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = (await callProvider({ provider: p.provider, key: p.key, prompt, temperature: 0.6, maxTokens: 900, fetchImpl })).trim();
      if (!text) throw new AiError('Could not generate strategy.', 'bad_response', p.provider);
      return text;
    },
  });
  return { strategy: value };
}

/* ── 8. verifyQuestion ────────────────────────────────────────────────────── */

export interface VerifyQuestionInput extends KeyOverrides {
  question: string;
  options: string[];
  markedCorrectAnswer: string;
  disputeReason?: string;
}

export async function localVerifyQuestion(input: VerifyQuestionInput, fetchImpl?: typeof fetch) {
  const prompt = `You are a fact-checker for exam questions. Verify if the marked correct answer is actually correct.

QUESTION: ${input.question}
OPTIONS:
${input.options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}
MARKED CORRECT: ${input.markedCorrectAnswer}
${input.disputeReason ? `DISPUTE REASON: ${input.disputeReason}` : ''}

IMPORTANT: You MUST respond with ONLY valid JSON. No markdown, no code blocks, no extra text.
The JSON must have this exact structure:
{"verdict": "confirmed", "verdictText": "explanation here", "confidence": 85, "suggestedAnswer": "exact option text if different"}

- verdict must be one of: "confirmed", "disputed", "incorrect"
- confidence must be a number 0-100
- suggestedAnswer is optional; include ONLY if verdict is "incorrect" or "disputed", using the exact option text from OPTIONS above.

Respond with ONLY the JSON object:`;

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, prompt, temperature: 0.2, maxTokens: 800, fetchImpl });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new AiError('Could not parse AI verification response.', 'bad_response', p.provider);
      const parsed = JSON.parse(jsonMatch[0]);
      const verdict: 'confirmed' | 'disputed' | 'incorrect' =
        ['confirmed', 'disputed', 'incorrect'].includes(parsed.verdict) ? parsed.verdict : 'confirmed';
      let suggestedAnswer = parsed.suggestedAnswer ? String(parsed.suggestedAnswer).trim() : undefined;
      if (suggestedAnswer) {
        const exact = input.options.find(o => o.trim().toLowerCase() === suggestedAnswer!.toLowerCase());
        if (exact) suggestedAnswer = exact;
      }
      return {
        verdict,
        verdictText: String(parsed.verdictText || 'Unable to determine.'),
        confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
        suggestedAnswer: suggestedAnswer && suggestedAnswer !== input.markedCorrectAnswer ? suggestedAnswer : undefined,
      };
    },
  });
  return value;
}

/* ── 9. ocrExtractQuestions ───────────────────────────────────────────────── */

export interface OcrExtractInput extends KeyOverrides {
  imageBase64: string;
  mimeType?: string;
}

export async function localOcrExtractQuestions(input: OcrExtractInput, fetchImpl?: typeof fetch) {
  const mimeType = input.mimeType || 'image/jpeg';
  const files: InlineFile[] = [{ base64: input.imageBase64, mimeType }];
  const providers = availableProviders(overrides(input)).filter(p => providerSupportsFiles(p.provider, files));
  if (providers.length === 0) {
    throw new AiError(
      'Photo OCR needs a Google Gemini, Anthropic Claude, or OpenAI key in Settings -> AI.',
      'unsupported',
    );
  }

  const prompt = `You are an OCR and quiz extraction expert. Analyze this image of a textbook page or question paper.

Extract ALL multiple-choice questions (MCQs) you can find. For each question:
1. Extract the full question text
2. Extract all answer options (A, B, C, D)
3. If the correct answer is marked/highlighted, identify it. If not, make your best educated guess based on the subject matter.
4. Classify difficulty as "easy", "medium", or "hard"
5. Provide a brief rationale for the correct answer
6. Auto-detect questionType — classify into the most specific academic discipline (e.g. Pharmacology, Anatomy, History, Physics, etc.)

Return ONLY valid JSON (no markdown, no code blocks):
{
  "questions": [
    {
      "question": "The full question text",
      "options": ["Option A text", "Option B text", "Option C text", "Option D text"],
      "correctAnswer": "The correct option text (must match one of the options exactly)",
      "difficulty": "medium",
      "rationale": "Brief explanation why this is correct",
      "questionType": "Detected discipline"
    }
  ],
  "rawText": "The full OCR text extracted from the image"
}

If no MCQs are found, extract the text content and generate relevant MCQs from it.`;

  const { value } = await withFallback({
    providers,
    attempt: async p => {
      const text = await callProvider({ provider: p.provider, key: p.key, prompt, files, maxTokens: 4096, timeoutMs: 90_000, fetchImpl });
      const cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return { questions: [], rawText: text };
      const parsed = JSON.parse(jsonMatch[0]);
      const questions = (Array.isArray(parsed.questions) ? parsed.questions : []).map((q: any) => {
        const opts = (Array.isArray(q.options) ? q.options : []).map((o: any) => String(o || '').trim()).filter(Boolean);
        let correct = String(q.correctAnswer || opts[0] || '').trim();
        const match = opts.find((o: string) => o.toLowerCase() === correct.toLowerCase());
        if (match) correct = match;
        return {
          question: String(q.question || '').trim(),
          options: opts,
          correctAnswer: correct,
          difficulty: ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium',
          rationale: q.rationale ? String(q.rationale).trim() : undefined,
          questionType: q.questionType ? String(q.questionType).trim() : undefined,
        };
      }).filter((q: any) => q.question && q.options.length >= 2);
      return {
        questions,
        rawText: String(parsed.rawText || text.slice(0, 500)),
      };
    },
  });
  return value;
}

/* ── 10 & 11. chatGuest / chatWithData (streaming + non-streaming) ────────── */

export interface LocalChatInput extends KeyOverrides {
  message: string;
  conversationHistory?: ChatTurn[];
  localSettings?: string;
  localHistorySummary?: string;
}

async function buildDeviceDataContext(fallbackSummary?: string, localSettings?: string): Promise<string> {
  try {
    const history = getHistorySync();
    if (!history.length) {
      return fallbackSummary
        ? `USER QUIZ DATA:\n${fallbackSummary}\n${localSettings ? `\nSETTINGS:\n${localSettings}` : ''}`
        : 'No quizzes taken on this device yet.';
    }
    const todayStr = new Date().toISOString().split('T')[0];
    const total = history.length;
    const correct = history.reduce((s, r) => s + (r.correct || 0), 0);
    const wrong = history.reduce((s, r) => s + (r.wrong || 0), 0);
    const skipped = history.reduce((s, r) => s + (r.skipped || 0), 0);
    const totalQs = history.reduce((s, r) => s + (r.totalQuestions || 0), 0);
    const avgPct = Math.round(history.reduce((s, r) => s + (r.percentage || 0), 0) / total);
    const bestPct = Math.round(Math.max(...history.map(r => r.percentage || 0)));
    const totalTimeMin = Math.round(history.reduce((s, r) => s + (r.timeTaken || 0), 0) / 60);
    const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;

    const todayQuizzes = history.filter(r => {
      const d = new Date(r.timestamp);
      return !Number.isNaN(d.getTime()) && d.toISOString().split('T')[0] === todayStr;
    });

    const subjMap = new Map<string, { count: number; pctSum: number; correct: number; wrong: number; total: number }>();
    for (const r of history) {
      const subj = (r.subject || '').trim();
      if (!subj) continue;
      const e = subjMap.get(subj) || { count: 0, pctSum: 0, correct: 0, wrong: 0, total: 0 };
      e.count++;
      e.pctSum += r.percentage || 0;
      e.correct += r.correct || 0;
      e.wrong += r.wrong || 0;
      e.total += r.totalQuestions || 0;
      subjMap.set(subj, e);
    }
    const subjects = [...subjMap.entries()]
      .map(([name, d]) => `- ${name}: ${d.count} quizzes, Avg ${Math.round(d.pctSum / d.count)}%, ${d.correct} correct / ${d.wrong} wrong out of ${d.total}`)
      .slice(0, 15)
      .join('\n');

    const recent = history.slice(0, 12).map(r =>
      `- ${r.quizTitle || r.subject || 'Quiz'} | ${r.percentage}% | ${r.correct}/${r.totalQuestions} correct | ${r.wrong} wrong | ${new Date(r.timestamp).toLocaleDateString('en-IN')}`
    ).join('\n');

    // Hydrate the 3 most recent quizzes from IndexedDB so question-level queries work offline/on-device!
    let recentQuestionDetails = '';
    try {
      const { loadFullResults } = await import('../../utils/reports/loadFull');
      const { results: hydrated } = await loadFullResults(history.slice(0, 3));
      for (const r of hydrated) {
        if (!Array.isArray(r.quizData) || r.quizData.length === 0) continue;
        const lines: string[] = [];
        r.quizData.slice(0, 25).forEach((q, idx) => {
          const ua = r.userAnswers?.[idx];
          const status = ua == null ? 'SKIPPED' : ua === q.correctAnswer ? 'CORRECT' : 'WRONG';
          lines.push(`  Q${idx + 1}: ${q.question.slice(0, 180)} | Picked: ${ua ?? 'SKIPPED'} | Correct: ${q.correctAnswer} [${status}]`);
        });
        recentQuestionDetails += `\n--- "${r.quizTitle || r.subject || 'Quiz'}" (${r.percentage}%) ---\n${lines.join('\n')}\n`;
      }
    } catch { /* ignore hydration failures */ }

    return `TODAY (${todayStr}): ${todayQuizzes.length} quiz(es) taken today.
LIFETIME STATS:
- Total Quizzes: ${total} | Total Questions: ${totalQs}
- Correct: ${correct} | Wrong: ${wrong} | Skipped: ${skipped}
- Accuracy: ${accuracy}% | Average Score: ${avgPct}% | Best Score: ${bestPct}%
- Total Study Time: ${totalTimeMin} minutes

SUBJECT BREAKDOWN:
${subjects || 'No subject tags yet.'}

RECENT QUIZZES:
${recent}
${recentQuestionDetails ? `\nRECENT QUESTION-LEVEL DETAILS:\n${recentQuestionDetails}` : ''}
${localSettings ? `\nUSER SETTINGS:\n${localSettings}` : ''}`;
  } catch {
    return fallbackSummary || 'No quiz data available.';
  }
}

export async function localChatAssistant(input: LocalChatInput, fetchImpl?: typeof fetch): Promise<{ text: string }> {
  const dataContext = await buildDeviceDataContext(input.localHistorySummary, input.localSettings);
  const currentDate = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const system = `You are "QMP AI" — the smart personal study assistant inside Quiz Master Pro. You have access to the user's on-device quiz data, question-level history, scores, subjects, and settings below.

Rules:
- Answer the exact question asked using specific numbers and questions from the user's data when relevant.
- Be warm, encouraging, concise, and actionable (2-5 paragraphs unless asked for more, e.g., generating MCQs or tables).
- Use clean markdown formatting (**bold**, bullet points, tables).
- Current date: ${currentDate}

${dataContext}`;

  const history: ChatTurn[] = (input.conversationHistory || []).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || ''),
  }));

  const { value } = await withFallback({
    providers: availableProviders(overrides(input)),
    attempt: async p => {
      const text = await callProvider({
        provider: p.provider,
        key: p.key,
        system,
        messages: history,
        prompt: input.message,
        temperature: 0.6,
        maxTokens: 4096,
        fetchImpl,
      });
      return text;
    },
  });
  return { text: value };
}

export const LOCAL_ENDPOINTS: Record<string, (input: never) => Promise<unknown>> = {
  generateQuiz: localGenerateQuiz as (input: never) => Promise<unknown>,
  explainQuestion: localExplainQuestion as (input: never) => Promise<unknown>,
  generateRevisionSheet: localGenerateRevisionSheet as (input: never) => Promise<unknown>,
  generateNotes: localGenerateNotes as (input: never) => Promise<unknown>,
  generateRevisionNotes: localGenerateRevisionNotes as (input: never) => Promise<unknown>,
  generateStudyPlan: localGenerateStudyPlan as (input: never) => Promise<unknown>,
  studyStrategy: localStudyStrategy as (input: never) => Promise<unknown>,
  verifyQuestion: localVerifyQuestion as (input: never) => Promise<unknown>,
  ocrExtractQuestions: localOcrExtractQuestions as (input: never) => Promise<unknown>,
  chatGuest: localChatAssistant as (input: never) => Promise<unknown>,
  chatWithData: localChatAssistant as (input: never) => Promise<unknown>,
};

export const LOCAL_STREAMING_ENDPOINTS: Record<string, (input: never) => Promise<{ text: string }>> = {
  chatGuest: localChatAssistant as (input: never) => Promise<{ text: string }>,
  chatWithData: localChatAssistant as (input: never) => Promise<{ text: string }>,
};
