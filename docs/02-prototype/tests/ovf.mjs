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
  // a control's parts spill out of it (a segmented control wider than its tray)
  document.querySelectorAll('.seg').forEach(s=>{ if(!vis(s) || s.closest('.sheet:not(.on)')) return; const r=s.getBoundingClientRect();
    [...s.children].filter(vis).forEach(k=>{ const c=k.getBoundingClientRect(); if (c.left<r.left-1 || c.right>r.right+1) out.push(`spills out of its control: "${k.textContent.trim().slice(0,20)}"`); }); });
  // a field wider than the column it sits in (iOS gives date inputs an intrinsic width)
  document.querySelectorAll('.field input, .field select, .field textarea, .field .pw, .field .amt-in').forEach(e=>{ if(!vis(e) || e.closest('.sheet:not(.on)')) return;
    const f=e.closest('.field').getBoundingClientRect(), r=e.getBoundingClientRect(); if (r.right>f.right+1) out.push(`field wider than its column: ${e.id||e.className||e.tagName}`); });
  // text touching the edge of a drawn card (a card with an outline or a fill needs inner padding)
  document.querySelectorAll('.card').forEach(card=>{ if(!vis(card)) return; const cs=getComputedStyle(card);
    if (parseFloat(cs.borderLeftWidth)===0 && cs.backgroundColor==='rgba(0, 0, 0, 0)') return;
    const r=card.getBoundingClientRect();
    card.querySelectorAll('*').forEach(e=>{ if(!vis(e) || ![...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim())) return;
      const t=document.createRange(); t.selectNodeContents(e); const b=t.getBoundingClientRect();
      if (b.width && (b.left<r.left+8 || b.right>r.right-8)) out.push(`text on the card's edge: "${e.textContent.trim().slice(0,24)}"`); });
    card.querySelectorAll('input[type=checkbox]').forEach(e=>{ if(!vis(e)) return; const b=e.getBoundingClientRect();
      if (b.left<r.left+8 || b.right>r.right-8) out.push(`control on the card's edge: ${e.dataset.v||'checkbox'}`); }); });
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
await check('view settings', ()=>{ location.hash='#/sub/view'; render(); });
await check('notifications', ()=>{ location.hash='#/sub/notifications'; render(); });
await check('notifications asking', ()=>{ S.notif.asking='settings'; save(); render(true); });
await check('notifications blocked', ()=>{ S.notif.asking=null; S.notif.perm='denied'; save(); render(true); });
await check('sheet add value', ()=>{ location.hash='#/holding/h-ibkr'; render(); setTimeout(()=>sheetValue('h-ibkr', null), 60); });
await check('sheet filter', ()=>{ closeSheet(); location.hash='#/home'; render(); setTimeout(()=>sheetFilter(false), 60); });
await check('sheet insights filter', ()=>{ closeSheet(); S.draft=null; location.hash='#/insights'; render(); setTimeout(()=>sheetFilter(true), 60); });
await check('sheet ask agent', ()=>{ closeSheet(); location.hash='#/holding/h-ibkr'; render(); setTimeout(()=>sheetAskAgent('h-ibkr'), 60); });
await check('sheet proto', ()=>{ closeSheet(); sheetProto(); });
await check('home push card', ()=>{ closeSheet(); reset('seeded'); location.hash='#/home'; render(); setTimeout(()=>document.querySelector('.nudge').scrollIntoView(), 60); });
await check('home push asking', ()=>{ S.notif.asking='home'; save(); render(true); });
await check('home push on', ()=>{ S.notif.asking=null; S.notif.flash={ where:'home', result:'granted' }; save(); render(true); });
await check('home push blocked', ()=>{ S.notif.flash={ where:'home', result:'denied' }; save(); render(true); });
await check('outside push', ()=>{ S.notif.flash=null; S.notif.perm='default'; save(); sheetProto(); document.querySelector('#sheet [data-act="sim-away"]').click(); });
await check('outside push + computer', ()=>{ closeSheet(); S.notif.thisOn=true; S.notif.devices=[{ id:'d-mac', label:'Mac · Chrome', platform:'computer', lastUsed:new Date().toISOString() }]; save(); sheetProto(); document.querySelector('#sheet [data-act="sim-away"]').click(); });
await check('outside email', ()=>{ closeSheet(); S.notif.thisOn=false; S.notif.devices=[]; save(); sheetProto(); document.querySelector('#sheet [data-act="sim-away"]').click(); });
await check('outside security', ()=>{ closeSheet(); sheetOutside('m-sec-claude'); });
console.log(`\n${dev}: ${total} issues; page errors: ${errs.join(' | ')||'none'}`);
await b.close();
