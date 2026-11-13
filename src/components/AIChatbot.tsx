import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useAccount } from '../platform/cloud/useAccount';
import { openSignIn } from '../platform/cloud/signInWindow';
import { X, Send, Sparkles, Trash2, Loader2, Bot, User, ArrowLeft, LogIn } from 'lucide-react';
import { chatGuest } from 'zitejs/api';
import { getHistorySync } from '../utils/historyStore';
import { Markdown } from '@project/components/markdown';
import { OverlayLayer } from './ui/Overlay';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SUGGESTIONS_LOGGED_IN = [
  '📊 How am I performing overall?',
  '🎯 What are my weak topics?',
  '📈 Show my progress this week',
  '🏆 What was my best quiz day?',
  '📚 Which subjects need more work?',
  '💡 Give me a study strategy',
];

const SUGGESTIONS_GUEST = [
  '💡 Give me study tips',
  '📚 How to improve quiz scores?',
  '🧠 Best memorization techniques?',
  '📊 Analyze my local quiz data',
  '🎯 How to identify weak topics?',
  '⏰ How to manage study time?',
];

function gatherLocalSettings(): Record<string, string | undefined> {
  const get = (k: string) => { try { return localStorage.getItem(k) || undefined; } catch { return undefined; } };
  return {
    settings: get('qmp_settings'),
    aiPrefs: get('qmp_ai_prefs'),
    theme: get('qmp_theme'),
  };
}

/** Build a text summary of local quiz history for guest mode */
function buildLocalHistorySummary(): string {
  try {
    const history = getHistorySync() as any[];
    if (!history.length) return 'No local quiz history found.';

    const total = history.length;
    const correct = history.reduce((a: number, r: any) => a + (r.correct || 0), 0);
    const wrong = history.reduce((a: number, r: any) => a + (r.wrong || 0), 0);
    const skipped = history.reduce((a: number, r: any) => a + (r.skipped || 0), 0);
    const totalQs = history.reduce((a: number, r: any) => a + (r.totalQuestions || 0), 0);
    const avgPct = Math.round(history.reduce((a: number, r: any) => a + (r.percentage || 0), 0) / total);
    const bestPct = Math.round(Math.max(...history.map((r: any) => r.percentage || 0)));
    const totalTime = history.reduce((a: number, r: any) => a + (r.timeTaken || 0), 0);
    const accuracy = (correct + wrong) > 0 ? Math.round(correct / (correct + wrong) * 100) : 0;

    // Subject breakdown
    const subjMap = new Map<string, { count: number; pctSum: number }>();
    for (const r of history) {
      const s = r.subject?.trim();
      if (!s) continue;
      const e = subjMap.get(s) || { count: 0, pctSum: 0 };
      e.count++; e.pctSum += r.percentage || 0;
      subjMap.set(s, e);
    }
    const subjects = [...subjMap.entries()].map(([name, d]) => `- ${name}: ${d.count} quizzes, Avg ${Math.round(d.pctSum / d.count)}%`).join('\n');

    const recent = history.slice(0, 10).map((r: any) =>
      `- ${r.quizTitle || r.subject || 'Quiz'} | ${r.percentage}% | ${r.correct}/${r.totalQuestions} correct | ${r.difficulty || 'mixed'}`
    ).join('\n');

    return `Total Quizzes: ${total} | Total Qs: ${totalQs}
Correct: ${correct} | Wrong: ${wrong} | Skipped: ${skipped}
Accuracy: ${accuracy}% | Avg Score: ${avgPct}% | Best: ${bestPct}%
Study Time: ${Math.round(totalTime / 60)} min

SUBJECTS:
${subjects || 'No subject data.'}

RECENT 10:
${recent || 'No recent quizzes.'}`;
  } catch {
    return 'Could not read local quiz history.';
  }
}

export interface QuestionContext {
  question: string;
  options: string[];
  correctAnswer: string;
  userAnswer: string | null;
  rationale?: string;
  difficulty?: string;
  questionType?: string;
}

interface Props {
  onClose: () => void;
  questionContext?: QuestionContext;
}

