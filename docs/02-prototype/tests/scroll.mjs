import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const ctx=await b.newContext({...devices['iPhone 13']});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const count=name=>p.evaluate(n=>S.events.filter(e=>e.name===n).length,name);
const sy=()=>p.evaluate(()=>Math.round(window.scrollY));

await p.goto(URL+'#/landing',{waitUntil:'load'});
await p.evaluate(()=>{ reset('seeded'); S.events=[]; save(); });
await p.evaluate(()=>{location.hash='#/home';}); await p.reload({waitUntil:'load'}); await p.waitForTimeout(300);
t('session_started fires on first signed-in render', await count('session_started')===1);

// Insights: scroll to Distribution Over Time, then page the chart
await p.click('#tabbar [data-tab="#/insights"]'); await p.waitForTimeout(300);
const iv0=await count('insights_viewed');
t('insights_viewed fires on opening Insights', iv0===1, 'n='+iv0);
const navs=await p.$$('.chartnav');
const last=navs[navs.length-1];
await last.scrollIntoViewIfNeeded(); await p.evaluate(()=>window.scrollBy(0,-120)); await p.waitForTimeout(100);
const y0=await sy();
await p.tap('.chartnav >> nth=-1 >> [data-v="1"]'); await p.waitForTimeout(200);
const y1=await sy();
t('Insights pager (earlier) keeps scroll position', y0>200 && Math.abs(y1-y0)<=2, `before ${y0} after ${y1}`);
t('…and it actually paged', await p.evaluate(()=>S.insightsPage)===1);
await p.tap('.chartnav >> nth=-1 >> [data-v="-1"]'); await p.waitForTimeout(200);
t('Insights pager (later) keeps scroll position', Math.abs(await sy()-y0)<=2, 'after '+await sy());
t('pager does not count as a view', await count('insights_viewed')===iv0, 'n='+await count('insights_viewed'));

// disabled › is inert and hit-testable
const dis=await p.$('.chartnav >> nth=-1 >> [data-v="-1"]');
const st=await dis.evaluate(e=>({aria:e.getAttribute('aria-disabled'),pe:getComputedStyle(e).pointerEvents,ta:getComputedStyle(e).touchAction,dis:e.disabled}));
t('disabled › is aria-disabled, not [disabled]', st.aria==='true' && st.dis===false, JSON.stringify(st));
t('disabled › stays hit-testable with touch-action manipulation', st.pe!=='none' && st.ta==='manipulation');
const box=await dis.boundingBox();
const hit=await p.evaluate(({x,y})=>{const e=document.elementFromPoint(x,y);return e&&e.closest('button')?e.closest('button').getAttribute('aria-label'):e&&e.className;},{x:box.x+box.width/2,y:box.y+box.height/2});
t('a tap on the disabled › lands on the button itself', hit==='Later periods', hit);
await p.tap('.chartnav >> nth=-1 >> [data-v="-1"]',{force:true}); await p.tap('.chartnav >> nth=-1 >> [data-v="-1"]',{force:true}); await p.waitForTimeout(200);
t('double-tap on disabled › does nothing', await p.evaluate(()=>S.insightsPage)===0 && Math.abs(await sy()-y0)<=2);

// view switch counts as a view; range does not
await p.evaluate(()=>window.scrollTo(0,0));
await p.tap('[data-act="set-insights-view"]:not(.on)'); await p.waitForTimeout(200);
t('switching view fires insights_viewed', await count('insights_viewed')===iv0+1);
const rb=await p.$('[data-act="set-insights-range"]:not(.on)');
if(rb){ await rb.tap(); await p.waitForTimeout(200); t('range change does not fire insights_viewed', await count('insights_viewed')===iv0+1); }

// route change still scrolls to top
await p.evaluate(()=>window.scrollTo(0,600)); await p.waitForTimeout(80);
await p.tap('#tabbar [data-tab="#/home"]'); await p.waitForTimeout(300);
t('route change scrolls to top', await sy()===0, 'y='+await sy());
t('returning Home does not re-fire session_started', await count('session_started')===1, 'n='+await count('session_started'));
await p.tap('#tabbar [data-tab="#/insights"]'); await p.waitForTimeout(300);
t('re-opening Insights fires insights_viewed again', await count('insights_viewed')===iv0+2);

// Home range bar keeps position
await p.tap('#tabbar [data-tab="#/home"]'); await p.waitForTimeout(300);
const rbar=await p.$('.rangebar button:not(.on)');
await rbar.scrollIntoViewIfNeeded(); await p.evaluate(()=>window.scrollBy(0,-40)); await p.waitForTimeout(80);
const hy=await sy(); await rbar.tap(); await p.waitForTimeout(200);
t('Home range bar keeps scroll position', Math.abs(await sy()-hy)<=2, `before ${hy} after ${await sy()}`);
t('Home rerenders do not re-fire session_started', await count('session_started')===1);

// Holding detail pager
const hid=await p.evaluate(()=>{const h=S.holdings.filter(h=>!h.archived).sort((a,b)=>b.values.length-a.values.length)[0];return h.id;});
await p.evaluate(id=>location.hash='#/holding/'+id,hid); await p.waitForTimeout(300);
t('opening a holding lands at top', await sy()===0);
const dn=await p.$('[data-act="detail-page"][data-v="1"]');
if(dn){ await p.evaluate(()=>{const b=document.querySelector('[data-act="detail-page"][data-v="1"]');window.scrollTo(0,b.getBoundingClientRect().top+scrollY-200);}); await p.waitForTimeout(80);
  console.log('   detail page height', await p.evaluate(()=>document.documentElement.scrollHeight), 'viewport', await p.evaluate(()=>innerHeight));
  const dy=await sy(); const was=await dn.getAttribute('aria-disabled');
  await dn.tap({force:true}); await p.waitForTimeout(200);
  t('detail pager keeps scroll position', Math.abs(await sy()-dy)<=2, `before ${dy} after ${await sy()} (disabled=${was})`); }

// Connect button disabled until verified
await p.evaluate(()=>{S.account.verified=false; save();});
t('no page errors', errs.length===0, errs.join(' | '));
await b.close();
