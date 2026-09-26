import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
async function start(sim){
  const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(s=>{ localStorage.setItem('netnet-proto-locale', s); reset('empty'); }, sim); await p.waitForTimeout(250);
  await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
  await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200);
  await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(200);
  await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
  return {p, ctx, errs};
}
const q=p=>p.$eval('#s-auth h1', e=>e.textContent);
const step=p=>p.$eval('#s-auth .auth-step', e=>e.textContent);
const yes=async(p,amt)=>{ await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120); await p.fill('#g-amount', String(amt)); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200); };
const no=async p=>{ await p.click('[data-act="guide-no"]'); await p.waitForTimeout(150); };
const hold=(p,name)=>p.evaluate(n=>{const h=S.holdings.find(x=>x.name===n); return h && { access:h.access, type:typeOf(h.typeId).name, reason:(reasonFor(h)||{}).reason, kind:h.kind };}, name);

// ---------- Malaysia
let {p, ctx, errs}=await start('MY');
t('MY: Malaysian pack, MYR', await p.evaluate(()=>[S.account.pack, S.settings.defaultCcy].join())==='my,MYR');
await yes(p,20000);
t('MY money reads RM', (await p.textContent('#s-auth .guide-last')).includes('RM'), await p.textContent('#s-auth .guide-last b + .amount').catch(()=>'')); 
t('MY question 2: EPF', (await q(p))==='Do you have EPF savings?');
await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120);
t('EPF amount asks for Persaraan and Sejahtera', (await q(p))==='Roughly how much in Akaun Persaraan and Akaun Sejahtera?');
await p.fill('#g-amount','150000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200);
let h=await hold(p,'EPF');
t('EPF is locked, with its reason', h && h.access==='locked' && h.reason.startsWith('EPF is locked'), JSON.stringify(h));
t('follow-up: Akaun Fleksibel, same number', (await q(p))==='Anything in Akaun Fleksibel?' && (await step(p))==='What you have · 2 of 6');
await yes(p,15000);
h=await hold(p,'EPF Akaun Fleksibel');
t('Fleksibel counts as usable — the fact decided it', h && h.access==='accessible' && h.reason==='Akaun Fleksibel can be withdrawn at any time', JSON.stringify(h));
await no(p); await no(p);   // investments, home
await yes(p,50000);
t('MY car → car loan follow-up', (await q(p))==='Is there a car loan on it?');
await yes(p,30000);
t('filed under MY’s "Car loan" type', (await hold(p,'Car loan')).type==='Car loan');
t('MY last question names PTPTN', (await q(p)).includes('PTPTN'));
await no(p);
await p.evaluate(()=>{location.hash='#/add/asset';}); await p.waitForTimeout(200);
await p.selectOption('#f-type','t-retirement'); await p.waitForTimeout(200);
t('Add form: an EPF holding is asked the Fleksibel question', (await p.textContent('#f-access')).includes('Is this your EPF Akaun Fleksibel?'));
t('no page errors (MY)', !errs.length, errs.join('|'));
await ctx.close();

// ---------- United Kingdom
({p, ctx, errs}=await start('GB'));
t('GB: UK pack, GBP', await p.evaluate(()=>[S.account.pack, S.settings.defaultCcy].join())==='gb,GBP');
t('GB question 1 mentions savings accounts', (await q(p)).includes('bank or savings account'));
await no(p);
await yes(p,80000);
h=await hold(p,'Pensions');
t('a pension is locked until it can be drawn', h && h.access==='locked' && h.reason.includes('until you can start drawing it'), JSON.stringify(h));
await no(p);   // investments
await yes(p,400000);
t('GB home → "Is there a mortgage on it?"', (await q(p))==='Is there a mortgage on it?');
await yes(p,250000);
t('mortgage is a liability labelled Mortgage', (await hold(p,'Mortgage')).kind==='liability' && (await hold(p,'Mortgage')).type==='Mortgage');
await yes(p,12000);
t('GB car → "Is there finance on it?"', (await q(p))==='Is there finance on it?');
await yes(p,8000);
t('filed under GB’s own "Car finance" type', (await hold(p,'Car finance')).type==='Car finance');
await no(p);
t('GB money reads £', (await p.textContent('#s-home .nw')).includes('£'), await p.textContent('#s-home .nw'));
t('no page errors (GB)', !errs.length, errs.join('|'));
await ctx.close();

// ---------- the sample account: All+1 gone; the out-of-date note, with and without an agent
ctx=await b.newContext({...devices['iPhone 13']}); p=await ctx.newPage(); errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL,{waitUntil:'load'}); await p.evaluate(()=>{ localStorage.removeItem('netnet-proto-locale'); reset('seeded'); }); await p.waitForTimeout(300);
await p.evaluate(()=>{location.hash='#/insights';}); await p.waitForTimeout(200);
t('Insights: no "All+1" range', !(await p.textContent('#s-insights .rangebar')).includes('+1'), await p.textContent('#s-insights .rangebar'));
await p.evaluate(()=>{location.hash='#/home';}); await p.waitForTimeout(200);
const a=await p.$('#s-home .note.warn a');
t('agent connected → "Ask Claude to update it", a prompt with no data', !!a && (await a.textContent()).trim()==='Ask Claude to update it'
  && decodeURIComponent((await a.getAttribute('href')).split('q=')[1])==='Some of my NetNet holdings are out of date. Find them and help me update them.');
await p.evaluate(()=>{ S.account.connections.forEach(c=>c.active=false); save(); render(); }); await p.waitForTimeout(150);
t('no agent → "Connect your agent to keep it current"', (await p.textContent('#s-home .note.warn')).includes('Connect your agent to keep it current'));
await p.click('#s-home .note.warn [data-act="connect-start"]'); await p.waitForTimeout(200);
t('…which opens the connect flow, not the demo chat', await p.evaluate(()=>location.hash)==='#/connect');
t('no page errors (sample)', !errs.length, errs.join('|'));
await ctx.close(); await b.close();
