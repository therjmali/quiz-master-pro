import { useState, useEffect, useRef, useCallback } from 'react';
import { QuizResult, QuizQuestion } from '../types/quiz';
import { SyncStatus } from '../components/Navbar';
import { saveQuizResult, getQuizHistory, getQuizDetail, trashQuizResult, restoreQuizResult } from 'zitejs/api';
import { registerOnlineSync, addToSyncQueue, removeFromSyncQueueByTimestamp } from '../utils/offlineSync';
import { hapticHeavy } from '../utils/haptics';
import { toast } from 'sonner';
import { reapplyStoredNegativeMarking } from '../utils/negativeMarkingStore';
import { idbGet, idbSet, idbGetMulti } from '../utils/indexedDB';
import { getHistory as getHistoryAsync, getHistorySync as getHistoryFromStore, setHistory as setHistoryStore } from '../utils/historyStore';

const IDB_HISTORY_KEY = 'qmp_history_cache';
const IDB_SYNC_TS_KEY = 'qmp_last_sync_ts';
const IDB_DETAIL_PREFIX = 'qmp_detail_';
const LRU_MAX = 30;

/** Parse a lite server record into a QuizResult with empty quizData/userAnswers (no JSON parsing overhead) */
export function parseSummaryRecord(r: any): QuizResult {
  const correct = r.correctCount || 0;
  const wrong = r.wrongCount || 0;
  const skipped = r.skippedCount || 0;
  const score = r.score || 0;
  const maxScore = r.maxScore || 0;
  const accuracy = (correct + wrong) > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
  const totalQuestions = r.totalQuestions || correct + wrong + skipped;
  // Always derive percentage from score/maxScore — never trust stored value
  const percentage = maxScore > 0 ? Math.max(0, Math.min(100, Math.round((score / maxScore) * 100))) : (r.percentage || 0);
  return {
    id: r.id, totalQuestions,
    quizData: [], userAnswers: [],
    score, maxScore, percentage,
    correct, wrong, skipped,
    gain: r.gain ?? correct,
    penalty: r.penalty ?? 0,
    netScore: score,
    accuracy,
    timeTaken: r.timeTakenSeconds || 0,
    difficulty: r.difficulty,
    timestamp: r.localTimestamp || (r.createdAt ? new Date(r.createdAt).getTime() : Date.now()),
    quizTitle: r.quizTitle || undefined,
    subject: r.subject || undefined,
    passMark: undefined,
    attemptType: r.attemptType === 'Practice' ? 'practice' : 'main',
    attemptNumber: r.attemptNumber || undefined,
    parentQuizId: r.parentQuizId || undefined,
    parentQuizTimestamp: undefined,
    notes: r.notes || undefined,
  };
}

/** Parse a full server record into a QuizResult (with JSON parsing) */
export function parseFullRecord(r: any): QuizResult {
  let quizData: QuizQuestion[] = [];
  let userAnswers: (string | null)[] = [];
  try { quizData = JSON.parse(r.quizDataJson || '[]'); } catch {}
  try { userAnswers = JSON.parse(r.userAnswersJson || '[]'); } catch {}
  const summary = parseSummaryRecord(r);
  return {
    ...summary,
    quizData,
    userAnswers,
  };
}

/** Resolve parentQuizTimestamp from parentQuizId */
function resolveParentTimestamps<T extends QuizResult>(records: T[]): T[] {
  const idToTs = new Map<string, number>();
  records.forEach(r => { if (r.id) idToTs.set(r.id, r.timestamp); });
  return records.map(r => {
    if (r.attemptType === 'practice' && r.parentQuizId && !r.parentQuizTimestamp) {
      const ts = idToTs.get(r.parentQuizId);
      if (ts) return { ...r, parentQuizTimestamp: ts };
    }
    return r;
  });
}

/**
 * Records that exist only on this device (saved while offline / cloud save failed) have no cloud id.
 * A cloud refresh must never drop them — merge them back (deduped by timestamp).
 */
