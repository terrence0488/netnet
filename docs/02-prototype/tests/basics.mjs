import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
async function start(sim){
  const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(s=>{ s ? localStorage.setItem('netnet-proto-locale', s) : localStorage.removeItem('netnet-proto-locale'); reset('empty'); }, sim);
  await p.waitForTimeout(250);
  await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
  await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200);
  await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
  await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
  return {p, ctx, errs};
}
const q=p=>p.$eval('#s-auth h1', e=>e.textContent);
const step=p=>p.$eval('#s-auth .auth-step', e=>e.textContent);
const yes=async(p,amt)=>{ await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(120); await p.fill('#g-amount', String(amt)); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200); };
const no=async p=>{ await p.click('[data-act="guide-no"]'); await p.waitForTimeout(150); };

// ---------- Singapore: its own questions, follow-ups, its own car-loan type
let {p, ctx, errs}=await start('');
t('SG basics open on question 1 of 6', (await step(p))==='What you have · 1 of 6');
t('one question: Yes, No, Skip, Back and one way out — nothing else on screen', (await p.$$('#s-auth button')).length===5, (await p.$$eval('#s-auth button', b=>b.map(x=>x.textContent.trim()))).join(' / '));
await yes(p,5000);
t('a yes is saved at once, with its consequence', (await p.textContent('#s-auth .guide-last')).includes('Added Bank accounts') && await p.evaluate(()=>S.holdings.length)===1);
await no(p); await no(p);   // CPF, investments
t('question 4: own home', (await q(p))==='Do you own the home you live in?' && (await step(p))==='What you have · 4 of 6');
await yes(p,800000);
t('yes to a home → follow-up: home loan, same number', (await q(p))==='Is there a home loan on it?' && (await step(p))==='What you have · 4 of 6');
await yes(p,300000);
const hl=await p.evaluate(()=>{const h=S.holdings.find(x=>x.name==='Home loan'); return h && [h.kind, typeOf(h.typeId).name];});
t('home loan is a liability of type "Home loan"', hl && hl[0]==='liability' && hl[1]==='Home loan', String(hl));
t('question 5: car', (await q(p))==='Do you own a car?');
await yes(p,60000);
t('yes to a car → follow-up: car loan (SG only)', (await q(p))==='Is there a car loan on it?');
await yes(p,40000);
const cl=await p.evaluate(()=>{const h=S.holdings.find(x=>x.name==='Car loan'); return h && [h.typeId, typeOf(h.typeId).name];});
t('car loan is filed under SG’s own "Car loan" type', cl && cl[0]==='t-car_loan' && cl[1]==='Car loan', String(cl));
t('last: anything else owed, 6 of 6', (await q(p)).startsWith('Anything else you owe') && (await step(p))==='What you have · 6 of 6');
await no(p);
t('end of the basics → Home, onboarded', await p.evaluate(()=>location.hash)==='#/home' && await p.evaluate(()=>S.account.onboarded===true));
const home=await p.textContent('#s-home');
t('Home shows the picture and no questions', !!(await p.$('#s-home .ledger')) && !/Do you have|The basics|Rather have your agent/.test(home));
t('SG account has "Car loan" among its types', await p.evaluate(()=>S.types.some(t=>typeName(t)==='Car loan')));
t('no page errors (SG)', !errs.length, errs.join('|'));
await ctx.close();

// ---------- a country on the common default: no car-loan question, no car-loan type
({p, ctx, errs}=await start('DE'));
t('Germany: 1 of 6 on the common default', (await step(p))==='What you have · 1 of 6');
await no(p); await no(p); await no(p); await no(p);   // bank, pension, investments, home
t('question 5: car', (await q(p))==='Do you own a car?');
await yes(p,20000);
t('yes to a car → no car-loan follow-up; straight to anything owed', (await q(p)).startsWith('Do you owe anything'), await q(p));
t('no "Car loan" type outside its pack', await p.evaluate(()=>!S.types.some(t=>typeName(t)==='Car loan')));
// leave mid-way, come back: resumes the basics
await p.evaluate(()=>{ S.account.signedIn=false; save(); location.hash='#/login'; }); await p.waitForTimeout(200);
await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
t('logging in mid-basics resumes the basics, where it was', await p.evaluate(()=>location.hash)==='#/basics' && (await q(p)).startsWith('Do you owe anything'));
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
// moving to Singapore later adds its type, removes nothing
await p.evaluate(()=>{ location.hash='#/sub/general'; }); await p.waitForTimeout(200);
const nTypes=await p.evaluate(()=>S.types.length);
await p.selectOption('[data-act="set-region"]','SG'); await p.waitForTimeout(200);
t('switching to Singapore adds "Car loan", removes nothing', await p.evaluate(()=>S.types.some(t=>t.key==='car_loan')) && await p.evaluate(()=>S.types.length)===nTypes+1);
t('no page errors (DE)', !errs.length, errs.join('|'));
await ctx.close();

// ---------- empty Home: one action and one quiet alternative
({p, ctx, errs}=await start(''));
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
const acts=await p.$$eval('#s-home .btn, #s-home .link, #s-home [data-act], #s-home [data-go]', els=>[...new Set(els)].map(e=>e.textContent.trim()||e.getAttribute('title')));
t('empty Home: one filled button; the agent below a rule; plus the + in the top bar', acts.length===3 && (await p.$$('#s-home .btn:not(.sec)')).length===1
  && (await p.textContent('#s-home .alt-route')).includes('Let your AI agent do this'), acts.join(' / '));
t('no starter tiles, no questions, no agent card', !(await p.$('#s-home .cats')) && !(await p.$('#s-home [data-act="guide-yes"]')) && !(await p.textContent('#s-home')).includes('Let your agent assemble it'));
await p.click('[data-act="basics-start"]'); await p.waitForTimeout(250);
t('"Add what you have" → the basics from the top', await p.evaluate(()=>location.hash)==='#/basics' && (await step(p))==='What you have · 1 of 6');
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(200);
await p.click('#s-home .alt-route .btn'); await p.waitForTimeout(200);
t('"Connect to agent" → choose an agent', await p.evaluate(()=>location.hash)==='#/connect');
t('no page errors (empty)', !errs.length, errs.join('|'));
await ctx.close(); await b.close();
