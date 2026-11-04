import './setup';
import { CloudError } from '../src/platform/cloud/http';
import { fingerprint } from '../src/platform/cloud/sections';
import type { PushResult, RemoteDoc, RevisionRow } from '../src/platform/cloud/remote';

type Sections = Record<string, unknown>;
const clone = <T,>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** In-memory twin of supabase/quiz_schema.sql (version check, hashes, incremental pull, restore points). */
export class FakeCloud {
  version = 0;
  sections = new Map<string, { value: unknown; hash: string; updatedAt: string }>();
  revisions: Array<{ version: number; snapshot: Record<string, unknown>; at: string }> = [];
  pushes = 0;
  pulls = 0;
  failNextPushWith: Error | null = null;
  beforePush: (() => void) | null = null;
  rejectKeys = new Set<string>();

  private meta(): Record<string, { hash: string; updatedAt: string }> {
    return Object.fromEntries([...this.sections].map(([k, s]) => [k, { hash: s.hash, updatedAt: s.updatedAt }]));
  }

  seed(data: Sections): void {
    for (const [k, v] of Object.entries(data)) this.sections.set(k, { value: clone(v), hash: fingerprint(v), updatedAt: new Date().toISOString() });
    this.version++;
  }

  data(): Sections { return Object.fromEntries([...this.sections].map(([k, s]) => [k, clone(s.value)])); }

  pullDoc = async (have: string): Promise<RemoteDoc> => {
    this.pulls++;
    const known: Record<string, string> = {};
    for (const part of have.split(',')) { const i = part.lastIndexOf(':'); if (i > 0) known[part.slice(0, i)] = part.slice(i + 1); }
    const haveAny = Object.keys(known).length > 0;
    const data: Sections = {};
    const changedKeys: string[] = [];
    for (const [k, s] of this.sections) if (!haveAny || known[k] !== s.hash) { data[k] = clone(s.value); changedKeys.push(k); }
    if (haveAny) for (const k of Object.keys(known)) if (!this.sections.has(k)) changedKeys.push(k);
    return { version: this.version, updatedAt: new Date().toISOString(), sections: this.meta(), data, changedKeys };
  };

  pushDoc = async (body: { baseVersion: number; sections: Record<string, { value: unknown; updatedAt: string }>; deletions: string[] }): Promise<PushResult> => {
    this.beforePush?.(); this.beforePush = null;
    if (this.failNextPushWith) { const e = this.failNextPushWith; this.failNextPushWith = null; throw e; }
    this.pushes++;
    if (body.baseVersion !== this.version) {
      throw new CloudError('conflict', 'version_conflict', 409, { version: this.version, updatedAt: new Date().toISOString(), sections: this.meta(), data: this.data() });
    }
    const applied: string[] = [];
    const rejected: Array<{ key: string; reason: string }> = [];
    const next = new Map(this.sections);
    for (const [k, s] of Object.entries(body.sections)) {
      if (this.rejectKeys.has(k)) { rejected.push({ key: k, reason: 'section_too_large' }); continue; }
      const h = fingerprint(s.value);
      if (next.get(k)?.hash === h) continue;
      next.set(k, { value: clone(s.value), hash: h, updatedAt: s.updatedAt }); applied.push(k);
    }
    for (const k of body.deletions) if (next.delete(k)) applied.push(`-${k}`);
    if (applied.length === 0) return { version: this.version, updatedAt: new Date().toISOString(), sections: this.meta(), applied: [], rejected, unchanged: true };
    this.sections = next; this.version++;
    this.revisions.push({ version: this.version, snapshot: this.data(), at: new Date().toISOString() });
    this.revisions = this.revisions.slice(-5);
    return { version: this.version, updatedAt: new Date().toISOString(), sections: this.meta(), applied, rejected };
  };

  listRevisions = async (): Promise<RevisionRow[]> =>
    this.revisions.map(r => ({ version: r.version, at: r.at, deviceId: null, keys: Object.keys(r.snapshot), bytes: JSON.stringify(r.snapshot).length })).reverse();

  restoreRevisionRemote = async (version: number): Promise<RemoteDoc> => {
    const rev = this.revisions.find(r => r.version === version);
    if (!rev) throw new CloudError('revision_not_found', 'revision_not_found', 404);
    this.sections = new Map(Object.entries(rev.snapshot).map(([k, v]) => [k, { value: clone(v), hash: fingerprint(v), updatedAt: rev.at }]));
    this.version++;
    return { version: this.version, updatedAt: new Date().toISOString(), sections: this.meta(), data: this.data(), changedKeys: [] };
  };

  wipeRemote = async (): Promise<void> => { this.sections = new Map(); this.version++; };
}

/** A simulated phone: its own localStorage, bookkeeping store and app data. */
export class FakeDevice {
  data: Sections = {};
  appliedLog: string[][] = [];
  midSyncEdit: (() => void) | null = null;
  constructor(public name: string, public userId = 'user-1') {}
  edit(key: string, value: unknown): void { this.data[key] = clone(value); }
  remove(key: string): void { delete this.data[key]; }
  readLocal = async (): Promise<Sections> => clone(this.data);
  applyLocal = async (target: Sections, skip: ReadonlySet<string>): Promise<string[]> => {
    const changed: string[] = [];
    for (const key of new Set([...Object.keys(this.data), ...Object.keys(target)])) {
      if (skip.has(key)) continue;
      const next = target[key];
      if (next === undefined) { if (key in this.data) { delete this.data[key]; changed.push(key); } continue; }
      if (fingerprint(this.data[key] ?? null) !== fingerprint(next)) { this.data[key] = clone(next); changed.push(key); }
    }
    if (changed.length) this.appliedLog.push(changed);
    return changed;
  };
}
