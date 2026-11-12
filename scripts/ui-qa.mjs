/**
 * UI regression suite (real Chrome, touch emulation): quiz header fit in 4 viewports, swipe navigation,
 * every quiz popup/menu, pause, submit, exit, results action tiles, and system-bar inset handling.
 * Run: npm run build && npm run test:ui   (screenshots go to the OS temp dir under qmp-ui-qa/)
 */
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { preview } from 'vite';
import { chromium } from 'playwright-core';
const SHOTS = path.join(os.tmpdir(), 'qmp-ui-qa'); fs.mkdirSync(SHOTS, { recursive: true });
const server = await preview({ configFile: path.resolve('vite.config.ts'), preview: { port: 4200, strictPort: true, host: '127.0.0.1' } });
const browser = await chromium.launch({ channel: 'chrome', args: ['--no-sandbox'] });
const n=6;
const mk=(extra={},settings={})=>({quizData:Array.from({length:n},(_,i)=>({question:`Question number ${i+1}: which option is correct?`,options:['Alpha','Beta','Gamma','Delta'],correctAnswer:'Alpha',difficulty:'easy',rationale:'Because Alpha.'})),settings:{mode:'submit',timerMode:'off',quizTitle:'QA',marksPerQuestion:1,...settings},currentIndex:0,userAnswers:new Array(n).fill(null),flaggedQuestions:new Array(n).fill(false),accumulatedTime:0,timeLeftPerQ:[],forcedNext:new Array(n).fill(false),totalTimeLeft:0,savedAt:Date.now(),...extra});
const results=[]; const ok=(name,pass,info='')=>{results.push({name,pass,info}); console.log((pass?'PASS ':'FAIL ')+name+(info?'  — '+info:''));};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const qNum=page=>page.evaluate(()=>document.querySelector('.qh-title')?.textContent?.replace(/[^Q\d/]/g,'').trim());
async function boot(w,h,session,{dpr=2}={}){
  const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:dpr,hasTouch:true});
  const page=await ctx.newPage(); const errs=[]; page.on('pageerror',e=>errs.push(String(e))); page.on('console',m=>{if(m.type()==='error'&&!/ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|status of 404/.test(m.text()))errs.push('console: '+m.text().slice(0,160))});
  await page.addInitScript(s=>{localStorage.setItem('qmp_active_session',JSON.stringify(s));localStorage.setItem('qmp_onboarding_done','true')},session);
  await page.goto('http://127.0.0.1:4200/'); await page.waitForTimeout(1100);
  await page.getByRole('button',{name:/resume/i}).first().click(); await page.waitForTimeout(900);
  const cdp=await ctx.newCDPSession(page);
  return {ctx,page,cdp,errs};
}
async function swipe(cdp,x1,y1,x2,y2,ms=140){const st=7;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});for(let i=1;i<=st;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*i/st,y:y1+(y2-y1)*i/st}]});await sleep(ms/st);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(450);}

// ─── 1. Header fit in 4 viewports
for (const [label,w,h] of [['phone portrait 360x740',360,740],['phone landscape 800x360',800,360],['tablet portrait 800x1280',800,1280],['tablet landscape 1280x800',1280,800]]) {
  const {ctx,page,errs}=await boot(w,h,mk());
  const m=await page.evaluate(()=>{const vw=innerWidth;const bs=[...document.querySelectorAll('.qh-row button, .qh-pill')].map(b=>b.getBoundingClientRect()).filter(r=>r.width>0);return {maxRight:Math.round(Math.max(...bs.map(r=>r.right))),minLeft:Math.round(Math.min(...bs.map(r=>r.left))),vw,overflow:document.documentElement.scrollWidth>vw+1,exit:!!document.querySelector('[aria-label="Exit quiz"]'),flagInline:!!document.querySelector('.qh-actions > [aria-label*="lag"]'),headerH:Math.round(document.querySelector('.qh').getBoundingClientRect().height)}});
  ok(`header fits — ${label}`, m.maxRight<=m.vw && m.minLeft>=0 && !m.overflow && m.exit && !m.flagInline, JSON.stringify(m));
  await page.screenshot({path:`${SHOTS}/qa_hdr_${w}x${h}.png`});
  ok(`no JS errors — ${label}`, errs.length===0, errs.join(' | ').slice(0,200));
  await ctx.close();
}

