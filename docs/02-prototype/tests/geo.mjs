import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const run=async (tz, sim)=>{
  const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:tz}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(s=>{ s ? localStorage.setItem('netnet-proto-locale', s) : localStorage.removeItem('netnet-proto-locale'); reset('empty'); }, sim);
  await p.waitForTimeout(250);
  await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(300);
  return {p, errs, ctx};
};
const alpha=a=>a.every((x,i)=>!i||a[i-1].localeCompare(x,'en')<=0);

// detected Singapore (stand-in: time zone)
let {p, errs, ctx}=await run('Asia/Singapore', '');
t('SG detected → pre-selected', (await p.textContent('#s-auth .choice button.on'))==='Singapore');
await p.click('[data-act="ob-other"]'); await p.waitForTimeout(200);
const opts=await p.$$eval('#ob-region option', o=>o.map(x=>x.textContent).filter(x=>x!=='Choose…'));
t('Somewhere else: every other country', opts.length===248, 'n='+opts.length);
t('…alphabetical', alpha(opts), opts.slice(0,4).join(', ')+' … '+opts.slice(-2).join(', '));
t('…Singapore is not on top (and not in the list at all)', opts[0]!=='Singapore' && !opts.includes('Singapore'));
await p.selectOption('#ob-region','BR'); await p.waitForTimeout(150);
t('choosing Brazil → totals in BRL', (await p.textContent('#s-auth .auth-ccy')).includes('BRL'));
await p.click('[data-act="ob-ccy-open"]'); await p.waitForTimeout(100);
const cc=await p.$$eval('#ob-ccy option', o=>o.map(x=>x.textContent));
t('currency list: the chosen one first, then alphabetical', cc[0]==='BRL' && alpha(cc.slice(1)) && cc.length>100, cc.slice(0,4).join(',')+' n='+cc.length);
await ctx.close();

// simulated IP: Germany → generic pack, EUR
({p, errs, ctx}=await run('Asia/Singapore', 'DE'));
t('IP says Germany → Germany pre-selected (overrides the time zone)', (await p.textContent('#s-auth .choice button.on'))==='Germany');
t('…totals default to EUR', (await p.textContent('#s-auth .auth-ccy')).includes('EUR'));
await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200); await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(250);
const acc=await p.evaluate(()=>[S.account.region, S.account.pack, S.settings.defaultCcy]);
t('Germany is recorded as Germany, on the generic pack', acc.join()==='DE,generic,EUR', acc.join());
await p.evaluate(()=>{location.hash='#/sub/general';}); await p.waitForTimeout(200);
const gen=await p.$$eval('[data-act="set-region"] option', o=>o.map(x=>x.textContent));
t('Account → General: all countries, alphabetical, Germany selected', gen.length===249 && alpha(gen) && await p.$eval('[data-act="set-region"]', s=>s.value)==='DE');
await p.evaluate(()=>{location.hash='#/add/asset';}); await p.waitForTimeout(200);
t('Add form currency starts with EUR', await p.$eval('#f-ccy', s=>s.options[0].textContent + '/' + s.value)==='EUR/EUR');
t('no page errors', !errs.length, errs.join('|'));
await ctx.close();

// not detected, no helpful time zone → must choose from the alphabetical list
({p, errs, ctx}=await run('Pacific/Auckland', 'none'));
const o2=await p.$$eval('#ob-region option', o=>o.map(x=>x.textContent).filter(x=>x!=='Choose…'));
t('nothing detected → full alphabetical list, nothing pre-selected', o2.length===249 && alpha(o2) && !(await p.$('#s-auth .choice')) && await p.$eval('#ob-region', s=>s.value)==='');
await ctx.close(); await b.close();
