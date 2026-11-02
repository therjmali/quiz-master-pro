// Generates comprehensive app documentation HTML with CSS-based screen previews,
// feature lists, and recreation prompts. 55+ labeled screen mockups.

/* ═══════════════════════════════════════════════════════════
   PHONE FRAME — reusable wrapper for all screen previews
   ═══════════════════════════════════════════════════════════ */
const BG = '#0a0a0f';
const CARD = 'rgba(12,12,22,0.85)';
const BD = 'rgba(255,255,255,0.08)';
const PRI = '#f0a500';
const TXT = '#e8e0d0';
const DIM = '#6b6e82';
const GRN = '#34d399';
const RED = '#f87171';
const AMB = '#fbbf24';
const VIO = '#a78bfa';
const CYN = '#22d3ee';

function phone(label: string, content: string, landscape = false): string {
  const w = landscape ? 420 : 240;
  const h = landscape ? 260 : 420;
  return `<div style="display:inline-block;vertical-align:top;margin:8px;text-align:center">
    <div style="width:${w}px;height:${h}px;border-radius:24px;border:3px solid rgba(255,255,255,0.12);background:${BG};overflow:hidden;position:relative;box-shadow:0 8px 32px rgba(0,0,0,0.5)">
      <div style="height:24px;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:space-between;padding:0 12px">
        <span style="font-size:8px;color:${DIM}">9:41</span>
        <div style="width:40px;height:8px;border-radius:8px;background:rgba(255,255,255,0.08)"></div>
        <span style="font-size:8px;color:${DIM}">⦿ ▮▮▮</span>
      </div>
      <div style="padding:8px;height:calc(100% - 24px);overflow:hidden;font-family:'Plus Jakarta Sans',system-ui,sans-serif">${content}</div>
    </div>
    <p style="font-size:11px;font-weight:800;color:${TXT};margin-top:8px;max-width:${w}px">${label}</p>
  </div>`;
}

// Helpers for mockup elements
const pill = (text: string, bg: string, color: string) =>
  `<span style="display:inline-block;font-size:7px;font-weight:800;padding:2px 6px;border-radius:8px;background:${bg};color:${color};margin:1px 2px">${text}</span>`;
const bar = (w: string, color: string, h = '4px') =>
  `<div style="height:${h};width:${w};border-radius:4px;background:${color};margin:2px 0"></div>`;
const card = (content: string, extra = '') =>
  `<div style="background:${CARD};border:1px solid ${BD};border-radius:10px;padding:6px 8px;margin:4px 0;${extra}">${content}</div>`;
const heading = (text: string) =>
  `<div style="font-size:8px;font-weight:900;color:${TXT};margin:4px 0 2px">${text}</div>`;
const subtext = (text: string) =>
  `<div style="font-size:6px;color:${DIM};margin:1px 0;line-height:1.4">${text}</div>`;
const row = (items: string) =>
  `<div style="display:flex;gap:4px;align-items:center">${items}</div>`;
const grid2 = (a: string, b: string) =>
  `<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">${a}${b}</div>`;
const grid3 = (a: string, b: string, c: string) =>
  `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px">${a}${b}${c}</div>`;
const miniBtn = (text: string, bg: string, color: string) =>
  `<div style="font-size:7px;font-weight:800;padding:4px 8px;border-radius:8px;background:${bg};color:${color};text-align:center;margin:2px 0">${text}</div>`;
const statCard = (emoji: string, val: string, label: string) =>
  `<div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:8px;padding:4px;text-align:center">
    <div style="font-size:8px">${emoji}</div>
    <div style="font-size:9px;font-weight:900;color:${TXT}">${val}</div>
    <div style="font-size:5px;color:${DIM};text-transform:uppercase;letter-spacing:0.5px">${label}</div>
  </div>`;
const navDots = (active: number, total: number) => {
  let dots = '';
  for (let i = 0; i < total; i++) {
    const isActive = i === active;
    const color = i < active ? GRN : isActive ? PRI : 'rgba(255,255,255,0.1)';
    dots += `<div style="width:${isActive ? 10 : 7}px;height:7px;border-radius:4px;background:${color};flex-shrink:0"></div>`;
  }
  return `<div style="display:flex;gap:2px;overflow:hidden;justify-content:center;margin:4px 0">${dots}</div>`;
};
const optionBtn = (letter: string, text: string, state: '' | 'selected' | 'correct' | 'wrong' = '') => {
  const bg = state === 'selected' ? 'rgba(240,165,0,0.12)' : state === 'correct' ? 'rgba(16,185,129,0.15)' : state === 'wrong' ? 'rgba(248,113,113,0.15)' : 'rgba(255,255,255,0.03)';
  const border = state === 'selected' ? 'rgba(240,165,0,0.4)' : state === 'correct' ? 'rgba(16,185,129,0.4)' : state === 'wrong' ? 'rgba(248,113,113,0.4)' : BD;
  const lColor = state === 'correct' ? GRN : state === 'wrong' ? RED : state === 'selected' ? PRI : DIM;
  return `<div style="display:flex;align-items:center;gap:6px;background:${bg};border:1px solid ${border};border-radius:8px;padding:5px 7px;margin:3px 0">
    <span style="width:14px;height:14px;border-radius:6px;background:rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:900;color:${lColor};flex-shrink:0">${letter}</span>
    <span style="font-size:7px;color:${TXT};font-weight:600">${text}</span>
    ${state === 'correct' ? '<span style="margin-left:auto;font-size:7px;color:' + GRN + '">✓</span>' : state === 'wrong' ? '<span style="margin-left:auto;font-size:7px;color:' + RED + '">✗</span>' : ''}
  </div>`;
};
const bottomNav = (active: number) => {
  // active: 0=home, 1=create, 2=library, 3=stats, 4=profile
  const tabs = [
    { ico: '🏠', lbl: 'Home', idx: 0 },
    { ico: '📚', lbl: 'Library', idx: 2 },
    { ico: '➕', lbl: 'Create', idx: 1, isFab: true },
    { ico: '📊', lbl: 'Stats', idx: 3 },
    { ico: '👤', lbl: 'Profile', idx: 4 },
  ];
  return `<div style="position:absolute;bottom:0;left:0;right:0;height:38px;background:rgba(10,10,15,0.92);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,0.05);display:flex;align-items:center;justify-content:space-around;padding:0 4px">
    ${tabs.map(t => {
      const isActive = t.idx === active;
      if (t.isFab) {
        return `<div style="text-align:center;margin-top:-8px">
          <div style="width:28px;height:28px;border-radius:10px;background:${PRI};display:flex;align-items:center;justify-content:center;font-size:12px;color:#0a0a0f;font-weight:900;margin:0 auto;box-shadow:0 2px 8px rgba(240,165,0,0.3)">+</div>
          <div style="font-size:5px;font-weight:800;color:${isActive?PRI:DIM};margin-top:1px">${t.lbl}</div>
        </div>`;
      }
      return `<div style="text-align:center;opacity:${isActive?1:0.4}">
        ${isActive?`<div style="width:14px;height:2px;border-radius:2px;background:${PRI};margin:0 auto 2px;box-shadow:0 0 4px rgba(240,165,0,0.4)"></div>`:''}
        <div style="font-size:10px">${t.ico}</div>
        <div style="font-size:5px;font-weight:800;color:${isActive?PRI:DIM}">${t.lbl}</div>
      </div>`;
    }).join('')}
  </div>`;
};

/* ═══════════════════════════════════════════════════════════
   SCREEN MOCKUPS — 55+ screens
   ═══════════════════════════════════════════════════════════ */
