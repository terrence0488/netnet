import { chromium, devices, shots } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const SP=shots('ovf');
const b=await chromium.launch();
const dev = process.argv[2] || 'iPhone 13';
const ctx=await b.newContext({...(dev==='desk'?{viewport:{width:1280,height:860}}:devices[dev])}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
await p.goto(URL,{waitUntil:'load'});
const audit = name => p.evaluate(name=>{
  const out=[]; const vw=innerWidth;
  if (document.scrollingElement.scrollWidth > vw + 1) out.push(`page scrolls sideways (${document.scrollingElement.scrollWidth} > ${vw})`);
  const vis = e => { const r=e.getBoundingClientRect(); const cs=getComputedStyle(e); return r.width>0 && r.height>0 && cs.visibility!=='hidden' && cs.opacity!=='0'; };
  // text sticking out of the viewport (ignoring carousels, which scroll sideways by design)
  document.querySelectorAll('body *').forEach(e=>{ if(!vis(e) || e.closest('.carousel') || e.closest('.sheet:not(.on)')) return;
    if ([...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) { const r=e.getBoundingClientRect(); if (r.right > vw + 1 || r.left < -1) out.push(`off-screen: "${e.textContent.trim().slice(0,30)}" (${Math.round(r.left)}–${Math.round(r.right)})`); } });
  // siblings in a row that collide
  const rows = '.axis, .xl, .bl, .rangebar, .tabbar-inner, .seg, .legend, .section-h, .topbar, .row, .chart-h, .kv, .vx-foot, .sh-head, .auth-foot, .pager, .conseq, .nw-wrap, .empty-next';
  document.querySelectorAll(rows).forEach(row=>{ if(!vis(row)) return; const kids=[...row.children].filter(vis);
    for (let i=0;i<kids.length;i++) for (let j=i+1;j<kids.length;j++){ const a=kids[i].getBoundingClientRect(), c=kids[j].getBoundingClientRect();
      const ox=Math.min(a.right,c.right)-Math.max(a.left,c.left), oy=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);
      if (ox>1 && oy>1 && getComputedStyle(kids[i]).position!=='absolute' && getComputedStyle(kids[j]).position!=='absolute')
        out.push(`collide in ${row.className||row.tagName}: "${kids[i].textContent.trim().slice(0,20)}" × "${kids[j].textContent.trim().slice(0,20)}"`); } });
  // one-line labels that wrap
  document.querySelectorAll('.axis > span, .xl > div, .bl > div, .rangebar button, .tab, .seg button, .label, .section-h h2, .section-h .link, .chip, .nw-label, .yt, .legend div, .navitem, .btn, .ph-label, .chart-h .chartnav span').forEach(e=>{
    if(!vis(e) || e.closest('.sheet:not(.on)')) return;
    const w=document.createTreeWalker(e, NodeFilter.SHOW_TEXT); const tops=new Set(); let n;
    while((n=w.nextNode())){ if(!n.textContent.trim() || n.parentElement.closest('[aria-hidden="true"]')) continue; const r=document.createRange(); r.selectNodeContents(n);
      [...r.getClientRects()].filter(x=>x.width>0).forEach(x=>tops.add(Math.round(x.top/4))); }
    if (tops.size>1) out.push(`wraps: "${e.textContent.trim().slice(0,30)}"`); });
  // text that wraps into truncation: ellipsis elements that actually truncate
  document.querySelectorAll('*').forEach(e=>{ const cs=getComputedStyle(e); if(cs.textOverflow==='ellipsis' && vis(e) && e.scrollWidth>e.clientWidth+1) out.push(`truncated: "${e.textContent.trim().slice(0,30)}"`); });
  return out;
}, name);
let total=0;
const check = async (name, setup) => {
  await p.evaluate(setup); await p.waitForTimeout(350);
  const o = await audit(name); total += o.length;
  console.log((o.length?'ISSUES':'OK    ')+' — '+name+(o.length?'\n    '+[...new Set(o)].slice(0,8).join('\n    '):''));
  await p.screenshot({path:`${SP}/${dev.replace(/ /g,'')}-${name.replace(/[^a-z0-9]+/gi,'_')}.png`, fullPage:true});
};
const seeded = h => `reset('seeded'); S.account.signedIn=true; save(); location.hash='${h}'; render();`;
await check('signup', ()=>{ reset('empty'); location.hash='#/signup'; render(); });
await check('login', ()=>{ reset('seeded'); S.account.signedIn=false; save(); location.hash='#/login'; render(); });
await check('region', ()=>{ reset('empty'); S.account.signedIn=true; S.account.email='a@b.co'; save(); location.hash='#/welcome'; render(); });
await check('segment', ()=>{ location.hash='#/welcome/2'; render(); });
await check('intro', ()=>{ S.account.obStep='start'; save(); location.hash='#/welcome/start'; render(); });
await check('basics', ()=>{ S.guide=newGuide(); S.account.obStep='basics'; save(); location.hash='#/basics'; render(); });
await check('connect list', ()=>{ S.account.verified=true; save(); location.hash='#/connect'; render(); });
await check('connect claude', ()=>{ location.hash='#/connect/claude'; render(); });
await check('connect muse', ()=>{ location.hash='#/connect/muse'; render(); });
await check('connect allow', ()=>{ location.hash='#/connect/claude/allow'; render(); });
await check('empty home', ()=>{ reset('empty'); Object.assign(S.account,{signedIn:true,onboarded:true}); save(); location.hash='#/home'; render(); });
await check('home', new Function(seeded('#/home')));
await check('home sorted by %', ()=>{ S.settings.sort='chg-pct'; save(); render(); });
await check('holding', new Function(seeded('#/holding/h-ibkr')));
await check('holding opened value', ()=>{ const h=holdingOf('h-ibkr'); S.expanded=h.values[h.values.length-1].id; render(true); });
await check('insights monthly', new Function(seeded('#/insights')));
await check('insights quarterly', ()=>{ S.settings.insightsView='quarterly'; save(); render(); });
await check('insights yearly', ()=>{ S.settings.insightsView='yearly'; save(); render(); });
await check('period', ()=>{ location.hash='#/period/monthly/0'; render(); });
await check('agent', new Function(seeded('#/agent')));
await check('agent chat', ()=>{ location.hash='#/agent/chat'; render(); });
await check('activity', ()=>{ location.hash='#/activity'; render(); });
await check('account', ()=>{ location.hash='#/account'; render(); });
await check('sheet add value', ()=>{ location.hash='#/holding/h-ibkr'; render(); sheetValue('h-ibkr', null); });
await check('sheet filter', ()=>{ closeSheet(); location.hash='#/home'; render(); sheetFilter(false); });
await check('sheet insights filter', ()=>{ closeSheet(); S.draft=null; location.hash='#/insights'; render(); sheetFilter(true); });
await check('sheet ask agent', ()=>{ closeSheet(); location.hash='#/holding/h-ibkr'; render(); sheetAskAgent('h-ibkr'); });
await check('sheet proto', ()=>{ closeSheet(); sheetProto(); });
console.log(`\n${dev}: ${total} issues; page errors: ${errs.join(' | ')||'none'}`);
await b.close();
