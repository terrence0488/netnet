import { chromium, devices, shots } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const SP=shots('fab');
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const longHistory = () => { reset('seeded'); S.account.signedIn=true;
  const h=holdingOf('h-ibkr'); const last=h.values[h.values.length-1]; const extra=[];
  for (let i=40;i>=1;i--) extra.push(Object.assign({},last,{id:'x'+i,date:addMonths(last.date,-i-24),amount:last.amount*(0.5+i/100),base:last.base*(0.5+i/100)}));
  h.values=[...extra,...h.values].sort((a,b)=>a.date<b.date?-1:1); save(); location.hash='#/holding/h-ibkr'; };
const geo = p => p.evaluate(()=>{ const f=document.querySelector('.screen.active .fab'); if(!f) return null; const r=f.getBoundingClientRect();
  const tb=document.querySelector('.tabbar'); const tbr=tb&&getComputedStyle(tb).display!=='none'?tb.getBoundingClientRect():null;
  const amt=[...document.querySelectorAll('#s-holding .row .amt')].pop(); const ar=amt&&amt.getBoundingClientRect();
  const lastRow=[...document.querySelectorAll('#s-holding .card.flush > .row')].pop(); const lr=lastRow&&lastRow.getBoundingClientRect();
  const pr=document.querySelector('#devbtn').getBoundingClientRect();
  return { top:r.top, bottom:r.bottom, left:r.left, right:r.right, h:r.height, sunk:f.classList.contains('sunk'), op:getComputedStyle(f).opacity,
    tabTop:tbr?tbr.top:null, amtRight:ar&&ar.right, lastRow:lr&&{top:lr.top,bottom:lr.bottom}, vh:innerHeight, proto:{left:pr.left,right:pr.right,top:pr.top} }; });
const hits = (p, rect) => p.evaluate(r=>{ const e=document.elementFromPoint(r.x, r.y); return e && !!e.closest('.fab'); }, rect);

