/**
 * Remote data access for the sync engine.
 *
 * Every call is a Postgres function from supabase/quiz_schema.sql that only ever touches the
 * signed-in user's own rows. Contract: incremental pull, push against a base version (conflict ->
 * merge -> retry), restore points and wipe.
 *
 * Large sections are gzip-compressed transparently (`{"$z":"gz1","b64":"..."}`): the server stores
 * opaque JSON and never needs to understand it, while the client merges the decompressed values.
 */
import { CloudError, toCloudError } from './http';
import { getSupabase } from './supabase';
import { getDeviceIdentity } from './device';

export interface RemoteSectionMeta { hash: string; updatedAt: string; deviceId?: string | null }
export interface RemoteDoc {
  version: number;
  updatedAt: string;
  sections: Record<string, RemoteSectionMeta>;
  data: Record<string, unknown>;
  changedKeys?: string[];
  bytes?: number;
}
export interface PushResult {
  version: number;
  updatedAt: string;
  sections: Record<string, RemoteSectionMeta>;
  applied: string[];
  rejected?: Array<{ key: string; reason: string }>;
  unchanged?: boolean;
}
export interface RevisionRow { version: number; at: string; deviceId: string | null; keys: string[]; bytes: number }

const TIMEOUT_MS = 30_000;
/** Compress sections bigger than this many characters of JSON. */
export const COMPRESS_THRESHOLD = 48 * 1024;

/* ---- compression --------------------------------------------------------------------------- */

interface Packed { $z: 'gz1'; b64: string }

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function pipeThrough(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const buffer = await new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream as unknown as TransformStream<Uint8Array, Uint8Array>)).arrayBuffer();
  return new Uint8Array(buffer);
}

export function compressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined' && typeof btoa === 'function';
}

export async function encodeSectionValue(value: unknown): Promise<unknown> {
  if (!compressionSupported()) return value;
  const json = JSON.stringify(value);
  if (json === undefined || json.length < COMPRESS_THRESHOLD) return value;
  try {
    const packed = await pipeThrough(new TextEncoder().encode(json), new CompressionStream('gzip'));
    const wrapped: Packed = { $z: 'gz1', b64: toBase64(packed) };
    // Only worth it if it actually shrinks the payload.
    return wrapped.b64.length < json.length * 0.9 ? wrapped : value;
  } catch {
    return value;
  }
}

export function isPacked(value: unknown): value is Packed {
  return !!value && typeof value === 'object' && (value as Packed).$z === 'gz1' && typeof (value as Packed).b64 === 'string';
}

export async function decodeSectionValue(value: unknown): Promise<unknown> {
  if (!isPacked(value)) return value;
  if (!compressionSupported()) throw new CloudError('This device cannot read compressed cloud data.', 'unsupported', 0);
  const bytes = await pipeThrough(fromBase64(value.b64), new DecompressionStream('gzip'));
  return JSON.parse(new TextDecoder().decode(bytes));
}

async function decodeData(data: Record<string, unknown> | undefined): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) out[key] = await decodeSectionValue(value);
  return out;
}

/* ---- RPC plumbing -------------------------------------------------------------------------- */

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await getSupabase().rpc(fn, args).abortSignal(controller.signal);
    if (error) throw toCloudError(error);
    return data as T;
  } catch (err) {
    throw toCloudError(err);
  } finally {
    clearTimeout(timer);
  }
}

/** "key:hash,key:hash" (the engine's format) -> { key: hash } */
export function parseHave(have: string): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const part of have.split(',')) {
    const i = part.lastIndexOf(':');
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return Object.keys(out).length ? out : null;
}

export async function pullDoc(have: string): Promise<RemoteDoc> {
  const doc = await rpc<RemoteDoc>('quiz_sync_pull', { p_have: have ? parseHave(have) : null });
  return { ...doc, data: await decodeData(doc.data) };
}

export async function pushDoc(body: {
  baseVersion: number;
  sections: Record<string, { value: unknown; updatedAt: string }>;
  deletions: string[];
}): Promise<PushResult> {
  const packed: Record<string, { value: unknown; updatedAt: string }> = {};
  for (const [key, section] of Object.entries(body.sections)) {
    packed[key] = { value: await encodeSectionValue(section.value), updatedAt: section.updatedAt };
  }
  const res = await rpc<PushResult & { conflict?: boolean; data?: Record<string, unknown> }>('quiz_sync_push', {
    p_base_version: body.baseVersion,
    p_sections: packed,
    p_deletions: body.deletions,
    p_device_id: getDeviceIdentity().id,
  });
  if (res.conflict) {
    const data = await decodeData(res.data);
    throw new CloudError('Another device saved changes first. Merging...', 'version_conflict', 409, { ...(res as unknown as Record<string, unknown>), data });
  }
  return res;
}

export async function listRevisions(): Promise<RevisionRow[]> {
  const res = await rpc<{ revisions: RevisionRow[] }>('quiz_sync_revisions_list', {});
  return res.revisions ?? [];
}

export async function restoreRevisionRemote(version: number): Promise<RemoteDoc> {
  const doc = await rpc<RemoteDoc>('quiz_sync_restore', { p_version: version, p_device_id: getDeviceIdentity().id });
  return { ...doc, data: await decodeData(doc.data) };
}

export async function wipeRemote(): Promise<void> {
  await rpc('quiz_sync_wipe', { p_device_id: getDeviceIdentity().id });
}

export async function deleteMyCloudData(): Promise<void> {
  await rpc('quiz_delete_my_data', {});
}

export async function deleteMyAccountRemote(): Promise<void> {
  await rpc('quiz_delete_my_account', {});
}