function mergeLocalOnly(cloud: QuizResult[], local: QuizResult[] | undefined | null): QuizResult[] {
  if (!local?.length) return cloud;
  const cloudTs = new Set(cloud.map(r => r.timestamp));
  const pending = local.filter(r => !r.id && !cloudTs.has(r.timestamp));
  if (!pending.length) return cloud;
  return [...cloud, ...pending].sort((a, b) => b.timestamp - a.timestamp);
}

async function fetchPage(offset: number, limit: number, since?: number) {
  const page = await getQuizHistory({ limit, offset, since });
  return {
    records: (page.records as any[]).map(parseSummaryRecord),
    hasMore: page.hasMore,
  };
}

async function fetchRemainingRecords(startOffset: number, since?: number): Promise<QuizResult[]> {
  const PAGE_SIZE = 500;
  let all: QuizResult[] = [];
  let offset = startOffset;
  let hasMore = true;
  while (hasMore) {
    const page = await fetchPage(offset, PAGE_SIZE, since);
    all = all.concat(page.records);
    hasMore = page.hasMore;
    offset += page.records.length;
    if (all.length + startOffset >= 5000) break;
  }
  return all;
}

/**
 * LRU cache for full QuizResult objects.
 * Keeps max 30 entries; oldest evicted on insert.
 */
class DetailCache {
  private map = new Map<string, QuizResult>();
  private max: number;

  constructor(max = LRU_MAX) { this.max = max; }

  get(id: string): QuizResult | undefined {
    const v = this.map.get(id);
    if (v) {
      // Move to end (most recent) by re-inserting — Map preserves insertion order
      this.map.delete(id);
      this.map.set(id, v);
    }
    return v;
  }

