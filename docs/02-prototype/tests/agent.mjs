import { chromium, devices, withFile, PNG_1PX } from './pw.mjs';
import fs from 'fs';
const DIR=decodeURIComponent(new globalThis.URL('..', import.meta.url).pathname).replace(/\/$/, '');
const URL='file://'+DIR+'/index.html';
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const hash=p=>p.evaluate(()=>location.hash);
const evs=p=>p.evaluate(()=>S.events.map(e=>e.name+(e.props.entry?':'+e.props.entry:'')+(e.props.client?':'+e.props.client:'')));
async function toIntro(p, how){
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(()=>{localStorage.removeItem('netnet-proto-locale'); reset('empty');}); await p.waitForTimeout(250);
  if (how==='email'){ await p.fill('#au-email','ana@example.com'); await p.click('[data-act="auth-email"]'); await p.waitForTimeout(200);
    await p.fill('#au-pw','correct horse'); await p.click('[data-act="auth-create"]'); await p.waitForTimeout(250); }
  else { await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250); }
  await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200);
  await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
}

// ================= phone, email sign-up: the full agent route
let ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); let p=await ctx.newPage();
let errs=[]; p.on('pageerror',e=>errs.push(e.message));
await toIntro(p,'email');
t('after location and segment: the intro screen', await hash(p)==='#/welcome/start');
const intro=await p.textContent('#s-auth');
t('it says what the Founder asked for', intro.includes('Let’s start by getting to know a little about your finances.'));
t('one filled button, Start', (await p.$$('#s-auth .btn:not(.sec)')).length===1 && (await p.textContent('#s-auth .btn:not(.sec)')).trim()==='Start');
const alt=await p.$('#s-auth .alt-route');
t('below a rule: "Let your AI agent do this" and an outlined "Connect to agent" with the agent icon', !!alt
  && (await alt.textContent()).includes('Let your AI agent do this') && (await p.getByRole('button', { name:'Connect to agent', exact:true }).count())===1
  && !!(await p.$('#s-auth .alt-route .btn.sec svg')) && await alt.evaluate(e=>getComputedStyle(e).borderTopStyle)==='solid');
await p.click('#s-auth .alt-route .btn'); await p.waitForTimeout(200);
t('→ Which AI agent do you use?', await hash(p)==='#/connect' && (await p.textContent('#s-auth')).includes('Which AI agent do you use?'));
t('…the launch agents (ChatGPT, Claude) plus "Other agent", and no questions link (Back does that)', (await p.$$('[data-act="connect-client"]')).length===3 && !(await p.$('#s-auth [data-act="ob-start"]')));
await p.click('[data-act="connect-client"][data-v="claude"]'); await p.waitForTimeout(200);
t('email sign-up, not yet verified → the gate', (await p.textContent('#s-auth')).includes('Verify your email first') && !(await p.$('.guide-steps')));
await p.click('.proto-mock'); await p.waitForTimeout(200);
t('verified → the setup guide moves on by itself', !!(await p.$('.guide-steps')) && (await p.textContent('#s-auth h1'))==='Connect Claude');
t('on a phone, the phone steps are shown', await p.$eval('.seg.plat .on', e=>e.dataset.v)==='phone' && (await p.textContent('.guide-steps')).includes('In the Claude app'));
const shots=await p.$$eval('.shot', f=>f.map(x=>[x.classList.contains('missing'), x.querySelector('figcaption').textContent]));
t('three steps, each with a screenshot slot; missing ones show the file to drop in', shots.length===3 && shots.every(s=>s[0]) && shots[0][1].includes('connect/claude-phone-1.png'), shots.map(s=>s[1]).join(' | '));
t('the address appears once, with Copy', (await p.$$('.guide-steps .urlbox')).length===1 && (await p.textContent('.guide-steps .urlbox')).includes('https://netnet.app/mcp'));
t('no "I’ve done it" button — it waits for the approval', (await p.textContent('#s-auth')).includes('moves on by itself') && !(await p.$('[data-act="connect"]')));
await p.click('[data-act="set-platform"][data-v="computer"]'); await p.waitForTimeout(150);
t('switch to computer → the computer steps and screenshots', (await p.textContent('.guide-steps')).includes('In Claude, open') && (await p.$eval('.shot figcaption', e=>e.textContent)).includes('claude-computer-1.png'));
await p.click('.proto-mock'); await p.waitForTimeout(200);
t('Claude opens NetNet’s approval page', await hash(p)==='#/connect/claude/allow' && (await p.textContent('#s-auth h1'))==='Claude wants to connect to your NetNet');
await p.click('[data-act="connect-cancel"]'); await p.waitForTimeout(200);
t('Cancel → back to the steps, told why, failure recorded', await hash(p)==='#/connect/claude' && (await p.textContent('#s-auth')).includes('you pressed Cancel')
  && (await evs(p)).some(e=>e.startsWith('agent_connection_failed:onboarding')));
