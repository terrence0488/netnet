import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const lum=c=>{const [r,g,bb]=c.match(/[\d.]+/g).slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*bb;};
const ratio=(a,c)=>{const [x,y]=[lum(a),lum(c)].sort((m,n)=>n-m);return (x+.05)/(y+.05);};
for (const scheme of ['dark','light']) {
  const ctx=await b.newContext({...devices['iPhone 13'], colorScheme:scheme, permissions:['clipboard-read','clipboard-write']}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  const connect = cl => p.evaluate(cl=>{ reset('empty'); Object.assign(S.account,{signedIn:true,onboarded:true,obStep:null,verified:true});
    S.account.connections=[{id:'c1',client:CLIENTS[cl].name,connectedAt:new Date().toISOString(),lastCall:new Date().toISOString(),active:true}]; save(); location.hash='#/home'; render(); }, cl);
  const card = sel => p.evaluate(s=>{ const e=document.querySelector(s+' .prompt-card'); if(!e) return null; const cs=getComputedStyle(e);
    const paper=getComputedStyle(document.body).backgroundColor;
    return { text:e.querySelector('.pc-text').textContent, shadow:cs.boxShadow, bg:cs.backgroundColor, paper, ink:getComputedStyle(e.querySelector('.pc-text')).color,
      copy:!!e.querySelector('[data-act="copy-prompt"]'), n:document.querySelectorAll(s+' .prompt-card').length }; }, sel);

  // agent without a prefilled-prompt link (the Founder's screen)
  await connect('other'); await p.waitForTimeout(250);
  let c = await card('#s-home');
  t(`[${scheme}] blank Home: the prompt is a card`, c && c.n===1 && c.text.startsWith('Help me set up NetNet'));
  t(`[${scheme}] the card is raised: a shadow and its own surface`, c && c.shadow!=='none' && c.bg!==c.paper, c && c.bg+' on '+c.paper);
  t(`[${scheme}] prompt text readable on the card (≥ 7:1)`, c && ratio(c.ink,c.bg)>=7, c && ratio(c.ink,c.bg).toFixed(1));
  t(`[${scheme}] no Copy inside the card when the primary is Copy`, c && !c.copy && (await p.textContent('#s-home .empty-next .btn')).trim()==='Copy the prompt');
  await p.click('#s-home .empty-next .btn'); await p.waitForTimeout(100);
  t(`[${scheme}] Copy the prompt copies it`, (await p.evaluate(()=>navigator.clipboard.readText())).startsWith('Help me set up NetNet'));
  t(`[${scheme}] the old boxed prompt is gone`, !(await p.$('.urlbox.prompt')));

  // agent with a link: Copy moves into the card, the primary opens the agent
  await connect('claude'); await p.waitForTimeout(250);
  c = await card('#s-home');
  t(`[${scheme}] Claude: Copy inside the card, "Let Claude do it" is the primary`, c && c.copy && (await p.textContent('#s-home a.btn')).trim()==='Let Claude do it');

  // Ask your agent sheet
  await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; save(); location.hash='#/holding/h-ibkr'; }); await p.waitForTimeout(250);
  await p.evaluate(()=>sheetAskAgent('h-ibkr')); await p.waitForTimeout(300);
  c = await card('.sheet');
  t(`[${scheme}] Ask your agent: the prompt is the same card, with Copy`, c && c.copy && c.text.includes('“IBKR”'));
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(200);

  // Muse, whose first step was a message card, is parked until after launch: not reachable
  await p.evaluate(()=>{ location.hash='#/connect/muse'; render(); }); await p.waitForTimeout(250);
  t(`[${scheme}] Muse is parked: its address shows the agent list, no setup card`, !(await p.$('.guide-steps')) && (await p.textContent('#s-auth h1'))==='Which AI agent do you use?');
  await p.evaluate(()=>{ S.connectPlatform='phone'; save(); location.hash='#/connect/claude'; render(); }); await p.waitForTimeout(250);
  t(`[${scheme}] Claude's guide keeps the address box, no card`, !!(await p.$('.guide-steps .urlbox')) && !(await p.$('.guide-steps .prompt-card')));
  t(`[${scheme}] no page errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}
// forced colours: the shadow goes, the edge stays
const fc=await b.newContext({...devices['iPhone 13'], forcedColors:'active'}); const q=await fc.newPage();
await q.goto(URL,{waitUntil:'load'});
await q.evaluate(()=>{ reset('empty'); Object.assign(S.account,{signedIn:true,onboarded:true,verified:true}); S.account.connections=[{id:'c1',client:'Claude',connectedAt:new Date().toISOString(),lastCall:new Date().toISOString(),active:true}]; save(); location.hash='#/home'; render(); }); await q.waitForTimeout(300);
t('Forced colours: the card keeps a visible border', await q.evaluate(()=>{ const cs=getComputedStyle(document.querySelector('.prompt-card')); return cs.borderTopStyle==='solid' && parseFloat(cs.borderTopWidth)>=1; }));
await fc.close();
await b.close();
