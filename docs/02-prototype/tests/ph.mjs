import { chromium, devices } from './pw.mjs';
const URL=new globalThis.URL('../index.html', import.meta.url).href;
const b=await chromium.launch();
const t=(n,c,x='')=>console.log((c?'PASS':'FAIL')+' — '+n+(x?'   ['+x+']':''));
const ctx=await b.newContext({...devices['iPhone 13'], timezoneId:'Asia/Singapore'}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto(URL,{waitUntil:'load'});
await p.evaluate(()=>reset('empty')); await p.waitForTimeout(250);
await p.click('[data-act="auth-provider"][data-v="google"]'); await p.waitForTimeout(250);
await p.click('[data-act="ob-next"]'); await p.waitForTimeout(200);
await p.click('[data-act="ob-finish"]'); await p.waitForTimeout(250);
await p.click('[data-act="ob-start"]'); await p.waitForTimeout(250);
await p.click('[data-act="guide-yes"]'); await p.fill('#g-amount','5000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200);
await p.click('[data-act="guide-no"]'); await p.waitForTimeout(150);
await p.click('[data-act="guide-yes"]'); await p.fill('#g-amount','42000'); await p.click('[data-act="guide-add"]'); await p.waitForTimeout(200);
await p.click('[data-act="guide-stop"]'); await p.waitForTimeout(300);

const ph = sel => p.evaluate(s=>[...document.querySelectorAll(s+' .ph')].map(e=>({
  label:(e.querySelector('.ph-label')||{}).textContent, sub:(e.querySelector('.ph-sub')||{}).textContent||'',
  hidden:e.querySelector('svg').getAttribute('aria-hidden'), svgText:e.querySelector('svg').textContent.trim(),
  blur:getComputedStyle(e.querySelector('.ph-veil')).backdropFilter, h:e.getBoundingClientRect().height })), sel);

// ---------- Home: one value per holding
let h = await ph('#s-home .o-trend');
t('Home: the trend keeps its place as a placeholder', h.length===1);
t('Home: labelled "Need more data"', h[0] && h[0].label==='Need more data');
t('Home: says what to do', h[0] && /Update a holding next month, or add an earlier value/.test(h[0].sub), h[0] && h[0].sub);
t('Home: no range bar on a placeholder', !(await p.$('#s-home .o-trend .rangebar')));
t('Home: the sample is hidden from screen readers and carries no text', h[0].hidden==='true' && h[0].svgText==='');
t('Home: frosted — the veil blurs what is under it', /blur/.test(h[0].blur), h[0].blur);
t('Home: no figure anywhere in the placeholder', !/\d/.test(await p.$eval('#s-home .o-trend', e=>e.textContent)));
t('Home: phone order kept (trend before position)', await p.evaluate(()=>document.querySelector('#s-home .o-trend').getBoundingClientRect().top < document.querySelector('#s-home .o-pos').getBoundingClientRect().top));
t('Home: the sample wears no data colour', await p.evaluate(()=>{
  const s=document.querySelector('#s-home .ph-sample'); const c=getComputedStyle(s).color;
  const probe=document.createElement('i'); document.body.appendChild(probe);
  const inks=['--brand','--gain','--loss','--agent'].map(v=>{probe.style.color=`var(${v})`; return getComputedStyle(probe).color;});
  probe.remove(); return !inks.includes(c) && !s.innerHTML.match(/var\(--(brand|gain|loss|agent)/); }));

// ---------- holding detail: one value
const hid = await p.evaluate(()=>S.holdings[0].id);
await p.evaluate(id=>location.hash='#/holding/'+id, hid); await p.waitForTimeout(300);
let d = await ph('#s-holding');
t('Detail: one placeholder, not a carousel of two', d.length===1 && !(await p.$('#detail-carousel')) && !(await p.$('#s-holding .dots i')));
t('Detail: says what to do', d[0] && /Update this next month, or add an earlier value/.test(d[0].sub), d[0] && d[0].sub);
// no values at all
await p.evaluate(id=>{ holdingOf(id).values=[]; render(true); }, hid); await p.waitForTimeout(150);
d = await ph('#s-holding');
t('Detail with no values: asks for the first one', d[0] && /Add its first value/.test(d[0].sub), d[0] && d[0].sub);
// a second, earlier value draws the real chart
await p.goto(URL+'#/home'); await p.waitForTimeout(300);
const hid2 = await p.evaluate(()=>S.holdings.find(h=>h.values.length===1).id);
await p.evaluate(id=>location.hash='#/holding/'+id, hid2); await p.waitForTimeout(300);
await p.click('[data-act="add-value"]'); await p.waitForTimeout(200);
await p.fill('#v-amount','40000'); await p.fill('#v-date','2026-05-31'); await p.click('[data-act="save-value"]'); await p.waitForTimeout(300);
t('Detail: an earlier value replaces the placeholder with the chart', (await ph('#s-holding')).length===0 && !!(await p.$('#detail-carousel .plot')));
await p.evaluate(()=>location.hash='#/home'); await p.waitForTimeout(300);
t('Home: the trend is real once any holding has two values', (await ph('#s-home')).length===0 && !!(await p.$('#s-home .o-trend .plot')) && !!(await p.$('#s-home .o-trend .rangebar')));

// ---------- Insights: nothing to compare
await p.evaluate(()=>{ S.holdings.forEach(h=>h.values=h.values.slice(-1)); S.settings.insightsView='monthly'; S.settings.insightsRange=0; save(); location.hash='#/insights'; render(); }); await p.waitForTimeout(300);
let i = await ph('#s-insights');
t('Insights: all three charts keep their place as placeholders', i.length===3, i.length);
t('Insights: each says "Need more data", reason said once in the summary', i.every(x=>x.label==='Need more data' && !x.sub));
const sum = await p.$eval('#s-insights .summary', e=>e.textContent.replace(/\s+/g,' ').trim());
t('Insights: the summary says what is missing and what to do', /month-on-month comparison needs two months of values\. It starts next month, or now if you add an earlier value\./.test(sum), sum);
t('Insights: chart titles kept', (await p.$$eval('#s-insights .chart-h h3', a=>a.map(x=>x.textContent))).join('|')==='Monthly growth|Assets vs. liabilities|Distribution');
t('Insights: no pager and no legend on placeholders', !(await p.$('#s-insights .chartnav')) && !(await p.$('#s-insights .legend')));
t('Insights: the old "Not enough history" card is gone', !(await p.textContent('#s-insights')).includes('Not enough history'));
t('Insights: gradient ids are unique on the page', await p.evaluate(()=>{ const ids=[...document.querySelectorAll('[id^="ph-fade-"]')].map(e=>e.id); return ids.length>0 && new Set(ids).size===ids.length; }) || (await p.$$('#s-insights .ph linearGradient')).length<=1);
await p.click('[data-act="set-insights-view"][data-v="yearly"]'); await p.waitForTimeout(200);
t('Insights yearly: the reason follows the view', /year-on-year comparison needs two years of values\. It starts next year/.test(await p.$eval('#s-insights .summary', e=>e.textContent.replace(/\s+/g,' '))));

// filtered to nothing: say so, not "need more data"
await p.evaluate(()=>{ S.settings.exTypes=S.types.map(t=>t.id); save(); render(); }); await p.waitForTimeout(200);
i = await ph('#s-insights');
t('Insights filtered to nothing: "Nothing to show", and the summary says why', i.length===3 && i.every(x=>x.label==='Nothing to show')
  && (await p.$eval('#s-insights .summary', e=>e.textContent.trim()))==='Nothing matches these filters.');
t('Insights filtered to nothing: no empty period list', !(await p.$('#s-insights .section-h')));
await p.evaluate(()=>{ S.settings.exTypes=[]; save(); render(); }); await p.waitForTimeout(150);

// ---------- chart functions fall back to the placeholder
t('lineChart with one point → placeholder', await p.evaluate(()=>lineChart([{points:[{x:'2026-01-31',y:5}],colour:'var(--brand)'}]).includes('class="ph"')));
t('lineChart, several series, one point → the multi-line sample', await p.evaluate(()=>lineChart([{points:[{x:'2026-01-31',y:5}]},{points:[{x:'2026-01-31',y:1}]}]).includes('ph-fade')));
t('growthBars with no periods → placeholder', await p.evaluate(()=>growthBars([]).includes('class="ph"')));
t('stackedBars with no periods → placeholder', await p.evaluate(()=>stackedBars([]).includes('class="ph"')));
t('the sample is fixed: same markup twice', await p.evaluate(()=>chartPlaceholder('bars')===chartPlaceholder('bars') && chartPlaceholder('stacked')===chartPlaceholder('stacked')));

// ---------- seeded account: real charts, no placeholders
await p.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; save(); location.hash='#/home'; }); await p.waitForTimeout(300);
t('Seeded Home: real trend, no placeholder', (await ph('#s-home')).length===0 && !!(await p.$('#s-home .o-trend .plot')));
await p.evaluate(()=>location.hash='#/insights'); await p.waitForTimeout(300);
t('Seeded Insights: real charts, no placeholder', (await ph('#s-insights')).length===0 && (await p.$$('#s-insights .plot')).length===3);
await p.evaluate(()=>location.hash='#/holding/h-ibkr'); await p.waitForTimeout(300);
t('Seeded detail: carousel, no placeholder', (await ph('#s-holding')).length===0 && !!(await p.$('#detail-carousel')));

// history exists but the range holds too little: say so, not "need more data"
await p.evaluate(()=>{ const h=holdingOf('h-ibkr'); h.values=h.values.filter(v=>v.date < '2026-01-01'); S.settings.detailRange=6; save(); render(); }); await p.waitForTimeout(250);
const rng = await ph('#s-holding');
t('Detail, history outside the range: "Pick a longer range", range bar still there to fix it', rng.length===1 && rng[0].label==='Pick a longer range' && !!(await p.$('#detail-carousel .rangebar')), rng[0] && rng[0].label);
await p.evaluate(()=>{ S.settings.detailRange=0; save(); render(); }); await p.waitForTimeout(200);
t('Detail, All: the chart is back', (await ph('#s-holding')).length===0);

// ---------- forced colours: the sample goes, the words stay
const fc=await b.newContext({...devices['iPhone 13'], forcedColors:'active'}); const q=await fc.newPage();
await q.goto(URL,{waitUntil:'load'});
await q.evaluate(()=>{ reset('seeded'); S.account.signedIn=true; S.holdings.forEach(h=>h.values=h.values.slice(-1)); save(); location.hash='#/home'; }); await q.waitForTimeout(300);
t('Forced colours: sample hidden, label still shown', await q.evaluate(()=>getComputedStyle(document.querySelector('.ph-sample')).display==='none' && document.querySelector('.ph-label').offsetHeight>0));
await fc.close();

t('no page errors', !errs.length, errs.join(' | '));
await b.close();
