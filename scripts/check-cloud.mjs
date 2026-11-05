#!/usr/bin/env node
/**
 * Read-only health check of the Supabase project behind cloud sync and login.
 *
 *   VITE_SUPABASE_URL=... VITE_SUPABASE_ANON_KEY=... node scripts/check-cloud.mjs
 *
 * It only uses the PUBLIC (publishable/anon) key and only reads: it never creates users, never writes
 * rows and never needs a password. It answers: is the project reachable, is e-mail login on, can new
 * people register, and has supabase/quiz_schema.sql been run (and is it locked down correctly)?
 *
 * Exit code: 0 = reachable (setup steps, if any, are reported as ACTION lines); 1 = unreachable / misconfigured.
 */
import { pathToFileURL } from 'node:url';

export const LEVEL = { OK: 'OK', INFO: 'INFO', ACTION: 'ACTION', FAIL: 'FAIL' };

async function call(fetchImpl, url, key, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal, headers: { apikey: key, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
    let body = null;
    const text = await res.text();
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    return { status: res.status, body };
  } catch (err) {
    return { status: 0, body: String(err?.message ?? err) };
  } finally {
    clearTimeout(timer);
  }
}

/** Turn raw probe results into findings. Pure, so it is unit-tested. */
export function interpret({ health, settings, rpc, table }) {
  const out = [];
  const add = (level, title, detail = '') => out.push({ level, title, detail });

  if (health.status === 0) {
    add(LEVEL.FAIL, 'Project unreachable', `${health.body}. Check SUPABASE_URL. A free project that was idle for a week is paused: open the Supabase dashboard and restore it.`);
    return out;
  }
  if (health.status === 401 || health.status === 403) add(LEVEL.FAIL, 'Key rejected', 'The publishable key was refused. Copy it again from Project Settings -> API.');
  else if (health.status >= 500) add(LEVEL.FAIL, 'Project not healthy', `Auth service answered ${health.status}. If the project is paused, restore it in the dashboard.`);
  else if (health.status >= 400) add(LEVEL.FAIL, 'Auth service error', `Answered ${health.status}.`);
  else add(LEVEL.OK, 'Project reachable', 'Auth service is up.');

  if (settings.status === 200 && settings.body && typeof settings.body === 'object') {
    const s = settings.body;
    if (s.external?.email === false) add(LEVEL.ACTION, 'E-mail login is switched off', 'Authentication -> Providers -> Email -> enable it.');
    else add(LEVEL.OK, 'E-mail + password login is enabled');
    if (s.disable_signup === true) add(LEVEL.INFO, 'New sign-ups are disabled', 'Only existing accounts (for example your RJ Tracker Pro login) can sign in. To let new people register: Authentication -> Sign In / Providers -> allow new users to sign up.');
    else add(LEVEL.OK, 'New accounts can register');
    add(LEVEL.INFO, s.mailer_autoconfirm ? 'Accounts are active immediately (no e-mail confirmation)' : 'E-mail confirmation is required for new accounts', s.mailer_autoconfirm ? '' : 'Turn "Confirm email" off for a private app if you do not want a confirmation step.');
  } else if (health.status < 400) {
    add(LEVEL.INFO, 'Could not read auth settings', `Answered ${settings.status}.`);
  }

  const code = r => (r.body && typeof r.body === 'object' ? r.body.code : undefined);
  const notInstalled = r => r.status === 404 || ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code(r));
  const lockedDown = r => r.status === 401 || r.status === 403 || code(r) === '42501';

  if (notInstalled(rpc)) {
    add(LEVEL.ACTION, 'Cloud tables are not installed yet', 'Run supabase/quiz_schema.sql once: Dashboard -> SQL Editor -> New query -> paste -> Run (the app also has a "Copy setup SQL" button).');
  } else if (lockedDown(rpc)) {
    add(LEVEL.OK, 'Cloud functions are installed', 'Anonymous callers are correctly locked out.');
  } else if (rpc.status >= 200 && rpc.status < 300) {
    add(LEVEL.FAIL, 'SECURITY: sync functions are callable without signing in', 'Re-run supabase/quiz_schema.sql - it revokes anonymous access.');
  } else {
    add(LEVEL.INFO, 'Could not tell whether the cloud functions exist', `Answered ${rpc.status}.`);
  }

  if (notInstalled(table)) {
    if (!out.some(f => f.title.startsWith('Cloud tables are not installed'))) add(LEVEL.ACTION, 'Cloud tables are not installed yet', 'Run supabase/quiz_schema.sql.');
  } else if (lockedDown(table)) {
    add(LEVEL.OK, 'Row-Level Security protects the sync tables');
  } else if (table.status >= 200 && table.status < 300 && Array.isArray(table.body) && table.body.length > 0) {
    add(LEVEL.FAIL, 'SECURITY: sync rows are readable without signing in', 'Re-run supabase/quiz_schema.sql.');
  } else if (table.status >= 200 && table.status < 300) {
    add(LEVEL.OK, 'Row-Level Security hides every row from anonymous callers');
  }
  return out;
}

export async function runChecks({ url, key, fetchImpl = fetch }) {
  const base = url.replace(/\/+$/, '');
  const [health, settings, rpc, table] = await Promise.all([
    call(fetchImpl, `${base}/auth/v1/health`, key),
    call(fetchImpl, `${base}/auth/v1/settings`, key),
    call(fetchImpl, `${base}/rest/v1/rpc/quiz_sync_pull`, key, { method: 'POST', body: '{}' }),
    call(fetchImpl, `${base}/rest/v1/quiz_sync_sections?select=key&limit=1`, key),
  ]);
  return interpret({ health, settings, rpc, table });
}

export function validateConfig(url, key) {
  const problems = [];
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url || '')) problems.push('SUPABASE_URL should look like https://<project-ref>.supabase.co');
  if (!key || key.length < 20) problems.push('SUPABASE_ANON_KEY is missing or too short');
  if (/service_role|sb_secret_/i.test(key || '')) problems.push('That looks like a SECRET key. Use the publishable (anon) key only.');
  return problems;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const problems = validateConfig(url, key);
  if (problems.length) { for (const p of problems) console.error(`FAIL  ${p}`); process.exit(1); }
  const findings = await runChecks({ url, key });
  const ci = process.env.GITHUB_ACTIONS === 'true';
  for (const f of findings) {
    console.log(`${f.level.padEnd(6)} ${f.title}${f.detail ? `\n       ${f.detail}` : ''}`);
    if (ci) {
      const cmd = f.level === LEVEL.FAIL ? 'error' : f.level === LEVEL.ACTION ? 'warning' : 'notice';
      console.log(`::${cmd} title=Cloud check::${f.title}${f.detail ? ` - ${f.detail}` : ''}`.replace(/\n/g, ' '));
    }
  }
  const failed = findings.some(f => f.level === LEVEL.FAIL);
  const pending = findings.filter(f => f.level === LEVEL.ACTION).length;
  console.log(failed ? '\nCloud check FAILED' : pending ? `\nCloud reachable - ${pending} setup step(s) still to do` : '\nCloud is ready');
  process.exit(failed ? 1 : 0);
}