function getScreenMockups(): { category: string; screens: { label: string; html: string }[] }[] {
  return [
    // ────────── DASHBOARD ──────────
    {
      category: '🏠 Dashboard & Home',
      screens: [
        {
          label: '1. Main Dashboard',
          html: phone('Main Dashboard — Home Screen', `
            ${heading('👋 Good Morning, Rana!')}
            ${card(`
              <div style="display:flex;align-items:center;gap:8px">
                <svg width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="${GRN}" stroke-width="3" stroke-dasharray="70 100"/><circle cx="20" cy="20" r="12" fill="none" stroke="${RED}" stroke-width="2" stroke-dasharray="30 100"/><text x="20" y="23" text-anchor="middle" fill="${TXT}" font-size="8" font-weight="900">75%</text></svg>
                <div>
                  <div style="font-size:8px;font-weight:900;color:${TXT}">Daily Practice</div>
                  ${bar('80%', PRI)}
                  <div style="font-size:6px;color:${DIM}">2/3 quizzes today · 🔥 5 day streak</div>
                </div>
              </div>
            `)}
            ${miniBtn('+ New Quiz  🚀', PRI, 'white')}
            ${heading('Quick Stats')}
            ${grid2(
              statCard('📝', '42', 'Quizzes'),
              statCard('🎯', '78%', 'Avg Score')
            )}
            ${grid2(
              statCard('🔥', '5', 'Streak'),
              statCard('⏱', '6.2h', 'Study Time')
            )}
            ${heading('Recent Quizzes')}
            ${card(`
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,${PRI},${VIO});display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:900">B</div>
                <div style="flex:1">
                  <div style="font-size:7px;font-weight:800;color:${TXT}">Biology Chapter 5</div>
                  <div style="font-size:5px;color:${DIM}">10 Qs · 2 min ago</div>
                </div>
                <div style="font-size:9px;font-weight:900;color:${GRN}">85%</div>
              </div>
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:6px">
                <div style="width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,${AMB},#f59e0b);display:flex;align-items:center;justify-content:center;font-size:8px;color:white;font-weight:900">H</div>
                <div style="flex:1">
                  <div style="font-size:7px;font-weight:800;color:${TXT}">History WWII</div>
                  <div style="font-size:5px;color:${DIM}">15 Qs · Yesterday</div>
                </div>
                <div style="font-size:9px;font-weight:900;color:${AMB}">62%</div>
              </div>
            `)}
            ${bottomNav(0)}
          `)
        },
        {
          label: '2. Daily Challenge',
          html: phone('Daily Challenge Card', `
            ${heading('🏠 Dashboard')}
            ${card(`
              <div style="text-align:center;padding:4px">
                <div style="font-size:20px;margin-bottom:4px">🎯</div>
                <div style="font-size:9px;font-weight:900;color:${TXT}">Daily Challenge</div>
                <div style="font-size:6px;color:${DIM};margin:3px 0">5 mixed questions · Time limit: 3 min</div>
                ${pill('🔥 Streak: 5 Days', 'rgba(245,158,11,0.15)', AMB)}
                <div style="margin-top:6px">${miniBtn('Start Challenge →', 'linear-gradient(135deg,#f59e0b,#ef4444)', 'white')}</div>
              </div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">⚡ Getting Started</div>
              <div style="display:flex;gap:4px;margin-top:4px">
                ${['✅ First Quiz', '✅ Set Goal', '⬜ 3-Day Streak'].map(t =>
                  `<span style="font-size:6px;color:${t.startsWith('✅') ? GRN : DIM};font-weight:600">${t}</span>`
                ).join('')}
              </div>
              ${bar('66%', GRN)}
            `)}
            ${bottomNav(0)}
          `)
        },
        {
          label: '3. Study Plan',
          html: phone('AI Study Plan Card', `
            ${heading('🏠 Dashboard')}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${VIO}">📋 Your Study Plan</div>
              <div style="font-size:6px;color:${DIM};margin:3px 0">AI-generated based on your performance</div>
              ${['🔴 Biology — Focus on Cell Division', '🟡 History — Review WWII Timeline', '🟢 Math — Maintain Algebra Skills'].map(t =>
                `<div style="font-size:6px;color:${TXT};padding:3px 0;border-bottom:1px solid ${BD}">${t}</div>`
              ).join('')}
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">📊 Exam Countdown</div>
              <div style="font-size:18px;font-weight:900;color:${PRI};text-align:center;margin:4px 0">14</div>
              <div style="font-size:6px;color:${DIM};text-align:center">days until Biology Final</div>
            `)}
            ${bottomNav(0)}
          `)
        },
        {
          label: '4. Session Comparison',
          html: phone('Performance Cards', `
            ${heading('🏠 Dashboard')}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">⭐ Performance Rating</div>
              <div style="display:flex;align-items:center;gap:6px;margin-top:4px">
                <div style="font-size:16px;font-weight:900;color:${GRN}">A+</div>
                <div>
                  <div style="font-size:6px;color:${GRN};font-weight:800">Excellent Learner</div>
                  <div style="font-size:5px;color:${DIM}">Top 10% this week</div>
                </div>
              </div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">📈 Session Comparison</div>
              <div style="display:flex;gap:3px;align-items:end;margin-top:6px;height:40px">
                ${[30,45,60,40,70,85,65].map((h,i) =>
                  `<div style="flex:1;height:${h}%;background:${i===5?PRI:'rgba(99,102,241,0.2)'};border-radius:3px"></div>`
                ).join('')}
              </div>
              <div style="font-size:5px;color:${DIM};text-align:center;margin-top:2px">Last 7 sessions</div>
            `)}
            ${bottomNav(0)}
          `)
        },
        {
          label: '5. Smart Nudge',
          html: phone('Smart Nudge Banners', `
            ${heading('🏠 Dashboard')}
            <div style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.25);border-radius:10px;padding:8px;margin:4px 0">
              <div style="font-size:7px;font-weight:900;color:${PRI}">💡 Smart Nudge</div>
              <div style="font-size:6px;color:${TXT};margin-top:2px">You haven't practiced Biology in 3 days. Your accuracy dropped 12%.</div>
              ${miniBtn('Practice Biology Now →', PRI, 'white')}
            </div>
            <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);border-radius:10px;padding:8px;margin:4px 0">
              <div style="font-size:7px;font-weight:900;color:${AMB}">🔄 Spaced Repetition</div>
              <div style="font-size:6px;color:${TXT};margin-top:2px">8 questions are due for review today</div>
              ${miniBtn('Review Now', 'rgba(245,158,11,0.15)', AMB)}
            </div>
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">🎯 Mistake Patterns</div>
              <div style="font-size:6px;color:${DIM};margin-top:2px">You often mix up: Mitosis vs Meiosis</div>
              ${bar('40%', RED)}
            `)}
            ${bottomNav(0)}
          `)
        },
      ]
    },

    // ────────── CREATE QUIZ ──────────
    {
      category: '📝 Create Quiz / Setup',
      screens: [
        {
          label: '6. Text Input Area',
          html: phone('Create Quiz — Text Input', `
            ${heading('📝 Create Quiz')}
            <div style="background:rgba(255,255,255,0.02);border:1px solid ${BD};border-radius:8px;height:80px;padding:6px;margin:4px 0">
              <div style="font-size:6px;color:${DIM};font-style:italic">Paste your study notes, textbook content, or any text here…</div>
            </div>
            ${row(`${miniBtn('📋 Paste', 'rgba(99,102,241,0.15)', PRI)} ${miniBtn('📁 Upload', 'rgba(99,102,241,0.15)', PRI)} ${miniBtn('↻ Draft', 'rgba(255,255,255,0.05)', DIM)}`)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">AI Source</div>
              <div style="display:flex;gap:4px;margin-top:3px">
                ${pill('✦ Gemini', 'rgba(66,133,244,0.15)', '#4285f4')}
                ${pill('Claude', 'rgba(255,255,255,0.05)', DIM)}
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;color:${DIM};margin-bottom:3px">Quiz Title</div>
              <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px 6px;font-size:7px;color:${TXT}">Biology Chapter 5</div>
            `)}
            ${card(`
              <div style="font-size:6px;color:${DIM};margin-bottom:3px">Subject</div>
              <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px 6px;font-size:7px;color:${TXT}">Biology</div>
            `)}
            ${bottomNav(1)}
          `)
        },
        {
          label: '7. Settings Panel',
          html: phone('Create Quiz — Settings', `
            ${heading('⚙️ Quiz Settings')}
            ${card(`
              <div style="font-size:6px;color:${DIM}">Difficulty</div>
              <div style="display:flex;gap:3px;margin-top:2px">
                ${['Mixed', 'Easy', 'Medium', 'Hard'].map((d,i) =>
                  `<span style="font-size:6px;font-weight:800;padding:2px 5px;border-radius:6px;background:${i===0?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)'};color:${i===0?PRI:DIM};border:1px solid ${i===0?'rgba(99,102,241,0.3)':BD}">${d}</span>`
                ).join('')}
              </div>
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-size:6px;color:${DIM}">Questions</div>
                <div style="font-size:8px;font-weight:900;color:${PRI}">10</div>
              </div>
              ${bar('40%', PRI)}
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:6px;color:${DIM}">Quiz Mode</span>
                <span style="font-size:6px;font-weight:800;color:${TXT}">Instant Feedback ⚡</span>
              </div>
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:6px;color:${DIM}">Timer</span>
                <span style="font-size:6px;font-weight:800;color:${GRN}">30s per Q</span>
              </div>
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:6px;color:${DIM}">Pass Mark</span>
                <span style="font-size:6px;font-weight:800;color:${AMB}">50%</span>
              </div>
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:6px;color:${DIM}">Shuffle Options</span>
                <div style="width:20px;height:10px;border-radius:5px;background:${GRN}"><div style="width:10px;height:10px;border-radius:50%;background:white;margin-left:10px"></div></div>
              </div>
            `)}
            ${miniBtn('Generate & Start 🚀', `linear-gradient(135deg,${PRI},#e8a020)`, '#0a0a0f')}
            ${bottomNav(1)}
          `)
        },
        {
          label: '8. File Upload Preview',
          html: phone('File Upload & OCR', `
            ${heading('📝 Create Quiz')}
            <div style="background:rgba(255,255,255,0.02);border:2px dashed rgba(99,102,241,0.3);border-radius:10px;padding:12px;text-align:center;margin:4px 0">
              <div style="font-size:16px;margin-bottom:4px">📁</div>
              <div style="font-size:7px;font-weight:800;color:${PRI}">Drop files or tap to upload</div>
              <div style="font-size:5px;color:${DIM};margin-top:2px">PDF, Images · Max 5 files, 10MB each</div>
            </div>
            <div style="font-size:6px;font-weight:800;color:${DIM};margin:4px 0">UPLOADED FILES</div>
            ${card(`
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px">📄</span>
                <div style="flex:1">
                  <div style="font-size:6px;font-weight:800;color:${TXT}">chapter5.pdf</div>
                  <div style="font-size:5px;color:${DIM}">2.4 MB · 12 pages</div>
                </div>
                ${pill('OCR ✓', 'rgba(52,211,153,0.15)', GRN)}
              </div>
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:6px">
                <span style="font-size:10px">🖼️</span>
                <div style="flex:1">
                  <div style="font-size:6px;font-weight:800;color:${TXT}">notes_photo.jpg</div>
                  <div style="font-size:5px;color:${DIM}">1.1 MB · Processing…</div>
                </div>
                <div style="width:12px;height:12px;border:2px solid ${PRI};border-top-color:transparent;border-radius:50%;animation:spin 1s linear infinite"></div>
              </div>
            `)}
            ${bottomNav(1)}
          `)
        },
        {
          label: '9. AI Generation Loading',
          html: phone('Generating Quiz — Loading', `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 50px);text-align:center;padding:12px">
              <div style="width:60px;height:60px;border-radius:50%;border:3px solid rgba(99,102,241,0.2);border-top-color:${PRI};margin-bottom:12px"></div>
              <div style="font-size:10px;font-weight:900;color:${TXT}">Generating Quiz…</div>
              <div style="font-size:6px;color:${DIM};margin-top:4px">AI is reading your notes and creating questions</div>
              <div style="width:80%;margin-top:12px">
                ${bar('65%', PRI, '6px')}
              </div>
              <div style="font-size:6px;color:${PRI};font-weight:800;margin-top:4px">7 of 10 questions ready</div>
              <div style="margin-top:16px;display:flex;gap:4px">
                ${pill('✦ Gemini Flash', 'rgba(66,133,244,0.15)', '#4285f4')}
                ${pill('Medium Difficulty', 'rgba(245,158,11,0.15)', AMB)}
              </div>
            </div>
            ${bottomNav(1)}
          `)
        },
        {
          label: '10. Bulk Import Modal',
          html: phone('Bulk Import Questions', `
            ${heading('📥 Bulk Import')}
            ${subtext('Paste questions in the required format')}
            <div style="background:rgba(255,255,255,0.02);border:1px solid ${BD};border-radius:8px;height:100px;padding:6px;margin:6px 0;font-size:5px;color:${DIM};font-family:monospace;line-height:1.6">
              Q1(E). What is DNA?<br><br>
              (a) Protein<br><br>
              (b) Nucleic acid<br><br>
              (c) Lipid<br><br>
              (d) Carbohydrate<br><br>
              Answer - (b) Nucleic acid<br><br>
              • DNA is a nucleic acid that stores genetic information.
            </div>
            ${card(`
              <div style="font-size:6px;color:${DIM}">Detected Format</div>
              <div style="display:flex;gap:3px;margin-top:2px">
                ${pill('Numbered + Lettered', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('2 Qs found', 'rgba(99,102,241,0.15)', PRI)}
              </div>
            `)}
            ${miniBtn('Import 2 Questions', PRI, 'white')}
          `)
        },
      ]
    },

    // ────────── QUIZ TAKING ──────────
    {
      category: '🎯 Quiz Taking',
      screens: [
        {
          label: '11. Classic Exam Mode',
          html: phone('Quiz — Classic Exam Mode', `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="display:flex;align-items:center;gap:4px">
                <svg width="24" height="24" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="${AMB}" stroke-width="2" stroke-dasharray="45 63"/><text x="12" y="15" text-anchor="middle" fill="${AMB}" font-size="7" font-weight="900">18s</text></svg>
                <div><div style="font-size:7px;font-weight:900;color:${TXT}">Q 3/10</div><div style="font-size:5px;color:${DIM}">02:34</div></div>
              </div>
              <div style="display:flex;gap:3px">
                ${pill('🏷️ Medium', 'rgba(240,165,0,0.15)', PRI)}
                ${pill('🚩', 'rgba(255,255,255,0.05)', DIM)}
              </div>
            </div>
            ${navDots(2, 10)}
            <div style="font-size:9px;font-weight:900;color:${TXT};margin:8px 0;line-height:1.5">What is the primary function of mitochondria in a cell?</div>
            ${optionBtn('A', 'Protein synthesis')}
            ${optionBtn('B', 'Energy production (ATP)', 'selected')}
            ${optionBtn('C', 'Cell division')}
            ${optionBtn('D', 'Waste removal')}
            <div style="display:flex;gap:6px;margin-top:8px;justify-content:space-between">
              ${miniBtn('← Prev', 'rgba(255,255,255,0.05)', DIM)}
              ${miniBtn('Next →', PRI, 'white')}
            </div>
            ${bottomNav(1)}
          `)
        },
        {
          label: '12. Instant Feedback',
          html: phone('Quiz — Instant Feedback Mode', `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <div style="font-size:7px;font-weight:900;color:${TXT}">Q 5/10</div>
              <div style="display:flex;gap:3px">
                ${pill('✓ 3', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('✗ 1', 'rgba(248,113,113,0.15)', RED)}
              </div>
            </div>
            ${navDots(4, 10)}
            <div style="font-size:9px;font-weight:900;color:${TXT};margin:6px 0;line-height:1.5">Which organelle is responsible for photosynthesis?</div>
            ${optionBtn('A', 'Mitochondria', 'wrong')}
            ${optionBtn('B', 'Chloroplast', 'correct')}
            ${optionBtn('C', 'Ribosome')}
            ${optionBtn('D', 'Nucleus')}
            <div style="background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.2);border-radius:8px;padding:6px;margin-top:4px">
              <div style="font-size:6px;font-weight:900;color:${RED}">✗ Incorrect</div>
              <div style="font-size:6px;color:${TXT};margin-top:2px;line-height:1.5">Chloroplasts contain chlorophyll which captures light energy…</div>
            </div>
            ${miniBtn('Next Question →', PRI, 'white')}
          `)
        },
        {
          label: '13. Timer Warning',
          html: phone('Quiz — Timer Running Low', `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
              <svg width="28" height="28" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="${RED}" stroke-width="2.5" stroke-dasharray="15 75" opacity="0.8"/><text x="14" y="17" text-anchor="middle" fill="${RED}" font-size="8" font-weight="900">5s</text></svg>
              <div style="font-size:7px;font-weight:900;color:${RED}">⚠️ Time running out!</div>
            </div>
            <div style="font-size:9px;font-weight:900;color:${TXT};margin:8px 0">The speed of light is approximately…</div>
            ${optionBtn('A', '3 × 10⁸ m/s')}
            ${optionBtn('B', '3 × 10⁶ m/s')}
            ${optionBtn('C', '3 × 10¹⁰ m/s')}
            ${optionBtn('D', '3 × 10⁴ m/s')}
            <div style="background:rgba(248,113,113,0.1);border-radius:8px;padding:6px;text-align:center;margin-top:6px">
              <div style="font-size:7px;font-weight:900;color:${RED}">⏰ Hurry! Only 5 seconds left</div>
            </div>
          `)
        },
        {
          label: '14. Pause Overlay',
          html: phone('Quiz — Paused', `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 50px);text-align:center;padding:12px">
              <div style="width:50px;height:50px;border-radius:50%;background:rgba(99,102,241,0.1);border:2px solid rgba(99,102,241,0.3);display:flex;align-items:center;justify-content:center;font-size:20px;margin-bottom:8px">⏸️</div>
              <div style="font-size:12px;font-weight:900;color:${TXT}">Quiz Paused</div>
              <div style="font-size:6px;color:${DIM};margin:4px 0">Take a breather! Timer stopped.</div>
              ${miniBtn('▶ Resume Quiz', PRI, 'white')}
              <div style="font-size:5px;color:${DIM};margin-top:8px">Q 3/10 · 4 answered</div>
            </div>
          `)
        },
        {
          label: '15. Edit Question Modal',
          html: phone('Edit Question Modal', `
            <div style="background:${CARD};border:1px solid ${BD};border-radius:12px;padding:8px;margin-top:20px">
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:6px">
                <span style="font-size:10px">✏️</span>
                <div>
                  <div style="font-size:7px;font-weight:900;color:${TXT}">Edit Question 3</div>
                  <div style="font-size:5px;color:${DIM}">Changes reset your answer</div>
                </div>
              </div>
              <div style="font-size:5px;color:${DIM};text-transform:uppercase;letter-spacing:0.5px;margin-bottom:2px">Question Text</div>
              <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px;height:24px;font-size:6px;color:${TXT}">What is the primary function…</div>
              <div style="font-size:5px;color:${DIM};text-transform:uppercase;letter-spacing:0.5px;margin:4px 0 2px">Options</div>
              ${['A  Protein synthesis', 'B  Energy production ✓', 'C  Cell division', 'D  Waste removal'].map((o,i) =>
                `<div style="display:flex;align-items:center;gap:3px;margin:2px 0">
                  <div style="background:rgba(255,255,255,0.03);border:1px solid ${i===1?'rgba(52,211,153,0.3)':BD};border-radius:4px;padding:2px 4px;flex:1;font-size:5px;color:${TXT}">${o}</div>
                </div>`
              ).join('')}
              <div style="background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.15);border-radius:6px;padding:4px;margin-top:4px">
                <div style="font-size:5px;color:${AMB}">⚠️ Answer will be reset</div>
              </div>
              <div style="display:flex;gap:4px;margin-top:6px">
                ${miniBtn('Cancel', 'rgba(255,255,255,0.05)', DIM)}
                ${miniBtn('Save & Reset', PRI, 'white')}
              </div>
            </div>
          `)
        },
        {
          label: '16. Submit Confirmation',
          html: phone('Submit Quiz Dialog', `
            <div style="display:flex;align-items:center;justify-content:center;height:100%">
              <div style="background:${CARD};border:1px solid ${BD};border-radius:14px;padding:16px;text-align:center;width:90%">
                <div style="font-size:20px;margin-bottom:6px">⚠️</div>
                <div style="font-size:10px;font-weight:900;color:${TXT}">Submit Quiz?</div>
                <div style="font-size:7px;color:${DIM};margin:6px 0">You answered 8 of 10 questions</div>
                <div style="display:flex;justify-content:center;gap:8px;margin:6px 0">
                  <div style="text-align:center">${pill('✓ 8', 'rgba(52,211,153,0.15)', GRN)}<div style="font-size:5px;color:${DIM};margin-top:2px">Answered</div></div>
                  <div style="text-align:center">${pill('⏭ 2', 'rgba(245,158,11,0.15)', AMB)}<div style="font-size:5px;color:${DIM};margin-top:2px">Skipped</div></div>
                </div>
                <div style="display:flex;gap:6px;margin-top:8px">
                  ${miniBtn('Go Back', 'rgba(255,255,255,0.05)', DIM)}
                  ${miniBtn('Submit Quiz', PRI, 'white')}
                </div>
              </div>
            </div>
          `)
        },
        {
          label: '17. Question Navigator',
          html: phone('Scrollable Question Navigator', `
            <div style="font-size:7px;font-weight:900;color:${TXT};margin-bottom:4px">Q 5/15 · Classic Mode</div>
            <div style="background:rgba(255,255,255,0.02);border:1px solid ${BD};border-radius:10px;padding:6px;margin:4px 0">
              <div style="display:flex;gap:3px;flex-wrap:wrap;justify-content:center">
                ${Array.from({length:15}, (_,i) => {
                  const bg = i < 3 ? GRN : i === 4 ? PRI : i === 7 ? RED : 'rgba(255,255,255,0.06)';
                  const isActive = i === 4;
                  return `<div style="width:${isActive?20:16}px;height:${isActive?20:16}px;border-radius:50%;background:${bg};display:flex;align-items:center;justify-content:center;font-size:${isActive?7:6}px;font-weight:900;color:${i<3||i===4||i===7?'white':DIM};border:${isActive?'2px solid white':'none'}">${i+1}</div>`;
                }).join('')}
              </div>
              <div style="display:flex;justify-content:center;gap:6px;margin-top:4px">
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:50%;background:${GRN}"></div><span style="font-size:5px;color:${DIM}">Answered</span></div>
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:50%;background:${PRI}"></div><span style="font-size:5px;color:${DIM}">Current</span></div>
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.06)"></div><span style="font-size:5px;color:${DIM}">Unseen</span></div>
              </div>
            </div>
            <div style="font-size:8px;font-weight:900;color:${TXT};margin-top:6px">What process converts glucose to ATP?</div>
            ${optionBtn('A', 'Glycolysis')}
            ${optionBtn('B', 'Krebs Cycle')}
            ${optionBtn('C', 'Cellular Respiration', 'selected')}
            ${optionBtn('D', 'Fermentation')}
          `)
        },
        {
          label: '18. Settings Sheet',
          html: phone('Mid-Quiz Settings Sheet', `
            <div style="position:absolute;bottom:0;left:0;right:0;background:${CARD};border-top-left-radius:16px;border-top-right-radius:16px;border:1px solid ${BD};padding:10px;z-index:2">
              <div style="width:30px;height:3px;border-radius:3px;background:rgba(255,255,255,0.15);margin:0 auto 8px"></div>
              <div style="font-size:8px;font-weight:900;color:${TXT};margin-bottom:6px">⚙️ Quiz Settings</div>
              ${['Timer: 30s per Q', 'Mode: Instant Feedback', 'Shuffle: On', 'Show Difficulty: On'].map(t =>
                `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid ${BD}">
                  <span style="font-size:6px;color:${TXT}">${t.split(':')[0]}</span>
                  <span style="font-size:6px;font-weight:800;color:${PRI}">${t.split(':')[1]}</span>
                </div>`
              ).join('')}
              ${miniBtn('Save & Continue', PRI, 'white')}
            </div>
          `)
        },
      ]
    },

    // ────────── RESULTS ──────────
    {
      category: '🏆 Results & Review',
      screens: [
        {
          label: '19. Score Speedometer',
          html: phone('Results — Speedometer', `
            <div style="text-align:center;padding:4px">
              <div style="font-size:8px;color:${DIM}">🎉 Confetti Animation</div>
              ${pill('🏆 Excellent!', 'rgba(52,211,153,0.15)', GRN)}
              <svg width="140" height="90" viewBox="0 0 140 90" style="margin:4px auto;display:block">
                <path d="M 15 80 A 55 55 0 0 1 125 80" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="10" stroke-linecap="round"/>
                <path d="M 15 80 A 55 55 0 0 1 125 80" fill="none" stroke="url(#grad)" stroke-width="10" stroke-linecap="round" stroke-dasharray="170 173"/>
                <defs><linearGradient id="grad"><stop offset="0%" stop-color="${RED}"/><stop offset="33%" stop-color="${AMB}"/><stop offset="66%" stop-color="#f59e0b"/><stop offset="100%" stop-color="${GRN}"/></linearGradient></defs>
                <text x="70" y="65" text-anchor="middle" fill="${TXT}" font-size="22" font-weight="900">85%</text>
                <text x="70" y="80" text-anchor="middle" fill="${GRN}" font-size="8" font-weight="800">PASS</text>
              </svg>
              <div style="font-size:7px;color:${DIM}">Biology Chapter 5 · 10 Questions</div>
            </div>
            ${grid3(
              statCard('✓', '8', 'Correct'),
              statCard('✗', '1', 'Wrong'),
              statCard('⏭', '1', 'Skipped')
            )}
            ${grid3(
              statCard('📝', '10', 'Total'),
              statCard('⏱', '4:32', 'Time'),
              statCard('🎯', '85%', 'Accuracy')
            )}
          `)
        },
        {
          label: '20. Score Formula',
          html: phone('Score Formula Breakdown', `
            ${heading('📊 Score Breakdown')}
            ${card(`
              <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:4px">
                <div style="text-align:center">
                  <div style="font-size:12px;font-weight:900;color:${GRN}">+8</div>
                  <div style="font-size:5px;color:${DIM}">Gained</div>
                </div>
                <div style="font-size:10px;color:${DIM}">−</div>
                <div style="text-align:center">
                  <div style="font-size:12px;font-weight:900;color:${RED}">-0.5</div>
                  <div style="font-size:5px;color:${DIM}">Penalty</div>
                </div>
                <div style="font-size:10px;color:${DIM}">=</div>
                <div style="text-align:center">
                  <div style="font-size:12px;font-weight:900;color:${PRI}">7.5</div>
                  <div style="font-size:5px;color:${DIM}">Net Score</div>
                </div>
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">NEGATIVE MARKING</div>
              <div style="display:flex;justify-content:space-between;margin-top:3px">
                <span style="font-size:6px;color:${TXT}">Wrong Answers</span>
                <span style="font-size:6px;font-weight:800;color:${RED}">1 × -0.5 = -0.5</span>
              </div>
            `)}
            <div style="font-size:6px;font-weight:800;color:${DIM};margin-top:6px">ACTION BUTTONS</div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:3px">
              ${['🏠 Home','📋 Copy','🔄 Retry','❌ Wrong','📝 New','✨ More'].map(t =>
                `<div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px;text-align:center;font-size:5px;color:${TXT};font-weight:700">${t}</div>`
              ).join('')}
            </div>
          `)
        },
        {
          label: '21. Review Cards',
          html: phone('Question Review Section', `
            ${heading('📋 Question Review')}
            <div style="display:flex;gap:3px;margin:4px 0">
              ${['All (10)', '✓ Correct (8)', '✗ Wrong (1)', '⏭ Skip (1)'].map((t,i) =>
                `<span style="font-size:5px;font-weight:800;padding:2px 4px;border-radius:4px;background:${i===0?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)'};color:${i===0?PRI:DIM};border:1px solid ${i===0?'rgba(99,102,241,0.3)':BD}">${t}</span>`
              ).join('')}
            </div>
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT};margin-bottom:3px">Q1. What is DNA?</div>
              <div style="display:flex;gap:3px">
                ${pill('✓ Nucleic acid', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('Easy', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('12s', 'rgba(255,255,255,0.05)', DIM)}
              </div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT};margin-bottom:3px">Q4. Function of ribosome?</div>
              <div style="display:flex;gap:3px;flex-wrap:wrap">
                ${pill('✗ Cell division', 'rgba(248,113,113,0.15)', RED)}
                ${pill('✓ Protein synthesis', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('Hard', 'rgba(248,113,113,0.15)', RED)}
              </div>
              ${miniBtn('✨ AI Rationale', 'rgba(167,139,250,0.15)', VIO)}
            `)}
          `)
        },
        {
          label: '22. AI Rationale',
          html: phone('AI Explanation Panel', `
            ${heading('✨ AI Rationale')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">Q4. Function of ribosome?</div>
              <div style="display:flex;gap:3px;margin:3px 0">
                ${pill('✗ Yours: Cell division', 'rgba(248,113,113,0.15)', RED)}
                ${pill('✓ Correct: Protein synthesis', 'rgba(52,211,153,0.15)', GRN)}
              </div>
            `)}
            <div style="background:rgba(167,139,250,0.06);border:1px solid rgba(167,139,250,0.2);border-radius:8px;padding:8px;margin:4px 0">
              <div style="display:flex;align-items:center;gap:3px;margin-bottom:4px">
                <span style="font-size:8px">✨</span>
                <span style="font-size:6px;font-weight:900;color:${VIO}">AI EXPLANATION</span>
              </div>
              <div style="font-size:6px;color:${TXT};line-height:1.7">
                Ribosomes are the molecular machines responsible for <strong>protein synthesis</strong> (translation). They read mRNA sequences and assemble amino acids into polypeptide chains.<br><br>
                Cell division is carried out by the <strong>centrioles</strong> and <strong>spindle fibers</strong>, not ribosomes.
              </div>
            </div>
            <div style="background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:8px;padding:6px;margin:4px 0">
              <div style="font-size:6px;font-weight:800;color:${AMB}">📖 Book Rationale</div>
              <div style="font-size:6px;color:${TXT};margin-top:2px">See Chapter 5, Section 3 — Ribosome Structure</div>
            </div>
          `)
        },
        {
          label: '23. Share Results',
          html: phone('Share Result Card', `
            <div style="background:linear-gradient(135deg,rgba(99,102,241,0.1),rgba(167,139,250,0.05));border:1px solid rgba(99,102,241,0.2);border-radius:14px;padding:12px;margin:8px 0;text-align:center">
              <div style="font-size:24px;margin-bottom:4px">🏆</div>
              <div style="font-size:11px;font-weight:900;color:${TXT}">Quiz Master Pro</div>
              <div style="font-size:20px;font-weight:900;color:${GRN};margin:4px 0">85%</div>
              <div style="font-size:7px;color:${DIM}">Biology Chapter 5</div>
              <div style="display:flex;justify-content:center;gap:8px;margin:8px 0">
                <div style="text-align:center"><div style="font-size:9px;font-weight:900;color:${GRN}">8</div><div style="font-size:5px;color:${DIM}">Correct</div></div>
                <div style="text-align:center"><div style="font-size:9px;font-weight:900;color:${RED}">1</div><div style="font-size:5px;color:${DIM}">Wrong</div></div>
                <div style="text-align:center"><div style="font-size:9px;font-weight:900;color:${AMB}">1</div><div style="font-size:5px;color:${DIM}">Skipped</div></div>
              </div>
              <div style="font-size:5px;color:${DIM}">quizmaster.zite.so</div>
            </div>
            <div style="display:flex;gap:3px;justify-content:center">
              ${miniBtn('📋 Copy', 'rgba(255,255,255,0.05)', DIM)}
              ${miniBtn('📸 Image', PRI, 'white')}
              ${miniBtn('📤 Share', 'rgba(52,211,153,0.15)', GRN)}
            </div>
          `)
        },
        {
          label: '24. Timing Breakdown',
          html: phone('Timing Breakdown Chart', `
            ${heading('⏱ Timing Breakdown')}
            ${card(`
              <div style="font-size:6px;color:${DIM};margin-bottom:4px">TIME PER QUESTION</div>
              ${[['Q1','8s',40],['Q2','15s',75],['Q3','22s',100],['Q4','12s',60],['Q5','5s',25]].map(([q,t,w]) =>
                `<div style="display:flex;align-items:center;gap:4px;margin:2px 0">
                  <span style="font-size:5px;color:${DIM};width:14px">${q}</span>
                  ${bar(w+'%', Number(w) > 80 ? RED : Number(w) > 50 ? AMB : GRN, '5px')}
                  <span style="font-size:5px;color:${TXT};font-weight:800">${t}</span>
                </div>`
              ).join('')}
            `)}
            ${card(`
              <div style="display:flex;justify-content:space-between">
                <div style="text-align:center"><div style="font-size:8px;font-weight:900;color:${GRN}">5s</div><div style="font-size:5px;color:${DIM}">Fastest</div></div>
                <div style="text-align:center"><div style="font-size:8px;font-weight:900;color:${AMB}">12.4s</div><div style="font-size:5px;color:${DIM}">Average</div></div>
                <div style="text-align:center"><div style="font-size:8px;font-weight:900;color:${RED}">22s</div><div style="font-size:5px;color:${DIM}">Slowest</div></div>
              </div>
            `)}
          `)
        },
        {
          label: '25. Difficulty Rating',
          html: phone('Post-Quiz Difficulty Rating', `
            ${heading('⭐ Rate Difficulty')}
            ${card(`
              <div style="text-align:center;padding:4px">
                <div style="font-size:7px;color:${DIM};margin-bottom:4px">How difficult was this quiz?</div>
                <div style="display:flex;justify-content:center;gap:4px;margin:6px 0">
                  ${['😊','🤔','😐','😰','🤯'].map((e,i) =>
                    `<div style="font-size:16px;opacity:${i===2?1:0.3};cursor:pointer">${e}</div>`
                  ).join('')}
                </div>
                <div style="font-size:6px;color:${AMB};font-weight:800">Just Right</div>
                <div style="font-size:5px;color:${DIM};margin-top:3px">Your rating helps improve future quizzes</div>
              </div>
            `)}
          `)
        },
        {
          label: '26. Report Downloads',
          html: phone('Report Download Panel', `
            ${heading('📄 Download Reports')}
            <div style="display:flex;gap:3px;margin:4px 0">
              ${pill('📝 10 Qs', 'rgba(99,102,241,0.15)', PRI)}
              ${pill('✓ 8', 'rgba(52,211,153,0.15)', GRN)}
              ${pill('✗ 1', 'rgba(248,113,113,0.15)', RED)}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px">
              ${[['📊','Full Report','10 Qs'],['✅','Correct Only','8 Qs'],['❌','Mistakes','1 Q'],['⏭','Skipped','1 Q'],['📖','Study Notes','All'],['📝','Exam Paper','10 Qs']].map(([ico,title,count]) =>
                `<div style="background:rgba(255,255,255,0.02);border:1px solid ${BD};border-radius:8px;padding:5px;text-align:center">
                  <div style="font-size:10px">${ico}</div>
                  <div style="font-size:6px;font-weight:800;color:${TXT};margin-top:2px">${title}</div>
                  <div style="font-size:5px;color:${DIM}">${count}</div>
                </div>`
              ).join('')}
            </div>
            <div style="display:flex;gap:3px;margin-top:4px">
              ${miniBtn('PDF', 'rgba(248,113,113,0.15)', RED)}
              ${miniBtn('DOC', 'rgba(66,133,244,0.15)', '#4285f4')}
              ${miniBtn('TXT', 'rgba(255,255,255,0.05)', DIM)}
            </div>
          `)
        },
      ]
    },

    // ────────── LIBRARY ──────────
    {
      category: '📚 Library & File Manager',
      screens: [
        {
          label: '27. Library — List View',
          html: phone('Library — List View', `
            ${row(`${heading('📚 Library')} <div style="margin-left:auto;display:flex;gap:3px">${pill('List', 'rgba(99,102,241,0.15)', PRI)}${pill('Subject', 'rgba(255,255,255,0.03)', DIM)}</div>`)}
            <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:8px;padding:4px 6px;margin:3px 0;display:flex;align-items:center;gap:4px">
              <span style="font-size:8px;color:${DIM}">🔍</span>
              <span style="font-size:6px;color:${DIM}">Search quizzes…</span>
            </div>
            <div style="display:flex;gap:2px;margin:3px 0;overflow:hidden">
              ${['All','Biology','History','Math','Physics'].map((s,i) =>
                pill(s, i===0?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)', i===0?PRI:DIM)
              ).join('')}
            </div>
            <div style="font-size:6px;font-weight:800;color:${DIM};margin:3px 0">📌 PINNED</div>
            ${card(`<div style="display:flex;align-items:center;gap:5px">
              <div style="width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,${GRN},#10b981);font-size:7px;color:white;display:flex;align-items:center;justify-content:center;font-weight:900">B</div>
              <div style="flex:1"><div style="font-size:6px;font-weight:800;color:${TXT}">Biology Final Prep</div><div style="font-size:5px;color:${DIM}">20 Qs · Jun 8</div></div>
              <div style="font-size:8px;font-weight:900;color:${GRN}">92%</div>
            </div>`)}
            <div style="font-size:6px;font-weight:800;color:${DIM};margin:3px 0">RECENT</div>
            ${card(`<div style="display:flex;align-items:center;gap:5px">
              <div style="width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,${AMB},#f59e0b);font-size:7px;color:white;display:flex;align-items:center;justify-content:center;font-weight:900">H</div>
              <div style="flex:1"><div style="font-size:6px;font-weight:800;color:${TXT}">History WWII</div><div style="font-size:5px;color:${DIM}">15 Qs · Jun 7</div></div>
              <div style="font-size:8px;font-weight:900;color:${AMB}">68%</div>
            </div>`)}
            ${card(`<div style="display:flex;align-items:center;gap:5px">
              <div style="width:18px;height:18px;border-radius:5px;background:linear-gradient(135deg,${RED},#ef4444);font-size:7px;color:white;display:flex;align-items:center;justify-content:center;font-weight:900">P</div>
              <div style="flex:1"><div style="font-size:6px;font-weight:800;color:${TXT}">Physics Waves</div><div style="font-size:5px;color:${DIM}">10 Qs · Jun 5</div></div>
              <div style="font-size:8px;font-weight:900;color:${RED}">45%</div>
            </div>`)}
            ${bottomNav(2)}
          `)
        },
        {
          label: '28. Library — Subject View',
          html: phone('Library — Subject Grouping', `
            ${row(`${heading('📚 Library')} <div style="margin-left:auto;display:flex;gap:3px">${pill('List', 'rgba(255,255,255,0.03)', DIM)}${pill('Subject', 'rgba(99,102,241,0.15)', PRI)}</div>`)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                <div style="width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(167,139,250,0.1));display:flex;align-items:center;justify-content:center;font-size:10px">🧬</div>
                <div style="flex:1">
                  <div style="font-size:7px;font-weight:900;color:${TXT}">Biology</div>
                  <div style="font-size:5px;color:${DIM}">5 quizzes · Avg: 78%</div>
                </div>
                <div style="font-size:5px;color:${DIM}">▼</div>
              </div>
              ${bar('78%', GRN, '3px')}
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                <div style="width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,rgba(245,158,11,0.2),rgba(234,179,8,0.1));display:flex;align-items:center;justify-content:center;font-size:10px">📜</div>
                <div style="flex:1">
                  <div style="font-size:7px;font-weight:900;color:${TXT}">History</div>
                  <div style="font-size:5px;color:${DIM}">3 quizzes · Avg: 65%</div>
                </div>
              </div>
              ${bar('65%', AMB, '3px')}
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                <div style="width:24px;height:24px;border-radius:8px;background:linear-gradient(135deg,rgba(34,211,238,0.2),rgba(6,182,212,0.1));display:flex;align-items:center;justify-content:center;font-size:10px">🔢</div>
                <div style="flex:1">
                  <div style="font-size:7px;font-weight:900;color:${TXT}">Mathematics</div>
                  <div style="font-size:5px;color:${DIM}">4 quizzes · Avg: 82%</div>
                </div>
              </div>
              ${bar('82%', GRN, '3px')}
            `)}
            ${bottomNav(2)}
          `)
        },
        {
          label: '29. File Manager',
          html: phone('File Manager — Folders', `
            ${heading('📁 File Manager')}
            <div style="display:flex;gap:3px;margin:3px 0">
              ${pill('📁 Root', 'rgba(99,102,241,0.15)', PRI)}
              ${pill('+ New Folder', 'rgba(255,255,255,0.05)', DIM)}
            </div>
            ${card(`<div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:14px">📁</span>
              <div style="flex:1"><div style="font-size:7px;font-weight:800;color:${TXT}">Biology</div><div style="font-size:5px;color:${DIM}">5 quizzes · 3 bookmarks</div></div>
              <span style="font-size:6px;color:${DIM}">→</span>
            </div>`)}
            ${card(`<div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:14px">📁</span>
              <div style="flex:1"><div style="font-size:7px;font-weight:800;color:${TXT}">History</div><div style="font-size:5px;color:${DIM}">3 quizzes</div></div>
              <span style="font-size:6px;color:${DIM}">→</span>
            </div>`)}
            ${card(`<div style="display:flex;align-items:center;gap:6px">
              <span style="font-size:14px">📄</span>
              <div style="flex:1"><div style="font-size:7px;font-weight:800;color:${TXT}">Quick Physics Quiz</div><div style="font-size:5px;color:${DIM}">10 Qs · 45%</div></div>
              <span style="font-size:7px;font-weight:900;color:${RED}">45%</span>
            </div>`)}
            ${bottomNav(2)}
          `)
        },
        {
          label: '30. Folder Analytics',
          html: phone('Folder Analytics Panel', `
            ${heading('📊 Biology — Analytics')}
            ${card(`
              <div style="display:flex;justify-content:space-between">
                <div style="text-align:center"><div style="font-size:10px;font-weight:900;color:${TXT}">5</div><div style="font-size:5px;color:${DIM}">Quizzes</div></div>
                <div style="text-align:center"><div style="font-size:10px;font-weight:900;color:${GRN}">78%</div><div style="font-size:5px;color:${DIM}">Average</div></div>
                <div style="text-align:center"><div style="font-size:10px;font-weight:900;color:${PRI}">50</div><div style="font-size:5px;color:${DIM}">Questions</div></div>
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM};margin-bottom:3px">SCORE TREND</div>
              <div style="display:flex;gap:2px;align-items:end;height:30px">
                ${[60,70,75,80,92].map(h =>
                  `<div style="flex:1;height:${h*0.3}px;background:linear-gradient(to top,${PRI},${VIO});border-radius:2px"></div>`
                ).join('')}
              </div>
              <div style="font-size:5px;color:${GRN};text-align:center;margin-top:2px">📈 +32% improvement</div>
            `)}
          `)
        },
      ]
    },

    // ────────── STATS ──────────
    {
      category: '📊 Statistics & Analytics',
      screens: [
        {
          label: '31. Weekly Heatmap',
          html: phone('Stats — Weekly Heatmap', `
            ${heading('📊 Stats & Analytics')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT};margin-bottom:4px">📅 Activity Heatmap</div>
              <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px">
                ${Array.from({length:28},(_,i) => {
                  const v = [0,1,3,2,0,1,4,2,3,0,1,2,5,3,1,0,2,3,4,1,0,2,3,1,4,2,3,5][i];
                  const colors = ['rgba(255,255,255,0.03)','rgba(99,102,241,0.15)','rgba(99,102,241,0.3)','rgba(99,102,241,0.5)','rgba(99,102,241,0.7)',PRI];
                  return `<div style="width:100%;aspect-ratio:1;border-radius:3px;background:${colors[v]}"></div>`;
                }).join('')}
              </div>
              <div style="display:flex;justify-content:space-between;margin-top:2px">
                <span style="font-size:5px;color:${DIM}">Mon</span>
                <span style="font-size:5px;color:${DIM}">Sun</span>
              </div>
            `)}
            ${bottomNav(3)}
          `)
        },
        {
          label: '32. Streak Milestones',
          html: phone('Streak Milestones', `
            ${heading('🔥 Streak Milestones')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
              ${[['🔥','3 Days','Unlocked!',true],['⚡','7 Days','Unlocked!',true],['💎','14 Days','9/14 days',false],['👑','30 Days','9/30 days',false]].map(([ico,title,sub,done]) =>
                `<div style="background:${done?'rgba(52,211,153,0.06)':'rgba(255,255,255,0.02)'};border:1px solid ${done?'rgba(52,211,153,0.2)':BD};border-radius:10px;padding:6px;text-align:center;${done?'':'opacity:0.5'}">
                  <div style="font-size:14px">${ico}</div>
                  <div style="font-size:7px;font-weight:900;color:${done?GRN:DIM}">${title}</div>
                  <div style="font-size:5px;color:${DIM}">${sub}</div>
                </div>`
              ).join('')}
            </div>
            ${bottomNav(3)}
          `)
        },
        {
          label: '33. Subject Radar',
          html: phone('Subject Radar Chart', `
            ${heading('🎯 Subject Performance')}
            ${card(`
              <svg width="180" height="140" viewBox="0 0 180 140" style="display:block;margin:0 auto">
                <polygon points="90,15 155,45 155,105 90,135 25,105 25,45" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
                <polygon points="90,35 140,55 140,95 90,115 40,95 40,55" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
                <polygon points="90,25 150,50 140,105 80,125 30,90 45,45" fill="rgba(99,102,241,0.15)" stroke="${PRI}" stroke-width="1.5"/>
                ${[['90','20','Bio'],['155','50','Hist'],['150','110','Math'],['90','130','Phys'],['30','110','Chem'],['30','50','Eng']].map(([x,y,l]) =>
                  `<text x="${x}" y="${y}" text-anchor="middle" fill="${DIM}" font-size="6" font-weight="800">${l}</text>`
                ).join('')}
              </svg>
            `)}
            ${bottomNav(3)}
          `)
        },
        {
          label: '34. Time of Day',
          html: phone('Time of Day Chart', `
            ${heading('🕐 Study Patterns')}
            ${card(`
              <div style="font-size:6px;color:${DIM};margin-bottom:4px">WHEN YOU STUDY</div>
              <div style="display:flex;gap:3px;align-items:end;height:50px">
                ${[['🌅',20,'Morning'],['☀️',60,'Afternoon'],['🌆',90,'Evening'],['🌙',30,'Night']].map(([ico,h,lbl]) =>
                  `<div style="flex:1;text-align:center">
                    <div style="height:${Number(h)*0.5}px;background:linear-gradient(to top,${PRI},${VIO});border-radius:4px 4px 0 0;margin:0 auto;width:80%"></div>
                    <div style="font-size:8px;margin-top:2px">${ico}</div>
                    <div style="font-size:5px;color:${DIM}">${lbl}</div>
                  </div>`
                ).join('')}
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${TXT}">💡 Insight</div>
              <div style="font-size:6px;color:${DIM};margin-top:2px">You perform best in the evening (82% accuracy)</div>
            `)}
            ${bottomNav(3)}
          `)
        },
        {
          label: '35. Confidence Chart',
          html: phone('Confidence Tracking', `
            ${heading('🎯 Confidence vs Accuracy')}
            ${card(`
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <div style="text-align:center"><div style="font-size:7px;font-weight:900;color:${GRN}">82%</div><div style="font-size:5px;color:${DIM}">Sure & Correct</div></div>
                <div style="text-align:center"><div style="font-size:7px;font-weight:900;color:${RED}">12%</div><div style="font-size:5px;color:${DIM}">Sure & Wrong</div></div>
                <div style="text-align:center"><div style="font-size:7px;font-weight:900;color:${AMB}">6%</div><div style="font-size:5px;color:${DIM}">Guessing</div></div>
              </div>
              ${bar('82%', GRN, '6px')}
              <div style="font-size:5px;color:${DIM};margin-top:2px">Your confidence calibration is excellent</div>
            `)}
            ${bottomNav(3)}
          `)
        },
        {
          label: '36. Mastery Heatmap',
          html: phone('Question Mastery Heatmap', `
            ${heading('🧠 Question Mastery')}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM};margin-bottom:3px">MASTERY LEVELS</div>
              <div style="display:grid;grid-template-columns:repeat(10,1fr);gap:2px">
                ${Array.from({length:30},(_,i) => {
                  const colors = [GRN,GRN,GRN,AMB,GRN,RED,GRN,GRN,AMB,GRN,GRN,RED,GRN,GRN,GRN,AMB,GRN,GRN,GRN,GRN,RED,AMB,GRN,GRN,GRN,GRN,AMB,GRN,GRN,GRN];
                  return `<div style="aspect-ratio:1;border-radius:2px;background:${colors[i]};opacity:0.6" title="Q${i+1}"></div>`;
                }).join('')}
              </div>
              <div style="display:flex;gap:6px;justify-content:center;margin-top:4px">
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:1px;background:${GRN}"></div><span style="font-size:5px;color:${DIM}">Mastered</span></div>
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:1px;background:${AMB}"></div><span style="font-size:5px;color:${DIM}">Learning</span></div>
                <div style="display:flex;align-items:center;gap:2px"><div style="width:6px;height:6px;border-radius:1px;background:${RED}"></div><span style="font-size:5px;color:${DIM}">Weak</span></div>
              </div>
            `)}
            ${bottomNav(3)}
          `)
        },
      ]
    },

    // ────────── PROFILE ──────────
    {
      category: '👤 Profile & Settings',
      screens: [
        {
          label: '37. Profile Header',
          html: phone('Profile — Main Screen', `
            <div style="text-align:center;padding:6px 0">
              <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,${PRI},${VIO});margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:18px;border:2px solid rgba(255,255,255,0.15)">🎓</div>
              <div style="font-size:10px;font-weight:900;color:${TXT};margin-top:4px">Rana Ahmed</div>
              <div style="font-size:6px;color:${DIM}">rana@example.com</div>
              <div style="display:flex;gap:3px;justify-content:center;margin-top:3px">
                ${pill('🎓 Master', 'rgba(167,139,250,0.15)', VIO)}
                ${pill('🔥 5 Day Streak', 'rgba(245,158,11,0.15)', AMB)}
              </div>
            </div>
            ${grid3(
              statCard('📝', '42', 'Quizzes'),
              statCard('🎯', '78%', 'Avg'),
              statCard('⭐', '100%', 'Best')
            )}
            ${grid3(
              statCard('✅', '82%', 'Accuracy'),
              statCard('🔥', '5', 'Streak'),
              statCard('⏱', '6h', 'Time')
            )}
            <div style="display:flex;gap:2px;margin-top:4px;overflow:hidden">
              ${['Overview','Notes','Awards','Settings','Trash'].map((t,i) =>
                `<span style="font-size:5px;font-weight:800;padding:3px 5px;border-radius:6px;background:${i===0?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)'};color:${i===0?PRI:DIM};white-space:nowrap;flex-shrink:0">${t}</span>`
              ).join('')}
            </div>
            ${bottomNav(4)}
          `)
        },
        {
          label: '38. Overview Tab',
          html: phone('Profile — Overview', `
            ${heading('📈 Overview')}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">LIFETIME SCORE</div>
              <div style="display:flex;align-items:center;justify-content:center;gap:4px;margin:4px 0">
                <span style="font-size:10px;font-weight:900;color:${GRN}">+328</span>
                <span style="font-size:8px;color:${DIM}">−</span>
                <span style="font-size:10px;font-weight:900;color:${RED}">-12</span>
                <span style="font-size:8px;color:${DIM}">=</span>
                <span style="font-size:10px;font-weight:900;color:${PRI}">316</span>
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">ACCURACY BREAKDOWN</div>
              <div style="margin-top:3px">
                <div style="display:flex;justify-content:space-between;font-size:5px"><span style="color:${GRN}">✓ Correct</span><span style="color:${TXT}">78%</span></div>
                ${bar('78%', GRN, '4px')}
                <div style="display:flex;justify-content:space-between;font-size:5px;margin-top:2px"><span style="color:${RED}">✗ Wrong</span><span style="color:${TXT}">15%</span></div>
                ${bar('15%', RED, '4px')}
                <div style="display:flex;justify-content:space-between;font-size:5px;margin-top:2px"><span style="color:${AMB}">⏭ Skipped</span><span style="color:${TXT}">7%</span></div>
                ${bar('7%', AMB, '4px')}
              </div>
            `)}
          `)
        },
        {
          label: '39. AI Notes Tab',
          html: phone('Profile — AI Notes', `
            ${heading('📖 AI Study Notes')}
            ${row(`${pill('✦ Gemini', 'rgba(66,133,244,0.15)', '#4285f4')} ${pill('Detailed', 'rgba(52,211,153,0.15)', GRN)} ${pill('All Subjects', 'rgba(255,255,255,0.05)', DIM)}`)}
            ${miniBtn('✨ Generate Notes', `linear-gradient(135deg,${VIO},${PRI})`, '#0a0a0f')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">📝 Generated Notes</div>
              <div style="font-size:6px;color:${TXT};line-height:1.7;margin-top:3px">
                <strong style="color:${VIO}">1. Cell Biology</strong><br>
                • Mitochondria = powerhouse of the cell<br>
                • DNA is found in the nucleus<br>
                <strong style="color:${VIO}">2. Key Mnemonics</strong><br>
                • "King Philip Came Over For…"
              </div>
            `)}
            <div style="display:flex;gap:3px;margin-top:4px">
              ${miniBtn('📄 TXT', 'rgba(255,255,255,0.05)', DIM)}
              ${miniBtn('📑 PDF', 'rgba(248,113,113,0.15)', RED)}
              ${miniBtn('🔍 Search', 'rgba(99,102,241,0.15)', PRI)}
            </div>
          `)
        },
        {
          label: '40. Awards Grid',
          html: phone('Profile — Awards', `
            ${heading('🏅 Achievements')}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">
              ${[['🎯','First Steps','Complete 1 quiz',true],['🔥','On Fire','5 quizzes',true],['💎','Diamond','10 quizzes',true],['🏆','Perfect','100% score',true],['⭐','High Achiever','>80% avg',false],['⚡','Speed Demon','<30s avg',false],['👑','Fifty Right','50 correct',false],['🧠','Scholar','20 quizzes',false]].map(([ico,title,desc,done]) =>
                `<div style="background:${done?'rgba(52,211,153,0.04)':'rgba(255,255,255,0.02)'};border:1px solid ${done?'rgba(52,211,153,0.2)':BD};border-radius:10px;padding:6px;text-align:center;${done?'':'opacity:0.4'}">
                  <div style="font-size:14px">${ico}</div>
                  <div style="font-size:6px;font-weight:900;color:${done?GRN:DIM};margin-top:2px">${title}</div>
                  <div style="font-size:5px;color:${DIM}">${desc}</div>
                  ${done?`<div style="font-size:5px;color:${GRN};margin-top:2px">✓ Unlocked</div>`:''}
                </div>`
              ).join('')}
            </div>
          `)
        },
        {
          label: '41. Settings Tab',
          html: phone('Profile — Settings', `
            ${heading('⚙️ Settings')}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">DISPLAY NAME</div>
              <div style="display:flex;gap:4px;align-items:center;margin-top:2px">
                <div style="font-size:14px">🎓</div>
                <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:3px 6px;flex:1;font-size:6px;color:${TXT}">Rana Ahmed</div>
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">THEME</div>
              <div style="display:flex;gap:3px;margin-top:3px">
                ${[['✨ Light',''],['🌌 Dark','selected'],['🖤 AMOLED','']].map(([t,s]) =>
                  `<span style="font-size:5px;font-weight:800;padding:3px 6px;border-radius:6px;background:${s?'rgba(99,102,241,0.15)':'rgba(255,255,255,0.03)'};color:${s?PRI:DIM};border:1px solid ${s?'rgba(99,102,241,0.3)':BD}">${t}</span>`
                ).join('')}
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">STUDY GOALS</div>
              <div style="margin-top:3px">
                <div style="display:flex;justify-content:space-between;font-size:5px;color:${TXT}"><span>Daily Quizzes</span><span style="font-weight:900;color:${PRI}">3</span></div>
                ${bar('30%', PRI, '4px')}
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${DIM}">CLOUD BACKUP</div>
              <div style="display:flex;gap:3px;margin-top:3px">
                ${pill('☁️ Synced', 'rgba(52,211,153,0.15)', GRN)}
                ${miniBtn('Sync Now', 'rgba(99,102,241,0.15)', PRI)}
              </div>
            `)}
          `)
        },
        {
          label: '42. Downloads Tab',
          html: phone('Profile — Downloads', `
            ${heading('⬇️ Export & Deploy')}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:12px">📱</span>
                <div><div style="font-size:7px;font-weight:900;color:${TXT}">Install on Android</div>
                <div style="font-size:5px;color:${DIM}">3 methods available</div></div>
              </div>
              ${miniBtn('⚡ One-Tap Install', GRN, 'white')}
            `, 'border-left:3px solid ' + GRN)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:12px">💻</span>
                <div><div style="font-size:7px;font-weight:900;color:${TXT}">Source Code</div>
                <div style="font-size:5px;color:${DIM}">180+ files · ZIP</div></div>
              </div>
            `, 'border-left:3px solid ' + PRI)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:12px">🤖</span>
                <div><div style="font-size:7px;font-weight:900;color:${TXT}">Android Studio</div>
                <div style="font-size:5px;color:${DIM}">Kotlin WebView</div></div>
              </div>
            `, 'border-left:3px solid ' + VIO)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:12px">📖</span>
                <div><div style="font-size:7px;font-weight:900;color:${TXT}">Documentation</div>
                <div style="font-size:5px;color:${DIM}">55+ screen previews</div></div>
              </div>
              <div style="display:flex;gap:3px;margin-top:3px">
                ${miniBtn('HTML', 'rgba(245,158,11,0.15)', AMB)}
                ${miniBtn('PDF', 'rgba(248,113,113,0.15)', RED)}
              </div>
            `, 'border-left:3px solid ' + AMB)}
          `)
        },
        {
          label: '43. Backup Section',
          html: phone('Google Drive Backup', `
            ${heading('☁️ Cloud & Drive Backup')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">Google Drive</div>
              <div style="display:flex;gap:3px;margin:4px 0">
                ${pill('✓ Connected', 'rgba(52,211,153,0.15)', GRN)}
              </div>
              <div style="font-size:5px;color:${DIM}">Last backup: 2 hours ago</div>
              <div style="display:flex;gap:3px;margin-top:4px">
                ${miniBtn('⬆ Upload', PRI, 'white')}
                ${miniBtn('⬇ Restore', 'rgba(255,255,255,0.05)', DIM)}
                ${miniBtn('📋 List', 'rgba(255,255,255,0.05)', DIM)}
              </div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">📧 Email Report</div>
              <div style="font-size:5px;color:${DIM};margin:2px 0">Send weekly performance summary</div>
              ${miniBtn('Send Report', 'rgba(99,102,241,0.15)', PRI)}
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">💾 Local Backup</div>
              <div style="display:flex;gap:3px;margin-top:3px">
                ${miniBtn('Download JSON', 'rgba(255,255,255,0.05)', DIM)}
                ${miniBtn('Restore', 'rgba(255,255,255,0.05)', DIM)}
              </div>
            `)}
          `)
        },
        {
          label: '44. API Keys Tab',
          html: phone('API Keys Management', `
            ${heading('🔑 API Keys')}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                <span style="font-size:10px">✦</span>
                <div style="font-size:7px;font-weight:900;color:${TXT}">Gemini API Key</div>
              </div>
              <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px 6px;font-size:6px;color:${DIM}">AIza●●●●●●●●●●●●●</div>
              ${pill('✓ Using your key', 'rgba(52,211,153,0.15)', GRN)}
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px;margin-bottom:4px">
                <span style="font-size:10px">◈</span>
                <div style="font-size:7px;font-weight:900;color:${TXT}">Anthropic API Key</div>
              </div>
              <div style="background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:6px;padding:4px 6px;font-size:6px;color:${DIM}">Not set</div>
              ${pill('Using system key', 'rgba(255,255,255,0.05)', DIM)}
              ${miniBtn('+ Add Key', 'rgba(99,102,241,0.15)', PRI)}
            `)}
          `)
        },
        {
          label: '45. Trash Tab',
          html: phone('Trash — Deleted Quizzes', `
            ${heading('🗑️ Trash')}
            ${miniBtn('🗑️ Empty Trash', 'rgba(248,113,113,0.1)', RED)}
            ${card(`<div style="display:flex;align-items:center;gap:5px">
              <div style="flex:1"><div style="font-size:6px;font-weight:800;color:${TXT}">Physics Waves</div><div style="font-size:5px;color:${DIM}">10 Qs · 45% · Deleted Jun 5</div></div>
              <div style="display:flex;gap:2px">
                ${pill('Restore', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('Delete', 'rgba(248,113,113,0.15)', RED)}
              </div>
            </div>`)}
            ${card(`<div style="display:flex;align-items:center;gap:5px">
              <div style="flex:1"><div style="font-size:6px;font-weight:800;color:${TXT}">Chemistry Bonds</div><div style="font-size:5px;color:${DIM}">8 Qs · 50% · Deleted Jun 3</div></div>
              <div style="display:flex;gap:2px">
                ${pill('Restore', 'rgba(52,211,153,0.15)', GRN)}
                ${pill('Delete', 'rgba(248,113,113,0.15)', RED)}
              </div>
            </div>`)}
          `)
        },
        {
          label: '46. Templates Tab',
          html: phone('Quiz Templates', `
            ${heading('📋 Templates')}
            ${subtext('Save quiz settings as reusable templates')}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:10px">⚡</span>
                <div style="flex:1"><div style="font-size:7px;font-weight:800;color:${TXT}">Quick Biology</div><div style="font-size:5px;color:${DIM}">10 Qs · Medium · 30s timer</div></div>
                ${miniBtn('Use', PRI, 'white')}
              </div>
            `)}
            ${card(`
              <div style="display:flex;align-items:center;gap:4px">
                <span style="font-size:10px">📝</span>
                <div style="flex:1"><div style="font-size:7px;font-weight:800;color:${TXT}">Exam Simulation</div><div style="font-size:5px;color:${DIM}">50 Qs · Hard · 45min total</div></div>
                ${miniBtn('Use', PRI, 'white')}
              </div>
            `)}
            ${miniBtn('+ Create Template', 'rgba(99,102,241,0.15)', PRI)}
          `)
        },
      ]
    },

    // ────────── PRACTICE ──────────
    {
      category: '🏋️ Practice & Flashcards',
      screens: [
        {
          label: '47. Practice Dashboard',
          html: phone('Practice Dashboard', `
            ${heading('🏋️ Practice Mode')}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">❌ Weak Questions</div>
              <div style="font-size:6px;color:${DIM};margin:2px 0">12 questions need review</div>
              ${bar('40%', RED, '5px')}
              ${miniBtn('Practice Weak Questions →', RED, 'white')}
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">🎯 Practice Goals</div>
              <div style="display:flex;justify-content:space-between;margin-top:3px">
                <div><div style="font-size:5px;color:${DIM}">Today</div><div style="font-size:8px;font-weight:900;color:${GRN}">2/3</div></div>
                <div><div style="font-size:5px;color:${DIM}">This Week</div><div style="font-size:8px;font-weight:900;color:${AMB}">8/15</div></div>
                <div><div style="font-size:5px;color:${DIM}">Mastered</div><div style="font-size:8px;font-weight:900;color:${PRI}">67%</div></div>
              </div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:900;color:${TXT}">⚡ Quick Re-Practice</div>
              <div style="font-size:6px;color:${DIM};margin:2px 0">Retry your last 5 wrong answers</div>
              ${miniBtn('Start', 'rgba(99,102,241,0.15)', PRI)}
            `)}
          `)
        },
        {
          label: '48. Flashcard Screen',
          html: phone('Flashcard Study Mode', `
            <div style="font-size:7px;font-weight:800;color:${DIM};text-align:center;margin-bottom:4px">Card 3 of 12</div>
            ${navDots(2, 12)}
            <div style="background:linear-gradient(135deg,rgba(99,102,241,0.08),rgba(167,139,250,0.04));border:2px solid rgba(99,102,241,0.2);border-radius:16px;padding:20px 12px;text-align:center;margin:8px 0;min-height:120px;display:flex;flex-direction:column;align-items:center;justify-content:center">
              <div style="font-size:9px;font-weight:900;color:${TXT};line-height:1.6">What is the powerhouse of the cell?</div>
              <div style="font-size:6px;color:${DIM};margin-top:8px">Tap to flip →</div>
            </div>
            <div style="display:flex;gap:4px;justify-content:center">
              ${miniBtn('❌ Wrong', 'rgba(248,113,113,0.15)', RED)}
              ${miniBtn('🤔 Okay', 'rgba(245,158,11,0.15)', AMB)}
              ${miniBtn('✅ Got It', 'rgba(52,211,153,0.15)', GRN)}
            </div>
            <div style="display:flex;gap:3px;justify-content:center;margin-top:4px">
              ${pill('🔀 Shuffle', 'rgba(255,255,255,0.05)', DIM)}
              ${pill('⏱ Auto-flip', 'rgba(255,255,255,0.05)', DIM)}
            </div>
          `)
        },
        {
          label: '49. Bookmarks Hub',
          html: phone('Bookmarks Hub', `
            ${heading('🔖 Bookmarks')}
            ${subtext('Questions you bookmarked during quizzes')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">🔖 What is DNA?</div>
              <div style="display:flex;gap:3px;margin-top:2px">
                ${pill('Biology', 'rgba(99,102,241,0.15)', PRI)}
                ${pill('Easy', 'rgba(52,211,153,0.15)', GRN)}
              </div>
              <div style="font-size:5px;color:${DIM};margin-top:2px">✓ Correct: Nucleic acid · Bookmarked Jun 8</div>
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">🔖 Function of ribosome?</div>
              <div style="display:flex;gap:3px;margin-top:2px">
                ${pill('Biology', 'rgba(99,102,241,0.15)', PRI)}
                ${pill('Hard', 'rgba(248,113,113,0.15)', RED)}
              </div>
              <div style="font-size:5px;color:${DIM};margin-top:2px">✗ Wrong: Cell division · Bookmarked Jun 7</div>
            `)}
            ${miniBtn('📝 Practice All Bookmarks', PRI, 'white')}
          `)
        },
        {
          label: '50. Study Calendar',
          html: phone('Study Calendar', `
            ${heading('📅 Study Calendar')}
            ${card(`
              <div style="text-align:center;font-size:7px;font-weight:900;color:${TXT};margin-bottom:4px">June 2026</div>
              <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:1px;text-align:center">
                ${['M','T','W','T','F','S','S'].map(d =>
                  `<div style="font-size:5px;color:${DIM};padding:2px">${d}</div>`
                ).join('')}
                ${Array.from({length:30},(_,i) => {
                  const active = [0,1,2,4,5,7,8,9].includes(i);
                  const today = i === 9;
                  return `<div style="font-size:5px;padding:2px;border-radius:4px;color:${today?'white':active?TXT:DIM};background:${today?PRI:active?'rgba(99,102,241,0.1)':'transparent'};font-weight:${active?'800':'400'}">${i+1}</div>`;
                }).join('')}
              </div>
            `)}
            ${card(`
              <div style="font-size:6px;font-weight:800;color:${TXT}">📊 June Summary</div>
              <div style="font-size:5px;color:${DIM}">8 study days · 12 quizzes · Avg 76%</div>
            `)}
          `)
        },
      ]
    },

    // ────────── AI & OTHER ──────────
    {
      category: '🤖 AI & Special Features',
      screens: [
        {
          label: '51. AI Chatbot',
          html: phone('AI Study Assistant', `
            <div style="display:flex;align-items:center;gap:4px;border-bottom:1px solid ${BD};padding-bottom:4px;margin-bottom:4px">
              <span style="font-size:12px">🤖</span>
              <div style="font-size:8px;font-weight:900;color:${TXT}">Study Assistant</div>
              ${pill('✦ Gemini', 'rgba(66,133,244,0.15)', '#4285f4')}
            </div>
            <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px 8px 8px 2px;padding:6px;margin:4px 0;max-width:85%">
              <div style="font-size:6px;color:${TXT};line-height:1.6">Hello! I'm your study assistant. Ask me anything about your quiz topics, explain concepts, or help you prepare for exams. 📚</div>
            </div>
            <div style="background:rgba(52,211,153,0.06);border:1px solid rgba(52,211,153,0.15);border-radius:8px 8px 2px 8px;padding:6px;margin:4px 0;max-width:85%;margin-left:auto">
              <div style="font-size:6px;color:${TXT};line-height:1.6">Explain photosynthesis in simple terms</div>
            </div>
            <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:8px 8px 8px 2px;padding:6px;margin:4px 0;max-width:85%">
              <div style="font-size:6px;color:${TXT};line-height:1.6">Photosynthesis converts sunlight + CO₂ + H₂O → glucose + O₂. Think of it as plants making their own food using sunlight! 🌱</div>
            </div>
            <div style="position:absolute;bottom:0;left:0;right:0;padding:6px;background:${BG};border-top:1px solid ${BD}">
              <div style="display:flex;gap:4px;align-items:center">
                <div style="flex:1;background:rgba(255,255,255,0.03);border:1px solid ${BD};border-radius:8px;padding:5px 8px;font-size:6px;color:${DIM}">Ask anything…</div>
                <div style="width:20px;height:20px;border-radius:8px;background:${PRI};display:flex;align-items:center;justify-content:center;font-size:8px;color:white">↑</div>
              </div>
            </div>
          `)
        },
        {
          label: '52. Gesture Shortcuts',
          html: phone('Gesture & Keyboard Shortcuts', `
            ${heading('👆 Gesture Shortcuts')}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">Swipe Gestures</div>
              ${[['← Swipe Left','Next Question'],['→ Swipe Right','Previous Question'],['📱 Shake','Random Jump']].map(([g,a]) =>
                `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid ${BD}">
                  <span style="font-size:6px;color:${PRI};font-weight:800">${g}</span>
                  <span style="font-size:6px;color:${DIM}">${a}</span>
                </div>`
              ).join('')}
            `)}
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">⌨️ Keyboard</div>
              ${[['←/→ Arrows','Navigate'],['1-4 Keys','Select Option'],['F','Toggle Flag'],['P','Pause/Resume']].map(([k,a]) =>
                `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid ${BD}">
                  <span style="font-size:6px;font-weight:800;color:${VIO};background:rgba(167,139,250,0.1);padding:1px 4px;border-radius:3px">${k}</span>
                  <span style="font-size:6px;color:${DIM}">${a}</span>
                </div>`
              ).join('')}
            `)}
          `)
        },
        {
          label: '53. Onboarding',
          html: phone('New User Onboarding', `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:calc(100% - 36px);text-align:center;padding:12px">
              <div style="font-size:36px;margin-bottom:8px">🎓</div>
              <div style="font-size:12px;font-weight:900;color:${TXT}">Welcome to Quiz Master Pro!</div>
              <div style="font-size:7px;color:${DIM};margin:6px 0;line-height:1.6">Transform your notes into AI-powered quizzes. Study smarter, not harder.</div>
              <div style="display:flex;gap:4px;margin:8px 0">
                ${[1,2,3].map((_,i) =>
                  `<div style="width:${i===0?20:8}px;height:4px;border-radius:2px;background:${i===0?PRI:'rgba(255,255,255,0.1)'}"></div>`
                ).join('')}
              </div>
              <div style="margin-top:8px;width:100%">
                ${miniBtn('Get Started →', `linear-gradient(135deg,${PRI},#e8a020)`, '#0a0a0f')}
              </div>
            </div>
          `)
        },
        {
          label: '54. Offline Indicator',
          html: phone('Offline Mode Banner', `
            ${heading('🏠 Dashboard')}
            <div style="background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.25);border-radius:8px;padding:6px;margin:4px 0;display:flex;align-items:center;gap:4px">
              <span style="font-size:10px">📡</span>
              <div>
                <div style="font-size:7px;font-weight:900;color:${RED}">You're Offline</div>
                <div style="font-size:5px;color:${DIM}">AI features unavailable. Local quizzes still work.</div>
              </div>
            </div>
            ${card(`
              <div style="font-size:7px;font-weight:800;color:${TXT}">Available Offline</div>
              <div style="font-size:6px;color:${DIM};margin-top:2px">
                ✅ View quiz history<br>
                ✅ Review past results<br>
                ✅ Practice bookmarked questions<br>
                ❌ Generate new quizzes (needs AI)
              </div>
            `)}
            ${bottomNav(0)}
          `)
        },
        {
          label: '55. PWA Install Prompt',
          html: phone('Install App Prompt', `
            <div style="display:flex;align-items:center;justify-content:center;height:100%">
              <div style="background:${CARD};border:1px solid ${BD};border-radius:14px;padding:16px;text-align:center;width:90%">
                <div style="font-size:28px;margin-bottom:6px">📱</div>
                <div style="font-size:10px;font-weight:900;color:${TXT}">Install Quiz Master Pro</div>
                <div style="font-size:6px;color:${DIM};margin:6px 0;line-height:1.6">Get the full app experience — works offline, no browser bar, instant launch from home screen!</div>
                <div style="display:flex;gap:3px;justify-content:center;margin:8px 0">
                  ${pill('📶 Offline', 'rgba(52,211,153,0.15)', GRN)}
                  ${pill('⚡ Fast', 'rgba(99,102,241,0.15)', PRI)}
                  ${pill('🔔 Notify', 'rgba(167,139,250,0.15)', VIO)}
                </div>
                ${miniBtn('Install Now ⚡', `linear-gradient(135deg,${PRI},${VIO})`, '#0a0a0f')}
                <div style="font-size:5px;color:${DIM};margin-top:6px">Maybe Later</div>
              </div>
            </div>
          `)
        },
      ]
    },
  ];
}

/* ═══════════════════════════════════════════════════════════
   HTML GENERATOR
   ═══════════════════════════════════════════════════════════ */
export function generateAppDocHTML(): string {
  const now = new Date().toLocaleString();
  const categories = getScreenMockups();
  const totalScreens = categories.reduce((a, c) => a + c.screens.length, 0);

  const tocHTML = categories.map(cat =>
    `<div style="margin-bottom:12px">
      <div style="font-size:14px;font-weight:900;color:${TXT};margin-bottom:6px">${cat.category}</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${cat.screens.map(s =>
          `<a href="#preview-${s.label.split('.')[0].trim()}" style="font-size:11px;padding:4px 10px;border-radius:8px;background:rgba(240,165,0,0.06);border:1px solid rgba(240,165,0,0.15);color:#f0a500;text-decoration:none;font-weight:600;transition:all 0.2s" onmouseover="this.style.background='rgba(240,165,0,0.12)'" onmouseout="this.style.background='rgba(240,165,0,0.06)'">${s.label}</a>`
        ).join('')}
      </div>
    </div>`
  ).join('');

  const previewsHTML = categories.map(cat =>
    `<div style="margin-bottom:40px">
      <h2 style="font-size:24px;font-weight:900;color:${TXT};margin:0 0 8px;padding-top:20px">${cat.category}</h2>
      <div style="height:3px;width:60px;border-radius:3px;background:linear-gradient(90deg,${PRI},${VIO},${CYN});margin-bottom:20px"></div>
      <div id="preview-${cat.screens[0]?.label.split('.')[0].trim()}" style="display:flex;flex-wrap:wrap;justify-content:center;gap:8px">
        ${cat.screens.map(s =>
          `<div id="preview-${s.label.split('.')[0].trim()}">${s.html}</div>`
        ).join('')}
      </div>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quiz Master Pro — Complete App Documentation (${totalScreens} Screen Previews)</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&family=Syne:wght@700;800&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'DM Sans','Plus Jakarta Sans',system-ui,sans-serif;background:linear-gradient(135deg,#0a0a0f,#0d0e1a,#0a0b14);color:${TXT};min-height:100vh;padding:32px 16px}
  .container{max-width:1200px;margin:0 auto}
  a{color:inherit}
  @media print{body{background:#0a0a0f!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}div{page-break-inside:avoid}}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:48px;font-weight:900;font-family:'Syne','DM Sans',sans-serif;background:linear-gradient(135deg,#f0a500,#e8a020,#a78bfa);-webkit-background-clip:text;-webkit-text-fill-color:transparent;text-align:center;line-height:1.2}
  .badge{display:inline-block;font-size:11px;font-weight:800;padding:5px 14px;border-radius:20px;text-transform:uppercase;letter-spacing:0.08em}
  .section{background:${CARD};border:1px solid ${BD};border-radius:20px;padding:32px;margin-bottom:28px;backdrop-filter:blur(20px)}
</style>
</head>
<body>
<div class="container">

  <!-- ══════ HERO ══════ -->
  <div style="text-align:center;padding:56px 20px 48px;margin-bottom:32px">
    <div style="font-size:64px;margin-bottom:16px">🎓</div>
    <h1>Quiz Master Pro</h1>
    <p style="font-size:20px;color:#8b8fa3;margin-top:12px;font-weight:700">Premium Edition — Visual Documentation</p>
    <p style="font-size:13px;color:#5b5e72;margin-top:16px">Generated: ${now}</p>
    <div style="display:flex;gap:8px;justify-content:center;margin-top:20px;flex-wrap:wrap">
      <span class="badge" style="background:rgba(240,165,0,0.15);color:#f0a500;border:1px solid rgba(240,165,0,0.3)">📱 ${totalScreens} Screen Previews</span>
      <span class="badge" style="background:rgba(16,185,129,0.15);color:#34d399;border:1px solid rgba(16,185,129,0.3)">🤖 AI Powered</span>
      <span class="badge" style="background:rgba(167,139,250,0.15);color:#a78bfa;border:1px solid rgba(167,139,250,0.3)">✨ Glassmorphism</span>
      <span class="badge" style="background:rgba(34,211,238,0.15);color:#22d3ee;border:1px solid rgba(34,211,238,0.3)">📲 Mobile First</span>
    </div>
    <p style="font-size:14px;color:#5b5e72;margin-top:24px">${categories.length} categories · ${totalScreens} screen previews · Every feature visualized</p>
  </div>

  <!-- ══════ TABLE OF CONTENTS ══════ -->
  <div class="section">
    <h2 style="font-size:22px;font-weight:900;color:${TXT};margin-bottom:6px">📑 Table of Contents</h2>
    <p style="font-size:12px;color:#5b5e72;margin-bottom:16px">Click any screen to jump to its preview</p>
    ${tocHTML}
  </div>

  <!-- ══════ INTRODUCTION ══════ -->
  <div class="section">
    <h2 style="font-size:22px;font-weight:900;color:${TXT};margin-bottom:16px">🌟 About This Documentation</h2>
    <p style="font-size:14px;color:#a1a4b8;line-height:1.9;margin-bottom:12px">
      This document contains <strong style="color:${TXT}">${totalScreens} visual screen previews</strong> of every screen in Quiz Master Pro.
      Each preview is a CSS-rendered miniature mockup showing the actual layout, colors, and content structure of that screen —
      all rendered as pure HTML/CSS with no external image dependencies.
    </p>
    <p style="font-size:14px;color:#a1a4b8;line-height:1.9;margin-bottom:12px">
      <strong style="color:${TXT}">Quiz Master Pro</strong> is a premium AI-powered quiz app for students. It transforms study notes into interactive MCQ quizzes
      using Google Gemini or Anthropic Claude. Built with React + TypeScript + Tailwind CSS on the Zite platform, featuring dark glassmorphism design,
      comprehensive analytics, cloud backup, Google Drive integration, and full export capabilities.
    </p>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-top:16px">
      ${[
        ['🎯','Quiz Generation','AI converts any text into MCQs with options, answers & explanations'],
        ['⚡','Instant Feedback','Real-time correct/wrong feedback with AI explanations'],
        ['🏆','Score Dashboard','Animated speedometer, stat cards, confetti & detailed review'],
        ['📊','Analytics','Heatmaps, radar charts, streak tracking & study patterns'],
        ['📱','Mobile First','PWA installable, gesture navigation, responsive design'],
        ['☁️','Cloud Sync','Auto-backup, Google Drive, email reports & data export'],
      ].map(([ico,title,desc]) =>
        `<div style="background:rgba(99,102,241,0.04);border:1px solid rgba(99,102,241,0.12);border-radius:12px;padding:14px">
          <div style="font-size:20px;margin-bottom:6px">${ico}</div>
          <div style="font-size:13px;font-weight:800;color:${TXT}">${title}</div>
          <div style="font-size:11px;color:#6b6e82;margin-top:4px;line-height:1.5">${desc}</div>
        </div>`
      ).join('')}
    </div>
  </div>

  <!-- ══════ ALL SCREEN PREVIEWS ══════ -->
  ${previewsHTML}

  <!-- ══════ TECH STACK ══════ -->
  <div class="section">
    <h2 style="font-size:22px;font-weight:900;color:${TXT};margin-bottom:16px">🔧 Technical Architecture</h2>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px">
      ${[
        ['⚛️','Frontend','React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui'],
        ['🔌','Backend','Zite platform endpoints with zod schemas'],
        ['🤖','AI','Google Gemini (Flash) + Anthropic Claude (Sonnet)'],
        ['🔐','Auth','Magic link + Google sign-in via Zite SDK'],
        ['💾','Storage','Zite DB + localStorage + Google Drive'],
        ['📄','Reports','HTML → PDF/DOC/TXT with live preview editing'],
        ['📦','Export','JSZip source code + Android Studio project'],
        ['📱','PWA','Installable, offline-capable progressive web app'],
      ].map(([ico,title,desc]) =>
        `<div style="background:rgba(255,255,255,0.02);border:1px solid ${BD};border-radius:12px;padding:14px">
          <span style="font-size:18px">${ico}</span>
          <div style="font-size:13px;font-weight:800;color:${TXT};margin-top:6px">${title}</div>
          <div style="font-size:11px;color:#6b6e82;margin-top:4px;line-height:1.5">${desc}</div>
        </div>`
      ).join('')}
    </div>
  </div>

  <!-- ══════ MASTER PROMPT ══════ -->
  <div class="section">
    <h2 style="font-size:22px;font-weight:900;color:${TXT};margin-bottom:8px">📜 Complete Recreation Prompt</h2>
    <p style="font-size:13px;color:#6b6e82;margin-bottom:16px;font-style:italic">Use this single prompt to recreate the entire app:</p>
    <div style="background:rgba(16,185,129,0.04);border:1px solid rgba(16,185,129,0.18);border-radius:14px;padding:24px">
      <pre style="margin:0;font-size:13px;color:#a1a4b8;line-height:1.9;white-space:pre-wrap;word-wrap:break-word;font-family:'Plus Jakarta Sans',system-ui,sans-serif">Build "Quiz Master Pro" — a premium AI-powered quiz app for students:

1. DESIGN: Dark glassmorphism UI with frosted blur cards, 3 themes (Light/Dark/AMOLED), mobile-first with bottom nav, smooth animations
2. AI QUIZ GENERATION: Paste text/notes/upload PDFs → AI (Gemini/Claude) generates MCQs with options, answers, difficulty, rationales
3. QUIZ MODES: Classic Exam (submit at end) + Instant Feedback (real-time). Timer, negative marking, shuffle, pass mark
4. RESULTS: Animated speedometer gauge, confetti, score breakdown, per-question review with AI explanations
5. REPORTS: 6 downloadable types (Full/Correct/Wrong/Skipped/Notes/Exam) in PDF/DOC/TXT with live preview
6. LIBRARY: Search, filter, pin, subject grouping, file manager with folders, analytics
7. STATS: Weekly heatmap, streak milestones, subject radar, time-of-day, confidence, mastery heatmap
8. PROFILE: Photo avatar, editable name, rank system, 10 tabs (Overview/Notes/Awards/Settings/Downloads/API Keys/Trash...)
9. PRACTICE: Weak questions, spaced repetition, flashcards, bookmarks hub, practice goals
10. AI FEATURES: Chatbot, rationale generation, study notes, "More Like This", question verification
11. CLOUD: Auth, cloud sync, Google Drive backup, email reports, offline support
12. EXPORT: PWA install, APK generator, source code ZIP, Android Studio project, full documentation</pre>
    </div>
  </div>

  <!-- ══════ FOOTER ══════ -->
  <div style="text-align:center;padding:40px 20px;border-top:1px solid rgba(255,255,255,0.05);margin-top:12px">
    <p style="font-size:16px;color:#6b6e82;font-weight:700">🎓 Quiz Master Pro — Premium Edition</p>
    <p style="font-size:12px;color:#3b3e4f;margin-top:12px">${totalScreens} screen previews · ${categories.length} categories · Complete visual documentation · Pure HTML/CSS — no external images</p>
  </div>

</div>
</body>
</html>`;
}

export function downloadAppDocHTML() {
  const html = generateAppDocHTML();
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `quiz-master-pro-documentation-${new Date().toISOString().split('T')[0]}.html`;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAppDocPDF() {
  const html = generateAppDocHTML();
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  setTimeout(() => { win.print(); }, 800);
}
