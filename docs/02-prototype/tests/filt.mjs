import { chromium, devices, shots } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const SP=shots('filt');
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const ctx=await b.newContext({...devices['iPhone 13']}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL,{waitUntil:'load'});
await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; save(); location.hash='#/home'; render(); }); await p.waitForTimeout(300);
const ids = await p.evaluate(()=>({ cash:S.types.find(t=>typeName(t)==='Cash').id, inv:S.types.find(t=>typeName(t)==='Investments').id, all:S.holdings.filter(h=>!h.archived).length,
  nw:money(totals(homeHoldings()).now) }));
const rows = () => p.$$eval('#s-home .o-list .row', a=>a.length);
const open = async () => { await p.click('#s-home [data-act="open-filter"]'); await p.waitForTimeout(250); };
await open();
t('Home filter now has a Don\'t Show section, types and tags', await p.evaluate(()=>/Don't Show/i.test(document.querySelector('.sheet').innerText)) &&
  (await p.$$('.sheet [data-act="draft-extype"]')).length > 0 && (await p.$$('.sheet [data-act="draft-extag"]')).length > 0);
t('its note says it is Home only', (await p.textContent('.sheet .hint')).includes('Hidden from Home only. Insights is unchanged.'));
await p.screenshot({path:`${SP}/sheet.png`, fullPage:true});
// hide a type
await p.click(`.sheet [data-act="draft-extype"][data-v="${ids.cash}"]`); await p.waitForTimeout(150);
t('a hidden type is marked in the loss ink', await p.$eval(`.sheet [data-act="draft-extype"][data-v="${ids.cash}"]`, e=>e.classList.contains('on') && e.classList.contains('ex')));
await p.click('.sheet [data-act="apply-filter"]'); await p.waitForTimeout(300);
const r1 = await p.evaluate(c=>({ n:document.querySelectorAll('#s-home .o-list .row').length, cash:[...document.querySelectorAll('#s-home .o-list .row .sub')].some(s=>/^\s*Cash/.test(s.textContent)),
  label:document.querySelector('#s-home .nw-wrap .label').textContent, note:document.querySelector('#s-home .note').innerText, on:document.querySelector('#s-home [data-act="open-filter"]').classList.contains('on'),
  nw:document.querySelector('#s-home .nw').textContent, expect:money(totals(S.holdings.filter(h=>!h.archived && h.typeId!==c)).now) }), ids.cash);
t('Home drops every Cash holding', !r1.cash && r1.n < ids.all, `${r1.n} of ${ids.all}`);
t('the total is the filtered total, and says so', r1.label==='Filtered total' && r1.nw===r1.expect, `${r1.nw} vs ${r1.expect}`);
t('the note names what is hidden, and the filter icon is on', /hiding Cash/.test(r1.note) && r1.on, r1.note);
// Insights is untouched
await p.evaluate(()=>{ location.hash='#/insights'; }); await p.waitForTimeout(300);
t('Insights is unchanged by Home\'s Don\'t Show', await p.evaluate(()=>insightsHoldings().length===S.holdings.filter(h=>!h.archived).length));
await p.evaluate(()=>{ location.hash='#/home'; }); await p.waitForTimeout(300);
// mutual exclusion
await open();
await p.click(`.sheet [data-act="draft-type"][data-v="${ids.cash}"]`); await p.waitForTimeout(150);
t('choosing a hidden type under Show Only takes it off Don\'t Show', await p.evaluate(c=>S.draft.types.includes(c) && !S.draft.exTypes.includes(c), ids.cash));
await p.click(`.sheet [data-act="draft-extype"][data-v="${ids.cash}"]`); await p.waitForTimeout(150);
t('and the other way round', await p.evaluate(c=>!S.draft.types.includes(c) && S.draft.exTypes.includes(c), ids.cash));
// tags, AND mode
const tag = await p.evaluate(()=>{ const c={}; S.holdings.forEach(h=>h.tags.forEach(t=>c[t]=(c[t]||0)+1)); return Object.entries(c).sort((a,b)=>b[1]-a[1])[0][0]; });
await p.click(`.sheet [data-act="draft-extag"][data-v="${tag}"]`); await p.waitForTimeout(150);
await p.click('.sheet [data-act="draft-extagmode"][data-v="AND"]'); await p.waitForTimeout(150);
t('the Don\'t Show tag mode stays on Home\'s sheet', await p.evaluate(()=>S.draft.forInsights===false && S.draft.exTagMode==='AND' && /Home only/.test(document.querySelector('.sheet .hint').textContent)));
await p.click('.sheet [data-act="apply-filter"]'); await p.waitForTimeout(300);
t('hidden tags apply too', await p.evaluate(tg=>homeHoldings().every(h=>!h.tags.includes(tg)), tag), tag);
// survives a reload
await p.reload({waitUntil:'load'}); await p.waitForTimeout(300);
t('kept across a reload', await p.evaluate(()=>S.settings.hideTypes.length===1 && S.settings.hideTags.length===1) && (await rows()) < ids.all);
// Clear on the note clears it all
await p.click('#s-home .note [data-act="clear-filter"]'); await p.waitForTimeout(300);
t('Clear brings everything back', (await rows())===ids.all && await p.evaluate(()=>!S.settings.hideTypes.length && !S.settings.hideTags.length && document.querySelector('#s-home .nw-wrap .label').textContent==='Net worth'));
// Reset inside the sheet
await open(); await p.click(`.sheet [data-act="draft-extype"][data-v="${ids.inv}"]`); await p.click('.sheet [data-act="reset-filter"]'); await p.waitForTimeout(150);
t('Reset in the sheet clears Don\'t Show too', await p.evaluate(()=>!S.draft.exTypes.length && !S.draft.exTags.length));
await p.click('.sheet [data-act="close-sheet"]'); await p.waitForTimeout(200);
// Insights' own Don't Show still works, and its mode toggle stays on its own sheet
await p.evaluate(()=>{ S.draft=null; location.hash='#/insights'; }); await p.waitForTimeout(300);
await p.click('#s-insights [data-act="open-insights-filter"]'); await p.waitForTimeout(250);
await p.click(`.sheet [data-act="draft-extype"][data-v="${ids.cash}"]`); await p.click('.sheet [data-act="draft-extagmode"][data-v="AND"]'); await p.waitForTimeout(150);
t('Insights sheet: its tag mode stays on the Insights sheet', await p.evaluate(()=>S.draft.forInsights===true && /Insights only/.test(document.querySelector('.sheet .hint').textContent)));
await p.click('.sheet [data-act="apply-filter"]'); await p.waitForTimeout(300);
t('Insights: its Don\'t Show still hides, Home unchanged', await p.evaluate(c=>insightsHoldings().every(h=>h.typeId!==c) && homeHoldings().length===S.holdings.filter(h=>!h.archived).length, ids.cash));
// state saved before this change still loads
await p.evaluate(()=>{ delete S.settings.hideTypes; delete S.settings.hideTags; delete S.settings.hideTagMode; save(); });
await p.reload({waitUntil:'load'}); await p.evaluate(()=>{ location.hash='#/home'; }); await p.waitForTimeout(300);
t('an older saved state loads without error', await p.evaluate(()=>Array.isArray(S.settings.hideTypes) && S.settings.hideTagMode==='OR') && (await rows())===ids.all);
t('no page errors', !errs.length, errs.join(' | '));
await b.close();
