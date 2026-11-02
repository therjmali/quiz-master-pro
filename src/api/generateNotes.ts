import { z } from 'zod';
import { createEndpoint } from 'zitejs/backend';
import { GoogleGenerativeAI } from '@google/generative-ai';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function isRateLimitErr(msg: string) {
  return msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') || msg.includes('rate') || msg.includes('spending cap');
}

async function callCohere(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.cohere.com/v2/chat', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Accept': 'application/json' },
    body: JSON.stringify({ model: 'command-r-plus', messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) throw new Error(`Cohere error ${res.status}`);
  const data = await res.json();
  return data.message?.content?.[0]?.text || '';
}

async function callOpenAI(apiKey: string, prompt: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 4096, temperature: 0.4 }),
  });
  if (!res.ok) throw new Error(`OpenAI error ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export default createEndpoint({
  description: 'Generate premium exam-ready study notes from quiz questions',
  inputSchema: z.object({
    questions: z.array(z.object({
      question: z.string(),
      correctAnswer: z.string(),
      rationale: z.string().optional(),
      subject: z.string().optional(),
    })),
    subject: z.string().optional(),
    noteType: z.enum(['compact', 'detailed']).default('compact'),
    userGeminiKey: z.string().optional(),
    userCohereKey: z.string().optional(),
    userOpenaiKey: z.string().optional(),
  }),
  outputSchema: z.object({
    notes: z.string(),
    questionCount: z.number(),
  }),
  execute: async ({ input }) => {
    const qs = input.questions.slice(0, 60);
    const subjectHint = input.subject || 'Medical / Nursing';
    const todayDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });

    const questionsText = qs.map((q, i) =>
      `MCQ ${i + 1}:\nQ: ${q.question}\n✓ Answer: ${q.correctAnswer}${q.rationale ? `\nRationale: ${q.rationale}` : ''}`
    ).join('\n\n');

    // ─── HIGH-YIELD STUDY NOTES PROMPT ──────────────────────────────────────
    const prompt = `You are an expert educational assistant designed to convert Multiple Choice Questions (MCQs) and their rationales into concise, highly readable study notes.

SUBJECT: ${subjectHint}
DATE: ${todayDate}
TOTAL: ${qs.length} questions

═══════════════════════════════════════════════════
STRICT FORMATTING RULES — Follow exactly:
═══════════════════════════════════════════════════

For every MCQ provided:

1. **The Main Statement:** Combine the core concept of the question and the correct answer into a **single, declarative sentence** on one line.
   - Do NOT include the wrong options.
   - Do NOT use question marks.
   - Number the statement (e.g., 1), 2)).

2. **The Rationale:** Condense the provided rationale into a **maximum of 2 bullet points**.
   - Ensure all critical information from the original rationale is captured within these two points.
   - Start every rationale bullet point exactly with this prefix: * 📖 - 
   - **CRUCIAL:** Rationale bullet points must be PLAIN TEXT ONLY. NEVER use bold (**), colors, HTML tags, or any markdown formatting in rationale lines. They must remain completely unformatted plain text.

