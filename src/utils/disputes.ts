const KEY = 'qmp_disputes';

export interface DisputeRecord {
  questionHash: string;
  verdict: 'confirmed' | 'disputed' | 'incorrect';
  verdictText: string;
  confidence: number;
  suggestedAnswer?: string;
  reason: string;
  timestamp: number;
}

function hashQuestion(q: string): string {
  let hash = 0;
  for (let i = 0; i < q.length; i++) {
    hash = ((hash << 5) - hash) + q.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

export function getDisputes(): Record<string, DisputeRecord> {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}

export function getDispute(question: string): DisputeRecord | undefined {
  return getDisputes()[hashQuestion(question)];
}

export function saveDispute(question: string, record: Omit<DisputeRecord, 'questionHash'>): DisputeRecord {
  const disputes = getDisputes();
  const h = hashQuestion(question);
  const entry: DisputeRecord = { ...record, questionHash: h };
  disputes[h] = entry;
  localStorage.setItem(KEY, JSON.stringify(disputes));
  return entry;
}
