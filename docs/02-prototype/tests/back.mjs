import { chromium, devices, withFile } from './pw.mjs';
import fs from 'fs';
const DIR=decodeURIComponent(new globalThis.URL('..', import.meta.url).pathname).replace(/\/$/, '');
const URL='file://'+DIR+'/index.html';
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
async function toIntro(opts={}){
  const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore', ...opts}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(()=>{ localStorage.removeItem('netnet-proto-locale'); reset('empty'); }); await p.waitForTimeout(250);
  await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
  await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200); await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
  return {p, ctx, errs};
}
const hash=p=>p.evaluate(()=>location.hash);
const q=p=>p.$eval('#s-auth h1', e=>e.textContent);
const back=async p=>{ await p.click('#s-auth .basics-top .back'); await p.waitForTimeout(200); };
const yes=async(p,a)=>{ await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120); await p.fill('#g-amount',String(a)); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200); };
const no=async p=>{ await p.click('[data-act="guide-no"]'); await p.waitForTimeout(150); };
const n=p=>p.evaluate(()=>S.holdings.length);

// ================= Back
let {p, ctx, errs}=await toIntro();
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
t('the questions show no Connect-to-agent button', !(await p.$('#s-auth .alt-route')) && !(await p.$('#s-auth [data-act="connect-start"]')));
t('a Back button at the top of every question', !!(await p.$('#s-auth .basics-top .back')));
await back(p);
t('Back on the first question → the intro screen, where the agent route is', await hash(p)==='#/welcome/start' && !!(await p.$('#s-auth .alt-route')));
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
await yes(p,5000);
t('yes → saved, next question', await n(p)===1 && (await q(p))==='Do you have CPF savings?');
await back(p);
t('Back → the previous question, showing what was entered', (await q(p)).startsWith('Roughly how much') && await p.inputValue('#g-amount')==='5000' && (await p.textContent('[data-act="guide-add"]'))==='Save');
await p.fill('#g-amount','6000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200);
t('Save corrects it in place — still one holding, now 6,000', await n(p)===1 && await p.evaluate(()=>S.holdings[0].values[0].amount)===6000);
t('…and carries on where they were', (await q(p))==='Do you have CPF savings?');
await no(p);
t('no → next', (await q(p)).startsWith('Any investments'));
await back(p); await back(p);
t('Back twice → the bank question again', (await q(p)).startsWith('Roughly how much'));
await back(p);
t('Back on an amount → its yes/no', (await q(p))==='Do you have money in a bank account?');
await no(p);
t('changing a yes to no removes what it added, logged', await n(p)===0 && await p.evaluate(()=>S.log.some(e=>e.kind==='holding.delete')));
t('…and skips what was already answered', (await q(p)).startsWith('Any investments'));
await no(p); await yes(p,800000); await yes(p,300000);   // investments no, home yes, home loan yes
await yes(p,60000); await yes(p,40000);                 // car yes, car loan yes
t('at the last question with home, home loan, car, car loan', (await q(p)).startsWith('Anything else') && await n(p)===4);
await back(p); await back(p); await back(p); await back(p);   // car loan (amount→ask), car (amount→ask)
t('walked back to the car question', (await q(p))==='Do you own a car?', await q(p));
await no(p);
t('no car → the car and its car loan both go', await n(p)===2 && await p.evaluate(()=>!S.holdings.some(h=>/Car/.test(h.name))));
t('…and the car-loan question is not asked', (await q(p)).startsWith('Anything else'));
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
t('Done for now → Home with home and home loan', await hash(p)==='#/home' && await n(p)===2);
t('no page errors (back)', !errs.length, errs.join('|'));
await ctx.close();

// from the empty Home, Back on the first question returns Home
({p, ctx, errs}=await toIntro());
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(200); await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
await p.click('[data-act="basics-start"]'); await p.waitForTimeout(250);
await back(p);
t('basics opened from the empty Home: Back on question 1 → Home', await hash(p)==='#/home');
await ctx.close();

// ================= the agent roll
({p, ctx, errs}=await toIntro());
const on=()=>p.$eval('#s-auth .agent-roll', r=>[...r.children].findIndex(x=>x.classList.contains('on')));
t('the button starts on the generic agent icon', await on()===0 && (await p.$$('#s-auth .agent-roll > i')).length===3);
t('"Works with ChatGPT and Claude, or any agent that supports MCP."', (await p.textContent('#s-auth .alt-sub'))==='Works with ChatGPT and Claude, or any agent that supports MCP.');
const seen=[await on()];
await p.waitForTimeout(1000); seen.push(await on()); for (let k=0;k<5;k++){ await p.waitForTimeout(2050); seen.push(await on()); }
t('the agent icon holds its first 2 seconds, then ChatGPT → Claude, every 2 seconds, and round again', seen.join()==='0,0,1,2,0,1,2', seen.join());
const marks=await p.$$eval('#s-auth .agent-roll .alogo', l=>l.map(x=>x.classList.contains('missing')));
t('ChatGPT and Claude show their logos', marks.join()==='false,false', JSON.stringify(marks));
t('screen readers hear "Connect to agent", not the logos', (await p.getByRole('button', { name:'Connect to agent', exact:true }).count())===1);
await p.click('#s-auth .alt-route .btn'); await p.waitForTimeout(200);
const rows=await p.$$eval('[data-act="connect-client"]', l=>l.map(x=>x.textContent.trim()));
t('each agent row is announced by its name alone', (await p.getByRole('button', { name:'Claude', exact:true }).count())===1);
t('the choice list shows ChatGPT, Claude and "Other agent", each with a logo', rows.length===3 && (await p.$$('[data-act="connect-client"] .alogo')).length===3 && rows[2].endsWith('Other agent'), rows.join(' | '));
t('Grok and Muse are parked: not offered', !(await p.$('[data-act="connect-client"][data-v="grok"]')) && !(await p.$('[data-act="connect-client"][data-v="muse"]')));
for (const id of ['grok','muse']) { await p.evaluate(id=>{ location.hash='#/connect/'+id; }, id); await p.waitForTimeout(200);
  t(`…and ${id}'s address shows the list instead`, (await p.textContent('#s-auth h1'))==='Which AI agent do you use?' && (await p.$$('[data-act="connect-client"]')).length===3); }
await p.click('[data-act="connect-client"][data-v="other"]'); await p.waitForTimeout(200);
await p.click('.proto-mock'); await p.waitForTimeout(150); await p.click('[data-act="connect-allow"]'); await p.waitForTimeout(250);
t('an agent with no prefilled-prompt link → Home offers "Copy the prompt"', (await p.textContent('#s-home .empty-next .btn:not(.ghost)')).trim()==='Copy the prompt');
t('no page errors (roll)', !errs.length, errs.join('|'));
await ctx.close();

// reduced motion: the roll stays still
({p, ctx, errs}=await toIntro({reducedMotion:'reduce'}));
await p.waitForTimeout(4300);
t('reduced motion → it stays on the agent icon', await p.$eval('#s-auth .agent-roll', r=>[...r.children].findIndex(x=>x.classList.contains('on')))===0);
await ctx.close();

// a missing logo shows the agent's initial, and a file dropped into agents/ is used at once.
// Every launch agent has its file, so a stand-in agent ("zed") is added to the roll for this.
const withZed=p=>p.evaluate(()=>{ CLIENTS.zed={ name:'Zed', deepLink:null, guides:{} }; ROLL.push('zed'); render(); });
({p, ctx, errs}=await toIntro()); await withZed(p); await p.waitForTimeout(300);
let st=await p.$$eval('#s-auth .agent-roll .alogo', l=>l.map(x=>[x.classList.contains('missing'), x.querySelector('b').textContent]));
t('a logo file not yet dropped in shows the initial', st.map(m=>m[0]).join()==='false,false,true' && st[2][1]==='Z', JSON.stringify(st));
await ctx.close();
await withFile(DIR+'/agents/zed.svg', '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>', async () => {
  ({p, ctx, errs}=await toIntro()); await withZed(p);
  await p.waitForTimeout(300);
  st=await p.$$eval('#s-auth .agent-roll .alogo', l=>l.map(x=>x.classList.contains('missing')));
  t('a logo dropped into agents/ is used at once', st.join()==='false,false,false', st.join());
  await ctx.close();
});
await b.close();
