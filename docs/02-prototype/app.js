/* NetNet prototype — behaviour.
   Stage 2 design code: deliberately throwaway. Vanilla JS, no build, no framework,
   no persistence beyond localStorage. Stack decisions belong to Stage 3. */

/* ================= state ================= */
const LS = 'netnet-proto-v1';
let S = load();

function load() {
  try { const raw = localStorage.getItem(LS); if (raw) return JSON.parse(raw); } catch (e) {}
  return hydrate(seededState());
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function reset(mode) {
  S = hydrate(mode === 'empty' ? emptyState() : seededState());
  save();
  location.hash = mode === 'empty' ? '#/landing' : '#/home';
  render();
}

/* Build the audit log (J7) from the value history, so every row on screen has a
   log entry behind it rather than the log being a separate fiction. */
function hydrate(s) {
  const log = [];
  s.holdings.forEach(h => {
    log.push({ id:'lg-c-'+h.id, at:h.values[0] ? h.values[0].enteredAt : TODAY+'T12:00:00Z',
      kind:'holding.create', holdingId:h.id, source:'web', client:null, turn:null,
      before:null, after:{ name:h.name }, undone:false });
    h.values.forEach(v => log.push({
      id:'lg-v-'+v.id, at:v.enteredAt, kind:'value.create', holdingId:h.id, valueId:v.id,
      source:v.source, client:v.client, turn:v.turn,
      before:null, after:{ amount:v.amount, ccy:v.ccy, date:v.date }, undone:false
    }));
  });
  const sold = s.holdings.find(h => h.id === 'h-sold');
  if (sold) log.push({ id:'lg-arch-sold', at:'2025-08-14T10:22:00Z', kind:'holding.archive',
    holdingId:'h-sold', source:'web', client:null, turn:null, before:{archived:false}, after:{archived:true}, undone:false });
  const btc = s.holdings.find(h => h.id === 'h-btc');
  if (btc && btc.values.length) {
    const v = btc.values[btc.values.length - 1];
    const wrong = Math.round(v.amount * 1.09 / 10) * 10;
    log.push({ id:'lg-corr-btc', at:'2026-08-05T08:05:00Z', kind:'value.edit', holdingId:'h-btc',
      valueId:v.id, source:'web', client:null, turn:null, originalSource:'agent',
      before:{ amount:wrong, ccy:v.ccy, date:v.date }, after:{ amount:v.amount, ccy:v.ccy, date:v.date }, undone:false });
  }
  s.log = log.sort((a, b) => b.at.localeCompare(a.at));
  return s;
}

/* ================= analytics (§3.5) =================
   Names and shapes only — never amounts or holding names (N9). The PROTO drawer
   shows the stream so the event contract is reviewable at design time. */
function fire(name, props) {
  const ev = { name, props: props || {}, at: new Date().toISOString() };
  S.events.unshift(ev);
  if (S.events.length > 120) S.events.pop();
  console.log('[event]', name, ev.props);
  save();
}

/* ================= helpers ================= */
const $ = sel => document.querySelector(sel);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeOf = id => S.types.find(t => t.id === id) || { name:'Uncategorised', colour:'#94a3b8' };
const holdingOf = id => S.holdings.find(h => h.id === id);

function money(n, ccy, opts) {
  const o = opts || {};
  const abs = Math.abs(n);
  const d = o.decimals != null ? o.decimals : (abs < 1000 && abs > 0 ? 2 : 0);
  const s = abs.toLocaleString('en-SG', { minimumFractionDigits:d, maximumFractionDigits:d });
  const sign = n < 0 ? '−' : (o.signed && n > 0 ? '+' : '');
  return sign + (ccy || S.settings.defaultCcy) + ' ' + s;
}
function pct(n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(1) + '%'; }
function cls(n) { return n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted'; }
function fmtDate(d) { return new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' }); }
function fmtDateTime(iso) { return new Date(iso).toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }) + ', ' + new Date(iso).toLocaleTimeString('en-SG', { hour:'numeric', minute:'2-digit' }); }
function ago(d) {
  const days = daysBetween(d, TODAY);
  if (days < 1) return 'today';
  if (days < 7) return days + 'd ago';
  if (days < 60) return Math.round(days / 7) + 'w ago';
  if (days < 730) return Math.round(days / 30) + 'mo ago';
  return (days / 365).toFixed(1).replace('.0', '') + 'y ago';
}
const ACCESS = {
  accessible: { label:'Readily accessible', short:'Accessible' },
  illiquid:   { label:'Illiquid',           short:'Illiquid'   },
  locked:     { label:'Locked',             short:'Locked'     },
  'n/a':      { label:'—',                  short:'—'          }
};

/* ================= computation ================= */
function valueAsOf(h, dateStr) {
  let out = null;
  for (const v of h.values) { if (v.date <= dateStr) out = v; else break; }
  return out;
}
function latest(h) { return h.values.length ? h.values[h.values.length - 1] : null; }
function signed(h, v) { return v ? (h.kind === 'liability' ? -v.base : v.base) : 0; }

function activeHoldings(opts) {
  const o = opts || {};
  let list = S.holdings.filter(h => !h.archived);
  if (!o.ignoreFilter) {
    const ft = S.settings.filterTypes, fg = S.settings.filterTags;
    if (ft.length) list = list.filter(h => ft.includes(h.typeId));
    if (fg.length) list = list.filter(h => h.tags.some(t => fg.includes(t)));
  }
  if (o.excludeInsights) list = list.filter(h => !isExcluded(h));
  return list;
}
function netWorthAsOf(dateStr, list) {
  return (list || activeHoldings()).reduce((sum, h) => sum + signed(h, valueAsOf(h, dateStr)), 0);
}

const BASELINES = [
  { id:'initial',      label:'Initial value' },
  { id:'last-update',  label:'Last update' },
  { id:'last-month',   label:'Last month' },
  { id:'last-quarter', label:'Last quarter' },
  { id:'jan1',         label:'1 January' },
  { id:'last-year',    label:'Last year' }
];
const baselineLabel = () => (BASELINES.find(b => b.id === S.settings.baseline) || BASELINES[2]).label;

/* Baseline is resolved PER HOLDING and summed, so the total and every row on the
   screen are measured against the same thing (J4). Returns {value, from, exact}. */
function baselineFor(h, baseline) {
  const b = baseline || S.settings.baseline;
  if (!h.values.length) return { value:0, from:null, exact:true };
  if (b === 'initial') { const v = h.values[0]; return { value:signed(h, v), from:v.date, exact:true }; }
  if (b === 'last-update') {
    const v = h.values.length > 1 ? h.values[h.values.length - 2] : h.values[0];
    return { value:signed(h, v), from:v.date, exact:true };
  }
  const asOf = { 'last-month':addMonths(TODAY, -1), 'last-quarter':addMonths(TODAY, -3),
                 'jan1':TODAY.slice(0, 4) + '-01-01', 'last-year':addMonths(TODAY, -12) }[b];
  const v = valueAsOf(h, asOf);
  if (v) return { value:signed(h, v), from:asOf, exact:true };
  return { value:signed(h, h.values[0]), from:h.values[0].date, exact:false }; // pre-dates the baseline
}
function changeFor(h) {
  const now = signed(h, latest(h));
  const b = baselineFor(h);
  return { now, base:b.value, abs:now - b.value, pct: b.value ? ((now - b.value) / Math.abs(b.value)) * 100 : 0, exact:b.exact };
}
function totals(list) {
  const hs = list || activeHoldings();
  let now = 0, base = 0, assets = 0, liabilities = 0, accessible = 0, exact = true;
  hs.forEach(h => {
    const c = changeFor(h);
    now += c.now; base += c.base; if (!c.exact) exact = false;
    if (h.kind === 'liability') liabilities += Math.abs(c.now); else {
      assets += c.now;
      if (h.access === 'accessible') accessible += c.now;
    }
  });
  return { now, base, abs:now - base, pct: base ? ((now - base) / Math.abs(base)) * 100 : 0, assets, liabilities, accessible, exact };
}
function isStale(h) {
  const v = latest(h);
  if (!v) return true;
  return daysBetween(v.date, TODAY) > Math.max(45, (h.cadenceDays || 30) * 1.6);
}
function byType(list) {
  const map = {};
  (list || activeHoldings()).filter(h => h.kind === 'asset').forEach(h => {
    const t = typeOf(h.typeId);
    map[t.id] = map[t.id] || { name:t.name, colour:t.colour, value:0 };
    map[t.id].value += signed(h, latest(h));
  });
  return Object.values(map).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
}

/* ---- Insights (J11) ---- */
function isExcluded(h) {
  return S.settings.insightsExclude.some(x =>
    (x.kind === 'holding' && x.id === h.id) ||
    (x.kind === 'type' && x.id === h.typeId) ||
    (x.kind === 'tag' && h.tags.includes(x.id)));
}
function periodEnd(view, i, anchor) {
  const d = new Date(anchor + 'T00:00:00Z');
  if (view === 'monthly') { d.setUTCMonth(d.getUTCMonth() - i + 1, 1); d.setUTCDate(0); }
  if (view === 'quarterly') { const q = Math.floor(d.getUTCMonth() / 3); d.setUTCMonth(q * 3 - i * 3 + 3, 1); d.setUTCDate(0); }
  if (view === 'yearly') { d.setUTCFullYear(d.getUTCFullYear() - i + 1, 0, 1); d.setUTCDate(0); }
  return d.toISOString().slice(0, 10);
}
function periodLabel(view, endDate) {
  const d = new Date(endDate + 'T00:00:00Z');
  if (view === 'monthly') return d.toLocaleDateString('en-SG', { month:'long', year:'numeric', timeZone:'UTC' });
  if (view === 'quarterly') return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + ' ' + d.getUTCFullYear();
  return String(d.getUTCFullYear());
}
function periodStart(view, endDate) {
  const d = new Date(endDate + 'T00:00:00Z');
  if (view === 'monthly') d.setUTCDate(1);
  if (view === 'quarterly') d.setUTCMonth(Math.floor(d.getUTCMonth() / 3), 1);
  if (view === 'yearly') d.setUTCMonth(0, 1);
  return d.toISOString().slice(0, 10);
}
/* Periods derive from VALUE DATES, never from entry dates (J11). */
function insightsPeriods(view) {
  const list = activeHoldings({ excludeInsights:true, ignoreFilter:false });
  if (!list.length) return { periods:[], list };
  let earliest = null;
  list.forEach(h => h.values.forEach(v => { if (!earliest || v.date < earliest) earliest = v.date; }));
  const periods = [];
  for (let i = 0; i < 40; i++) {
    const end = i === 0 ? TODAY : periodEnd(view, i, TODAY);
    const start = periodStart(view, i === 0 ? TODAY : end);
    if (end < earliest) break;
    const prevEnd = periodEnd(view, i + 1, TODAY);
    const value = netWorthAsOf(end, list);
    const prev = prevEnd >= earliest ? netWorthAsOf(prevEnd, list) : null;
    const hasData = list.some(h => h.values.some(v => v.date >= start && v.date <= end));
    periods.push({
      view, i, end, start, label:periodLabel(view, i === 0 ? TODAY : end),
      current: i === 0, value, prev,
      abs: prev == null ? null : value - prev,
      pct: prev ? ((value - prev) / Math.abs(prev)) * 100 : null,
      hasData
    });
  }
  return { periods, list };
}
function contributors(period, list) {
  const prevEnd = periodEnd(period.view, period.i + 1, TODAY);
  return list.map(h => {
    const now = signed(h, valueAsOf(h, period.end));
    const before = signed(h, valueAsOf(h, prevEnd));
    const observed = h.values.some(v => v.date >= period.start && v.date <= period.end);
    return { h, delta:now - before, now, carried:!observed };
  }).filter(c => c.now !== 0 || c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

/* ================= charts (hand-rolled SVG — no library, works offline) ================= */
function lineChart(points, o) {
  o = o || {};
  const w = 100, h = o.h || 30, pad = 1.5;
  if (points.length < 2) return '<div class="muted" style="padding:16px 0;font-size:13px">Not enough history to draw a line yet.</div>';
  const ys = points.map(p => p.y), min = Math.min(...ys), max = Math.max(...ys), span = (max - min) || 1;
  const xs = points.map((p, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const yy = points.map(p => (h - pad) - ((p.y - min) / span) * (h - pad * 2));
  const d = xs.map((x, i) => (i ? 'L' : 'M') + x.toFixed(2) + ' ' + yy[i].toFixed(2)).join(' ');
  const area = d + ` L${xs[xs.length-1].toFixed(2)} ${h} L${xs[0].toFixed(2)} ${h} Z`;
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${o.px||120}px" aria-hidden="true">
    <path class="area" d="${area}"/><path class="ln" d="${d}" vector-effect="non-scaling-stroke"/>
    <circle class="pt" cx="${xs[xs.length-1].toFixed(2)}" cy="${yy[yy.length-1].toFixed(2)}" r="1.1"/></svg>
  <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-3);margin-top:6px">
    <span>${esc(fmtDate(points[0].x))}</span><span>${esc(fmtDate(points[points.length-1].x))}</span></div>`;
}
function donut(segs) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  let a = -Math.PI / 2, out = '';
  segs.forEach(s => {
    const ang = (s.value / total) * Math.PI * 2, b = a + ang, r = 15.9, R = 21;
    const big = ang > Math.PI ? 1 : 0;
    const p = (rad, ang) => [(24 + rad * Math.cos(ang)).toFixed(3), (24 + rad * Math.sin(ang)).toFixed(3)];
    const [x1,y1] = p(R,a), [x2,y2] = p(R,b), [x3,y3] = p(r,b), [x4,y4] = p(r,a);
    out += `<path d="M${x1} ${y1} A${R} ${R} 0 ${big} 1 ${x2} ${y2} L${x3} ${y3} A${r} ${r} 0 ${big} 0 ${x4} ${y4} Z" fill="${s.colour}"/>`;
    a = b;
  });
  return `<svg viewBox="0 0 48 48" style="width:124px;height:124px;flex:none" aria-hidden="true">${out}</svg>`;
}
function barChart(bars, o) {
  o = o || {};
  const n = bars.length, w = 100, h = 34, gap = 1.2;
  const bw = (w - gap * (n - 1)) / n;
  const max = Math.max(1, ...bars.map(b => Math.abs(b.value)));
  const mid = h / 2;
  const body = bars.map((b, i) => {
    const bh = (Math.abs(b.value) / max) * (mid - 3);
    const x = i * (bw + gap);
    const y = b.value >= 0 ? mid - bh : mid;
    return `<rect class="${b.value >= 0 ? 'bar-p' : 'bar-n'}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${bw.toFixed(2)}" height="${Math.max(0.6, bh).toFixed(2)}" rx="0.6"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="height:${o.px||96}px" aria-hidden="true">
    ${body}<line class="zero" x1="0" y1="${mid}" x2="${w}" y2="${mid}" vector-effect="non-scaling-stroke"/></svg>
  <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-3);margin-top:5px">
    ${bars.map(b => `<span style="flex:1;text-align:center">${esc(b.label)}</span>`).join('')}</div>`;
}
function seriesFor(list, months) {
  const pts = [];
  for (let m = months; m >= 0; m--) {
    const d = m === 0 ? TODAY : addMonths(TODAY, -m);
    pts.push({ x:d, y:netWorthAsOf(d, list) });
  }
  return pts.filter((p, i) => i === 0 || p.y !== 0 || pts.slice(0, i).some(q => q.y !== 0));
}

/* ================= sheets ================= */
function sheet(html) {
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSheet() { $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on'); }

/* ================= HOME (J1, J4) ================= */
function renderHome() {
  const all = S.holdings.filter(h => !h.archived);
  if (!all.length) return $('#s-home').innerHTML = emptyHome();

  const list = activeHoldings();
  const t = totals(list);
  const filtered = S.settings.filterTypes.length || S.settings.filterTags.length;
  const segs = byType(list);
  const months = S.settings.range || 12;
  const pts = seriesFor(list, months);
  const staleCount = list.filter(isStale).length;

  const sorted = list.slice().sort(sorter(S.settings.sort));
  const rows = sorted.map(h => {
    const c = changeFor(h), v = latest(h), tp = typeOf(h.typeId);
    return `<button class="row" data-go="#/holding/${h.id}">
      <span class="dot" style="background:${tp.colour}"></span>
      <span class="grow">
        <span class="name">${esc(h.name)}
          ${v && v.source === 'agent' ? '<span class="chip agent">agent</span>' : ''}
          ${isStale(h) ? `<span class="chip stale">stale · ${esc(ago(v.date))}</span>` : ''}
          ${h.access === 'locked' ? '<span class="chip locked">locked</span>' : ''}</span>
        <span class="sub">${esc(tp.name)}${h.ccy !== S.settings.defaultCcy ? ' · ' + esc(h.ccy) : ''}
          ${v ? ' · updated ' + esc(ago(v.date)) : ' · no value yet'}</span>
      </span>
      <span class="amt">${h.kind === 'liability' ? '−' : ''}${esc(money(Math.abs(c.now)))}
        <span class="chg ${cls(c.abs)}">${esc(pct(c.pct))}</span></span>
      <span class="chev">›</span></button>`;
  }).join('');

  $('#s-home').innerHTML = `
  <div class="topbar">
    <h1>Net worth</h1>
    <button class="iconbtn" data-act="open-filter" title="Filters">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg></button>
    <button class="iconbtn" data-go="#/activity" title="Activity">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 7 4-14 3 7h4"/></svg></button>
  </div>

  ${filtered ? `<div class="note"><b>Filtered view.</b> ${esc(filterSummary())} — the total below covers the filtered set only.
    <button class="btn ghost sm" style="margin-top:8px" data-act="clear-filter">Clear filter</button></div>` : ''}

  <div class="card">
    <div class="nw-label">${filtered ? 'FILTERED TOTAL' : 'TOTAL NET WORTH'}</div>
    <div class="nw">${esc(money(t.now))}</div>
    <div class="nw-chg ${cls(t.abs)}">${esc(money(t.abs, null, {signed:true}))} · ${esc(pct(t.pct))}</div>
    <button class="baseline-btn" data-act="open-baseline">vs ${esc(baselineLabel().toLowerCase())} ▾</button>
    ${!t.exact ? '<div class="hint muted" style="font-size:11.5px;margin-top:6px">Some holdings pre-date this baseline; their first recorded value is used.</div>' : ''}
  </div>

  <div class="card">
    <div class="seg" style="margin-bottom:14px">
      ${[[6,'6M'],[12,'1Y'],[24,'2Y']].map(([m,l]) => `<button data-act="set-range" data-v="${m}" class="${months===m?'on':''}">${l}</button>`).join('')}
    </div>
    ${lineChart(pts, { px:130 })}
  </div>

  <div class="card">
    <div class="section-h" style="margin:0 0 12px"><h2>Where it sits</h2></div>
    <div style="display:flex;gap:16px;align-items:center">
      ${donut(segs)}
      <div style="flex:1;min-width:0">
        ${segs.slice(0, 6).map(s => `<div class="legend-row">
          <span class="dot" style="background:${s.colour}"></span>
          <span class="grow">${esc(s.name)}</span>
          <b>${Math.round(s.value / (t.assets || 1) * 100)}%</b></div>`).join('')}
      </div>
    </div>
  </div>

  <div class="card">
    <div class="section-h" style="margin:0 0 10px"><h2>Assets vs liabilities</h2></div>
    <div class="split">
      <i style="background:var(--pos);width:${(t.assets/(t.assets+t.liabilities||1)*100).toFixed(1)}%"></i>
      <i style="background:var(--neg);width:${(t.liabilities/(t.assets+t.liabilities||1)*100).toFixed(1)}%"></i>
    </div>
    <div class="kv" style="margin-top:10px"><span>Assets</span><b>${esc(money(t.assets))}</b></div>
    <div class="kv"><span>Liabilities</span><b class="neg">−${esc(money(t.liabilities).replace(/^−/, ''))}</b></div>
    <div class="kv"><span>Readily accessible <span class="muted">(what you could actually touch)</span></span><b>${esc(money(t.accessible))}</b></div>
  </div>

  ${staleCount ? `<div class="note warn"><b>${staleCount} holding${staleCount>1?'s have':' has'} gone stale.</b>
    Ask your agent to refresh ${staleCount>1?'them':'it'}, or update by hand.
    <button class="btn ghost sm" style="margin-top:8px" data-go="#/agent/chat">Ask the agent</button></div>` : ''}

  <div class="section-h"><h2>Holdings · ${list.length}</h2>
    <button class="link" data-act="open-sort">${esc(sortLabel())} ▾</button></div>
  <div class="card flush">${rows || '<div class="empty"><p class="muted">Nothing matches this filter.</p></div>'}</div>

  <div class="btn-row"><button class="btn" data-act="open-add">+ Add tracking</button></div>
  ${S.holdings.some(h => h.archived) ? `<div class="btn-row"><button class="btn sec sm" data-go="#/sub/archived">View archived (${S.holdings.filter(h=>h.archived).length})</button></div>` : ''}
  `;
}

function emptyHome() {
  return `
  <div class="topbar"><h1>Net worth</h1></div>
  <div class="card">
    <div class="nw-label">TOTAL NET WORTH</div>
    <div class="nw muted">${esc(S.settings.defaultCcy)} 0</div>
    <div class="muted" style="font-size:13px">Nothing tracked yet.</div>
  </div>
  <div class="btn-row"><button class="btn" data-act="open-add">+ Add your first holding</button></div>
  <div class="section-h"><h2>Or start from one of these</h2></div>
  <div class="pad"><div class="cats">
    ${[['Cash','t-cash','Bank accounts'],['CPF','t-cpf','OA, SA, MA'],['Property','t-prop','Home or investment'],
       ['Investments','t-inv','Brokerage, funds'],['Vehicle','t-veh','Car, COE'],['Loan','t-loan','Mortgage, car loan']]
      .map(([n,t,s]) => `<button data-act="quick-add" data-v="${t}" data-n="${esc(n)}">${esc(n)}<small>${esc(s)}</small></button>`).join('')}
  </div>
  <p class="muted" style="font-size:12.5px;margin:12px 2px 0">Suggestions, not a fixed list. Rename them, ignore them, or make your own.</p></div>

  <div class="section-h"><h2>Rather not type it in?</h2></div>
  <div class="card">
    <div style="font-weight:600;margin-bottom:5px">Let your agent assemble it</div>
    <p class="muted" style="margin:0 0 14px;font-size:14px">Connect Claude or ChatGPT, then just describe what you have —
      or drop in a statement. It creates the holdings for you, and you can undo anything it does.</p>
    <button class="btn" data-go="#/agent">Connect your agent</button>
  </div>`;
}

function sorter(k) {
  return {
    'value-desc': (a,b) => Math.abs(signed(b,latest(b))) - Math.abs(signed(a,latest(a))),
    'value-asc':  (a,b) => Math.abs(signed(a,latest(a))) - Math.abs(signed(b,latest(b))),
    'name':       (a,b) => a.name.localeCompare(b.name),
    'change':     (a,b) => changeFor(b).pct - changeFor(a).pct,
    'updated':    (a,b) => ((latest(a)||{}).date||'') < ((latest(b)||{}).date||'') ? 1 : -1
  }[k] || (() => 0);
}
const SORTS = [['value-desc','Value, high to low'],['value-asc','Value, low to high'],['name','Name'],['change','Change'],['updated','Last updated']];
const sortLabel = () => (SORTS.find(s => s[0] === S.settings.sort) || SORTS[0])[1];
function filterSummary() {
  const p = [];
  if (S.settings.filterTypes.length) p.push(S.settings.filterTypes.map(id => typeOf(id).name).join(', '));
  if (S.settings.filterTags.length) p.push(S.settings.filterTags.join(', '));
  return p.join(' · ');
}

/* ================= HOLDING DETAIL (J3, J4) ================= */
function renderHolding(id) {
  const h = holdingOf(id);
  if (!h) { location.hash = '#/home'; return; }
  const c = changeFor(h), v = latest(h), tp = typeOf(h.typeId);
  const pts = h.values.map(x => ({ x:x.date, y:Math.abs(x.base) }));

  const bars = [];
  for (let i = 5; i >= 0; i--) {
    const end = i === 0 ? TODAY : periodEnd('monthly', i, TODAY);
    const prev = periodEnd('monthly', i + 1, TODAY);
    const a = valueAsOf(h, end), b = valueAsOf(h, prev);
    bars.push({ label:new Date(end + 'T00:00:00Z').toLocaleDateString('en-SG',{month:'narrow',timeZone:'UTC'}),
                value:(a ? Math.abs(a.base) : 0) - (b ? Math.abs(b.base) : 0) });
  }

  const history = h.values.slice().reverse().map(x => `
    <button class="row" data-act="expand-value" data-v="${x.id}">
      <span class="grow">
        <span class="name">${esc(money(Math.abs(x.base)))}
          ${x.source === 'agent' ? `<span class="chip agent">${esc(x.client||'agent')}</span>` : ''}</span>
        <span class="sub">${esc(fmtDate(x.date))}${x.ccy !== S.settings.defaultCcy ? ' · ' + esc(money(x.amount, x.ccy)) : ''}</span>
      </span>
      <span class="chev">${S.expanded === x.id ? '⌄' : '›'}</span>
    </button>
    ${S.expanded === x.id ? `<div style="padding:2px 14px 14px;border-bottom:1px solid var(--line)">
      ${x.ccy !== S.settings.defaultCcy ? `<div class="kv"><span>Original</span><b>${esc(money(x.amount, x.ccy))}</b></div>
        <div class="kv"><span>Rate used</span><b>1 ${esc(x.ccy)} = ${x.rate} ${esc(S.settings.defaultCcy)}</b></div>
        <div class="kv"><span>Rate date</span><b>${esc(fmtDate(x.rateDate))}</b></div>` : ''}
      <div class="kv"><span>Entered</span><b>${esc(fmtDateTime(x.enteredAt))}</b></div>
      <div class="kv"><span>Source</span><b>${x.source === 'agent' ? esc(x.client) + ' (agent)' : 'You, on the web'}</b></div>
      <div style="display:flex;gap:8px;margin-top:10px">
        <button class="btn sec sm" data-act="edit-value" data-h="${h.id}" data-v="${x.id}">Edit</button>
        <button class="btn sec sm" data-act="delete-value" data-h="${h.id}" data-v="${x.id}" style="color:var(--neg)">Delete</button>
      </div></div>` : ''}`).join('');

  $('#s-holding').innerHTML = `
  <div class="topbar">
    <button class="back" data-go="#/home">‹ Net worth</button>
    <span style="flex:1"></span>
    <button class="iconbtn" data-act="holding-menu" data-h="${h.id}">⋯</button>
  </div>
  <div class="pad" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
      <span class="dot" style="background:${tp.colour}"></span>
      <span class="muted" style="font-size:13px;font-weight:550">${esc(tp.name)}${h.kind==='liability'?' · liability':''}</span>
    </div>
    <h1 style="font-size:23px;letter-spacing:-.02em;margin:0 0 8px">${esc(h.name)}</h1>
    <div style="display:flex;gap:6px;flex-wrap:wrap">
      <span class="chip">${esc(ACCESS[h.access].label)}</span>
      ${h.tags.map(t => `<span class="chip">${esc(t)}</span>`).join('')}
      ${isStale(h) ? `<span class="chip stale">stale · ${esc(ago(v.date))}</span>` : ''}
    </div>
  </div>
  <div class="card">
    <div class="nw-label">CURRENT VALUE</div>
    <div class="nw">${h.kind==='liability'?'−':''}${esc(money(Math.abs(c.now)))}</div>
    ${h.ccy !== S.settings.defaultCcy && v ? `<div class="muted" style="font-size:13.5px;margin-bottom:4px">${esc(money(v.amount, v.ccy))} at ${v.rate}</div>` : ''}
    <div class="nw-chg ${cls(c.abs)}">${esc(money(c.abs, null, {signed:true}))} · ${esc(pct(c.pct))}</div>
    <button class="baseline-btn" data-act="open-baseline">vs ${esc(baselineLabel().toLowerCase())} ▾</button>
  </div>
  <div class="card">${lineChart(pts, { px:120 })}</div>
  <div class="card">
    <div class="section-h" style="margin:0 0 10px"><h2>Change by month</h2></div>
    ${barChart(bars)}
  </div>
  <div class="btn-row"><button class="btn" data-act="add-value" data-h="${h.id}">+ Add value</button></div>
  <div class="section-h"><h2>History · ${h.values.length}</h2></div>
  <div class="card flush">${history || '<div class="empty"><p class="muted">No values yet.</p></div>'}</div>`;
}

/* ================= ADD / EDIT HOLDING (J2) ================= */
function renderAdd(kind, presetType) {
  const k = kind || 'asset';
  $('#s-add').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/home">‹ Cancel</button><h1 style="text-align:center">New ${k}</h1><span style="width:44px"></span></div>
  <div class="card">
    <div class="seg" style="margin-bottom:16px">
      <button class="${k==='asset'?'on':''}" data-go="#/add/asset">Asset</button>
      <button class="${k==='liability'?'on':''}" data-go="#/add/liability">Liability</button>
    </div>
    <div class="field"><label>Name <span class="req">*</span></label>
      <input id="f-name" placeholder="${k==='asset'?'e.g. DBS Multiplier':'e.g. HDB loan'}"></div>
    <div class="field"><label>Type <span class="req">*</span></label>
      <select id="f-type">${S.types.filter(t => k==='liability' ? t.id==='t-loan' : t.id!=='t-loan')
        .map(t => `<option value="${t.id}" ${t.id===presetType?'selected':''}>${esc(t.name)}</option>`).join('')}
        <option value="__new">+ New type…</option></select></div>
    <div class="two">
      <div class="field"><label>Currency <span class="req">*</span></label>
        <select id="f-ccy">${['SGD','USD','MYR','HKD','AUD','GBP','EUR','JPY'].map(c => `<option ${c===S.settings.defaultCcy?'selected':''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>Value <span class="req">*</span></label>
        <input id="f-amount" type="number" inputmode="decimal" placeholder="0"></div>
    </div>
    <div class="field"><label>As of</label><input id="f-date" type="date" value="${TODAY}" max="${TODAY}">
      <div class="hint">Back-dating is fine — the newest date is what counts toward your total.</div></div>
    ${k === 'asset' ? `<div class="field"><label>How accessible is it?</label>
      <select id="f-access">
        <option value="accessible">Readily accessible — I could use it this month</option>
        <option value="illiquid">Illiquid — I'd have to sell it</option>
        <option value="locked">Locked — CPF, unvested, or otherwise untouchable</option>
      </select>
      <div class="hint">This is what stops your agent counting CPF or home equity when you ask
        whether you can afford something.</div></div>` : ''}
    <div class="field"><label>Tags</label>
      <div class="tagpick" id="f-tags">
        ${(S.tags.length ? S.tags : SEED_TAGS).map(t => `<button type="button" data-act="toggle-newtag" data-v="${esc(t)}">${esc(t)}</button>`).join('')}
        <button type="button" data-act="new-tag">+ New</button></div></div>
    <button class="btn" data-act="save-holding" data-k="${k}">Save</button>
  </div>
  <div class="note">Only name, type, currency and value are required. Everything else you can add later.</div>`;
  if (presetType) { const el = document.getElementById('f-name'); if (el) el.focus(); }
}

/* ================= INSIGHTS (J11) =================
   PROVISIONAL LAYOUT — built from docs/01-prd.md §6 J11 and the mockups README.
   The Insights frames themselves have never been seen; behaviour here is the
   contract, the visual treatment is a proposal. See prototype-notes.md §6. */
function renderInsights() {
  const view = S.settings.insightsView;
  const { periods, list } = insightsPeriods(view);
  const withData = periods.filter(p => p.hasData || p.value !== 0);
  const excl = S.settings.insightsExclude;
  const comparable = periods.filter(p => p.abs != null);

  const rows = periods.map(p => `
    <button class="row" data-go="#/period/${view}/${p.i}">
      <span class="grow">
        <span class="name">${esc(p.label)}${p.current ? '<span class="chip">so far</span>' : ''}</span>
        <span class="sub">${esc(money(p.value))} at ${p.current ? 'today' : esc(fmtDate(p.end))}</span>
      </span>
      <span class="amt ${p.abs == null ? 'muted' : cls(p.abs)}">
        ${p.abs == null ? '—' : esc(money(p.abs, null, { signed:true }))}
        <span class="chg ${p.abs == null ? 'muted' : cls(p.abs)}">${p.pct == null ? 'no earlier period' : esc(pct(p.pct))}</span>
      </span>
      <span class="chev">›</span></button>`).join('');

  $('#s-insights').innerHTML = `
  <div class="topbar"><h1>Insights</h1>
    <button class="iconbtn" data-act="open-insights-filter">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M6 12h12M10 18h4"/></svg></button>
  </div>
  <div class="pad"><div class="seg" style="margin-bottom:14px">
    ${[['monthly','Monthly'],['quarterly','Quarterly'],['yearly','Yearly']]
      .map(([v,l]) => `<button data-act="set-insights-view" data-v="${v}" class="${view===v?'on':''}">${l}</button>`).join('')}
  </div></div>

  ${excl.length ? `<div class="note"><b>${excl.length} exclusion${excl.length>1?'s':''} active:</b>
    ${esc(excl.map(x => x.label).join(', '))}. Hidden from Insights only — your net worth on Home is unchanged.
    <button class="btn ghost sm" style="margin-top:8px" data-act="clear-exclusions">Clear exclusions</button></div>` : ''}
  ${(S.settings.filterTypes.length || S.settings.filterTags.length) ? `<div class="note"><b>Filter:</b> ${esc(filterSummary())}
    — every figure below is over the filtered set only.</div>` : ''}

  ${comparable.length === 0 ? `<div class="card">
      <div style="font-weight:600;margin-bottom:6px">Not enough history yet</div>
      <p class="muted" style="margin:0;font-size:14px">You have ${withData.length} ${view.replace('ly','')}${withData.length===1?'':'s'} of data.
      A ${view.replace('ly','')}-on-${view.replace('ly','')} comparison needs two, so there is nothing to compare yet —
      keep recording values and the first comparison appears ${view==='monthly'?'next month':view==='quarterly'?'next quarter':'next year'}.</p>
    </div>` : `
    <div class="card"><div class="section-h" style="margin:0 0 10px"><h2>Change per ${view.replace('ly','')}</h2></div>
      ${barChart(comparable.slice(0, 8).reverse().map(p => ({ label:shortLabel(p), value:p.abs })))}
    </div>`}

  <div class="card flush">${rows}</div>
  <div class="note">Periods are worked out from the <b>dates on your values</b>, not when you typed them in.
    Add a back-dated value and the periods it belongs to recompute.</div>`;
}
function shortLabel(p) {
  const d = new Date(p.end + 'T00:00:00Z');
  if (p.view === 'monthly') return d.toLocaleDateString('en-SG', { month:'narrow', timeZone:'UTC' });
  if (p.view === 'quarterly') return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1);
  return String(d.getUTCFullYear()).slice(2);
}

function renderPeriod(view, i) {
  const { periods, list } = insightsPeriods(view);
  const p = periods.find(x => x.i === +i);
  if (!p) { location.hash = '#/insights'; return; }
  const cs = contributors(p, list);
  const rows = cs.map(c => `
    <button class="row" data-go="#/holding/${c.h.id}">
      <span class="dot" style="background:${typeOf(c.h.typeId).colour}"></span>
      <span class="grow"><span class="name">${esc(c.h.name)}
          ${c.carried ? '<span class="chip carried">carried forward</span>' : ''}</span>
        <span class="sub">${esc(typeOf(c.h.typeId).name)} · ${esc(money(Math.abs(c.now)))} at period end</span></span>
      <span class="amt ${cls(c.delta)}">${esc(money(c.delta, null, { signed:true }))}</span>
      <span class="chev">›</span></button>`).join('');

  $('#s-period').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/insights">‹ Insights</button></div>
  <div class="card">
    <div class="nw-label">${esc(p.label.toUpperCase())}${p.current ? ' · SO FAR' : ''}</div>
    <div class="nw">${esc(money(p.value))}</div>
    <div class="nw-chg ${p.abs == null ? 'muted' : cls(p.abs)}">
      ${p.abs == null ? 'No earlier period to compare with' : esc(money(p.abs, null, { signed:true })) + ' · ' + esc(pct(p.pct))}</div>
    <div class="muted" style="font-size:12.5px;margin-top:8px">${esc(fmtDate(p.start))} – ${esc(p.current ? 'today' : fmtDate(p.end))}</div>
  </div>
  <div class="section-h"><h2>What drove it</h2></div>
  <div class="card flush">${rows || '<div class="empty"><p class="muted">Nothing moved in this period.</p></div>'}</div>
  ${cs.some(c => c.carried) ? `<div class="note"><b>Carried forward</b> means no value was recorded inside this period,
    so the last known one before the period ended was used. It is not a measurement.</div>` : ''}
  <div class="note">Multi-currency holdings use the conversion recorded on each entry, so a period's
    change is not distorted by FX that moved after the fact.</div>`;
}

/* ================= AGENT / CONNECT (J5) ================= */
const MCP_URL = 'https://netnet.app/mcp';
function renderAgent() {
  const conns = S.account.connections || [];
  const verified = S.account.verified;
  $('#s-agent').innerHTML = `
  <div class="topbar"><h1>Your agent</h1></div>

  ${!verified ? `<div class="note warn"><b>Verify your email first.</b> Agent connection needs a verified
    account — everything else in NetNet works without it.
    <button class="btn sm" style="margin-top:10px" data-act="verify">Resend verification</button>
    <button class="btn ghost sm" data-act="mock-verify">(prototype: mark verified)</button></div>` : ''}

  ${conns.filter(c => c.active).map(c => `<div class="card">
    <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
      <span class="dot" style="background:var(--pos);border-radius:50%"></span>
      <b>${esc(c.client)} — connected</b></div>
    <div class="kv"><span>Connected</span><b>${esc(fmtDateTime(c.connectedAt))}</b></div>
    <div class="kv"><span>Last tool call</span><b>${esc(fmtDateTime(c.lastCall))}</b></div>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button class="btn sm" data-go="#/agent/chat">Try it</button>
      <button class="btn sec sm" data-act="revoke" data-v="${c.id}" style="color:var(--neg)">Revoke</button>
    </div></div>`).join('')}

  <div class="section-h"><h2>${conns.filter(c=>c.active).length ? 'Connect another client' : 'Connect a client'}</h2></div>
  <div class="card">
    <div class="seg" style="margin-bottom:14px">
      ${['Claude','ChatGPT'].map(c => `<button data-act="set-client" data-v="${c}" class="${(S.uiClient||'Claude')===c?'on':''}">${c}</button>`).join('')}
    </div>
    ${(S.uiClient || 'Claude') === 'Claude' ? `
      <ol class="steps">
        <li>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</li>
        <li>Paste the NetNet URL below.</li>
        <li>Claude opens NetNet in your browser — press <b>Allow</b>.</li>
        <li>Done. NetNet's tools appear in Claude. No token to copy anywhere.</li>
      </ol>` : `
      <ol class="steps">
        <li>In ChatGPT, open <b>Settings → Connectors → Create</b>.</li>
        <li>Paste the NetNet URL below and choose OAuth.</li>
        <li>Approve NetNet when the browser window opens.</li>
        <li>Done. NetNet's tools appear in ChatGPT. No token to copy anywhere.</li>
      </ol>
      <div class="note warn" style="margin:12px 0 0">ChatGPT currently exposes custom connectors on paid
        plans only, and may need developer mode switched on. Stage 3 re-checks this before launch.</div>`}
    <div class="urlbox"><span class="mono">${MCP_URL}</span>
      <button class="btn ghost sm" style="width:auto;padding:6px 10px" data-act="copy-url">Copy</button></div>
    <button class="btn" style="margin-top:14px" data-act="connect">I've pasted it — continue</button>
    <button class="btn ghost sm" data-act="fail-connect">(prototype: simulate a failure)</button>
  </div>

  <div class="section-h"><h2>What it can do</h2></div>
  <div class="card">
    <p class="muted" style="margin:0 0 12px;font-size:14px">Everything you can do here, your agent can do —
      and nothing you can't undo.</p>
    <div class="kv"><span>Read your position, history and currency exposure</span><b>✓</b></div>
    <div class="kv"><span>Create, update, archive and delete holdings</span><b>✓</b></div>
    <div class="kv"><span>Record and correct values</span><b>✓</b></div>
    <div class="kv"><span>Manage your types, tags and accessibility</span><b>✓</b></div>
    <div class="kv"><span>Every write logged, attributed and reversible</span><b>✓</b></div>
  </div>
  <div class="note"><b>Your statements never reach us.</b> Your agent reads them where it runs and
    sends NetNet only the numbers. There is no AI in NetNet's backend.</div>`;
}

/* ================= AGENT DEMO (J6, J8) ================= */
const SCRIPT = [
  { who:'user', text:"Here's my IBKR statement for September — update NetNet." },
  { who:'tool', text:'<b>netnet.find_holding</b> { query: "IBKR" }<br>→ 1 likely match: “IBKR — global equities” (USD) · last value 21 Sep' },
  { who:'ai',   text:'Found your existing IBKR holding, so I\'ll update it rather than create a second one. The statement closes at USD 191,480.' },
  { who:'tool', text:'<b>netnet.record_value</b> { holding_id: "h-ibkr", amount: 191480, currency: "USD", as_of: "2026-09-23" }<br>→ ok · SGD 254,090 at 1.3269', write:true },
  { who:'ai',   text:'Done — IBKR is updated. Your net worth is now <b>{{NW}}</b>. That one holding is 21% of your assets.' },
  { who:'user', text:"Can I afford a S$120k car?" },
  { who:'tool', text:'<b>netnet.get_position_summary</b> { include: ["accessibility","staleness","currency_exposure"] }<br>→ 1 call, no follow-ups needed' },
  { who:'ai',   text:'Short answer: not comfortably in cash today.<br><br>You\'re worth <b>{{NW}}</b>, but most of it can\'t be touched — CPF, the flat, and unvested RSUs are locked or illiquid. What\'s <b>readily accessible</b> is <b>{{ACC}}</b>, and part of that is your emergency fund.<br><br>Two caveats from the data itself: your car is <b>{{CARSTALE}}</b> out of date, so the trade-in figure is guesswork, and 30% of your accessible money is USD, so the price you pay depends on where SGD/USD sits when you buy.' }
];
function renderChat() {
  const step = S.chatStep || 0;
  const t = totals(activeHoldings({ ignoreFilter:true }));
  const car = S.holdings.find(h => h.id === 'h-car');
  const fill = s => s.replace('{{NW}}', money(t.now)).replace('{{ACC}}', money(t.accessible))
    .replace('{{CARSTALE}}', car && latest(car) ? ago(latest(car).date) : 'a while');
  const msgs = SCRIPT.slice(0, step).map(m =>
    `<div class="msg ${m.who}">${m.who === 'tool' ? m.text : esc(fill(m.text)).replace(/&lt;b&gt;/g,'<b>').replace(/&lt;\/b&gt;/g,'</b>').replace(/&lt;br&gt;/g,'<br>')}</div>`).join('');
  $('#s-chat').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/agent">‹ Your agent</button>
    <h1 style="font-size:16px">Claude · NetNet connected</h1></div>
  <div class="note">This is a <b>replay of a real conversation shape</b>, to show what the connection
    buys you. In the product this happens in Claude or ChatGPT, not here.</div>
  <div class="chat">${msgs || '<div class="typing">Press Play to walk through it.</div>'}</div>
  <div class="btn-row">
    ${step < SCRIPT.length ? `<button class="btn" data-act="chat-next">${step ? 'Continue' : 'Play'}</button>` : ''}
    ${step ? '<button class="btn sec" data-act="chat-reset">Replay</button>' : ''}
  </div>
  ${step >= 5 ? `<div class="note"><b>That write is real in this prototype.</b> It's on Home, and in
    Activity you can see who made it and undo it.
    <button class="btn ghost sm" style="margin-top:8px" data-go="#/activity">Open activity log</button></div>` : ''}`;
}

/* ================= ACTIVITY / AUDIT (J7) ================= */
function renderActivity() {
  const turns = {};
  const rows = [];
  S.log.slice(0, 60).forEach(e => {
    if (e.turn && !e.undone) { (turns[e.turn] = turns[e.turn] || []).push(e); }
    rows.push(e);
  });
  const seenTurn = {};
  const html = rows.map(e => {
    const h = holdingOf(e.holdingId);
    const group = e.turn && turns[e.turn] && turns[e.turn].length > 1;
    let head = '';
    if (group && !seenTurn[e.turn]) {
      seenTurn[e.turn] = true;
      head = `<div style="padding:11px 14px 4px;display:flex;align-items:center;gap:8px;background:var(--agent-soft)">
        <span class="chip agent">${esc(e.client)} · one turn · ${turns[e.turn].length} changes</span>
        <span style="flex:1"></span>
        <button class="btn ghost sm" style="width:auto;padding:4px 8px" data-act="undo-turn" data-v="${esc(e.turn)}">Undo all</button></div>`;
    }
    return head + `<div class="row" style="${e.undone ? 'opacity:.5' : ''}">
      <span class="grow">
        <span class="name">${esc(describeLog(e, h))} ${e.undone ? '<span class="chip">undone</span>' : ''}</span>
        <span class="sub">${esc(fmtDateTime(e.at))} · ${e.source === 'agent' ? esc(e.client) + ' (agent)' : 'you, on the web'}</span>
      </span>
      ${!e.undone && e.kind !== 'holding.create' ? `<button class="btn ghost sm" style="width:auto;padding:5px 9px" data-act="undo" data-v="${e.id}">Undo</button>` : ''}
    </div>`;
  }).join('');

  $('#s-activity').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/home">‹ Net worth</button><h1 style="font-size:19px">Activity</h1></div>
  <div class="note">Every change, from the web or from an agent, in one list — what changed, from what
    to what, by whom. Undo restores the previous state exactly.</div>
  <div class="card flush">${html}</div>`;
}
function describeLog(e, h) {
  const n = h ? h.name : 'a holding';
  if (e.kind === 'holding.create') return 'Added ' + n;
  if (e.kind === 'holding.archive') return 'Archived ' + n;
  if (e.kind === 'holding.delete') return 'Deleted ' + n;
  if (e.kind === 'value.create') return n + ' → ' + money(e.after.amount, e.after.ccy) + ' (' + fmtDate(e.after.date) + ')';
  if (e.kind === 'value.edit') return n + ': ' + money(e.before.amount, e.before.ccy) + ' → ' + money(e.after.amount, e.after.ccy);
  if (e.kind === 'value.delete') return n + ': removed ' + money(e.before.amount, e.before.ccy);
  if (e.kind === 'connection.revoke') return 'Revoked ' + (e.after.client || 'a client');
  return e.kind;
}
