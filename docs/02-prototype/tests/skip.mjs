import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
async function toIntro(){
  const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(()=>{ localStorage.removeItem('netnet-proto-locale'); reset('empty'); }); await p.waitForTimeout(250);
  await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
  await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200); await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
  return {p, ctx, errs};
}
const q=p=>p.$eval('#s-auth h1', e=>e.textContent);
const skip=async p=>{ await p.click('[data-act="guide-skip"]'); await p.waitForTimeout(150); };
const n=p=>p.evaluate(()=>S.holdings.length);

// ================= Skip
let {p, ctx, errs}=await toIntro();
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
t('every question offers Skip, under Yes and No', (await p.$$eval('#s-auth button', b=>b.map(x=>x.textContent.trim()))).join('|')==='‹ Back|Done for now|Yes|No|Skip');
await skip(p);
t('Skip → next question, nothing added', (await q(p))==='Do you have CPF savings?' && await n(p)===0);
await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(150);
t('the amount screen offers Skip too ("I don’t know how much")', !!(await p.$('#s-auth [data-act="guide-skip"]')));
await skip(p);
t('Skip on the amount → next question, nothing added', (await q(p)).startsWith('Any investments') && await n(p)===0);
await skip(p);   // investments
t('question: own home', (await q(p))==='Do you own the home you live in?');
await skip(p);
t('skipping the home → its home-loan follow-up is not asked', (await q(p))==='Do you own a car?');
await p.click('#s-auth .basics-top .back'); await p.waitForTimeout(200);
t('Back returns to a skipped question, unanswered', (await q(p))==='Do you own the home you live in?' && !!(await p.$('[data-act="guide-yes"]')));
await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120); await p.fill('#g-amount','700000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200);
t('answering it now brings its follow-up', (await q(p))==='Is there a home loan on it?' && await n(p)===1);
await skip(p); await skip(p); await skip(p);   // home loan, car, owed
t('skipping to the end → Home, with only what was answered', await p.evaluate(()=>location.hash)==='#/home' && await n(p)===1);
t('no page errors (skip)', !errs.length, errs.join('|'));
await ctx.close();

// ================= Other agent
({p, ctx, errs}=await toIntro());
await p.click('#s-auth .alt-route .btn'); await p.waitForTimeout(200);
t('"Other agent" is offered, with the generic agent icon', (await p.textContent('[data-act="connect-client"][data-v="other"]')).trim()==='Other agent'
  && !!(await p.$('[data-act="connect-client"][data-v="other"] .alogo svg')));
await p.click('[data-act="connect-client"][data-v="other"]'); await p.waitForTimeout(200);
const g=await p.textContent('#s-auth');
t('generic guide: "Connect your agent", the MCP requirement, the address', (await q(p))==='Connect your agent' && g.includes('remote MCP server with sign-in (OAuth)') && (await p.textContent('.guide-steps .urlbox')).includes('https://netnet.app/mcp'));
t('no phone/computer switch and no screenshot slots', !(await p.$('.seg.plat')) && !(await p.$('.shot')));
t('no questions link at the bottom', !(await p.$('#s-auth [data-act="ob-start"]')));
await p.click('.proto-mock'); await p.waitForTimeout(200);
t('approval page: "Your AI agent wants to connect"', (await q(p))==='Your AI agent wants to connect to your NetNet');
await p.click('[data-act="connect-allow"]'); await p.waitForTimeout(250);
const home=await p.textContent('#s-home .empty-next');
t('blank Home: "Your agent is connected", with Copy the prompt (no link to open it)', home.includes('Your agent is connected') && (await p.textContent('#s-home .empty-next .btn:not(.ghost)')).trim()==='Copy the prompt');
await p.evaluate(()=>{location.hash='#/agent';}); await p.waitForTimeout(200);
const tab=await p.textContent('#s-agent');
t('Agent tab: "Your agent" connected, "Connect another agent" still offered, the named agents too', tab.includes('Your agent') && tab.includes('Connect another agent') && tab.includes('Connect Claude'));
t('no page errors (other)', !errs.length, errs.join('|'));
await ctx.close(); await b.close();
