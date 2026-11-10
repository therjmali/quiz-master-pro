/**
 * UI regression for the navigation redesign (real Chrome): profile photo -> Settings hub, bottom tab "Progress",
 * no Export/Deploy screens, update panel, profile photo upload, sub pages, no overflow, no JS errors.
 * Run: npm run build && npm run test:ui:settings
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { preview } from 'vite';
import { chromium } from 'playwright-core';

const SHOTS = path.join(os.tmpdir(), 'qmp-ui-settings'); fs.mkdirSync(SHOTS, { recursive: true });
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 4201, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: process.env.PW_CHANNEL || 'chrome' }), args: ['--no-sandbox'] });
let failed = 0;
const ok = (name, pass, info = '') => { if (!pass) failed++; console.log((pass ? 'PASS ' : 'FAIL ') + name + (info ? '  - ' + info : '')); };

// A real 64x32 PNG (non-square, so the centre crop is exercised) built without dependencies.
function png(w, h) {
  const crc = (buf) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const b of buf) x = t[(x ^ b) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = x * 4; raw[o + 1] = 80; raw[o + 2] = 200; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function run(label, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 4\d\d|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 160)); });
  await page.addInitScript(() => { localStorage.setItem('qmp_onboarding_done', 'true'); });
  await page.goto('http://127.0.0.1:4201/'); await page.waitForTimeout(1200);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);

  // bottom nav
  const labels = await page.locator('nav button, nav a').allInnerTexts();
  ok(`[${label}] bottom nav says Progress, not Profile`, labels.join('|').includes('Progress') && !/\bProfile\b/.test(labels.join('|')), labels.join('|').replace(/\n/g, ' '));

  // avatar top right
  const av = page.getByTestId('avatar-settings');
  ok(`[${label}] profile photo button is visible`, await av.isVisible());
  const box = await av.boundingBox();
  ok(`[${label}] profile photo sits in the top-right and inside the screen`, !!box && box.x + box.width <= w + 0.5 && box.x > w * 0.6 && box.y < 80, JSON.stringify(box));
  await av.click(); await page.waitForTimeout(700);
  ok(`[${label}] tap opens /settings`, new URL(page.url()).pathname === '/settings', page.url());
  ok(`[${label}] Settings heading`, await page.getByRole('heading', { name: 'Settings', level: 2 }).isVisible());
  const body = (await page.locator('body').innerText());
  ok(`[${label}] no Export / Deploy & Install anywhere on Settings`, !/Deploy|Export, |Source Code|WebIntoApp|Install on Android/i.test(body));
  ok(`[${label}] App updates section exists`, await page.locator('#section-updates').count() === 1);
  ok(`[${label}] Appearance, Cloud, Backups sections exist`, (await page.locator('#section-appearance, #section-cloud, #section-autobackup').count()) === 3);
  ok(`[${label}] settings fits the screen width`, !(await overflow()));
  await page.screenshot({ path: `${SHOTS}/settings_${label}.png` });

  // updates panel
  await page.locator('#section-updates button[aria-expanded]').first().click(); await page.waitForTimeout(500);
  ok(`[${label}] update panel renders`, await page.locator('#qm-update-panel').isVisible() && /Installed v\d+\.\d+\.\d+/.test(await page.locator('#qm-update-panel').innerText()));
  ok(`[${label}] web build offers Check for updates (no APK install on web)`, await page.getByRole('button', { name: /Check for updates/ }).first().isVisible() && !(await page.getByRole('button', { name: /Download & install/ }).count()));
  await page.screenshot({ path: `${SHOTS}/updates_${label}.png` });

  // profile photo upload
  await page.locator('input[type=file][aria-label="Choose profile photo"]').setInputFiles({ name: 'me.png', mimeType: 'image/png', buffer: png(64, 32) });
  await page.waitForTimeout(900);
  const src = await page.locator('section[aria-label="Your account"] img').first().getAttribute('src');
  ok(`[${label}] photo upload stored as a small JPEG data URL`, !!src && src.startsWith('data:image/jpeg;base64,') && src.length < 60_000, src ? src.slice(0, 30) + ` (${src.length} chars)` : 'none');
  ok(`[${label}] navbar shows the new photo`, await page.getByTestId('avatar-settings').locator('img').count() === 1);
  await page.getByRole('button', { name: 'Remove photo' }).click(); await page.waitForTimeout(300);
  ok(`[${label}] photo can be removed`, await page.getByTestId('avatar-settings').locator('img').count() === 0);
  await page.locator('input[type=file][aria-label="Choose profile photo"]').setInputFiles({ name: 'x.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
  await page.waitForTimeout(500);
  ok(`[${label}] a non-image is refused with a message`, await page.getByText(/choose a photo/i).count() >= 1);

  // name edit
  const card = page.locator('section[aria-label="Your account"]');
  await card.locator('button:has(svg.lucide-pencil)').first().click();
  await card.getByLabel('Display name').fill('Rana QA'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  ok(`[${label}] display name edit works`, await page.locator('section[aria-label="Your account"]').getByText('Rana QA').count() >= 1);

  // sub page (Trash tile) + back
  await page.getByRole('listitem').filter({ hasText: 'Trash' }).first().click(); await page.waitForTimeout(500);
  ok(`[${label}] Trash tile opens the Trash page`, await page.getByRole('heading', { name: 'Trash', level: 2 }).isVisible());
  await page.getByRole('button', { name: 'Back to settings' }).click(); await page.waitForTimeout(400);
  ok(`[${label}] back returns to the Settings hub`, await page.getByRole('heading', { name: 'Settings', level: 2 }).isVisible());

  // back to where we came from
  await page.getByRole('button', { name: 'Back', exact: true }).click(); await page.waitForTimeout(600);
  ok(`[${label}] Back leaves Settings`, new URL(page.url()).pathname !== '/settings', page.url());

  // Progress tab
  await page.locator('nav').getByText('Progress', { exact: true }).first().click(); await page.waitForTimeout(900);
  ok(`[${label}] Progress tab opens the Progress screen`, new URL(page.url()).pathname === '/profile' && await page.getByRole('heading', { name: 'Progress', level: 2 }).isVisible(), page.url());
  const prog = await page.locator('body').innerText();
  ok(`[${label}] Progress has no Settings/Awards/Notes/Templates/Trash/API/Downloads tabs`, !/\b(Awards|Templates|Downloads|API Keys)\b/i.test(prog) && await page.getByRole('tab', { name: /Settings|Trash|Notes/ }).count() === 0);
  ok(`[${label}] Progress shows the premium status hero + rank meter`, await page.getByTestId('rank-meter').isVisible() && await page.locator('.qmp-status-hero').isVisible());
  ok(`[${label}] Progress has the Overview / Correct / Mistakes / Skipped switch`, await page.getByRole('tab').count() === 4);
  ok(`[${label}] Progress fits the screen width`, !(await overflow()));
  await page.screenshot({ path: `${SHOTS}/progress_${label}.png` });
  await page.getByRole('button', { name: 'Open settings and profile' }).click(); await page.waitForTimeout(600);
  ok(`[${label}] avatar on Progress also opens Settings`, new URL(page.url()).pathname === '/settings');

  // Status strip deep link: tap "App" tile -> Settings updates section opens
  await page.goBack().catch(() => {}); 
  ok(`[${label}] no JS errors`, errs.length === 0, errs.join(' | ').slice(0, 300));
  await ctx.close();
}

await run('phone 360x740', 360, 740);
await run('phone 412x915', 412, 915);
await run('tablet 800x1280', 800, 1280);
await browser.close(); await server.close();
console.log(failed ? `\n${failed} check(s) FAILED  (screenshots: ${SHOTS})` : `\nAll UI checks passed  (screenshots: ${SHOTS})`);
process.exit(failed ? 1 : 0);
