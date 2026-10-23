import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch(); const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
const p=await ctx.newPage(); const errs=[];
p.on('pageerror',e=>errs.push('pageerror: '+e.message));
p.on('console',m=>{if(m.type()==='error')errs.push('console: '+m.text());});
p.on('dialog', d=>d.accept());
const t=(n,c)=>console.log((c?'PASS':'FAIL')+' — '+n);
const nw=async()=>(await p.textContent('#s-home .nw')).trim();

await p.goto(URL+'#/home',{waitUntil:'load'}); await p.waitForTimeout(250);
const nw0=await nw();
t('home renders a net worth', /^\$[\d,]+/.test(nw0));

// --- add a holding (J2)
await p.goto(URL+'#/add/asset',{waitUntil:'load'}); await p.waitForTimeout(150);
await p.fill('#f-name','Test Gold Bar'); await p.fill('#f-amount','50000');
await p.selectOption('#f-ccy','USD');
await p.click('[data-act="save-holding"]'); await p.waitForTimeout(300);
// J1: saving a new holding returns to Home with the holding listed under the total
t('saving returns to Home with the new holding listed (J1)',
  (await p.evaluate(()=>location.hash)) === '#/home' && (await p.textContent('#s-home')).includes('Test Gold Bar'));
await p.click('#s-home .row:has-text("Test Gold Bar")'); await p.waitForTimeout(300);
t('the new holding opens from Home', (await p.textContent('#s-holding h1')).includes('Test Gold Bar'));
const usdShown=await p.textContent('#s-holding');
t('USD holding converted to SGD (not shown as 50,000)', !/\$50,000\.00/.test(await p.textContent('#s-holding .num')));

// --- add a value (J3)
await p.click('[data-act="add-value"]'); await p.waitForTimeout(250);
await p.fill('#v-amount','60000');
await p.click('[data-act="save-value"]'); await p.waitForTimeout(300);
const rows=await p.$$('#s-holding .card.flush .row');
t('value history now has 2 entries', rows.length===2);

// --- the audit log is a record only (J7)
await p.goto(URL+'#/activity',{waitUntil:'load'}); await p.waitForTimeout(250);
const act=await p.textContent('#s-activity');
t('Activity lists the new value first', (await p.textContent('#s-activity .row')).includes('Test Gold Bar'));
t('an agent turn reads as one group', act.includes('changes at once'));
t('Activity has no Undo, and nothing on it changes data',
  !/undo/i.test(act) && (await p.$$('#s-activity [data-act]')).length===0);

// --- filter (J4)
await p.goto(URL+'#/home',{waitUntil:'load'}); await p.waitForTimeout(250);
const nwBase=await nw();   // re-baseline: the steps above legitimately changed net worth
await p.click('[data-act="open-filter"]'); await p.waitForTimeout(250);
await p.click('[data-act="draft-showonly"][data-v="liabilities"]'); await p.waitForTimeout(150);
await p.click('[data-act="apply-filter"]'); await p.waitForTimeout(300);
const liabOnly=await p.textContent('#s-home');
t('liabilities-only filter changes the total', (await nw())!==nwBase);
t('filter is visible on screen', liabOnly.includes('Filtered'));
await p.click('[data-act="clear-filter"]'); await p.waitForTimeout(250);
t('clearing the filter restores the total', (await nw())===nwBase);

// --- Insights exclusion must NOT change Home (J11)
await p.goto(URL+'#/insights',{waitUntil:'load'}); await p.waitForTimeout(300);
await p.click('[data-act="open-insights-filter"]'); await p.waitForTimeout(250);
await p.click('[data-act="draft-extype"][data-v="t-retirement"]'); await p.waitForTimeout(150);
await p.click('[data-act="apply-filter"]'); await p.waitForTimeout(300);
t('exclusion is shown on Insights', (await p.textContent('#s-insights')).includes('Hidden here'));
await p.goto(URL+'#/home',{waitUntil:'load'}); await p.waitForTimeout(300);
t('Home net worth is unchanged by an Insights exclusion', (await nw())===nwBase);

// --- insights views
for (const v of ['monthly','quarterly','yearly']) {
  await p.goto(URL+'#/insights',{waitUntil:'load'}); await p.waitForTimeout(200);
  await p.click(`[data-act="set-insights-view"][data-v="${v}"]`); await p.waitForTimeout(300);
  const txt=await p.textContent('#s-insights');
  t(`${v} view renders growth + distribution`, txt.includes('growth') && txt.includes('Distribution') && !!(await p.$('#s-insights .chartnav .span')));
}
await b.close();
console.log(errs.length?('\nERRORS:\n'+errs.join('\n')):'\nno console/page errors');
