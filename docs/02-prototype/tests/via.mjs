import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:900},colorScheme:'dark'});
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const lastCreated=()=>p.evaluate(()=>{const e=S.events.find(e=>e.name==='holding_created');return e?e.props:null;});

await p.goto(URL+'#/landing',{waitUntil:'load'});
await p.evaluate(()=>{ reset('empty'); S.account.signedIn=true; S.account.onboarded=true; S.account.verified=true; save(); location.hash='#/home'; });
await p.waitForTimeout(400);

// 1. the basics — now a focused onboarding step at #/basics
await p.evaluate(()=>{ S.guide=newGuide(); save(); location.hash='#/basics'; }); await p.waitForTimeout(300);
await p.click('[data-act="guide-yes"]'); await p.waitForTimeout(150);
await p.fill('#g-amount','5000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(250);
let ev=await lastCreated(); t('the basics → via: guided', ev&&ev.via==='guided'&&ev.source==='web', JSON.stringify(ev));

// 2. starter tiles are gone from the empty Home: one action instead
await p.evaluate(()=>{ reset('empty'); S.account.signedIn=true; S.account.onboarded=true; S.account.verified=true; save(); location.hash='#/home'; });
await p.waitForTimeout(400);
t('empty Home has no starter tiles', !(await p.$('[data-act="quick-add"]')));

// 3. plain Add form
await p.goto(URL+'#/add/asset',{waitUntil:'load'}); await p.waitForTimeout(250);
await p.fill('#f-name','Form item'); await p.fill('#f-amount','800');
await p.click('[data-act="save-holding"]'); await p.waitForTimeout(300);
ev=await lastCreated(); t('Add form → via: form', ev&&ev.via==='form', JSON.stringify(ev));

// 4. "Not sure" → undecided (PRD J2)
const before=await p.evaluate(()=>{const x=totals(homeHoldings());return {nw:x.now,acc:x.accessible};});
await p.goto(URL+'#/add/asset',{waitUntil:'load'}); await p.waitForTimeout(250);
await p.selectOption('#f-type','t-property'); await p.waitForTimeout(250);
const notSure=await p.$('[data-act="form-answer"][data-q="unset"]');
t('property asks a fact question with a "Not sure" answer', !!notSure);
if(notSure){ await notSure.click(); await p.waitForTimeout(150); }
await p.fill('#f-name','Unsure flat'); await p.fill('#f-amount','300000');
await p.click('[data-act="save-holding"]'); await p.waitForTimeout(350);
const after=await p.evaluate(()=>{const x=totals(homeHoldings());const h=S.holdings.find(h=>h.name==='Unsure flat');
  return {nw:x.now,acc:x.accessible,access:h&&h.access};});
t('saving with "Not sure" is not blocked, and is stored as undecided', after.access==='unset', 'access='+after.access);
t('undecided COUNTS toward net worth', Math.round(after.nw-before.nw)===300000, `+${Math.round(after.nw-before.nw)}`);
t('undecided NEVER counts toward what you could use', Math.round(after.acc-before.acc)===0, `+${Math.round(after.acc-before.acc)}`);
const home=await p.textContent('#s-home');
t('it is visibly marked as not decided on Home', /not decided/i.test(home));
await b.close(); console.log(errs.length?'\nERRORS: '+errs.join('; '):'\nno page errors');