  set(id: string, value: QuizResult) {
    this.map.delete(id); // remove first to update insertion order
    this.map.set(id, value);
    if (this.map.size > this.max) {
      // Evict oldest (first key)
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  invalidate(id: string) {
    this.map.delete(id);
  }

  clear() {
    this.map.clear();
  }
}

/** Clear IndexedDB history cache — call on logout to prevent duplication */
export async function clearHistoryCache() {
  try {
    await idbSet(IDB_HISTORY_KEY, []);
    await idbSet(IDB_SYNC_TS_KEY, undefined);
  } catch {}
}

/** Store a full QuizResult in IDB for later retrieval (combined reports, offline use) */
export async function storeQuizDetail(key: string, result: QuizResult): Promise<void> {
  try {
    await idbSet(`${IDB_DETAIL_PREFIX}${key}`, result);
  } catch {}
}

/** Retrieve full QuizResult from IDB by id or timestamp key */
export async function getQuizDetailFromIDB(key: string): Promise<QuizResult | undefined> {
  return idbGet<QuizResult>(`${IDB_DETAIL_PREFIX}${key}`);
}

/** Retrieve multiple full QuizResults from IDB */
export async function getQuizDetailsFromIDB(keys: string[]): Promise<Map<string, QuizResult>> {
  return idbGetMulti<QuizResult>(keys.map(k => `${IDB_DETAIL_PREFIX}${k}`)).then(map => {
    const result = new Map<string, QuizResult>();
    map.forEach((v, k) => result.set(k.replace(IDB_DETAIL_PREFIX, ''), v));
    return result;
  });
}

export function useHistorySync(user: any, isLoading: boolean) {
  const [history, setHistory] = useState<QuizResult[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  const [totalRecords, setTotalRecords] = useState(0);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const historyRef = useRef<QuizResult[]>([]);
  const userRef = useRef(user);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recentlyTrashedRef = useRef<Map<string, QuizResult>>(new Map());
  const dirtyRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const detailCacheRef = useRef(new DetailCache());
  const refreshRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { userRef.current = user; }, [user]);
  useEffect(() => {
    return () => { if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current); };
  }, []);

  const flashSynced = useCallback(() => {
    setSyncStatus('synced');
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(() => setSyncStatus('idle'), 4000);
  }, []);

  const markDirty = useCallback(() => { dirtyRef.current = true; }, []);
  const clearDirty = useCallback(() => { dirtyRef.current = false; }, []);
  const isDirty = useCallback(() => dirtyRef.current, []);

  /** Fetch full QuizResult for a single quiz (checks LRU cache first) */
  const fetchFullDetail = useCallback(async (id: string): Promise<QuizResult | null> => {
    // Check LRU cache
    const cached = detailCacheRef.current.get(id);
    if (cached) return cached;

    try {
      const resp = await getQuizDetail({ id });
      if (!resp.record) return null;
      const full = parseFullRecord(resp.record);
      detailCacheRef.current.set(id, full);
      return full;
    } catch {
      return null;
    }
  }, []);

  /** Cache a QuizResult that was just created locally (e.g. after quiz completion) */
  const cacheDetail = useCallback((id: string, result: QuizResult) => {
    detailCacheRef.current.set(id, result);
  }, []);

  /** Invalidate a cached detail (e.g. after edit/trash) */
  const invalidateDetail = useCallback((id: string) => {
    detailCacheRef.current.invalidate(id);
  }, []);

  // ── Progressive initial fetch with IndexedDB cache ──
  useEffect(() => {
    if (!user) {
      if (!isLoading) {
        setSyncStatus('offline');
        // Guest / offline: the history store (IndexedDB, full data) is the source of truth.
        // Fall back to the signed-in cache only if the local store is empty.
        (async () => {
          try {
            const local = await getHistoryAsync();
            if (local.length) { setHistory(local); return; }
          } catch {}
          const cached = await idbGet<QuizResult[]>(IDB_HISTORY_KEY);
          if (cached?.length) { setHistory(cached); return; }
          try {
            const l = getHistoryFromStore();
            if (l.length) setHistory(l);
          } catch {}
        })();
      }
      return;
    }

    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    // Step 0: Show IndexedDB cache instantly for fast first paint
    let cachedAtStart: QuizResult[] | undefined;
    (async () => {
      cachedAtStart = await idbGet<QuizResult[]>(IDB_HISTORY_KEY);
      if (cachedAtStart?.length) {
        setHistory(cachedAtStart);
        setTotalRecords(cachedAtStart.length);
      }
    })();

    setSyncStatus('syncing');

    // Step 1: Full reconciliation with the cloud (stale-while-revalidate).
    // The list endpoint returns lightweight summaries, so a full pass is cheap — and it is the only
    // way edits, restores and deletes made on ANOTHER device (or after a title/date edit) reach this
    // one. The old incremental "since" sync filtered on the quiz's own date and could never see them.
    (async () => {
      try {
        const cachedHistory = cachedAtStart ?? await idbGet<QuizResult[]>(IDB_HISTORY_KEY);
        const hasCache = !!cachedHistory?.length;

        const INITIAL_PAGE = 50;
        const { records: firstBatch, hasMore } = await fetchPage(0, INITIAL_PAGE);

        // With a cache already on screen, don't flash a truncated list — wait for the full set.
        if (!hasCache) {
          const first = mergeLocalOnly(reapplyStoredNegativeMarking(resolveParentTimestamps(firstBatch)), cachedHistory);
          setHistory(first);
          setTotalRecords(first.length);
          flashSynced();
        }

        let all = firstBatch;
        if (hasMore) {
          setLoadingOlder(true);
          const remaining = await fetchRemainingRecords(INITIAL_PAGE);
          all = [...firstBatch, ...remaining];
          setLoadingOlder(false);
        }
        const resolved = mergeLocalOnly(reapplyStoredNegativeMarking(resolveParentTimestamps(all)), cachedHistory);
        setHistory(resolved);
        setTotalRecords(resolved.length);
        flashSynced();

        await idbSet(IDB_HISTORY_KEY, resolved);
        await idbSet(IDB_SYNC_TS_KEY, Date.now());
      } catch {
        setSyncStatus('error');
        setLoadingOlder(false);
        // IndexedDB cache already shown from Step 0
        const cached = await idbGet<QuizResult[]>(IDB_HISTORY_KEY);
        if (!cached?.length) {
          try {
            const l = getHistoryFromStore();
            if (l.length) setHistory(l);
          } catch {}
        }
      }
    })();
  }, [user, isLoading, flashSynced]);

  useEffect(() => {
    if (!user) { initialLoadDoneRef.current = false; }
  }, [user]);

  // Offline sync
  useEffect(() => {
    if (!user) return;
    return registerOnlineSync(async (item) => {
      if (item.type === 'saveQuizResult') {
        try {
          await saveQuizResult(item.payload);
          // Pull the new cloud id back into history (also dedupes the local-only copy by timestamp)
          refreshRef.current?.();
          return true;
        } catch { return false; }
      }
      return false;
    });
  }, [user]);

  const refreshHistory = useCallback(async () => {
    if (!userRef.current) return;
    setSyncStatus('syncing');
    try {
      const INITIAL_PAGE = 50;
      const { records: firstBatch, hasMore } = await fetchPage(0, INITIAL_PAGE);
      let all = firstBatch;
      if (hasMore) {
        const remaining = await fetchRemainingRecords(INITIAL_PAGE);
        all = [...all, ...remaining];
      }
      const resolved = mergeLocalOnly(reapplyStoredNegativeMarking(resolveParentTimestamps(all)), historyRef.current);
      setHistory(resolved);
      setTotalRecords(resolved.length);
      flashSynced();
      // Update IndexedDB cache
      await idbSet(IDB_HISTORY_KEY, resolved);
      await idbSet(IDB_SYNC_TS_KEY, Date.now());
    } catch { setSyncStatus('error'); }
  }, [flashSynced]);
  useEffect(() => { refreshRef.current = refreshHistory; }, [refreshHistory]);

  const saveResult = useCallback(async (result: QuizResult) => {
    // Create summary for the history list
    // Store as lightweight summary in history (no quizData/userAnswers in list)
    const summary: QuizResult = {
      totalQuestions: result.totalQuestions,
      quizData: [], userAnswers: [],
      score: result.score,
      maxScore: result.maxScore,
      percentage: result.maxScore > 0 ? Math.max(0, Math.min(100, Math.round(((result.netScore ?? result.score ?? 0) / result.maxScore) * 100))) : result.percentage,
      correct: result.correct,
      wrong: result.wrong,
      skipped: result.skipped,
      gain: result.gain,
      penalty: result.penalty,
      netScore: result.netScore,
      accuracy: result.accuracy,
      timeTaken: result.timeTaken,
      difficulty: result.difficulty,
      timestamp: result.timestamp,
      quizTitle: result.quizTitle,
      subject: result.subject,
      passMark: result.passMark,
      attemptType: result.attemptType,
      attemptNumber: result.attemptNumber,
      parentQuizId: result.parentQuizId,
      parentQuizTimestamp: result.parentQuizTimestamp,
      notes: result.notes,
      isMockExam: result.isMockExam,
      isAdaptive: result.isAdaptive,
      adaptiveSkillLevel: result.adaptiveSkillLevel,
    };

    const newHist = [summary, ...historyRef.current];
    setHistory(newHist);
    markDirty();

    // Always store full quiz detail in IDB for offline combined reports
    const detailKey = String(result.timestamp);
    storeQuizDetail(detailKey, result).catch(() => {});

    if (userRef.current) {
      setSyncStatus('syncing');
      let payload: any = null;
      try {
        // Derive correct percentage before saving to cloud
        const derivedPct = result.maxScore > 0 ? Math.max(0, Math.min(100, Math.round((result.netScore / result.maxScore) * 100))) : result.percentage;
        payload = {
          quizDataJson: JSON.stringify(result.quizData),
          userAnswersJson: JSON.stringify(result.userAnswers),
          score: result.netScore, maxScore: result.maxScore, percentage: derivedPct,
          totalQuestions: result.totalQuestions, correctCount: result.correct,
          wrongCount: result.wrong, skippedCount: result.skipped,
          timeTakenSeconds: result.timeTaken,
          questionPreview: result.quizData[0]?.question || 'Quiz',
          difficulty: result.difficulty,
          quizTitle: result.quizTitle || undefined,
          subject: result.subject || undefined,
          gain: result.gain, penalty: result.penalty,
          localTimestamp: result.timestamp,
          attemptType: result.attemptType === 'practice' ? 'Practice' : 'Main',
          attemptNumber: result.attemptNumber,
          parentQuizId: result.parentQuizId || undefined,
        };
        const { id } = await saveQuizResult(payload);
        flashSynced();
        toast.success('☁️ Quiz saved to cloud');
        // Update summary with cloud id
        setHistory(prev => prev.map(r => r.timestamp === result.timestamp ? { ...r, id } : r));
        // Cache full result in LRU
        detailCacheRef.current.set(id, { ...result, id });
        // Also store in IDB by both id and timestamp for offline combined reports
        storeQuizDetail(id, { ...result, id }).catch(() => {});
        // Update IndexedDB cache
        idbSet(IDB_HISTORY_KEY, [{ ...summary, id }, ...historyRef.current.filter(r => r.timestamp !== result.timestamp)]).catch(() => {});
        idbSet(IDB_SYNC_TS_KEY, Date.now()).catch(() => {});
        return id;
      } catch {
        setSyncStatus('error');
        toast.error('Cloud save failed — saved on this device and will retry automatically');
        // Signed-in sessions read from the IDB cache — persist there too, otherwise the quiz
        // would vanish on reload. Queue the upload so it retries when the connection is back.
        idbSet(IDB_HISTORY_KEY, newHist).catch(() => {});
        if (payload) addToSyncQueue('saveQuizResult', payload);
        return undefined;
      }
    } else {
      setSyncStatus('offline');
      setHistoryStore(newHist);
      toast('💾 Saved locally — sign in to sync to cloud');
      return undefined;
    }
  }, [flashSynced, markDirty]);

  const trashResult = useCallback(async (id: string) => {
    hapticHeavy();
    const item = historyRef.current.find(h => h.id === id || String(h.timestamp) === id);
    if (!item) return;

    const filtered = historyRef.current.filter(h => h.id !== id && String(h.timestamp) !== id);
    setHistory(filtered);
    markDirty();

    // Invalidate detail cache
    if (item.id) detailCacheRef.current.invalidate(item.id);

    if (userRef.current && item.id) {
      recentlyTrashedRef.current.set(id, item);
      try {
        await trashQuizResult({ id });
      } catch {
        setHistory(prev => [item, ...prev].sort((a, b) => b.timestamp - a.timestamp));
        toast.error('Could not move to trash. Please try again.');
        recentlyTrashedRef.current.delete(id);
        return;
      }
    } else if (!userRef.current) {
      setHistoryStore(filtered);
    } else {
      // Signed in but never reached the cloud (no id): drop it from the retry queue and local store
      removeFromSyncQueueByTimestamp(item.timestamp);
    }

    // Update IndexedDB
    idbSet(IDB_HISTORY_KEY, filtered).catch(() => {});

    toast('🗑️ Moved to Trash', {
      action: {
        label: '↩️ Undo',
        onClick: async () => {
          const trashedItem = recentlyTrashedRef.current.get(id);
          if (!trashedItem) return;
          if (userRef.current && trashedItem.id) {
            try { await restoreQuizResult({ id }); }
            catch { toast.error('Could not restore.'); return; }
          }
          setHistory(prev => {
            const restored = [trashedItem, ...prev].sort((a, b) => b.timestamp - a.timestamp);
            idbSet(IDB_HISTORY_KEY, restored).catch(() => {});
            return restored;
          });
          toast.success('↩️ Quiz restored!');
          recentlyTrashedRef.current.delete(id);
        },
      },
      duration: 6000,
    });
    setTimeout(() => recentlyTrashedRef.current.delete(id), 7000);
  }, [markDirty]);

  const undoLastTrash = useCallback(() => {
    const entries = Array.from(recentlyTrashedRef.current.entries());
    if (!entries.length) { toast('📳 Shake detected — nothing to undo'); return; }
    const [id, item] = entries[entries.length - 1];
    setHistory(prev => [item, ...prev].sort((a, b) => b.timestamp - a.timestamp));
    recentlyTrashedRef.current.delete(id);
    if (userRef.current && item.id) {
      restoreQuizResult({ id }).catch(() => {});
    }
    toast.success('🔄 Shake! Undone last delete');
  }, []);

  return {
    history, setHistory, syncStatus, setSyncStatus,
    historyRef, userRef, recentlyTrashedRef, totalRecords,
    refreshHistory, saveResult, trashResult, undoLastTrash,
    flashSynced, isDirty, clearDirty, markDirty,
    loadingOlder,
    // New two-tier APIs
    fetchFullDetail, cacheDetail, invalidateDetail,
  };
}