for (const scheme of ['dark','light']) {
  const ctx=await b.newContext({...devices['iPhone 13'], colorScheme:scheme}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('dialog',d=>d.accept());
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(longHistory); await p.waitForTimeout(400);
  let g = await geo(p);
  t(`[${scheme}] a floating Update, bottom-right, up on arrival`, g && !g.sunk && g.op==='1' && g.bottom <= g.tabTop - 12, g && `bottom ${Math.round(g.bottom)}, tab bar ${Math.round(g.tabTop)}`);
  t(`[${scheme}] aligned to the content's right edge (the amounts' edge)`, Math.abs(g.right - g.amtRight) <= 2, `${Math.round(g.right)} vs ${Math.round(g.amtRight)}`);
  t(`[${scheme}] 48px tall (touch target)`, g.h >= 44, g.h);
  t(`[${scheme}] the only Update on the page`, (await p.$$('#s-holding [data-act="add-value"]')).length===1 && !(await p.$('#s-holding .btn-row')));
  t(`[${scheme}] PROTO moved to the left, clear of it`, g.proto.right < g.left - 8);
  await p.evaluate(()=>scrollTo(0, (document.scrollingElement.scrollHeight - innerHeight)/2)); await p.waitForTimeout(400);
  g = await geo(p);
  t(`[${scheme}] mid-list: still up`, !g.sunk && g.op==='1');
  await p.evaluate(()=>scrollTo(0, document.scrollingElement.scrollHeight)); await p.waitForTimeout(500);
  g = await geo(p);
  t(`[${scheme}] very bottom: it sinks behind the tab bar`, g.sunk && g.op==='0' && g.top >= g.tabTop - 1, `top ${Math.round(g.top)}, tab bar ${Math.round(g.tabTop)}`);
  t(`[${scheme}] very bottom: the last value is uncovered and tappable`, !(await hits(p, { x:g.amtRight-10, y:(g.lastRow.top+g.lastRow.bottom)/2 })));
  await p.screenshot({path:`${SP}/bottom-${scheme}.png`});
  await p.mouse.wheel(0, -120); await p.waitForTimeout(500);
  g = await geo(p);
  t(`[${scheme}] scroll up a little: it resurfaces`, !g.sunk && g.op==='1' && g.bottom <= g.tabTop - 12);
  await p.screenshot({path:`${SP}/up-${scheme}.png`});
  await p.click('.screen.active .fab'); await p.waitForTimeout(300);
  t(`[${scheme}] it opens Add Value`, (await p.textContent('.sheet .sh-head h3')).trim()==='Add Value');
  await p.evaluate(()=>closeSheet()); await p.waitForTimeout(250);
  // after adding a value at the bottom, the state is recomputed
  await p.evaluate(()=>scrollTo(0, document.scrollingElement.scrollHeight)); await p.waitForTimeout(400);
  await p.evaluate(()=>{ const h=holdingOf('h-ibkr'); S.expanded=h.values[0].id; render(true); }); await p.waitForTimeout(400);
  g = await geo(p);
  const atBottom = await p.evaluate(()=>innerHeight + scrollY >= document.scrollingElement.scrollHeight - 4);
  t(`[${scheme}] re-render keeps it right (sunk only if still at the bottom)`, g.sunk === atBottom);
  // keyboard: a sunk button comes back when it takes focus
  await p.evaluate(()=>scrollTo(0, document.scrollingElement.scrollHeight)); await p.waitForTimeout(400);
  await p.keyboard.press('Shift'); await p.evaluate(()=>document.querySelector('.screen.active .fab').focus()); await p.waitForTimeout(400);
  g = await geo(p);
  t(`[${scheme}] keyboard focus brings a sunk button back into view`, g.op==='1' && g.bottom <= g.tabTop, `op ${g.op}`);
  // only on the holding page
  await p.evaluate(()=>location.hash='#/home'); await p.waitForTimeout(300);
  t(`[${scheme}] no floating button on Home`, !(await p.evaluate(()=>{ const f=document.querySelector('.fab'); return f && f.getBoundingClientRect().height>0; })));
  // short holding: one value
  await p.evaluate(()=>{ const h=holdingOf('h-ibkr'); h.values=h.values.slice(-1); save(); location.hash='#/holding/h-ibkr'; }); await p.waitForTimeout(400);
  await p.evaluate(()=>scrollTo(0, document.scrollingElement.scrollHeight)); await p.waitForTimeout(400);
  g = await geo(p);
  t(`[${scheme}] one value: sinks at the bottom too, row uncovered`, g.sunk && !(await hits(p, { x:g.amtRight-10, y:(g.lastRow.top+g.lastRow.bottom)/2 })));
  t(`[${scheme}] no page errors`, !errs.length, errs.join(' | '));
  await ctx.close();
}
// reduced motion: no slide
{ const ctx=await b.newContext({...devices['iPhone 13'], reducedMotion:'reduce'}); const p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(longHistory); await p.waitForTimeout(300);
  t('reduced motion: no slide, it simply goes', await p.evaluate(()=>getComputedStyle(document.querySelector('.screen.active .fab')).transitionDuration.split(',').every(d=>parseFloat(d)===0)));
  await ctx.close(); }
// desktop widths: on the content column's edge, never the far edge of a wide screen
for (const w of [1280, 2000]) {
  const ctx=await b.newContext({viewport:{width:w,height:860}}); const p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'load'}); await p.evaluate(longHistory); await p.waitForTimeout(400);
  const g = await geo(p);
  t(`desktop ${w}px: aligned to the content column, 24px from the bottom`, Math.abs(g.right - g.amtRight) <= 2 && Math.abs(g.vh - g.bottom - 24) <= 1, `${Math.round(g.right)} vs ${Math.round(g.amtRight)}`);
  await p.evaluate(()=>scrollTo(0, document.scrollingElement.scrollHeight)); await p.waitForTimeout(500);
  const g2 = await geo(p);
  t(`desktop ${w}px: sinks off the bottom at the end`, g2.sunk && g2.top >= g2.vh - 1);
  if (w===1280) { await p.evaluate(()=>scrollTo(0,0)); await p.waitForTimeout(400); await p.screenshot({path:`${SP}/desk.png`}); }
  await ctx.close();
}
// a page too short to scroll: stays up, covers nothing
{ const ctx=await b.newContext({viewport:{width:1280,height:1800}}); const p=await ctx.newPage();
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; const h=holdingOf('h-ibkr'); h.values=h.values.slice(-1); save(); location.hash='#/holding/h-ibkr'; }); await p.waitForTimeout(400);
  const g = await geo(p); const scrollable = await p.evaluate(()=>document.scrollingElement.scrollHeight - innerHeight > 4);
  t('short page that cannot scroll: stays up and covers no row', !scrollable && !g.sunk && g.top > g.lastRow.bottom, `scrollable=${scrollable}, fab top ${Math.round(g.top)}, last row bottom ${Math.round(g.lastRow.bottom)}`);
  await ctx.close(); }
await b.close();