3. **Bold Keywords (Main Statement ONLY):**
   - In the Main Statement (the numbered line) ONLY, strategically highlight important keywords, core concepts, and anatomical terms using **bold markdown** exactly like this: \`**Important Word**\`
   - NEVER use bold or any formatting in the rationale bullet points — rationale must stay plain text.

═══════════════════════════════════════════════════
INPUT/OUTPUT EXAMPLE
═══════════════════════════════════════════════════

INPUT:
Q1(M). Capacitation of spermatozoa — where does it BEGIN and where does the MAJORITY occur?

(a) Begins in vagina — majority in uterine cavity

(b) Begins in cervix — majority in fallopian tube

(c) Begins in fallopian tube — majority in uterine cavity

(d) Begins in uterine cavity — majority in cervix

Answer - (b) Begins in cervix — majority in fallopian tube

• Capacitation is the process by which sperms acquire the ability to fertilize the ovum; it begins in the cervix and mostly occurs in the fallopian tube.

• It takes 2–6 hours and occurs entirely within the female reproductive tract.

OUTPUT:

1) **Capacitation** of spermatozoa **begins in the cervix** and the majority occurs in the **fallopian tube**

* 📖 - Capacitation is the process where sperm acquire the ability to fertilize the ovum, occurring entirely within the female reproductive tract
* 📖 - The complete process typically takes 2 to 6 hours

═══════════════════════════════════════════════════
REQUIRED OUTPUT STRUCTURE
═══════════════════════════════════════════════════

# 📄 ${subjectHint} — High-Yield Study Notes
### ${todayDate} · ${qs.length} Questions

---

1) [Single declarative statement with **answer/key terms** highlighted in bold]

* 📖 - [Most important fact — PLAIN TEXT ONLY, no bold, no colors, no HTML]
* 📖 - [Second important fact — PLAIN TEXT ONLY]

---

2) [Next statement with **answer** in bold]

* 📖 - [Key fact — plain text]
* 📖 - [Key fact — plain text]

---

[...continue for all questions...]

---

## 📊 Quick Revision Table

| # | Fact | Answer |
|---|------|--------|
| 1 | [concept] | **[answer]** |

---
> 📝 *R.J Quiz Study Notes · ${todayDate}*

═══════════════════════════════════════════════════
ADDITIONAL RULES
═══════════════════════════════════════════════════
- Use **keyword** bold markdown in the numbered main statement line ONLY — this is the ONLY place bold is allowed
- NEVER use bold or any formatting in * 📖 - rationale bullets — they MUST be plain text
- NEVER use HTML tags like <span>, <b>, <strong>, or any HTML in the output — use only markdown **bold**
- MAXIMUM 2 bullet points per question, each starting with * 📖 - 
- Each bullet should be concise (1 line)
- Use --- separator between every entry
- ${input.noteType === 'detailed' ? 'DETAILED: Include values, doses, classifications, mnemonics where relevant in the 2 bullets.' : 'COMPACT: Keep bullets focused on the single most important fact per bullet.'}
- For "EXCEPT" questions: ⚠️ flag and clarify which option is the exception
- Do NOT include wrong options in the statement
- Do NOT use question marks — convert everything to declarative statements
- Write clean, scholarly, scannable notes
- NO markdown fences, NO preamble

═══════════════════════════════════════════════════
QUESTIONS TO CONVERT:
═══════════════════════════════════════════════════
${questionsText}

Output ONLY the formatted Markdown. Start with # heading.`;

    const geminiKey = input.userGeminiKey?.trim() || process.env.ZITE_GEMINI_ACCESS_TOKEN!;
    const useCohere = !input.userGeminiKey?.trim() && !!input.userCohereKey?.trim();
    const useOpenAI = !input.userGeminiKey?.trim() && !input.userCohereKey?.trim() && !!input.userOpenaiKey?.trim();

    const MAX_TRIES = 3;
    let lastError: Error = new Error('Notes generation failed');

    for (let attempt = 0; attempt < MAX_TRIES; attempt++) {
      try {
        let text = '';
        if (useCohere) {
          text = await callCohere(input.userCohereKey!, prompt);
        } else if (useOpenAI) {
          text = await callOpenAI(input.userOpenaiKey!, prompt);
        } else {
          const genAI = new GoogleGenerativeAI(geminiKey);
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            generationConfig: { maxOutputTokens: 8192, temperature: 0.4 },
          });
          const result = await model.generateContent(prompt);
          text = result.response.text();
        }
        // Strip any accidental markdown fences the model may add
        const cleaned = text.trim().replace(/^```(?:markdown)?\n?/i, '').replace(/\n?```\s*$/i, '');
        return { notes: cleaned, questionCount: qs.length };
      } catch (err: any) {
        lastError = err;
        const msg = String(err?.message || '');
        if (isRateLimitErr(msg)) {
          if (attempt < MAX_TRIES - 1) { await sleep([2000, 5000][attempt] ?? 5000); continue; }
          throw new Error('⏳ AI is temporarily busy. Please wait a moment and try again, or add your own API key in Profile → API Keys.');
        }
        if (msg.includes('503') || msg.includes('overloaded') || msg.includes('UNAVAILABLE')) {
          if (attempt < MAX_TRIES - 1) { await sleep(1500); continue; }
          throw new Error('AI service temporarily unavailable. Please try again.');
        }
        throw new Error('Failed to generate notes: ' + (err?.message || 'Unknown error'));
      }
    }
    throw lastError;
  },
});
