import { chromium, devices, shots } from './pw.mjs';
const OUT = shots('');
const URL = new globalThis.URL('../index.html', import.meta.url).href;
const errs = [];
const b = await chromium.launch();

async function run(name, w, h, routes) {
  const ctx = await b.newContext({ viewport:{ width:w, height:h }, colorScheme:'dark' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(`[${name}] pageerror: ${e.message}`));
  /* logo and screenshot slots are EXPECTED to 404 until their files are dropped in; any other
     missing resource (a script, a font) still counts */
  p.on('requestfailed', r => { if (!/\/(agents|connect)\//.test(r.url())) errs.push(`[${name}] failed: ${r.url()}`); });
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(`[${name}] console: ${m.text()}`); });
  for (const r of routes) {
    await p.goto(URL + r, { waitUntil:'load' });
    await p.waitForTimeout(160);
    const shot = r.replace(/[#/]/g, '_') || '_root';
    await p.screenshot({ path:`${OUT}/${name}${shot}.png`, fullPage:true });
  }
  await ctx.close();
}
const routes = ['#/home','#/insights','#/agent','#/account','#/activity'];
await run('m', 390, 844, routes);
await run('d', 1280, 900, routes);

// interaction pass on mobile
const ctx = await b.newContext({ viewport:{ width:390, height:844 }, colorScheme:'dark' });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(`[int] pageerror: ${e.message}`));
p.on('console', m => { if (m.type() === 'error') errs.push(`[int] console: ${m.text()}`); });
await p.goto(URL + '#/home', { waitUntil:'load' });
await p.waitForTimeout(200);
// open first holding
await p.click('#s-home .card.flush .row');
await p.waitForTimeout(250);
await p.screenshot({ path:`${OUT}/int_detail.png`, fullPage:true });
// expand a value row
await p.click('#s-holding .card.flush .row');
await p.waitForTimeout(200);
await p.screenshot({ path:`${OUT}/int_expanded.png`, fullPage:true });
// open Add Value sheet
await p.click('[data-act="add-value"]');
await p.waitForTimeout(250);
await p.screenshot({ path:`${OUT}/int_addvalue.png` });
await p.click('[data-act="close-sheet"]');
// filters sheet on home
await p.goto(URL + '#/home', { waitUntil:'load' }); await p.waitForTimeout(200);
await p.click('[data-act="open-filter"]'); await p.waitForTimeout(250);
await p.screenshot({ path:`${OUT}/int_filters.png` });
await p.click('[data-act="close-sheet"]');
// insights filters (Don't Show)
await p.goto(URL + '#/insights', { waitUntil:'load' }); await p.waitForTimeout(250);
await p.click('[data-act="open-insights-filter"]'); await p.waitForTimeout(250);
await p.screenshot({ path:`${OUT}/int_insfilters.png` });
await p.click('[data-act="close-sheet"]');
// period drilldown
await p.click('#s-insights .card.flush .row'); await p.waitForTimeout(250);
await p.screenshot({ path:`${OUT}/int_period.png`, fullPage:true });
// agent chat
await p.goto(URL + '#/agent/chat', { waitUntil:'load' }); await p.waitForTimeout(200);
for (let i = 0; i < 8; i++) { const btn = await p.$('[data-act="chat-next"]'); if (!btn) break; await btn.click(); await p.waitForTimeout(120); }
await p.screenshot({ path:`${OUT}/int_chat.png`, fullPage:true });
await ctx.close();
await b.close();
console.log(errs.length ? errs.join('\n') : 'NO ERRORS');
