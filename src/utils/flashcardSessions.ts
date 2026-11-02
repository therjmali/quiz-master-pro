const SESSIONS_KEY = 'qmp_flashcard_sessions';

export interface FlashcardSession {
  id: string;
  timestamp: number;
  cardsReviewed: number;
  markedKnown: number;
  markedReview: number;
  subjects: string[];
  durationSeconds: number;
  masteryPct: number;
}

export function loadSessions(): FlashcardSession[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) || '[]');
  } catch { return []; }
}

export function saveSessions(sessions: FlashcardSession[]) {
  try {
    // Keep last 500 sessions
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions.slice(0, 500)));
  } catch {}
}

export function recordSession(session: Omit<FlashcardSession, 'id'>): FlashcardSession {
  const sessions = loadSessions();
  const entry: FlashcardSession = {
    ...session,
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
  };
  sessions.unshift(entry);
  saveSessions(sessions);
  return entry;
}

export function getSessionsInRange(range: 'today' | 'week' | 'month' | 'all'): FlashcardSession[] {
  const sessions = loadSessions();
  if (range === 'all') return sessions;
  const now = Date.now();
  if (range === 'today') {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    return sessions.filter(s => s.timestamp >= start.getTime());
  }
  if (range === 'week') return sessions.filter(s => s.timestamp >= now - 7 * 86400000);
  if (range === 'month') {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0);
    return sessions.filter(s => s.timestamp >= d.getTime());
  }
  return sessions;
}