await p.click('.proto-mock'); await p.waitForTimeout(200);
await p.click('[data-act="connect-allow"]'); await p.waitForTimeout(300);
t('Allow → onboarding is done: a blank Home', await hash(p)==='#/home' && await p.evaluate(()=>S.account.onboarded===true && totals(homeHoldings()).now===0));
t('Claude is connected', await p.evaluate(()=>S.account.connections.some(c=>c.active && c.client==='Claude')));
const hint=await p.textContent('#s-home .empty-next');
t('blank Home hint: Claude is connected, with the starting prompt', hint.includes('Claude is connected') && hint.includes('Help me set up NetNet'));
const href=await p.getAttribute('#s-home .empty-next a.btn','href');
t('"Let Claude do it" opens Claude with the prompt typed in', href && href.startsWith('https://claude.ai/new?q=') && decodeURIComponent(href.split('q=')[1]).startsWith('Help me set up NetNet'), href&&href.slice(0,60));
t('one primary action; manual setup is the quiet link', (await p.$$('#s-home .empty-next .btn:not(.ghost)')).length===1 && (await p.textContent('#s-home .empty-next .link')).includes('Or add it yourself'));
const e1=(await evs(p)).reverse();
t('…in that order, all tagged onboarding', JSON.stringify(e1.filter(e=>e.startsWith('agent_connection'))) ===
  JSON.stringify(['agent_connection_started:onboarding:Claude','agent_connection_failed:onboarding:Claude','agent_connection_completed:onboarding:Claude']), e1.filter(e=>e.startsWith('agent_connection')).join(','));
await p.click('#s-home .empty-next .link'); await p.waitForTimeout(250);
t('"Or add it yourself" → the basics', await hash(p)==='#/basics');
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(200);

// Agent tab: connect another; its flow returns to the Agent tab
await p.evaluate(()=>{location.hash='#/agent';}); await p.waitForTimeout(200);
t('Agent tab: Claude connected, "Connect ChatGPT" offered', (await p.textContent('#s-agent')).includes('Connect ChatGPT') && !(await p.textContent('#s-agent')).includes('Connect Claude'));
await p.click('[data-act="connect-start"][data-client="chatgpt"]'); await p.waitForTimeout(200);
t('straight to ChatGPT’s steps (no gate: now verified)', (await p.textContent('#s-auth h1'))==='Connect ChatGPT');
await p.click('#s-auth .back'); await p.waitForTimeout(200);
t('Back → the Agent tab', await hash(p)==='#/agent');
await p.click('[data-act="connect-start"][data-client="chatgpt"]'); await p.waitForTimeout(200);
await p.click('.proto-mock'); await p.waitForTimeout(200); await p.click('[data-act="connect-allow"]'); await p.waitForTimeout(250);
t('Allow → back on the Agent tab with both connected', await hash(p)==='#/agent' && (await p.$$('#s-agent .card h3')).length===2);
t('prototype failure control is gone from the PROTO sheet', !(await p.evaluate(()=>{ sheetProto(); const x=document.getElementById('sheet').textContent; closeSheet(); return x; })).includes('failed agent connection'));
t('no page errors (phone)', !errs.length, errs.join('|'));
await ctx.close();

// ================= provider sign-up: verified, so no gate
ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); p=await ctx.newPage(); errs=[]; p.on('pageerror',e=>errs.push(e.message));
await toIntro(p,'google');
await p.click('#s-auth .alt-route .btn'); await p.waitForTimeout(150); await p.click('[data-act="connect-client"][data-v="chatgpt"]'); await p.waitForTimeout(200);
t('Google account → no email gate, straight to the steps', (await p.textContent('#s-auth h1'))==='Connect ChatGPT');
t('the steps screen has no questions link', !(await p.$('#s-auth [data-act="ob-start"]')));
await p.click('#s-auth .back'); await p.waitForTimeout(200); await p.click('#s-auth .back'); await p.waitForTimeout(200);
t('Back, Back → the intro screen, where Start is', await hash(p)==='#/welcome/start' && !!(await p.$('[data-act="ob-start"]')));
t('no page errors (google)', !errs.length, errs.join('|'));
await ctx.close();

// ================= desktop: computer steps by default; a dropped-in screenshot shows
await withFile(DIR+'/connect/claude-computer-1.png', PNG_1PX, async () => {
  ctx=await b.newContext({viewport:{width:1280,height:900}}); p=await ctx.newPage(); errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(()=>{ reset('seeded'); S.connectPlatform=null; save(); location.hash='#/connect/claude'; }); await p.waitForTimeout(400);
  t('desktop → computer steps by default', await p.$eval('.seg.plat .on', e=>e.dataset.v)==='computer');
  const st=await p.$$eval('.shot', f=>f.map(x=>x.classList.contains('missing')));
  t('a screenshot dropped into connect/ appears; the others stay placeholders', st.join()==='false,true,true', st.join());
  t('no page errors (desktop)', !errs.length, errs.join('|'));
  await ctx.close();
});
await b.close();