export default function AIChatbot({ onClose, questionContext }: Props) {
  const account = useAccount();
  const user = account.signedIn ? account : null;
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isGuest = !user;
  const displayName = user?.name || 'there';

  const SUGGESTIONS_QUESTION = questionContext ? [
    '❓ Why is the correct answer right?',
    '🤔 Why is my answer wrong?',
    '📖 Explain this concept in detail',
    '🔗 What related topics should I study?',
    '💡 Give me a similar practice question',
    '🧠 Memory trick for this concept',
  ] : [];

  const suggestions = questionContext ? SUGGESTIONS_QUESTION : (isGuest ? SUGGESTIONS_GUEST : SUGGESTIONS_LOGGED_IN);

  // Build question context string for the AI
  const questionContextStr = questionContext ? `
[QUESTION CONTEXT — The user is asking about this specific question:]
Question: ${questionContext.question}
Options: ${questionContext.options.map((o, i) => `${String.fromCharCode(97 + i)}) ${o}`).join(' | ')}
Correct Answer: ${questionContext.correctAnswer}
User's Answer: ${questionContext.userAnswer ?? 'SKIPPED'}
Result: ${questionContext.userAnswer === questionContext.correctAnswer ? '✅ CORRECT' : questionContext.userAnswer ? '❌ WRONG' : '⏭ SKIPPED'}
${questionContext.rationale ? `Rationale: ${questionContext.rationale}` : ''}
${questionContext.difficulty ? `Difficulty: ${questionContext.difficulty}` : ''}
${questionContext.questionType ? `Topic: ${questionContext.questionType}` : ''}
[END QUESTION CONTEXT]
` : '';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = useCallback(async (text: string, retryAttempt = 0) => {
    if (!text.trim() || streaming) return;

    // Only add user message on first attempt (not retries)
    if (retryAttempt === 0) {
      const userMsg: ChatMessage = { role: 'user', content: text.trim() };
      setMessages(prev => [...prev, userMsg]);
      setInput('');
    } else {
      // Remove the last error message before retrying
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.content.startsWith('❌')) return prev.slice(0, -1);
        return prev;
      });
    }
    setStreaming(true);

    const history = messages.slice(-10);
    const localSettings = JSON.stringify(gatherLocalSettings());

    const MAX_RETRIES = 2;
    const attempt = async (tryNum: number): Promise<void> => {
      try {
        const fullMessage = questionContextStr ? `${questionContextStr}\n\nUser question: ${text.trim()}` : text.trim();
        const streamResponse = chatGuest({
          message: fullMessage,
          conversationHistory: history,
          localSettings,
          localHistorySummary: buildLocalHistorySummary(),
        });

        setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        for await (const chunk of streamResponse) {
          setMessages(prev => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') {
              next[next.length - 1] = { ...last, content: last.content + chunk };
            }
            return next;
          });
        }
      } catch (err) {
        // Remove empty assistant message if it was added
        setMessages(prev => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
          return prev;
        });

        const isNonRetryable = err instanceof Error && (err.name === 'AiError' && ['no_key', 'auth', 'unsupported'].includes((err as any).code));
        if (!isNonRetryable && tryNum < MAX_RETRIES) {
          // Exponential backoff: 1s, 2s
          await new Promise(r => setTimeout(r, (tryNum + 1) * 1000));
          return attempt(tryNum + 1);
        }

        const errMsg = err instanceof Error ? err.message : '';
        const isAiErr = err instanceof Error && err.name === 'AiError';
        const isTimeout = errMsg.includes('timed out') || errMsg.includes('timeout');
        const isQuota = errMsg.includes('quota') || errMsg.includes('limit') || errMsg.includes('429');

        const friendlyMsg = isAiErr && errMsg
          ? errMsg
          : isTimeout
            ? 'Request timed out. Tap the retry button below to try again.'
            : isQuota
              ? 'AI rate limit reached. Wait a moment and tap retry.'
              : (errMsg || 'Something went wrong. Tap the retry button below to try again.');

        setMessages(prev => [
          ...prev,
          { role: 'assistant', content: `❌ ${friendlyMsg}` },
        ]);
      }
    };

    await attempt(retryAttempt > 0 ? 1 : 0);
    setStreaming(false);
  }, [messages, streaming, questionContextStr]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <OverlayLayer layer="panel">
    <div className="fixed inset-0 flex flex-col bg-background animate-fade-in" style={{ zIndex: 'var(--qmp-z-panel)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 backdrop-blur-xl flex-shrink-0">
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-xl bg-foreground/5 hover:bg-foreground/10 border border-border flex items-center justify-center transition-colors"
        >
          <ArrowLeft className="w-4 h-4 text-foreground/60" />
        </button>
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
          <Bot className="w-4.5 h-4.5 text-primary-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-foreground leading-tight">QMP AI Assistant</p>
          <p className="text-[10px] text-foreground/40 font-semibold">
            {questionContext ? '🎯 Question Mode · Ask anything about this Q' : isGuest ? '🤖 Powered by Gemini · Guest Mode' : '🤖 Powered by Gemini · Full Data Access'}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {isGuest && (
            <button
              onClick={() => openSignIn()}
              className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1.5 rounded-lg hover:bg-primary/15 transition-all"
            >
              <LogIn className="w-3 h-3" /> Sign In
            </button>
          )}
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-2 rounded-lg text-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
              title="Clear chat"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="space-y-5 pt-8 max-w-lg mx-auto">
            <div className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/20 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-lg font-black text-foreground mb-1">Hi {displayName}!</h2>
              <p className="text-sm text-foreground/50 leading-relaxed max-w-xs mx-auto">
                {isGuest
                  ? 'Ask me anything about studying, quiz strategies, or learning tips. Sign in for personalized analytics!'
                  : 'Ask me anything about your quiz data, study progress, or get a personalized strategy.'
                }
              </p>
            </div>

            {/* Question context banner */}
            {questionContext && (
              <div className="bg-primary/8 border border-primary/15 rounded-xl px-4 py-3">
                <p className="text-[10px] font-black text-primary/70 uppercase tracking-widest mb-1.5">🎯 Question Context</p>
                <p className="text-xs font-bold text-foreground/70 leading-relaxed line-clamp-3">{questionContext.question}</p>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-md border ${
                    questionContext.userAnswer === questionContext.correctAnswer
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : questionContext.userAnswer
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}>
                    {questionContext.userAnswer === questionContext.correctAnswer ? '✅ Correct' : questionContext.userAnswer ? '❌ Wrong' : '⏭ Skipped'}
                  </span>
                  {questionContext.difficulty && (
                    <span className="text-[9px] font-bold text-foreground/40 bg-foreground/5 px-2 py-0.5 rounded-md border border-border">{questionContext.difficulty}</span>
                  )}
                </div>
              </div>
            )}

            {/* Guest mode banner */}
            {isGuest && !questionContext && (
              <div className="flex items-center gap-3 bg-primary/8 border border-primary/15 rounded-xl px-4 py-3">
                <span className="text-lg flex-shrink-0">🤖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-bold text-foreground/60">Guest Mode Active</p>
                  <p className="text-[10px] text-foreground/35 mt-0.5">Using local data. Sign in for full cloud analytics & personalized insights.</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {suggestions.map(s => (
                <button
                  key={s}
                  onClick={() => sendMessage(s.replace(/^[^\s]+\s/, ''))}
                  className="text-left text-sm font-semibold px-4 py-3 rounded-xl border border-border bg-card hover:bg-primary/10 hover:border-primary/20 text-foreground/60 hover:text-foreground transition-all active:scale-[0.98]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 max-w-2xl mx-auto ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-4 h-4 text-primary-foreground" />
              </div>
            )}
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-card border border-border text-foreground/85 rounded-bl-md'
            }`}>
              {msg.role === 'assistant' ? (
                msg.content ? (
                  <div>
                    <div className="prose prose-sm prose-invert max-w-none [&_p]:mb-2 [&_p]:mt-0 [&_li]:mb-1 [&_ul]:mb-2 [&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_strong]:text-foreground">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                    {msg.content.startsWith('❌') && i === messages.length - 1 && !streaming && (() => {
                      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
                      return lastUserMsg ? (
                        <button
                          onClick={() => sendMessage(lastUserMsg.content, 1)}
                          className="mt-2 flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/20 px-3 py-2 rounded-lg hover:bg-primary/15 transition-all"
                        >
                          ↻ Retry
                        </button>
                      ) : null;
                    })()}
                  </div>
                ) : streaming && i === messages.length - 1 ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-foreground/40">Thinking…</span>
                  </div>
                ) : null
              ) : (
                <span>{msg.content}</span>
              )}
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-foreground/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-4 h-4 text-foreground/60" />
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-border bg-card/60 backdrop-blur-xl pb-safe">
        <div className="flex gap-3 items-center max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isGuest ? "Ask anything about studying…" : "Ask about your progress…"}
            disabled={streaming}
            className="flex-1 bg-foreground/[0.04] border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
          />
          <button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center text-primary-foreground disabled:opacity-30 hover:bg-primary/90 transition-all active:scale-90 flex-shrink-0"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
    </OverlayLayer>
  );
}
