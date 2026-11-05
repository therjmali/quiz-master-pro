import './setup';
import { test } from 'node:test';
import assert from 'node:assert/strict';
// @ts-expect-error plain .mjs script without type declarations
import { interpret, runChecks, validateConfig, LEVEL } from '../scripts/check-cloud.mjs';

type R = { status: number; body: unknown };
const healthy: R = { status: 200, body: { name: 'GoTrue' } };
const settings = (over: object = {}): R => ({ status: 200, body: { external: { email: true }, disable_signup: false, mailer_autoconfirm: true, ...over } });
const missing: R = { status: 404, body: { code: 'PGRST202', message: 'Could not find the function' } };
const locked: R = { status: 401, body: { code: '42501', message: 'permission denied for function quiz_sync_pull' } };
const levels = (f: Array<{ level: string; title: string }>) => f.map(x => `${x.level}:${x.title}`);

test('a fully set up project reports ready, with anonymous callers locked out', () => {
  const f = interpret({ health: healthy, settings: settings(), rpc: locked, table: { status: 200, body: [] } });
  assert.ok(f.every((x: { level: string }) => x.level === LEVEL.OK || x.level === LEVEL.INFO));
  assert.ok(levels(f).includes('OK:Cloud functions are installed'));
  assert.ok(levels(f).includes('OK:Row-Level Security hides every row from anonymous callers'));
});

test('a project without the schema tells the owner exactly what to run', () => {
  const f = interpret({ health: healthy, settings: settings(), rpc: missing, table: { status: 404, body: { code: 'PGRST205' } } });
  const actions = f.filter((x: { level: string }) => x.level === LEVEL.ACTION);
  assert.equal(actions.length, 1, 'reported once, not twice');
  assert.match(actions[0].detail, /quiz_schema\.sql/);
});

test('disabled sign-ups are explained, not treated as a failure', () => {
  const f = interpret({ health: healthy, settings: settings({ disable_signup: true }), rpc: locked, table: { status: 401, body: { code: '42501' } } });
  const info = f.find((x: { title: string }) => x.title === 'New sign-ups are disabled');
  assert.equal(info.level, LEVEL.INFO);
  assert.match(info.detail, /existing accounts/);
});

test('e-mail login switched off is an action item', () => {
  const f = interpret({ health: healthy, settings: settings({ external: { email: false } }), rpc: locked, table: locked });
  assert.ok(levels(f).includes('ACTION:E-mail login is switched off'));
});

test('unreachable or paused projects and rejected keys fail clearly', () => {
  assert.equal(interpret({ health: { status: 0, body: 'fetch failed' }, settings, rpc: missing, table: missing })[0].level, LEVEL.FAIL);
  assert.match(interpret({ health: { status: 0, body: 'x' }, settings, rpc: missing, table: missing })[0].detail, /paused/);
  assert.equal(interpret({ health: { status: 401, body: null }, settings: { status: 401, body: null }, rpc: locked, table: locked })[0].title, 'Key rejected');
  assert.equal(interpret({ health: { status: 503, body: null }, settings: { status: 503, body: null }, rpc: locked, table: locked })[0].title, 'Project not healthy');
});

test('open sync functions or readable rows are flagged as security failures', () => {
  const open = interpret({ health: healthy, settings: settings(), rpc: { status: 200, body: {} }, table: { status: 200, body: [{ key: 'x' }] } });
  assert.equal(open.filter((x: { level: string }) => x.level === LEVEL.FAIL).length, 2);
});

test('configuration is validated and secret keys are refused', () => {
  assert.deepEqual(validateConfig('https://bapexncjgombcgbkwzzu.supabase.co', 'sb_publishable_9rJ8I4Aot0ALgBbdmVYI4g_uCUnuQsL'), []);
  assert.ok(validateConfig('http://nope', '').length >= 2);
  assert.match(validateConfig('https://abc.supabase.co', 'sb_secret_abcdefghijklmnopqrstuvwx')[0], /SECRET key/);
});

test('runChecks only ever sends GET/POST reads with the public key', async () => {
  const seen: Array<{ url: string; method: string; apikey: string }> = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen.push({ url, method: String(init.method ?? 'GET'), apikey: String((init.headers as Record<string, string>).apikey) });
    const body = url.includes('/auth/v1/settings') ? settings().body : url.includes('/rpc/') ? locked.body : url.includes('/auth/v1/health') ? healthy.body : [];
    const status = url.includes('/rpc/') ? 401 : 200;
    return { status, text: async () => JSON.stringify(body) } as Response;
  }) as typeof fetch;
  const f = await runChecks({ url: 'https://abc.supabase.co/', key: 'sb_publishable_xxxxxxxxxxxxxxxxxxxx', fetchImpl });
  assert.equal(seen.length, 4);
  assert.ok(seen.every(s => s.apikey === 'sb_publishable_xxxxxxxxxxxxxxxxxxxx'));
  assert.ok(seen.every(s => !/\/auth\/v1\/(signup|token|admin)/.test(s.url)), 'never signs up or logs in');
  assert.equal(seen.filter(s => s.method === 'POST').length, 1, 'the single POST is the read-only RPC probe');
  assert.ok(f.length > 0);
});
