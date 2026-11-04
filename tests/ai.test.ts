import './setup';
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { AiError, availableProviders, callProvider, saveAiClientPrefs, testProviderKey, withFallback } from '../src/platform/ai/providers';
import { localExplainQuestion, localGenerateQuiz } from '../src/platform/ai/localEndpoints';
import { buildQuizSystemPrompt, buildSimpleExplainPrompt } from '../src/lib/aiPrompts';
import { saveUserApiKeys } from '../src/utils/apiKeys';

interface Call { url: string; init: RequestInit; body: any }

function mockFetch(handler: (call: Call) => { status?: number; json?: unknown; text?: string; throws?: Error }) {
  const calls: Call[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    const call = { url: String(url), init, body: JSON.parse(String(init.body)) };
    calls.push(call);
    const r = handler(call);
    if (r.throws) throw r.throws;
    const status = r.status ?? 200;
    return { ok: status >= 200 && status < 300, status, json: async () => r.json, text: async () => r.text ?? JSON.stringify(r.json ?? {}) } as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const geminiReply = (text: string) => ({ json: { candidates: [{ content: { parts: [{ text }] } }] } });
const mcq = (n: number) => JSON.stringify(Array.from({ length: n }, (_, i) => ({
  question: `Q1(E). Which drug is first line for case ${i}?`, options: [`(a) Oxytocin ${i}`, `(b) Carboprost ${i}`, `(c) Misoprostol ${i}`, `(d) Ergometrine ${i}`],
  correctAnswer: `Oxytocin ${i}`, difficulty: 'easy', rationale: ['Oxytocin is the first-line uterotonic.', 'It is given after delivery.'], topic: 'PPH', subject: 'OBG',
})));

beforeEach(() => { localStorage.clear(); saveAiClientPrefs({ preferred: null, models: {} }); });

test('each provider gets the right URL, auth header and body, and its answer is parsed', async () => {
  const cases: Array<{ provider: 'gemini' | 'anthropic' | 'openai' | 'cohere'; reply: unknown; check: (c: Call) => void }> = [
    { provider: 'gemini', reply: geminiReply('hello').json, check: c => {
      assert.match(c.url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
      assert.equal((c.init.headers as Record<string, string>)['x-goog-api-key'], 'K');
      assert.equal(c.body.systemInstruction.parts[0].text, 'SYS');
      assert.equal(c.body.contents[0].parts[0].text, 'hi');
    } },
    { provider: 'anthropic', reply: { content: [{ type: 'text', text: 'hello' }] }, check: c => {
      assert.equal(c.url, 'https://api.anthropic.com/v1/messages');
      const h = c.init.headers as Record<string, string>;
      assert.equal(h['x-api-key'], 'K'); assert.equal(h['anthropic-version'], '2023-06-01'); assert.equal(h['anthropic-dangerous-direct-browser-access'], 'true');
      assert.equal(c.body.system, 'SYS'); assert.equal(c.body.messages[0].content, 'hi');
    } },
    { provider: 'openai', reply: { choices: [{ message: { content: 'hello' } }] }, check: c => {
      assert.equal(c.url, 'https://api.openai.com/v1/chat/completions');
      assert.equal((c.init.headers as Record<string, string>).Authorization, 'Bearer K');
      assert.deepEqual(c.body.messages.map((m: { role: string }) => m.role), ['system', 'user']);
    } },
    { provider: 'cohere', reply: { message: { content: [{ text: 'hello' }] } }, check: c => {
      assert.equal(c.url, 'https://api.cohere.com/v2/chat');
      assert.equal((c.init.headers as Record<string, string>).Authorization, 'Bearer K');
    } },
  ];
  for (const t of cases) {
    const { impl, calls } = mockFetch(() => ({ json: t.reply }));
    const text = await callProvider({ provider: t.provider, key: 'K', system: 'SYS', prompt: 'hi', fetchImpl: impl });
    assert.equal(text, 'hello', t.provider);
    t.check(calls[0]);
  }
});

test('HTTP and network failures become clear, typed errors', async () => {
  const run = (r: Parameters<typeof mockFetch>[0]) => callProvider({ provider: 'openai', key: 'K', prompt: 'x', fetchImpl: mockFetch(r).impl });
  await assert.rejects(run(() => ({ status: 401, text: 'bad' })), (e: AiError) => e.code === 'auth' && /rejected the key/.test(e.message));
  await assert.rejects(run(() => ({ status: 429, text: 'slow down' })), (e: AiError) => e.code === 'rate_limit' && /429/.test(e.message));
  await assert.rejects(run(() => ({ status: 503, text: '' })), (e: AiError) => e.code === 'unavailable');
  await assert.rejects(run(() => ({ throws: new TypeError('fetch failed') })), (e: AiError) => e.code === 'network');
  await assert.rejects(run(() => ({ json: { choices: [{ message: { content: '   ' } }] } })), (e: AiError) => e.code === 'bad_response');
  await assert.rejects(callProvider({ provider: 'openai', key: 'K', prompt: 'x', files: [{ base64: 'AA', mimeType: 'image/png' }], fetchImpl: mockFetch(() => ({})).impl }), (e: AiError) => e.code === 'unsupported');
});

test('saved keys are ordered by preference and disabled keys are skipped', () => {
  saveUserApiKeys({ openai: 'sk-o', gemini: 'AIza-g', anthropic: 'sk-ant-a', anthropicEnabled: false });
  assert.deepEqual(availableProviders().map(p => p.provider), ['gemini', 'openai']);
  saveAiClientPrefs({ preferred: 'openai', models: {} });
  assert.deepEqual(availableProviders().map(p => p.provider), ['openai', 'gemini']);
  assert.deepEqual(availableProviders({ cohere: 'explicit' }).map(p => p.provider).sort(), ['cohere', 'gemini', 'openai']);
});

test('fallback retries a rate limit, then moves to the next provider', async () => {
  const seen: string[] = [];
  const out = await withFallback({
    providers: [{ provider: 'gemini', key: 'a' }, { provider: 'openai', key: 'b' }],
    sleep: async () => {},
    attempt: async p => {
      seen.push(p.provider);
      if (p.provider === 'gemini') throw new AiError('429', 'rate_limit', 'gemini');
      return 'done';
    },
  });
  assert.equal(out.value, 'done'); assert.equal(out.provider, 'openai');
  assert.deepEqual(seen, ['gemini', 'gemini', 'gemini', 'openai'], '1 try + 2 retries on gemini, then openai');
  await assert.rejects(withFallback({ providers: [], attempt: async () => 1 }), (e: AiError) => e.code === 'no_key');
  await assert.rejects(withFallback({ providers: [{ provider: 'gemini', key: 'a' }], sleep: async () => {}, attempt: async () => { throw new AiError('nope', 'auth', 'gemini'); } }), (e: AiError) => e.code === 'auth');
});

test('on-device quiz generation uses the same prompt and validation as the backend', async () => {
  saveUserApiKeys({ gemini: 'AIza-test' });
  const { impl, calls } = mockFetch(() => geminiReply('```json\n' + mcq(3) + '\n```'));
  const res = await localGenerateQuiz({ text: 'Postpartum haemorrhage notes', difficulty: 'hard' }, impl);
  assert.equal(res.questions.length, 3);
  assert.equal(res.provider, 'gemini_device');
  const q = res.questions[0];
  assert.equal(q.question, 'Which drug is first line for case 0?', 'Q1(E). prefix removed');
  assert.deepEqual(q.options.map((o: string) => o.slice(0, 5)), ['Oxyto', 'Carbo', 'Misop', 'Ergom'], '(a)/(b) letters removed');
  assert.equal(q.correctAnswer, 'Oxytocin 0');
  assert.equal(q.subject, 'OBG');
  assert.match(calls[0].body.systemInstruction.parts[0].text, /Difficulty target: hard/);
  assert.match(calls[0].body.contents[0].parts[0].text, /Postpartum haemorrhage notes/);
});

test('generation fails clearly when the answer has no usable questions, or files lack a Gemini key', async () => {
  saveUserApiKeys({ openai: 'sk-test' });
  const { impl } = mockFetch(() => ({ json: { choices: [{ message: { content: 'Sorry, I cannot do that.' } }] } }));
  await assert.rejects(localGenerateQuiz({ text: 'x' }, impl), (e: AiError) => /No valid questions/.test(e.message));
  await assert.rejects(localGenerateQuiz({ text: 'x', files: [{ base64: 'AA', mimeType: 'application/pdf' }] }, impl), (e: AiError) => e.code === 'unsupported');
  localStorage.clear();
  await assert.rejects(localGenerateQuiz({ text: 'x' }, impl), (e: AiError) => e.code === 'no_key');
});

test('on-device explanations are cleaned like the backend ones', async () => {
  saveUserApiKeys({ openai: 'sk-test' });
  const { impl, calls } = mockFetch(() => ({ json: { choices: [{ message: { content: '- Oxytocin is first line.\n\n- It contracts the uterus.' } }] } }));
  const res = await localExplainQuestion({ question: 'First line for PPH?', correctAnswer: 'Oxytocin', userAnswer: 'Ergometrine', options: ['Oxytocin', 'Ergometrine'], status: 'wrong' }, impl);
  assert.equal(res.provider, 'openai_device');
  assert.equal(res.rationale, 'Oxytocin is first line.\nIt contracts the uterus.', 'bullets and blank lines removed by the shared cleaner');
  assert.match(calls[0].body.messages[1].content, /Student answered: "Ergometrine" \(wrong\)/);
  assert.match(calls[0].body.messages[0].content, /expert exam tutor/);
});

test('key test reports success and failure in plain words', async () => {
  const ok = await testProviderKey('openai', 'sk', mockFetch(() => ({ json: { choices: [{ message: { content: 'ok' } }] } })).impl);
  assert.deepEqual(ok, { ok: true, message: 'OpenAI key works.' });
  const bad = await testProviderKey('openai', 'sk', mockFetch(() => ({ status: 401, text: 'no' })).impl);
  assert.equal(bad.ok, false); assert.match(bad.message, /rejected the key/);
});

test('shared prompts keep their contract (guards the backend/app refactor)', () => {
  assert.match(buildQuizSystemPrompt('all'), /Difficulty target: mixed/);
  assert.match(buildQuizSystemPrompt('easy'), /Difficulty target: easy/);
  assert.match(buildQuizSystemPrompt('all'), /Return ONLY a valid JSON array/);
  assert.match(buildSimpleExplainPrompt('Q?', 'A'), /like I'm 5 years old/);
});
