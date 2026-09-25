import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch(); const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const txt=sel=>p.evaluate(s=>document.querySelector(s).innerText,sel);
await p.goto(URL+'#/landing',{waitUntil:'load'});
await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; save(); location.hash='#/holding/h-ibkr'; }); await p.waitForTimeout(300);

// the Founder's example: the agent-written IBKR value, opened
await p.evaluate(()=>{const h=holdingOf('h-ibkr');S.expanded=h.values[h.values.length-1].id;render(true);}); await p.waitForTimeout(150);
const vx=await txt('#s-holding .vx');
t('opened value: no exchange rate', !/rate|1 USD =/i.test(vx), vx.replace(/\n/g,' | '));
t('opened value: no repeated amounts or changes', !/Default Currency|Amount Change|Percentage Change|797,992/.test(vx));
t('opened value: no "Entered" label, no "(agent)"', !/Entered|\(agent\)/.test(vx));
t('opened value: original currency once', (vx.match(/USD/g)||[]).length===1 && vx.includes('587,580'));
t('opened value: quiet footer names the agent', /Added .+ ago by Claude/.test(vx));
const row=await txt('#s-holding .row.open');
t('value row header does not name the agent', !/claude/i.test(row), row.replace(/\n/g,' | '));
t('no cents on whole amounts', !/\.00\b/.test(await txt('#s-holding')));

// a web value: "Added just now", nobody named
await p.click('[data-act="add-value"]'); await p.waitForTimeout(200);
await p.fill('#v-amount','600000'); await p.click('[data-act="save-value"]'); await p.waitForTimeout(300);
await p.evaluate(()=>{const h=holdingOf('h-ibkr');S.expanded=h.values[h.values.length-1].id;render(true);}); await p.waitForTimeout(150);
t('web value footer: "Added just now"', (await txt('#s-holding .vx')).includes('Added just now'), await txt('#s-holding .vx'));

// agent ink is a quiet mark, never a label, anywhere
for (const h of ['#/home','#/holding/h-ibkr','#/activity','#/insights']) {
  await p.evaluate(hh=>{location.hash=hh;},h); await p.waitForTimeout(250);
  const n=await p.evaluate(()=>{
    const probe=document.createElement('i'); probe.style.color='var(--agent-text)'; document.body.appendChild(probe);
    const ink=getComputedStyle(probe).color; probe.style.color='var(--agent)'; const ink2=getComputedStyle(probe).color; probe.remove();
    return [...document.querySelectorAll('.screen.active *')].filter(e=>[ink,ink2].includes(getComputedStyle(e).color)
      && [...e.childNodes].some(c=>c.nodeType===3 && c.textContent.trim())).length; });
  t(`no agent-ink text on ${h}`, n===0, 'n='+n);
}

// Home: one change figure per row, no cents on the total, no separate comparison button
await p.evaluate(()=>{location.hash='#/home';}); await p.waitForTimeout(250);
const perRow=await p.evaluate(()=>[...document.querySelectorAll('#s-home .o-list .row')].map(r=>r.querySelectorAll('.chg').length));
t('Home rows carry at most one change figure', perRow.every(n=>n<=1), perRow.join(''));
t('net worth has no cents', !/\./.test(await txt('#s-home .nw')), await txt('#s-home .nw'));
t('no "Change comparison" button', !(await txt('#s-home')).includes('Change comparison'));
await p.click('#s-home .nw-chg'); await p.waitForTimeout(200);
t('tapping the change line opens the comparison sheet', (await txt('#sheet')).includes('Comparison'));
await p.evaluate(()=>closeSheet());
const order=await p.evaluate(()=>['.o-trend','.o-pos','.o-list','.o-alloc'].map(s=>Math.round(document.querySelector('#s-home '+s).getBoundingClientRect().top)));
t('phone order: trend → position → holdings → allocation', order.every((y,i)=>!i||y>order[i-1]), order.join(' < '));

// prototype scaffolding lives in the PROTO sheet, not on product screens
await p.evaluate(()=>{S.account.verified=false; save(); location.hash='#/agent';}); await p.waitForTimeout(250);
t('no "(prototype)" controls on the Agent screen', !/prototype/i.test(await txt('#s-agent')));
await p.click('#devbtn'); await p.waitForTimeout(200);
t('PROTO sheet offers Mark email verified', (await txt('#sheet')).includes('Mark email verified'));
await p.click('[data-act="mock-verify"]'); await p.waitForTimeout(200);
t('…and it verifies', await p.evaluate(()=>S.account.verified===true));

// activity: foreign amounts carry their currency code
await p.evaluate(()=>{location.hash='#/activity';}); await p.waitForTimeout(250);
t('activity shows IBKR in USD, not a bare $', (await txt('#s-activity')).includes('IBKR → USD 587,580'));
t('no page errors', !errs.length, errs.join(' | '));
await b.close();
