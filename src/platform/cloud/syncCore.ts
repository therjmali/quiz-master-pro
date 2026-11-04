/**
 * Pure decision logic of the sync engine - no I/O, fully unit-tested.
 *
 *   base   = what both sides agreed on at the last successful sync
 *   local  = what is on this device now
 *   remote = what the cloud holds now
 *
 * Per section: if only one side changed, take it; if both changed, merge field-by-field (see merge3);
 * a section deleted on one side and untouched on the other is deleted everywhere. Whenever both
 * sides changed the *same* value differently, the newest device wins and the loser is reported as a
 * conflict so the user can inspect it in the sync log.
 */
import { deepEqual, mergeThreeWay, type MergeConflict } from './merge3';
import { fingerprint, isSyncKey } from './sections';
import type { RemoteDoc } from './remote';

export type Sections = Record<string, unknown>;

export interface SectionConflicts { key: string; conflicts: MergeConflict[] }

export interface MergeOutcome {
  merged: Sections;
  conflicts: SectionConflicts[];
}

export function mergeSections(base: Sections, local: Sections, remote: Sections): MergeOutcome {
  const merged: Sections = {};
  const conflicts: SectionConflicts[] = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);

  for (const key of keys) {
    const b = base[key];
    const l = local[key];
    const r = remote[key];

    if (l === undefined && r === undefined) continue;
    if (l === undefined) {
      // Missing locally: a deliberate local deletion if the base still had it, otherwise brand new remotely.
      if (b !== undefined) continue;
      merged[key] = r;
      continue;
    }
    if (r === undefined) {
      if (b !== undefined) continue; // remote deleted, local untouched -> follow the deletion
      merged[key] = l;
      continue;
    }
    if (b !== undefined && deepEqual(b, l)) { merged[key] = r; continue; }
    if (b !== undefined && deepEqual(b, r)) { merged[key] = l; continue; }
    if (deepEqual(l, r)) { merged[key] = l; continue; }

    const result = mergeThreeWay(b, l, r, key);
    merged[key] = result.value;
    if (result.conflictCount) conflicts.push({ key, conflicts: result.conflicts });
  }
  return { merged, conflicts };
}

export interface PushPlan {
  sections: Record<string, { value: unknown; updatedAt: string }>;
  deletions: string[];
}

/** What the server is missing, given the merged result and the server's current content. */
export function planPush(merged: Sections, remote: Sections, opts: { forceAll?: boolean; now?: string } = {}): PushPlan {
  const now = opts.now ?? new Date().toISOString();
  const sections: PushPlan['sections'] = {};
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined || !isSyncKey(key)) continue;
    const remoteValue = remote[key];
    if (opts.forceAll || remoteValue === undefined || fingerprint(value) !== fingerprint(remoteValue)) {
      sections[key] = { value, updatedAt: now };
    }
  }
  const deletions = Object.keys(remote).filter(key => merged[key] === undefined && isSyncKey(key));
  return { sections, deletions };
}

/** Overlay a pulled (incremental) document on the last agreed state to get the full remote picture. */
export function remoteFromDoc(doc: Pick<RemoteDoc, 'data' | 'changedKeys'>, base: Sections): Sections {
  const remote: Sections = { ...base, ...(doc.data ?? {}) };
  for (const key of doc.changedKeys ?? []) {
    if (!(key in (doc.data ?? {}))) delete remote[key];
  }
  return remote;
}

/** Only sections this build knows how to apply are ever merged or written to the device. */
export function onlySyncable(sections: Sections): Sections {
  const out: Sections = {};
  for (const [key, value] of Object.entries(sections)) if (isSyncKey(key)) out[key] = value;
  return out;
}
