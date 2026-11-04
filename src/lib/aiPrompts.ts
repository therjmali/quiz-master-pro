/**
 * Prompts and parsers shared by the backend endpoints and the in-app (bring-your-own-key) AI path,
 * so both behave identically. Pure functions - no network, no secrets.
 */
import { formatRationale, rationalePoints } from './rationaleFormat';

export function extractJsonArray(text: string): any[] {
  let cleaned = text.trim().replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try { const p = JSON.parse(cleaned); return Array.isArray(p) ? p : []; } catch {}
  const match = cleaned.match(/\[[\s\S]*\]/);
  if (match) { try { return JSON.parse(match[0]); } catch {} }
  return [];
}

export function isRateLimitErr(msg: string) {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') || msg.includes('rate') || msg.includes('spending cap');
}

export function validateAndMap(parsed: any[]): any[] {
  return parsed
    .filter((q: any) => q.question && Array.isArray(q.options) && q.options.length === 4 && q.correctAnswer)
    .map((q: any) => {
      const options = q.options.map((o: any) => String(o).replace(/^\s*\(?[a-dA-D][).]\s+/, '').trim());
      const ans = String(q.correctAnswer).trim();
      const correctAnswer = options.find((o: string) => o.toLowerCase() === ans.toLowerCase()) || '';
      const bullets = rationalePoints(Array.isArray(q.rationale) ? q.rationale.join('\n') : String(q.rationale || '')).slice(0, 2);
      return {
        question: String(q.question).replace(/^\s*Q\d+\([EMH]\)\.\s*/, '').trim(),
        options,
        correctAnswer,
        difficulty: ['easy', 'medium', 'hard'].includes(String(q.difficulty)) ? String(q.difficulty) : 'medium',
        rationale: formatRationale(bullets.join('\n')),
        ...(q.topic ? { topic: String(q.topic).trim() } : {}),
        ...(q.subject ? { subject: String(q.subject).trim() } : {}),
        ...(q.questionType ? { questionType: String(q.questionType).trim() } : {}),
      };
    })
    .filter((q: any) => q.correctAnswer && new Set(q.options.map((o: string) => o.toLowerCase())).size === 4);
}

export function buildQuizSystemPrompt(difficulty: string): string {
  return `You are an expert MCQ Quiz Generator.
TASK 1: If the input already contains MCQ questions, extract them EXACTLY as given — do NOT change the meaning or add outside information.
TASK 2: If the input is study notes/topics, write high-quality, exam-ready MCQs.

### THE ONLY MCQ FORMAT
Every question follows this exact structure:

Q1(E). Question text

(a) Option 1

(b) Option 2

(c) Option 3

(d) Option 4

Answer - (b) Option 2

• Explanation of why the answer is correct.

• Second point, only if needed.

Rules:
1. Difficulty tag: E = Easy, M = Medium, H = Hard.
2. Exactly four options (a)–(d), all different, with exactly one correct answer.
3. Explanation: 1 or 2 short, factually correct points. Never more than 2. No emojis, headings or labels.

EXTRACTION RULES (TASK 1):
- Preserve ALL original question and option wording exactly. Do NOT paraphrase.
- Explanation: include ONLY if the source gives one, using its wording, condensed into at most 2 points. Otherwise use an empty array.
- If a difficulty tag (E)/(M)/(H) is present, map E→easy, M→medium, H→hard.
- Extract Topic and Subject from the source if present; leave blank if not found.

For every question also classify questionType into the most specific academic/medical discipline (e.g. Pharmacology, Anatomy, Pathology, Physiology, Biochemistry, Microbiology, Medicine, Surgery, Pediatrics, Obstetrics, Community Medicine, etc.).

Difficulty target: ${difficulty === 'all' ? 'mixed (vary easy/medium/hard)' : difficulty}.
Return ONLY a valid JSON array — no markdown fences, no commentary.
Schema: [{"question":"question text without the Q1(E). prefix","options":["option a","option b","option c","option d"],"correctAnswer":"exact full text of the correct option","difficulty":"easy|medium|hard","rationale":["point 1","optional point 2"],"topic":"extracted topic or empty string","subject":"extracted subject or empty string","questionType":"discipline"}]
Rules: options are plain text without (a)/(b) letters. correctAnswer must exactly match one option. rationale has 1–2 items for TASK 2.`;
}

export const EXPLAIN_SYSTEM_PROMPT = [
  'You are an expert exam tutor giving concise, accurate, exam-focused explanations.',
  '',
  'Write 2 to 3 short plain-text points. No emojis, no symbols, no bullet characters, no markdown, no bold. Each point is one or two sentences.',
  '',
  'Put each point on its own line. Do not add headings, labels, numbering, introductions or closing remarks.',
  'Be factual and direct. Never invent facts.',
].join('\n');

export function buildExplainPrompt(
  question: string,
  correctAnswer: string,
  userAnswer: string | undefined,
  options: string[] | undefined,
  status: 'correct' | 'wrong' | 'skipped'
): string {
  const optionsBlock = options?.length
    ? `\nAll Options:\n${options.map((o, i) => `${String.fromCharCode(65 + i)}) ${o}`).join('\n')}`
    : '';

  const base = `Question: "${question}"${optionsBlock}\nCorrect Answer: "${correctAnswer}"`;

  if (status === 'wrong' && userAnswer) {
    return `${base}\nStudent answered: "${userAnswer}" (wrong)\n\nExplain concisely why "${correctAnswer}" is correct, and why "${userAnswer}" is wrong. Mention the student's choice in one point.`;
  }
  if (status === 'skipped') {
    return `${base}\nStudent skipped.\n\nExplain concisely why "${correctAnswer}" is correct.`;
  }
  return `${base}\n\nExplain concisely why "${correctAnswer}" is correct.`;
}

export function buildSimpleExplainPrompt(question: string, correctAnswer: string): string {
  return `Question: "${question}"\nCorrect Answer: "${correctAnswer}"\n\nExplain this answer like I'm 5 years old. Use super simple words, a fun analogy or comparison, and keep it to 2 to 3 very short plain-text points, one per line. No emojis, no symbols, no bullet characters, no markdown, no bold.`;
}