// ─── 2. Swipes + menu + dialogs on phone
{
  const {ctx,page,cdp,errs}=await boot(360,740,mk());
  const cy=300;
  await swipe(cdp,300,cy,60,cy); ok('swipe LEFT → next (Q2)', (await qNum(page))==='Q2/6', await qNum(page));
  await swipe(cdp,60,cy,300,cy); ok('swipe RIGHT → previous (Q1)', (await qNum(page))==='Q1/6', await qNum(page));
  await swipe(cdp,60,cy,300,cy); ok('swipe RIGHT on Q1 → stays', (await qNum(page))==='Q1/6');
  await swipe(cdp,300,cy,60,cy,1500); ok('slow drag (<0.3px/ms) is ignored', (await qNum(page))==='Q1/6');
  await swipe(cdp,200,cy,200,cy+250); ok('vertical swipe is ignored', (await qNum(page))==='Q1/6');
  for(let i=0;i<5;i++) await swipe(cdp,300,cy,60,cy);
  ok('swipe LEFT ×5 reaches last Q6', (await qNum(page))==='Q6/6', await qNum(page));
  await swipe(cdp,300,cy,60,cy); ok('swipe LEFT on last → stays', (await qNum(page))==='Q6/6');
  // ⋯ menu
  await page.getByRole('button',{name:'More options'}).click(); await page.waitForTimeout(200);
  ok('menu has Flag/Edit/Settings/Zoom', (await page.getByRole('menuitem').allInnerTexts()).join('|').match(/Flag.*Edit.*settings.*zoom/is)!==null, (await page.getByRole('menuitem').allInnerTexts()).join('|'));
  await page.getByRole('menuitem',{name:/Flag for review/}).click(); await page.waitForTimeout(250);
  ok('flag from menu sets dot on ⋯', await page.locator('.qh-flagdot').count()===1);
  await page.getByRole('button',{name:'More options'}).click(); await page.waitForTimeout(150);
  ok('menu now says Remove flag', (await page.getByRole('menuitem',{name:/Remove flag/}).count())===1);
  await page.getByRole('menuitem',{name:/Remove flag/}).click(); await page.waitForTimeout(200);
  ok('flag removed', await page.locator('.qh-flagdot').count()===0);
  await page.getByRole('button',{name:'More options'}).click(); await page.getByRole('menuitem',{name:/Edit question/}).click(); await page.waitForTimeout(600);
  const editOpen=await page.evaluate(()=>!!document.querySelector('[role=dialog], .question-edit-modal, [data-qedit]')||/Edit Question|Save/i.test(document.body.innerText));
  ok('Edit question opens a modal', editOpen); await page.screenshot({path:SHOTS+'/qa_edit_modal.png'});
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  await page.getByRole('button',{name:'More options'}).click(); await page.getByRole('menuitem',{name:/Interface zoom/}).click(); await page.waitForTimeout(300);
  ok('Zoom panel opens from menu', await page.locator('.zoom-control-group').count()===1);
  await page.mouse.click(180,500); await page.waitForTimeout(200);
  // pause
  await page.getByRole('button',{name:'Pause quiz'}).click(); await page.waitForTimeout(300);
  ok('Pause shows overlay', /Quiz Paused/.test(await page.evaluate(()=>document.body.innerText)));
  await page.getByRole('button',{name:'Resume quiz'}).first().click(); await page.waitForTimeout(300);
  ok('Resume hides overlay', !/Quiz Paused/.test(await page.evaluate(()=>document.body.innerText)));
  // answer + tap-to-clear + submit dialog
  await page.getByRole('radio',{name:/Alpha/}).click(); await page.getByRole('radio',{name:/Alpha/}).click();
  ok('tap selected option clears it', (await page.getByRole('radio',{name:/Alpha/}).getAttribute('aria-checked'))==='false');
  await page.getByRole('radio',{name:/Alpha/}).click();
  await page.getByRole('button',{name:/Submit All/}).click(); await page.waitForTimeout(400);
  ok('Submit dialog opens', /Submit All Answers\?/.test(await page.evaluate(()=>document.body.innerText)));
  const dlg=await page.evaluate(()=>{const d=document.querySelector('[role=alertdialog]').getBoundingClientRect();return {l:Math.round(d.left),r:Math.round(d.right),vw:innerWidth}});
  ok('Submit dialog fits screen', dlg.l>=0 && dlg.r<=dlg.vw, JSON.stringify(dlg));
  await page.getByRole('button',{name:'Go Back'}).click(); await page.waitForTimeout(300);
  ok('Go Back closes dialog, still in quiz', (await qNum(page))==='Q6/6');
  // Exit dialog: continue → not paused; escape → not paused
  await page.getByRole('button',{name:'Exit quiz'}).click(); await page.waitForTimeout(400);
  ok('Exit dialog opens', /Leave this quiz\?/.test(await page.evaluate(()=>document.body.innerText)));
  const d2=await page.evaluate(()=>{const d=document.querySelector('[role=alertdialog]').getBoundingClientRect();return {l:Math.round(d.left),r:Math.round(d.right),vw:innerWidth}});
  ok('Exit dialog fits screen', d2.l>=0 && d2.r<=d2.vw, JSON.stringify(d2));
  await page.keyboard.press('Escape'); await page.waitForTimeout(400);
  ok('Esc on Exit dialog resumes quiz (not left paused)', !/Quiz Paused/.test(await page.evaluate(()=>document.body.innerText)));
  await page.getByRole('button',{name:'Exit quiz'}).click(); await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Continue'}).click(); await page.waitForTimeout(300);
  ok('Continue resumes quiz', !/Quiz Paused/.test(await page.evaluate(()=>document.body.innerText)) && (await qNum(page))==='Q6/6');
  // submit for real → results
  await page.getByRole('button',{name:/Submit All/}).click(); await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Submit Quiz'}).click(); await page.waitForTimeout(2500);
  const onResults=await page.evaluate(()=>/Total Qs|Keep Practicing|Good Effort|Outstanding|Great Job|Perfect Score/.test(document.body.innerText));
  ok('Submit Quiz → results screen', onResults);
  await page.waitForTimeout(3500);
  const acts=await page.evaluate(()=>{const g=document.querySelector('.res-actions');if(!g)return null;const r=[...g.children].map(c=>Math.round(c.getBoundingClientRect().top));return {tiles:g.children.length,rows:new Set(r).size,vw:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,right:Math.round(Math.max(...[...g.children].map(c=>c.getBoundingClientRect().right)))}});
  ok('results actions: portrait phone = 2-row grid', acts && acts.rows===2 && !acts.overflow && acts.right<=acts.vw, JSON.stringify(acts));
  await page.locator('.res-actions').scrollIntoViewIfNeeded(); await page.screenshot({path:SHOTS+'/qa_results_phone.png'});
  ok('no JS errors — phone flows', errs.length===0, errs.join(' | ').slice(0,300));
  await ctx.close();
}
// ─── 3. results on landscape + tablets
for (const [label,w,h,expectRows] of [['phone landscape 800x360',800,360,1],['tablet portrait 800x1280',800,1280,2],['tablet landscape 1280x800',1280,800,1]]) {
  const {ctx,page,errs}=await boot(w,h,mk({userAnswers:['Alpha','Beta','Alpha',null,'Gamma','Alpha']}));
  await page.getByRole('button',{name:/Submit All/}).click(); await page.waitForTimeout(300);
  await page.getByRole('button',{name:'Submit Quiz'}).click(); await page.waitForTimeout(4200);
  const acts=await page.evaluate(()=>{const g=document.querySelector('.res-actions');if(!g)return null;const r=[...g.children].map(c=>Math.round(c.getBoundingClientRect().top));return {tiles:g.children.length,rows:new Set(r).size,vw:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth+1,right:Math.round(Math.max(...[...g.children].map(c=>c.getBoundingClientRect().right))),left:Math.round(Math.min(...[...g.children].map(c=>c.getBoundingClientRect().left)))}});
  ok(`results actions rows=${expectRows} — ${label}`, acts && acts.rows===expectRows && !acts.overflow && acts.right<=acts.vw && acts.left>=0, JSON.stringify(acts));
  await page.evaluate(()=>window.scrollTo(0,0)); await page.waitForTimeout(300);
  await page.screenshot({path:`${SHOTS}/qa_results_${w}x${h}.png`});
  // button actions work
  const share=page.getByRole('button',{name:'Share'}); if(await share.count()){ await share.first().click(); await page.waitForTimeout(700); ok(`Share opens — ${label}`, await page.evaluate(()=>/Share|Download|Copy/i.test(document.body.innerText)&&!!document.querySelector('[class*="fixed"]')) ); await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  ok(`no JS errors — results ${label}`, errs.length===0, errs.join(' | ').slice(0,300));
  await ctx.close();
}
// ─── 4. inset simulation
{
  const {ctx,page,cdp}=await boot(800,1280,mk());
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:34,left:0,bottom:0,right:0}}); await page.waitForTimeout(300);
  let pad=await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.qh')).paddingTop));
  ok('env() inset 34 → header padded ≈38px (zoom-compensated)', pad>=34 && pad<=40, String(pad));
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:0,bottom:0,right:0}});
  await page.evaluate(()=>document.documentElement.style.setProperty('--qmp-native-inset-top','40px')); await page.waitForTimeout(200);
  pad=await page.evaluate(()=>parseFloat(getComputedStyle(document.querySelector('.qh')).paddingTop));
  ok('native (MainActivity) inset 40 → header padded ≈44px', pad>=40 && pad<=46, String(pad));
  await page.screenshot({path:SHOTS+'/qa_inset.png',clip:{x:0,y:0,width:800,height:200}});
  await ctx.close();
}
const f=results.filter(r=>!r.pass); console.log(`\n${results.length-f.length}/${results.length} passed`); if(f.length) console.log('FAILED:\n'+f.map(x=>' - '+x.name+' '+x.info).join('\n'));
await browser.close(); await server.close();

process.exit(results.some(r => !r.pass) ? 1 : 0);
