import { chromium, devices, shots } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const SP=shots('lc');
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const wait = ms => new Promise(r=>setTimeout(r,ms));
const state = (p, sel) => p.evaluate(s=>{ const el=document.querySelector(s); const tip=el.querySelector('.lc-tip'); const pr=el.getBoundingClientRect();
  const tr=tip&&tip.getBoundingClientRect();
  return { reading:el.classList.contains('reading'), i:el._i, n:JSON.parse(el.dataset.lc).x.length, tip:tip&&tip.innerText.replace(/\n/g,' | '),
    inside: tr ? (tr.left >= pr.left - 1 && tr.right <= pr.right + 1) : null, live:document.querySelector('#lc-live').textContent,
    expect: el._i!=null ? (()=>{ const d=JSON.parse(el.dataset.lc); return [fmtDate(d.x[el._i]), ...d.s.map(s=>money(s.y[el._i]))]; })() : null }; }, sel);

// ---------- phone
{ const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage(); const cdp=await ctx.newCDPSession(p);
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; S.settings.range=0; save(); location.hash='#/home'; render(); }); await p.waitForTimeout(400);
  const H='#s-home .o-trend .lc';
  const box = await p.$eval(H, e=>{ const r=e.querySelector('.lc-layer').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  t('phone: three dates under the chart, none wrapping', (await p.$$eval('#s-home .o-trend .axis span', a=>a.length))===3);
  await p.touchscreen.tap(box.x + box.w*0.6, box.y + box.h*0.5); await p.waitForTimeout(200);
  let s = await state(p, H);
  t('tap: the reading appears at the nearest point', s.reading && s.i===Math.round(0.6*(s.n-1)), `i=${s.i} of ${s.n}`);
  t('tap: date and value are that point\'s', s.tip.includes(s.expect[0]) && s.tip.includes(s.expect[1]), s.tip);
  t('tap: screen readers hear it', s.live.includes(s.expect[0]) && s.live.includes(s.expect[1]));
  await p.screenshot({path:`${SP}/phone-home.png`, clip:{x:0,y:box.y-60,width:390,height:box.h+130}});
  await p.touchscreen.tap(200, 40); await p.waitForTimeout(200);
  t('touching elsewhere clears it', !(await state(p, H)).reading);
  // press, hold, drag: scrubs, and the page does not scroll
  const y0 = await p.evaluate(()=>scrollY);
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type==='touchEnd'?[]:[{x, y}] });
  await tp('touchStart', box.x + box.w*0.2, box.y + box.h*0.5); await wait(300);
  for (let k=1;k<=8;k++) { await tp('touchMove', box.x + box.w*(0.2+k*0.08), box.y + box.h*0.5 + k*3); await wait(30); }
  s = await state(p, H);
  t('press, hold, drag: scrubs along the line', s.reading && s.i===Math.round(0.84*(s.n-1)), `i=${s.i}`);
  await tp('touchEnd'); await wait(150);
  t('scrubbing does not scroll the page', (await p.evaluate(()=>scrollY))===y0);
  t('lifting the finger leaves the reading', (await state(p, H)).reading);
  await p.touchscreen.tap(200, 40); await p.waitForTimeout(150);
  // a plain swipe up still scrolls the page and reads nothing
  await tp('touchStart', box.x + box.w*0.5, box.y + box.h*0.8);
  for (let k=1;k<=8;k++) { await tp('touchMove', box.x + box.w*0.5, box.y + box.h*0.8 - k*25); await wait(16); }
  await tp('touchEnd'); await wait(400);
  t('a plain swipe scrolls the page and reads nothing', (await p.evaluate(()=>scrollY)) > y0 && !(await state(p, H)).reading, `scrollY ${await p.evaluate(()=>scrollY)}`);
  // holding page: the chart sits in a carousel
  await p.evaluate(()=>{ S.settings.detailRange=0; S.detailCard=0; save(); location.hash='#/holding/h-ibkr'; }); await p.waitForTimeout(400);
  const D='#detail-carousel .lc';
  const db = await p.$eval(D, e=>{ const r=e.querySelector('.lc-layer').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  await tp('touchStart', db.x + db.w*0.7, db.y + db.h*0.5); await wait(300);
  for (let k=1;k<=8;k++) { await tp('touchMove', db.x + db.w*(0.7-k*0.07), db.y + db.h*0.5); await wait(30); }
  s = await state(p, D);
  const sl1 = await p.$eval('#detail-carousel', e=>e.scrollLeft);
  t('holding chart: press-hold-drag scrubs', s.reading && sl1===0, `i=${s.i}, scrollLeft ${sl1}`);
  await tp('touchEnd'); await wait(100); await p.touchscreen.tap(200, 40); await wait(150);
  // liability: the reading carries the sign the page uses
  await p.evaluate(()=>{ S.detailCard=0; save(); location.hash='#/holding/h-hdbloan'; render(); }); await p.waitForTimeout(400);
  const lb = await p.$eval(D, e=>{ const r=e.querySelector('.lc-layer').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; }).catch(()=>null);
  if (lb) { await p.touchscreen.tap(lb.x + lb.w*0.5, lb.y + lb.h*0.5); await wait(200); s = await state(p, D);
    t('a liability reads with its minus sign', /−\$/.test(s.tip), s.tip); }
  else t('a liability reads with its minus sign', false, 'no h-hdbloan chart');
  t('phone: no page errors', !errs.length, errs.join(' | '));
  await ctx.close(); }

// ---------- desktop: mouse and keyboard
{ const ctx=await b.newContext({viewport:{width:1280,height:900}}); const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL,{waitUntil:'load'});
  await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; S.settings.range=0; save(); location.hash='#/home'; render(); }); await p.waitForTimeout(400);
  const H='#s-home .o-trend .lc';
  t('desktop: four dates under the chart', (await p.$$eval('#s-home .o-trend .axis span', a=>a.length))===4);
  const box = await p.$eval(H, e=>{ const r=e.querySelector('.lc-layer').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  await p.mouse.move(box.x + box.w*0.3, box.y + box.h*0.5); await p.waitForTimeout(100);
  let s = await state(p, H);
  t('hover: reads the nearest point', s.reading && s.i===Math.round(0.3*(s.n-1)) && s.tip.includes(s.expect[1]), s.tip);
  await p.mouse.move(box.x + box.w*0.9, box.y + box.h*0.5); await p.waitForTimeout(100);
  s = await state(p, H);
  t('hover: follows the pointer; the readout flips left near the right edge and stays inside', s.i===Math.round(0.9*(s.n-1)) && s.inside);
  await p.mouse.move(box.x + box.w*0.999, box.y + box.h*0.5); await p.waitForTimeout(100);
  t('last point: readout inside the chart', (await state(p, H)).inside);
  await p.mouse.move(box.x + 1, box.y + box.h*0.5); await p.waitForTimeout(100);
  t('first point: readout inside the chart', (await state(p, H)).inside);
  await p.screenshot({path:`${SP}/desk-home.png`, clip:{x:box.x-60,y:box.y-40,width:box.w+80,height:box.h+80}});
  await p.mouse.move(box.x + box.w*0.5, box.y + box.h + 120); await p.waitForTimeout(100);
  t('leaving the chart clears it', !(await state(p, H)).reading);
  // keyboard
  await p.evaluate(s=>{ const el=document.querySelector(s); el.previousElementSibling ? 0 : 0; }, H);
  await p.keyboard.press('Tab'); for (let k=0;k<30 && !(await p.evaluate(s=>document.activeElement===document.querySelector(s), H)); k++) await p.keyboard.press('Tab');
  s = await state(p, H);
  t('keyboard: focusing the chart reads the latest point', s.reading && s.i===s.n-1);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); s = await state(p, H);
  t('keyboard: ← steps back', s.i===s.n-3);
  await p.keyboard.press('Home'); s = await state(p, H); t('keyboard: Home goes to the first point', s.i===0);
  await p.keyboard.press('Escape'); t('keyboard: Esc clears', !(await state(p, H)).reading);
  // Insights: every series at that date, largest first
  await p.evaluate(()=>{ location.hash='#/insights'; }); await p.waitForTimeout(400);
  const I='#s-insights .lc';
  const ib = await p.$eval(I, e=>{ const r=e.querySelector('.lc-layer').getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  await p.mouse.move(ib.x + ib.w*0.95, ib.y + ib.h*0.5); await p.waitForTimeout(100);
  s = await state(p, I);
  const rows = await p.$$eval(I+' .lc-tip .lc-s', a=>a.map(r=>r.innerText.replace(/\n/g,' ')));
  t('Insights: one readout lists all three series, largest first', rows.length===3 && /Assets$/.test(rows[0]) && /Net worth$/.test(rows[1]) && /Liabilities$/.test(rows[2]), rows.join(' / '));
  t('Insights: each series keyed by a short line in its colour', await p.$$eval(I+' .lc-tip .lc-s i', a=>a.every(i=>i.getBoundingClientRect().height<=3 && getComputedStyle(i).backgroundColor!=='rgba(0, 0, 0, 0)')));
  await p.screenshot({path:`${SP}/desk-ins.png`, clip:{x:ib.x-60,y:ib.y-50,width:ib.w+80,height:ib.h+90}});
  t('desktop: no page errors', !errs.length, errs.join(' | '));
  await ctx.close(); }
await b.close();
