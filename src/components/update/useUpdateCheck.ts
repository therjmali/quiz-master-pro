import { useCallback, useEffect, useRef, useState } from 'react';
import { checkForUpdate, readCachedResult, shouldAutoCheck, canSelfUpdate, type UpdateResult } from '../../platform/updater';

/** Shared update state: shows the last known result instantly, re-checks quietly at most every 12 h (installed app only). */
export function useUpdateCheck(auto: boolean) {
  const [result, setResult] = useState<UpdateResult | null>(() => readCachedResult());
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const check = useCallback(async () => {
    if (busy.current) return null;
    busy.current = true; setChecking(true);
    try { const r = await checkForUpdate(); setResult(r); return r; }
    finally { busy.current = false; setChecking(false); }
  }, []);

  useEffect(() => {
    if (!auto || !canSelfUpdate() || !shouldAutoCheck()) return;
    // Never compete with start-up work: the app is already usable offline before this runs.
    const t = setTimeout(() => { void check(); }, 4000);
    return () => clearTimeout(t);
  }, [auto, check]);

  return { result, checking, check };
}
