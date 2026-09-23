/* NetNet prototype — behaviour.
   Stage 2 design code: deliberately throwaway. Vanilla JS, no build, no framework.
   Stack decisions belong to Stage 3. */

/* ================= state ================= */
const LS = 'netnet-proto-v2';
let S = load();

function load() {
  try { const raw = localStorage.getItem(LS); if (raw) return JSON.parse(raw); } catch (e) {}
  return hydrate(seededState());
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function reset(mode) {
  S = hydrate(mode === 'empty' ? emptyState() : seededState());
  save(); closeSheet();
  location.hash = mode === 'empty' ? '#/landing' : '#/home';
  render();
}

/* The audit log (J7) is built FROM the value history, so every row on screen has
   a log entry behind it rather than the log being a separate fiction. */
function hydrate(s) {
  const log = [];
  s.holdings.forEach(h => {
    log.push({ id:'lg-c-'+h.id, at:h.values[0] ? h.values[0].enteredAt : TODAY+'T12:00:00Z',
      kind:'holding.create', holdingId:h.id, source:'web', client:null, turn:null,
      before:null, after:{ name:h.name }, undone:false });
    h.values.forEach(v => log.push({
      id:'lg-v-'+v.id, at:v.enteredAt, kind:'value.create', holdingId:h.id, valueId:v.id,
      source:v.source, client:v.client, turn:v.turn,
      before:null, after:{ amount:v.amount, ccy:v.ccy, date:v.date }, undone:false }));
  });
  if (s.holdings.find(h => h.id === 'h-sold'))
    log.push({ id:'lg-arch-sold', at:'2025-08-14T10:22:00Z', kind:'holding.archive', holdingId:'h-sold',
      source:'web', client:null, turn:null, before:{archived:false}, after:{archived:true}, undone:false });
  const btc = s.holdings.find(h => h.id === 'h-btc');
  if (btc && btc.values.length) {
    const v = btc.values[btc.values.length - 1];
    log.push({ id:'lg-corr-btc', at:'2026-08-05T08:05:00Z', kind:'value.edit', holdingId:'h-btc',
      valueId:v.id, source:'web', client:null, turn:null, originalSource:'agent',
      before:{ amount:Math.round(v.amount*1.09/10)*10, ccy:v.ccy, date:v.date },
      after:{ amount:v.amount, ccy:v.ccy, date:v.date }, undone:false });
  }
  s.log = log.sort((a, b) => b.at.localeCompare(a.at));
  return s;
}

/* ================= analytics (§3.5) =================
   Names, counts and timings only — never amounts or holding names (N9).
   The PROTO drawer shows the stream so the event contract is reviewable now. */
function fire(name, props) {
  S.events.unshift({ name, props:props||{}, at:new Date().toISOString() });
  if (S.events.length > 150) S.events.pop();
  console.log('[event]', name, props || {});
  save();
}

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const typeOf = id => S.types.find(t => t.id === id) || { id:'t-general', name:'General', colour:'#94a3b8' };
const holdingOf = id => S.holdings.find(h => h.id === id);
const uid = p => p + '-' + Math.random().toString(36).slice(2, 9);

function money(n, ccy, o) {
  o = o || {};
  const abs = Math.abs(n);
  const d = o.decimals != null ? o.decimals : (o.cents ? 2 : 0);
  const s = abs.toLocaleString('en-SG', { minimumFractionDigits:d, maximumFractionDigits:d });
  return (n < 0 ? '−' : (o.signed && n > 0 ? '+' : '')) + '$' + s + (o.ccy ? ' ' + (ccy || S.settings.defaultCcy) : '');
}
function compact(n) {
  const a = Math.abs(n), sign = n < 0 ? '−' : '';
  if (a >= 1e6) return sign + '$' + (a / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (a >= 1e3) return sign + '$' + Math.round(a / 1e3) + 'K';
  return sign + '$' + Math.round(a);
}
function compactSigned(n) { return (n > 0 ? '+' : '') + compact(n); }
const pct = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%';
const cls = n => n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted';
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' });
const fmtDT = iso => new Date(iso).toLocaleDateString('en-SG', { day:'numeric', month:'short', year:'numeric' }) +
  ', ' + new Date(iso).toLocaleTimeString('en-SG', { hour:'numeric', minute:'2-digit' });
function ago(d) {
  const n = daysBetween(d, TODAY);
  if (n < 1) return 'today';
  if (n < 7) return n + ' days ago';
  if (n < 45) return 'about ' + Math.round(n / 7) + ' weeks ago';
  if (n < 400) return 'about ' + Math.round(n / 30) + ' months ago';
  const y = n / 365;
  return 'about ' + (y < 1.5 ? 'a year' : Math.round(y) + ' years') + ' ago';
}
const ACCESS = {
  accessible:{ label:'Readily accessible', hint:'I could use it this month' },
  illiquid:  { label:'Illiquid',           hint:"I'd have to sell it first" },
  locked:    { label:'Locked',             hint:'CPF, unvested, or otherwise untouchable' },
  'n/a':     { label:'—',                  hint:'' }
};

/* ================= core computation ================= */
function valueAsOf(h, dateStr) {
  let out = null;
  for (const v of h.values) { if (v.date <= dateStr) out = v; else break; }
  return out;
}
const latest = h => h.values.length ? h.values[h.values.length - 1] : null;
const signed = (h, v) => v ? (h.kind === 'liability' ? -v.base : v.base) : 0;

/* One filter pipeline, used by Home and (with the extra exclusions) by Insights. */
function applyFilter(list, f) {
  let out = list.filter(h => f.archived ? true : !h.archived);
  if (f.showOnly === 'assets') out = out.filter(h => h.kind === 'asset');
  if (f.showOnly === 'liabilities') out = out.filter(h => h.kind === 'liability');
  if (f.types && f.types.length) out = out.filter(h => f.types.includes(h.typeId));
  if (f.tags && f.tags.length) {
    out = out.filter(h => f.tagMode === 'AND'
      ? f.tags.every(t => h.tags.includes(t))
      : f.tags.some(t => h.tags.includes(t)));
  }
  if (f.exTypes && f.exTypes.length) out = out.filter(h => !f.exTypes.includes(h.typeId));
  if (f.exTags && f.exTags.length) {
    out = out.filter(h => !(f.exTagMode === 'AND'
      ? f.exTags.every(t => h.tags.includes(t))
      : f.exTags.some(t => h.tags.includes(t))));
  }
  if (f.exHoldings && f.exHoldings.length) out = out.filter(h => !f.exHoldings.includes(h.id));
  return out;
}
const homeFilter = () => ({ showOnly:S.settings.showOnly, types:S.settings.filterTypes,
  tags:S.settings.filterTags, tagMode:S.settings.tagMode, archived:S.settings.filterArchived });
const insightsFilter = () => ({ showOnly:S.settings.inShowOnly, types:S.settings.inTypes,
  tags:S.settings.inTags, tagMode:S.settings.inTagMode, archived:S.settings.inArchived,
  exTypes:S.settings.exTypes, exTags:S.settings.exTags, exTagMode:S.settings.exTagMode,
  exHoldings:S.settings.exHoldings });
const homeHoldings = () => applyFilter(S.holdings, homeFilter());
const insightsHoldings = () => applyFilter(S.holdings, insightsFilter());
const homeFiltered = () => {
  const f = homeFilter();
  return f.showOnly !== 'all' || f.types.length || f.tags.length || f.archived;
};
const insightsFiltered = () => {
  const s = S.settings;
  return s.inShowOnly !== 'all' || s.inTypes.length || s.inTags.length || s.inArchived;
};
const exclusionCount = () => S.settings.exTypes.length + S.settings.exTags.length + S.settings.exHoldings.length;

function netWorthAsOf(dateStr, list) {
  return list.reduce((sum, h) => sum + signed(h, valueAsOf(h, dateStr)), 0);
}
function splitAsOf(dateStr, list) {
  let assets = 0, liabilities = 0;
  list.forEach(h => {
    const v = valueAsOf(h, dateStr); if (!v) return;
    if (h.kind === 'liability') liabilities += v.base; else assets += v.base;
  });
  return { assets, liabilities, net:assets - liabilities };
}

/* --- comparison baseline (J4). Resolved PER HOLDING and summed, so the total and
       every row on screen are measured against the same thing. --- */
const BASELINES = [
  { id:'initial',      label:'Initial Value' },
  { id:'last-update',  label:'Last Update Value' },
  { id:'last-month',   label:'Last Month' },
  { id:'last-quarter', label:'Last Quarter' },
  { id:'jan1',         label:'January 1, ' + TODAY.slice(0, 4) },
  { id:'last-year',    label:'Last Year' }
];
const baselineLabel = () => (BASELINES.find(b => b.id === S.settings.baseline) || BASELINES[3]).label;

function baselineFor(h) {
  const b = S.settings.baseline;
  if (!h.values.length) return { value:0, exact:true };
  if (b === 'initial') return { value:signed(h, h.values[0]), exact:true };
  if (b === 'last-update') {
    const v = h.values.length > 1 ? h.values[h.values.length - 2] : h.values[0];
    return { value:signed(h, v), exact:true };
  }
  const asOf = { 'last-month':addMonths(TODAY, -1), 'last-quarter':addMonths(TODAY, -3),
                 'jan1':TODAY.slice(0, 4) + '-01-01', 'last-year':addMonths(TODAY, -12) }[b];
  const v = valueAsOf(h, asOf);
  if (v) return { value:signed(h, v), exact:true };
  return { value:signed(h, h.values[0]), exact:false }; // holding pre-dates the baseline
}
function changeFor(h) {
  const now = signed(h, latest(h)), b = baselineFor(h);
  return { now, base:b.value, abs:now - b.value,
           pct: b.value ? ((now - b.value) / Math.abs(b.value)) * 100 : 0, exact:b.exact };
}
function totals(list) {
  let now = 0, base = 0, assets = 0, liabilities = 0, accessible = 0, exact = true;
  list.forEach(h => {
    const c = changeFor(h);
    now += c.now; base += c.base; if (!c.exact) exact = false;
    if (h.kind === 'liability') liabilities += Math.abs(c.now);
    else { assets += c.now; if (h.access === 'accessible') accessible += c.now; }
  });
  return { now, base, abs:now - base, pct: base ? ((now - base) / Math.abs(base)) * 100 : 0,
           assets, liabilities, accessible, exact };
}
const isStale = h => {
  const v = latest(h);
  return !v || daysBetween(v.date, TODAY) > Math.max(45, (h.cadenceDays || 30) * 1.6);
};
function byType(list) {
  const map = {};
  list.filter(h => h.kind === 'asset').forEach(h => {
    const t = typeOf(h.typeId);
    (map[t.id] = map[t.id] || { id:t.id, name:t.name, colour:t.colour, value:0 }).value += signed(h, latest(h));
  });
  return Object.values(map).filter(s => s.value > 0).sort((a, b) => b.value - a.value);
}

/* --- periods (J11). Derived from VALUE DATES, never from entry dates. --- */
function periodEnd(view, i) {
  const d = new Date(TODAY + 'T00:00:00Z');
  if (view === 'monthly') { d.setUTCMonth(d.getUTCMonth() - i + 1, 1); d.setUTCDate(0); }
  if (view === 'quarterly') { d.setUTCMonth(Math.floor(d.getUTCMonth() / 3) * 3 - i * 3 + 3, 1); d.setUTCDate(0); }
  if (view === 'yearly') { d.setUTCFullYear(d.getUTCFullYear() - i + 1, 0, 1); d.setUTCDate(0); }
  return d.toISOString().slice(0, 10);
}
function periodStart(view, end) {
  const d = new Date(end + 'T00:00:00Z');
  if (view === 'monthly') d.setUTCDate(1);
  if (view === 'quarterly') d.setUTCMonth(Math.floor(d.getUTCMonth() / 3), 1);
  if (view === 'yearly') d.setUTCMonth(0, 1);
  return d.toISOString().slice(0, 10);
}
function periodLabel(view, end, short) {
  const d = new Date(end + 'T00:00:00Z');
  if (view === 'monthly') return short ? (d.getUTCMonth() + 1) + '-' + d.getUTCFullYear()
    : d.toLocaleDateString('en-SG', { month:'long', year:'numeric', timeZone:'UTC' });
  if (view === 'quarterly') return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + '/' + d.getUTCFullYear();
  return String(d.getUTCFullYear());
}
function earliestDate(list) {
  let e = null;
  list.forEach(h => h.values.forEach(v => { if (!e || v.date < e) e = v.date; }));
  return e;
}
/* Returns newest-first periods. cap = how many to keep (the range selector). */
function periodsFor(view, list, cap) {
  const first = earliestDate(list);
  if (!first) return [];
  const out = [];
  for (let i = 0; i < 200; i++) {
    const end = periodEnd(view, i);
    if (end < first && i > 0) break;
    const start = periodStart(view, end);
    const prevEnd = periodEnd(view, i + 1);
    const asOf = i === 0 ? TODAY : end;
    const split = splitAsOf(asOf, list);
    const prev = prevEnd >= first ? netWorthAsOf(prevEnd, list) : null;
    out.push({ view, i, end, start, asOf, current:i === 0,
      label:periodLabel(view, end), short:periodLabel(view, end, true),
      value:split.net, assets:split.assets, liabilities:split.liabilities, prev,
      abs: prev == null ? null : split.net - prev,
      pct: prev ? ((split.net - prev) / Math.abs(prev)) * 100 : null,
      hasData: list.some(h => h.values.some(v => v.date >= start && v.date <= end)) });
    if (cap && out.length >= cap) break;
  }
  return out;
}
function contributors(period, list) {
  const prevEnd = periodEnd(period.view, period.i + 1);
  return list.map(h => {
    const now = signed(h, valueAsOf(h, period.asOf));
    const before = signed(h, valueAsOf(h, prevEnd));
    return { h, delta:now - before, now,
      carried: !h.values.some(v => v.date >= period.start && v.date <= period.end) };
  }).filter(c => c.now !== 0 || c.delta !== 0).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
function distribution(periods, list) {
  return periods.map(p => {
    const segs = {};
    list.forEach(h => {
      const v = valueAsOf(h, p.asOf); if (!v) return;
      const t = typeOf(h.typeId);
      (segs[t.id] = segs[t.id] || { id:t.id, name:t.name, colour:t.colour, value:0 })
        .value += h.kind === 'liability' ? -v.base : v.base;
    });
    return { p, segs:Object.values(segs), total:p.value };
  });
}

/* --- ranges --- */
const HOME_RANGES = [['All',0],['6M',6],['YTD',-1],['1Y',12],['2Y',24],['4Y',48],['8Y',96]];
const INSIGHT_RANGES = {
  monthly:  [['All',0],['All+1',-2],['YTD',-1],['6M',6],['1Y',12],['2Y',24],['4Y',48]],
  quarterly:[['All',0],['All+1',-2],['YTD',-1],['1Y',4],['2Y',8],['4Y',16],['8Y',32]],
  yearly:   [['All',0],['All+1',-2],['2Y',2],['4Y',4],['8Y',8],['10Y',10]]
};
function ytdMonths() { return new Date(TODAY + 'T00:00:00Z').getUTCMonth() + 1; }
function rangeMonths(v) { return v === -1 ? ytdMonths() : v; }

/* ================= charts =================
   SVG carries geometry only, in a 0–100 x 0–100 box with preserveAspectRatio="none",
   so a chart fills whatever card it is in. Every piece of text is HTML positioned
   over or under it, so nothing is ever stretched. No chart library. */
function niceTicks(min, max, n) {
  const out = []; for (let i = 0; i <= n; i++) out.push(min + (max - min) * (i / n)); return out;
}
function sparkline(vals, colour) {
  if (vals.length < 2) return '<svg class="spark" viewBox="0 0 52 26"></svg>';
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1;
  const d = vals.map((v, i) => (i ? 'L' : 'M') + (i / (vals.length - 1) * 50 + 1).toFixed(1) + ' ' +
    (24 - ((v - min) / span) * 22).toFixed(1)).join(' ');
  return `<svg class="spark" viewBox="0 0 52 26" aria-hidden="true"><path d="${d}" fill="none"
    stroke="${colour}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
}

/* Multi-series line/area chart — Home trend, Insights assets-vs-liabilities. */
function lineChart(series, o) {
  o = o || {};
  const h = o.px || 170, PADL = 42;
  const pts0 = series[0] ? series[0].points : [];
  const all = series.flatMap(s => s.points.map(p => p.y));
  if (!all.length || pts0.length < 2)
    return '<div class="muted" style="padding:30px 0;text-align:center;font-size:13px">Not enough history to draw this yet.</div>';
  let min = o.includeZero ? Math.min(0, ...all) : Math.min(...all), max = Math.max(...all);
  if (min === max) { min -= 1; max += 1; }
  const ticks = niceTicks(min, max, 3);
  const fy = v => 100 - ((v - min) / (max - min)) * 100;
  const fx = i => (i / (pts0.length - 1)) * 100;
  const grid = S.settings.showZeroBounds
    ? ticks.map(t => `<line class="grid-l" x1="0" y1="${fy(t).toFixed(2)}" x2="100" y2="${fy(t).toFixed(2)}" vector-effect="non-scaling-stroke"/>`).join('')
    : '';
  const body = series.map(s => {
    const d = s.points.map((p, i) => (i ? 'L' : 'M') + fx(i).toFixed(2) + ' ' + fy(p.y).toFixed(2)).join(' ');
    const area = s.fill ? `<path d="${d} L100 100 L0 100 Z" fill="${s.colour}" opacity=".2"/>` : '';
    return area + `<path class="ln" d="${d}" stroke="${s.colour}" vector-effect="non-scaling-stroke"/>`;
  }).join('');
  const marks = (o.marks || []).map(m =>
    `<circle cx="${fx(m.i).toFixed(2)}" cy="${fy(m.y).toFixed(2)}" r="2.6" fill="var(--bg)"
      stroke="${series[0].colour}" stroke-width="2" vector-effect="non-scaling-stroke"/>`).join('');
  const yl = S.settings.showZeroBounds ? ticks.map(t =>
    `<span class="yt" style="top:${fy(t).toFixed(2)}%">${esc(compact(t))}</span>`).join('') : '';
  const idx = [0, Math.round((pts0.length - 1) / 3), Math.round((pts0.length - 1) * 2 / 3), pts0.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);
  const xl = idx.map(i => `<span>${esc(new Date(pts0[i].x + 'T00:00:00Z')
    .toLocaleDateString('en-SG', { month:'short', year:'numeric', timeZone:'UTC' }))}</span>`).join('');
  return `<div class="plot" style="height:${h}px;padding-left:${PADL}px">${yl}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}${body}${marks}</svg></div>
    <div class="axis" style="padding-left:${PADL}px">${xl}</div>`;
}

/* Growth bars with the change label above each bar — the mockups' signature chart. */
function growthBars(periods, o) {
  o = o || {};
  const n = periods.length;
  if (!n) return '<div class="muted" style="padding:30px 0;text-align:center;font-size:13px">No periods to show yet.</div>';
  const h = o.px || 170, PADL = 42;
  const m = Math.max(1, ...periods.map(p => Math.abs(p.abs || 0)));
  const fy = v => 50 - (v / m) * 48;
  const cellW = 100 / n, bw = Math.min(cellW * 0.52, 9);
  const grid = S.settings.showZeroBounds
    ? [m, m / 2, 0, -m / 2, -m].map(t =>
        `<line class="${t === 0 ? 'zero' : 'grid-l'}" x1="0" y1="${fy(t).toFixed(2)}" x2="100" y2="${fy(t).toFixed(2)}" vector-effect="non-scaling-stroke"/>`).join('')
    : `<line class="zero" x1="0" y1="50" x2="100" y2="50" vector-effect="non-scaling-stroke"/>`;
  const bars = periods.map((p, i) => {
    const v = p.abs || 0;
    const y = v >= 0 ? fy(v) : 50;
    const bh = Math.max(0.7, Math.abs(fy(v) - 50));
    const colour = v > 0 ? 'var(--pos)' : v < 0 ? 'var(--neg)' : 'var(--surface-3)';
    return `<rect x="${(cellW * i + cellW / 2 - bw / 2).toFixed(2)}" y="${y.toFixed(2)}"
      width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${colour}"/>`;
  }).join('');
  const yl = S.settings.showZeroBounds ? [m, m / 2, 0, -m / 2, -m].map(t =>
    `<span class="yt" style="top:${fy(t).toFixed(2)}%">${esc(compact(t))}</span>`).join('') : '';
  const labels = periods.map(p => {
    const v = p.abs || 0, c = v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted';
    return `<div class="${c}">${esc(compactSigned(v))}<br>${p.pct == null ? '—' : esc(pct(p.pct))}</div>`;
  }).join('');
  const xl = periods.map(p => `<div>${esc(p.short)}</div>`).join('');
  return `<div class="bl" style="padding-left:${PADL}px">${labels}</div>
    <div class="plot" style="height:${h}px;padding-left:${PADL}px">${yl}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}${bars}</svg></div>
    <div class="xl" style="padding-left:${PADL}px">${xl}</div>`;
}

/* Distribution Over Time — stacked bars, liabilities below the zero line. */
function stackedBars(dist, o) {
  o = o || {};
  const n = dist.length;
  if (!n) return '';
  const h = o.px || 190;
  let maxUp = 1, maxDn = 1;
  dist.forEach(d => {
    let up = 0, dn = 0;
    d.segs.forEach(s => s.value >= 0 ? up += s.value : dn += -s.value);
    maxUp = Math.max(maxUp, up); maxDn = Math.max(maxDn, dn);
  });
  const total = maxUp + maxDn, zero = (maxUp / total) * 100, sc = 100 / total;
  const cellW = 100 / n, bw = Math.min(cellW * 0.5, 9);
  const body = dist.map((d, i) => {
    const x = cellW * i + cellW / 2 - bw / 2;
    let up = zero, dn = zero, out = '';
    d.segs.filter(s => s.value >= 0).sort((a, b) => b.value - a.value).forEach(s => {
      const bh = s.value * sc; up -= bh;
      out += `<rect x="${x.toFixed(2)}" y="${up.toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${s.colour}"/>`;
    });
    d.segs.filter(s => s.value < 0).forEach(s => {
      const bh = -s.value * sc;
      out += `<rect x="${x.toFixed(2)}" y="${dn.toFixed(2)}" width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${s.colour}"/>`;
      dn += bh;
    });
    return out;
  }).join('');
  const tops = dist.map(d => `<div class="muted">${esc(compact(d.total))}</div>`).join('');
  const xl = dist.map(d => `<div>${esc(d.p.short)}</div>`).join('');
  return `<div class="bl">${tops}</div>
    <div class="plot" style="height:${h}px">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${body}
        <line class="zero" x1="0" y1="${zero.toFixed(2)}" x2="100" y2="${zero.toFixed(2)}" vector-effect="non-scaling-stroke"/></svg></div>
    <div class="xl">${xl}</div>`;
}

/* Pie with inline slice labels — the mockups' two pie views. Square, so it keeps
   its aspect ratio rather than filling. */
function pie(segs, o) {
  o = o || {};
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  const R = 62, cx = 80, cy = 80;
  let a = -Math.PI / 2, body = '', labels = '';
  segs.forEach(s => {
    const ang = (s.value / total) * Math.PI * 2, b = a + ang;
    const big = ang > Math.PI ? 1 : 0;
    const p = (r, t) => [(cx + r * Math.cos(t)).toFixed(2), (cy + r * Math.sin(t)).toFixed(2)];
    const [x1, y1] = p(R, a), [x2, y2] = p(R, b);
    body += segs.length === 1
      ? `<circle cx="${cx}" cy="${cy}" r="${R}" fill="${s.colour}"/>`
      : `<path d="M${cx} ${cy} L${x1} ${y1} A${R} ${R} 0 ${big} 1 ${x2} ${y2} Z" fill="${s.colour}" stroke="var(--surface)" stroke-width="1"/>`;
    const share = s.value / total;
    if (share > 0.045) {
      const [lx, ly] = p(R * 0.66, a + ang / 2);
      labels += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle" font-size="8.5"
        font-weight="700" fill="#fff" style="paint-order:stroke;stroke:rgba(0,0,0,.5);stroke-width:2.5px">${
        esc(o.mode === '$' ? compact(s.value) : (share * 100).toFixed(2) + '%')}</text>`;
    }
    a = b;
  });
  return `<svg viewBox="0 0 160 160" style="width:100%;max-width:200px;margin:0 auto;display:block" aria-hidden="true">${body}${labels}</svg>`;
}

/* ================= HOME (J1, J4) ================= */
const ICON = {
  filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
  dots:'<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  sort:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4v16l-3-3M17 20V4l3 3"/></svg>',
  close:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-6 8 6"/><path d="M6 10v10h12V10"/></svg>',
  insights:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-6 4 4 7-8"/><path d="M4 20h16"/></svg>',
  agent:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4"/><circle cx="9" cy="13" r="1.1" fill="currentColor"/><circle cx="15" cy="13" r="1.1" fill="currentColor"/></svg>',
  account:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8.5" r="3.6"/><path d="M4.8 20c1.2-3.7 3.9-5.6 7.2-5.6s6 1.9 7.2 5.6"/></svg>',
  activity:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l3 7 4-14 3 7h4"/></svg>'
};
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good Morning,' : h < 18 ? 'Good Afternoon,' : 'Good Evening,';
}

function renderHome() {
  if (!S.holdings.filter(h => !h.archived).length) { $('#s-home').innerHTML = emptyHome(); return; }
  const list = homeHoldings();
  const t = totals(list);
  const months = rangeMonths(S.settings.range);
  const first = earliestDate(list);
  const span = months || (first ? Math.max(2, Math.ceil(daysBetween(first, TODAY) / 30)) : 12);
  const pts = [];
  for (let m = span; m >= 0; m--) {
    const d = m === 0 ? TODAY : addMonths(TODAY, -m);
    pts.push({ x:d, y:netWorthAsOf(d, list) });
  }
  const segs = byType(list);
  const al = [{ name:'Assets', colour:'var(--pos)', value:t.assets },
              { name:'Liabilities', colour:'var(--neg)', value:t.liabilities }];
  const card = S.settings.homeCard;

  const rows = list.slice().sort(sorter(S.settings.sort)).map(h => {
    const c = changeFor(h), v = latest(h), tp = typeOf(h.typeId);
    const vals = h.values.slice(-14).map(x => Math.abs(x.base));
    const dir = vals.length > 1 ? vals[vals.length - 1] - vals[0] : 0;
    const good = h.kind === 'liability' ? -dir : dir;
    return `<button class="row" data-go="#/holding/${h.id}">
      ${sparkline(vals, good > 0 ? 'var(--pos)' : good < 0 ? 'var(--neg)' : 'var(--ink-3)')}
      <span class="grow">
        <span class="name">${esc(h.name)}
          ${v && v.source === 'agent' ? '<span class="chip agent">agent</span>' : ''}
          ${isStale(h) ? '<span class="chip stale">stale</span>' : ''}</span>
        <span class="sub">${v ? 'Updated ' + esc(ago(v.date)) : 'No value yet'}</span>
      </span>
      <span class="amt"><b class="num">${h.kind === 'liability' ? '−' : ''}${esc(compact(Math.abs(c.now)))}</b>
        <span class="chg num ${cls(c.abs)}">${esc(pct(c.pct))} ${c.abs >= 0 ? '↑' : '↓'} ${esc(compact(Math.abs(c.abs)))}</span></span>
    </button>`;
  }).join('');

  $('#s-home').innerHTML = `
  <div class="topbar">
    <div class="avatar">${esc(S.account.initials || 'ST')}</div>
    <div class="greet"><small>${esc(greeting())}</small><b>${esc(S.account.name || 'there')}</b></div>
    <button class="iconbtn" data-act="open-baseline" title="Comparison options">${ICON.dots}</button>
    <button class="iconbtn ${homeFiltered() ? 'on' : ''}" data-act="open-filter" title="Filters">${ICON.filter}</button>
    <button class="iconbtn" data-act="open-add-menu" title="Add tracking">${ICON.plus}</button>
  </div>

  ${homeFiltered() ? `<div class="note"><b>Filtered.</b> ${esc(filterSummary())} — the total below covers the
    filtered set only. <button class="btn ghost sm auto" data-act="clear-filter">Clear</button></div>` : ''}

  <div class="carousel" id="home-carousel">
    <div class="slide"><div class="card">
      ${lineChart([{ points:pts, colour:'var(--pos)', fill:true }], { px:170, includeZero:false })}
      <div class="rangebar">${HOME_RANGES.map(([l, v]) =>
        `<button data-act="set-range" data-v="${v}" class="${S.settings.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div></div>
    <div class="slide"><div class="card">
      ${pie(segs, { mode:S.settings.pieMode })}
      <div class="seg sm" style="max-width:130px;margin:10px auto 8px">
        <button data-act="pie-mode" data-v="$" class="${S.settings.pieMode === '$' ? 'on' : ''}">$</button>
        <button data-act="pie-mode" data-v="%" class="${S.settings.pieMode === '%' ? 'on' : ''}">%</button></div>
      <div class="legend">${segs.map(s => `<div><i style="background:${s.colour}"></i>${esc(s.name)}</div>`).join('')}</div>
    </div></div>
    <div class="slide"><div class="card">
      ${pie(al, { mode:S.settings.pieMode })}
      <div class="seg sm" style="max-width:130px;margin:10px auto 8px">
        <button data-act="pie-mode" data-v="$" class="${S.settings.pieMode === '$' ? 'on' : ''}">$</button>
        <button data-act="pie-mode" data-v="%" class="${S.settings.pieMode === '%' ? 'on' : ''}">%</button></div>
      <div class="legend"><div><i style="background:var(--pos)"></i>Assets</div>
        <div><i style="background:var(--neg)"></i>Liabilities</div></div>
    </div></div>
  </div>
  <div class="dots">${[0,1,2].map(i => `<i class="${card === i ? 'on' : ''}"></i>`).join('')}</div>

  <div class="nw-wrap">
    <div class="nw-label">Your total net worth is</div>
    <div class="nw num">${esc(money(t.now, null, { cents:true }))}</div>
    <div class="nw-chg num ${cls(t.abs)}">${esc(pct(t.pct))} ${t.abs >= 0 ? '↑' : '↓'} ${esc(compact(Math.abs(t.abs)))}</div>
    <button class="baseline-btn" data-act="open-baseline">vs ${esc(baselineLabel())} ▾</button>
    ${!t.exact ? '<div class="muted" style="font-size:11.5px;margin-top:6px">Some holdings pre-date this baseline; their first value is used.</div>' : ''}
  </div>

  <div class="grid" style="margin-top:14px">
    <div class="g8">
      <div class="section-h"><h2>Assets &amp; Liabilities</h2>
        <button class="iconbtn" data-act="open-sort" title="Sort by">${ICON.sort}</button></div>
      <div class="card flush">${rows || '<div class="empty"><p class="muted">Nothing matches this filter.</p></div>'}</div>
      <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="open-add-menu">+ Add tracking</button></div>
    </div>
    <div class="g4">
      <div class="section-h"><h2>Position</h2></div>
      <div class="card">
        <div class="kv"><span>Assets</span><b class="num">${esc(money(t.assets))}</b></div>
        <div class="kv"><span>Liabilities</span><b class="num neg">−${esc(money(t.liabilities)).replace('−','')}</b></div>
        <div class="kv"><span>Readily accessible</span><b class="num">${esc(money(t.accessible))}</b></div>
      </div>
      <div class="note"><b>Readily accessible</b> is what you could actually use this month — it leaves out
        CPF, the flat and unvested equity. It is what stops your agent answering
        “can I afford this” off money you can’t touch.</div>
      ${list.filter(isStale).length ? `<div class="note warn"><b>${list.filter(isStale).length} holding${list.filter(isStale).length>1?'s have':' has'} gone stale.</b>
        Ask your agent to refresh ${list.filter(isStale).length>1?'them':'it'}.
        <button class="btn ghost sm auto" data-go="#/agent/chat">Ask the agent</button></div>` : ''}
      ${S.holdings.some(h => h.archived) ? `<div class="btn-row"><button class="btn sec sm" data-go="#/sub/archived">Archived (${S.holdings.filter(h=>h.archived).length})</button></div>` : ''}
    </div>
  </div>`;
  const c = $('#home-carousel');
  if (c) {
    c.scrollLeft = card * c.clientWidth;
    c.onscroll = () => {
      const i = Math.round(c.scrollLeft / Math.max(1, c.clientWidth));
      if (i !== S.settings.homeCard) {
        S.settings.homeCard = i; save();
        document.querySelectorAll('#s-home .dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      }
    };
  }
}

function emptyHome() {
  return `
  <div class="topbar">
    <div class="avatar">${esc(S.account.initials || '·')}</div>
    <div class="greet"><small>${esc(greeting())}</small><b>${esc(S.account.name || 'there')}</b></div>
    <button class="iconbtn" data-act="open-add-menu">${ICON.plus}</button>
  </div>
  <div class="nw-wrap" style="padding:20px 0 6px">
    <div class="nw-label">Your total net worth is</div>
    <div class="nw num muted">$0.00</div>
    <div class="muted" style="font-size:13px">Nothing tracked yet.</div>
  </div>
  <div class="btn-row"><button class="btn" data-act="open-add-menu">+ Add your first holding</button></div>
  <div class="grid">
    <div class="g7">
      <div class="section-h"><h2>Or start from one of these</h2></div>
      <div class="pad"><div class="cats">
        ${[['Cash','t-cash','Bank accounts'],['CPF','t-cpf','OA, SA, MA'],['Property','t-prop','Home or investment'],
           ['Stocks','t-stocks','Brokerage, funds'],['Automobile','t-auto','Car, COE'],['Loan','t-loan','Mortgage, car loan']]
          .map(([n,t,s]) => `<button data-act="quick-add" data-v="${t}">${esc(n)}<small>${esc(s)}</small></button>`).join('')}
      </div>
      <p class="muted" style="font-size:12.5px;margin:12px 2px 0">Suggestions, not a fixed list. Rename them,
        ignore them, or make your own.</p></div>
    </div>
    <div class="g5">
      <div class="section-h"><h2>Rather not type it in?</h2></div>
      <div class="card">
        <h3>Let your agent assemble it</h3>
        <p class="muted" style="margin:6px 0 14px;font-size:14px">Connect Claude or ChatGPT, then just describe
          what you have — or drop in a statement. It creates the holdings for you, and you can undo anything it does.</p>
        <button class="btn" data-go="#/agent">Connect your agent</button>
      </div>
    </div>
  </div>`;
}

const SORTS = [['name','Name'],['updated','Last Update'],['value-desc','Value (High to Low)'],
               ['value-asc','Value (Low to High)'],['type','Type'],['chg-pct','Change Percentage'],['chg-val','Change Value']];
const sortLabel = () => (SORTS.find(s => s[0] === S.settings.sort) || SORTS[2])[1];
function sorter(k) {
  return {
    'name':(a,b) => a.name.localeCompare(b.name),
    'updated':(a,b) => ((latest(b)||{}).date || '').localeCompare((latest(a)||{}).date || ''),
    'value-desc':(a,b) => Math.abs(signed(b,latest(b))) - Math.abs(signed(a,latest(a))),
    'value-asc':(a,b) => Math.abs(signed(a,latest(a))) - Math.abs(signed(b,latest(b))),
    'type':(a,b) => typeOf(a.typeId).name.localeCompare(typeOf(b.typeId).name) || a.name.localeCompare(b.name),
    'chg-pct':(a,b) => changeFor(b).pct - changeFor(a).pct,
    'chg-val':(a,b) => changeFor(b).abs - changeFor(a).abs
  }[k] || (() => 0);
}
function filterSummary() {
  const p = [];
  if (S.settings.showOnly !== 'all') p.push(S.settings.showOnly === 'assets' ? 'Assets only' : 'Liabilities only');
  if (S.settings.filterTypes.length) p.push(S.settings.filterTypes.map(id => typeOf(id).name).join(', '));
  if (S.settings.filterTags.length) p.push(S.settings.filterTags.join(' ' + S.settings.tagMode + ' '));
  if (S.settings.filterArchived) p.push('including archived');
  return p.join(' · ');
}

/* ================= HOLDING DETAIL (J3, J4) ================= */
function renderHolding(id) {
  const h = holdingOf(id);
  if (!h) { location.hash = '#/home'; return; }
  const c = changeFor(h), v = latest(h), tp = typeOf(h.typeId);
  const card = S.detailCard || 0;
  const view = S.detailView || 'monthly';
  const page = S.detailPage || 0;

  const months = rangeMonths(S.settings.detailRange != null ? S.settings.detailRange : 0);
  const hist = h.values.slice();
  const pts = (months ? hist.filter(x => x.date >= addMonths(TODAY, -months)) : hist)
    .map(x => ({ x:x.date, y:Math.abs(x.base) }));
  const marks = pts.map((p, i) => ({ i, y:p.y, v:hist.find(x => x.date === p.x) }))
    .filter(m => m.v && m.v.marked);

  const pers = periodsFor(view, [h], 5 + page * 5).slice(page * 5, page * 5 + 5).reverse();
  const ath = hist.reduce((m, x) => !m || Math.abs(x.base) > Math.abs(m.base) ? x : m, null);
  const jan1 = valueAsOf(h, TODAY.slice(0, 4) + '-01-01');
  const ytdAbs = jan1 ? Math.abs(v.base) - Math.abs(jan1.base) : null;

  const history = hist.slice().reverse().map((x, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? Math.abs(x.base) - Math.abs(prev.base) : 0;
    const p = prev && prev.base ? (d / Math.abs(prev.base)) * 100 : 0;
    const open = S.expanded === x.id;
    return `<button class="row" data-act="expand-value" data-v="${x.id}">
      <span class="grow"><span class="name" style="font-weight:550">${open ? '▾' : '▸'} ${esc(fmtDate(x.date))}
        ${x.source === 'agent' ? `<span class="chip agent">${esc(x.client || 'agent')}</span>` : ''}
        ${x.marked ? '<span class="chip marked">★</span>' : ''}</span>
        ${x.note ? `<span class="sub">${esc(x.note)}</span>` : ''}</span>
      <span class="amt"><b class="num">${esc(money(Math.abs(x.base), null, { cents:true }))}</b>
        ${prev ? `<span class="chg num ${cls(d)}">${esc(pct(p))} ${d >= 0 ? '↑' : '↓'} ${esc(compact(Math.abs(d)))}</span>` : ''}</span>
    </button>
    ${open ? `<div style="padding:2px 14px 14px;border-bottom:1px solid var(--line)">
      <div class="kv"><span>Default Currency</span><b class="num">${esc(money(Math.abs(x.base), null, { cents:true }))}</b></div>
      <div class="kv"><span>Original Value</span><b class="num">${esc(money(x.amount, x.ccy, { cents:true, ccy:x.ccy !== S.settings.defaultCcy }))}</b></div>
      ${x.ccy !== S.settings.defaultCcy ? `<div class="kv"><span>Rate used</span><b class="num">1 ${esc(x.ccy)} = ${x.rate} ${esc(S.settings.defaultCcy)} · ${esc(fmtDate(x.rateDate))}</b></div>` : ''}
      <div class="kv"><span>Amount Change</span><b class="num ${cls(d)}">${esc(money(d, null, { signed:true, cents:true }))}</b></div>
      <div class="kv"><span>Percentage Change</span><b class="num ${cls(d)}">${esc(pct(p))}</b></div>
      <div class="kv"><span>Entered</span><b>${esc(fmtDT(x.enteredAt))} · ${x.source === 'agent' ? esc(x.client) + ' (agent)' : 'you, on the web'}</b></div>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="btn sec sm" data-act="edit-value" data-h="${h.id}" data-v="${x.id}">Edit</button>
        <button class="btn sec sm" data-act="delete-value" data-h="${h.id}" data-v="${x.id}" style="color:var(--neg)">Delete</button>
      </div></div>` : ''}`;
  }).join('');

  $('#s-holding').innerHTML = `
  <div class="topbar">
    <button class="iconbtn" data-go="#/home" title="Close">${ICON.close}</button>
    <span style="flex:1"></span>
    <button class="iconbtn" data-act="holding-menu" data-h="${h.id}">${ICON.dots}</button>
  </div>
  <div class="pad" style="margin-bottom:12px">
    <h1 style="font-size:26px;letter-spacing:-.025em">${esc(h.name)}</h1>
    <div class="num" style="margin-top:4px;font-size:15px;font-weight:600">
      ${h.kind === 'liability' ? '−' : ''}${esc(money(Math.abs(c.now), null, { cents:true }))}
      <span class="${cls(c.abs)}" style="font-size:13px">${esc(pct(c.pct))} ${c.abs >= 0 ? '↑' : '↓'} ${esc(compact(Math.abs(c.abs)))}</span>
    </div>
  </div>

  <div class="carousel" id="detail-carousel">
    <div class="slide"><div class="card">
      ${lineChart([{ points:pts, colour:c.abs >= 0 ? 'var(--pos)' : 'var(--neg)', fill:true }], { px:175 })}
      <div class="rangebar">${HOME_RANGES.map(([l, val]) =>
        `<button data-act="set-detail-range" data-v="${val}" class="${(S.settings.detailRange||0) === val ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div></div>
    <div class="slide"><div class="card">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <div class="chartnav">
          <button data-act="detail-page" data-v="1" title="Earlier">‹</button>
          <button data-act="detail-page" data-v="-1" ${page === 0 ? 'disabled' : ''} title="Later">›</button>
        </div><span style="flex:1"></span>
      </div>
      ${growthBars(pers, { px:175 })}
      <div class="seg sm" style="max-width:240px;margin:12px auto 0">
        ${['monthly','quarterly','yearly'].map(x => `<button data-act="detail-view" data-v="${x}" class="${view === x ? 'on' : ''}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}
      </div>
    </div></div>
  </div>
  <div class="dots">${[0,1].map(i => `<i class="${card === i ? 'on' : ''}"></i>`).join('')}</div>

  <div class="pad"><div class="pillrow">
    <div class="pill"><small>Type</small><b>${esc(tp.name)}</b></div>
    <div class="pill"><small>Accessibility</small><b>${esc(ACCESS[h.access].label)}</b></div>
    <div class="pill"><small>Last update</small><b>${v ? esc(ago(v.date)) : '—'}</b></div>
    <div class="pill"><small>Started on</small><b>${hist.length ? esc(fmtDate(hist[0].date)) : '—'}</b></div>
    ${ath ? `<div class="pill"><small>ATH ${esc(fmtDate(ath.date))}</small><b class="num">${esc(money(Math.abs(ath.base)))}</b></div>` : ''}
    ${ytdAbs != null ? `<div class="pill"><small>YTD</small><b class="num ${cls(ytdAbs)}">${esc(compactSigned(ytdAbs))}</b></div>` : ''}
    <div class="pill"><small>Currency</small><b>${esc(h.ccy)}</b></div>
    ${h.tags.length ? `<div class="pill"><small>Tags</small><b>${esc(h.tags.join(', '))}</b></div>` : ''}
  </div></div>

  <div class="section-h" style="margin-top:18px"><h2>Value History · ${hist.length}</h2></div>
  <div class="card flush">${history || '<div class="empty"><p class="muted">No values yet.</p></div>'}</div>
  <div class="btn-row"><button class="btn" data-act="add-value" data-h="${h.id}">Update</button></div>`;

  const cc = $('#detail-carousel');
  if (cc) {
    cc.scrollLeft = card * cc.clientWidth;
    cc.onscroll = () => {
      const i = Math.round(cc.scrollLeft / Math.max(1, cc.clientWidth));
      if (i !== (S.detailCard || 0)) {
        S.detailCard = i; save();
        document.querySelectorAll('#s-holding .dots i').forEach((d, j) => d.classList.toggle('on', j === i));
      }
    };
  }
}

/* ================= INSIGHTS (J11) ================= */
const VIEW_NOUN = { monthly:'Month', quarterly:'Quarter', yearly:'Year' };
const VIEW_ADJ  = { monthly:'Monthly', quarterly:'Quarterly', yearly:'Yearly' };
const VIEW_PLURAL = { monthly:'months', quarterly:'quarters', yearly:'years' };

function renderInsights() {
  const view = S.settings.insightsView;
  const list = insightsHoldings();
  const ranges = INSIGHT_RANGES[view];
  let cap = S.settings.insightsRange;
  if (!ranges.some(r => r[1] === cap)) { cap = ranges[0][1]; S.settings.insightsRange = cap; }

  const all = periodsFor(view, list, 0);
  let take = cap > 0 ? cap : all.length;
  if (cap === -1) take = view === 'monthly' ? ytdMonths() : view === 'quarterly' ? Math.ceil(ytdMonths()/3) : 1;
  if (cap === -2) take = all.length + 1;
  const periods = all.slice(0, Math.max(1, take));
  const oldestFirst = periods.slice().reverse();
  const comparable = periods.filter(p => p.abs != null);
  const cur = periods[0];
  const avgAbs = comparable.length ? comparable.reduce((s, p) => s + p.abs, 0) / comparable.length : 0;
  const avgPct = comparable.length ? comparable.reduce((s, p) => s + (p.pct || 0), 0) / comparable.length : 0;
  const page = S.insightsPage || 0;
  const windowed = oldestFirst.slice(Math.max(0, oldestFirst.length - 5 - page * 5),
                                     oldestFirst.length - page * 5);
  const dist = distribution(windowed, list);
  const distTypes = [];
  dist.forEach(d => d.segs.forEach(s => { if (!distTypes.find(x => x.id === s.id)) distTypes.push(s); }));

  const noHistory = comparable.length === 0;

  $('#s-insights').innerHTML = `
  <div class="topbar"><h1>Insights</h1>
    <button class="iconbtn ${insightsFiltered() || exclusionCount() ? 'on' : ''}" data-act="open-insights-filter">${ICON.filter}</button>
  </div>
  <div class="pad">
    <div class="seg" style="max-width:340px;margin:0 auto">
      ${['monthly','quarterly','yearly'].map(v => `<button data-act="set-insights-view" data-v="${v}" class="${view === v ? 'on' : ''}">${VIEW_ADJ[v]}</button>`).join('')}
    </div>
    <div class="rangebar">${ranges.map(([l, v]) =>
      `<button data-act="set-insights-range" data-v="${v}" class="${cap === v ? 'on' : ''}">${l}</button>`).join('')}</div>
  </div>

  ${exclusionCount() ? `<div class="note" style="margin-top:12px"><b>${exclusionCount()} exclusion${exclusionCount()>1?'s':''} active</b>
    (${esc(exclusionSummary())}). Hidden from Insights only — your net worth on Home is unchanged.
    <button class="btn ghost sm auto" data-act="clear-exclusions">Clear</button></div>` : ''}
  ${insightsFiltered() ? `<div class="note" style="margin-top:12px"><b>Filtered.</b> Every figure below covers the filtered set only.</div>` : ''}

  <div class="pad" style="margin-top:14px"><div class="pillrow">
    <div class="pill" style="min-width:132px"><small>Total Net Worth</small>
      <b class="num" style="font-size:17px">${esc(compact(cur ? cur.value : 0))}</b>
      ${sparkline(oldestFirst.map(p => p.value), 'var(--pos)')}</div>
    <div class="pill" style="min-width:150px"><small>Current ${esc(VIEW_NOUN[view])} Change</small>
      <b class="num ${cur && cur.abs != null ? cls(cur.abs) : 'muted'}" style="font-size:17px">
        ${cur && cur.abs != null ? esc(compactSigned(cur.abs)) + ' / ' + esc(pct(cur.pct)) : '—'}</b></div>
    <div class="pill" style="min-width:150px"><small>Avg ${esc(VIEW_NOUN[view])} Change</small>
      <b class="num ${cls(avgAbs)}" style="font-size:17px">${esc(compactSigned(avgAbs))} / ${esc(pct(avgPct))}</b>
      <small style="text-transform:none;letter-spacing:0">Last ${comparable.length} ${esc(VIEW_PLURAL[view])}</small></div>
  </div></div>

  ${noHistory ? `<div class="card" style="margin-top:14px">
      <h3>Not enough history yet</h3>
      <p class="muted" style="margin:8px 0 0;font-size:14px">You have ${periods.length}
        ${esc(VIEW_PLURAL[view].slice(0, -1))}${periods.length === 1 ? '' : 's'} carrying data. A
        ${esc(VIEW_NOUN[view].toLowerCase())}-on-${esc(VIEW_NOUN[view].toLowerCase())} comparison needs two,
        so there is nothing to compare yet. Keep recording values and the first comparison appears
        next ${esc(VIEW_NOUN[view].toLowerCase())}.</p></div>` : `

  <div class="grid" style="margin-top:14px">
    <div class="g6"><div class="card">
      <div style="display:flex;align-items:flex-start">
        <div style="flex:1"><h3>${esc(VIEW_ADJ[view])} Growth</h3>
          <div class="csub">${esc(VIEW_ADJ[view])} growth over the last ${windowed.length} ${esc(VIEW_PLURAL[view])}</div></div>
        <div class="chartnav">
          <button data-act="insights-page" data-v="1" ${(page+1)*5 >= oldestFirst.length ? 'disabled' : ''}>‹</button>
          <button data-act="insights-page" data-v="-1" ${page === 0 ? 'disabled' : ''}>›</button></div>
      </div>
      <div style="margin-top:10px">${growthBars(windowed, { px:180 })}</div>
    </div></div>

    <div class="g6"><div class="card">
      <h3>Assets vs. Liabilities</h3>
      <div class="csub">${esc(VIEW_ADJ[view])} assets and liabilities trend over ${oldestFirst.length} ${esc(VIEW_PLURAL[view])}</div>
      <div style="margin-top:12px">${lineChart([
        { points:oldestFirst.map(p => ({ x:p.end, y:p.assets })), colour:'var(--pos)', fill:true },
        { points:oldestFirst.map(p => ({ x:p.end, y:p.liabilities })), colour:'var(--neg)', fill:true },
        { points:oldestFirst.map(p => ({ x:p.end, y:p.value })), colour:'#9aa4b0' }
      ], { px:180, includeZero:true })}</div>
      <div class="legend"><div><i style="background:var(--pos)"></i>Assets</div>
        <div><i style="background:#7d8794"></i>Net worth</div>
        <div><i style="background:var(--neg)"></i>Liabilities</div></div>
    </div></div>

    <div class="g12"><div class="card">
      <div style="display:flex;align-items:flex-start">
        <div style="flex:1"><h3>Distribution Over Time</h3>
          <div class="csub">Net worth distribution over the last ${windowed.length} ${esc(VIEW_PLURAL[view])}</div></div>
        <div class="chartnav">
          <button data-act="insights-page" data-v="1" ${(page+1)*5 >= oldestFirst.length ? 'disabled' : ''}>‹</button>
          <button data-act="insights-page" data-v="-1" ${page === 0 ? 'disabled' : ''}>›</button></div>
      </div>
      <div class="legend" style="margin:8px 0 4px">${distTypes.map(s => `<div><i style="background:${s.colour}"></i>${esc(s.name)}</div>`).join('')}</div>
      ${stackedBars(dist, { px:190 })}
    </div></div>
  </div>`}

  <div class="section-h"><h2>${esc(VIEW_NOUN[view])} by ${esc(VIEW_NOUN[view].toLowerCase())}</h2></div>
  <div class="card flush">${periods.map(p => `
    <button class="row" data-go="#/period/${view}/${p.i}">
      <span class="grow"><span class="name">${esc(p.label)}${p.current ? ' <span class="chip">so far</span>' : ''}</span>
        <span class="sub">${esc(money(p.value))} at ${p.current ? 'today' : esc(fmtDate(p.end))}</span></span>
      <span class="amt"><b class="num ${p.abs == null ? 'muted' : cls(p.abs)}">${p.abs == null ? '—' : esc(compactSigned(p.abs))}</b>
        <span class="chg num ${p.abs == null ? 'muted' : cls(p.abs)}">${p.pct == null ? 'no earlier period' : esc(pct(p.pct))}</span></span>
      <span class="chev">›</span></button>`).join('')}</div>

  <div class="note">Periods are worked out from the <b>dates on your values</b>, not from when you typed
    them in. Add a back-dated value and the periods it belongs to recompute.</div>`;
  fire('insights_viewed', { view });
}
function exclusionSummary() {
  const s = S.settings;
  return [...s.exTypes.map(id => typeOf(id).name), ...s.exTags,
          ...s.exHoldings.map(id => (holdingOf(id) || {}).name)].filter(Boolean).join(', ');
}

function renderPeriod(view, i) {
  const list = insightsHoldings();
  const p = periodsFor(view, list, +i + 1)[+i];
  if (!p) { location.hash = '#/insights'; return; }
  const cs = contributors(p, list);
  $('#s-period').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/insights">‹ Insights</button></div>
  <div class="card">
    <div class="nw-label">${esc(p.label)}${p.current ? ' · so far' : ''}</div>
    <div class="nw num">${esc(money(p.value, null, { cents:true }))}</div>
    <div class="nw-chg num ${p.abs == null ? 'muted' : cls(p.abs)}">
      ${p.abs == null ? 'No earlier period to compare with'
        : esc(money(p.abs, null, { signed:true })) + ' · ' + esc(pct(p.pct))}</div>
    <div class="muted" style="font-size:12.5px;margin-top:8px">${esc(fmtDate(p.start))} – ${p.current ? 'today' : esc(fmtDate(p.end))}</div>
  </div>
  <div class="section-h"><h2>What drove it</h2></div>
  <div class="card flush">${cs.map(c => `
    <button class="row" data-go="#/holding/${c.h.id}">
      <span class="dot" style="background:${typeOf(c.h.typeId).colour}"></span>
      <span class="grow"><span class="name">${esc(c.h.name)}${c.carried ? ' <span class="chip carried">carried</span>' : ''}</span>
        <span class="sub">${esc(typeOf(c.h.typeId).name)} · ${esc(money(Math.abs(c.now)))} at period end</span></span>
      <span class="amt"><b class="num ${cls(c.delta)}">${esc(money(c.delta, null, { signed:true }))}</b></span>
      <span class="chev">›</span></button>`).join('') || '<div class="empty"><p class="muted">Nothing moved in this period.</p></div>'}</div>
  ${cs.some(c => c.carried) ? `<div class="note"><b>Carried</b> means no value was recorded inside this period,
    so the last known one before the period ended was used. It is not a measurement.</div>` : ''}
  <div class="note">Multi-currency holdings use the conversion recorded on each entry, so a period's change
    is not distorted by FX that moved after the fact.</div>`;
}

/* ================= AGENT (J5) ================= */
const MCP_URL = 'https://netnet.app/mcp';
function renderAgent() {
  const conns = (S.account.connections || []).filter(c => c.active);
  $('#s-agent').innerHTML = `
  <div class="topbar"><h1>Your agent</h1></div>
  <div class="grid">
    <div class="g7">
      ${!S.account.verified ? `<div class="note warn"><b>Verify your email first.</b> Agent connection needs a
        verified account — everything else in NetNet works without it.
        <button class="btn sm auto" style="margin-top:10px" data-act="mock-verify">Mark verified (prototype)</button></div>` : ''}
      ${conns.map(c => `<div class="card">
        <div style="display:flex;align-items:center;gap:9px;margin-bottom:10px">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--pos);display:block"></span>
          <h3 style="flex:1">${esc(c.client)} — connected</h3></div>
        <div class="kv"><span>Connected</span><b>${esc(fmtDT(c.connectedAt))}</b></div>
        <div class="kv"><span>Last tool call</span><b>${esc(fmtDT(c.lastCall))}</b></div>
        <div style="display:flex;gap:8px;margin-top:12px">
          <button class="btn sm" data-go="#/agent/chat">Try it</button>
          <button class="btn sec sm" data-act="revoke" data-v="${c.id}" style="color:var(--neg)">Revoke</button></div>
      </div>`).join('')}

      <div class="section-h"><h2>${conns.length ? 'Connect another client' : 'Connect a client'}</h2></div>
      <div class="card">
        <div class="seg" style="max-width:260px;margin-bottom:14px">
          ${['Claude','ChatGPT'].map(c => `<button data-act="set-client" data-v="${c}" class="${(S.uiClient || 'Claude') === c ? 'on' : ''}">${c}</button>`).join('')}
        </div>
        ${(S.uiClient || 'Claude') === 'Claude' ? `<ol class="steps">
          <li>In Claude, open <b>Settings → Connectors → Add custom connector</b>.</li>
          <li>Paste the NetNet URL below.</li>
          <li>Claude opens NetNet in your browser — press <b>Allow</b>.</li>
          <li>Done. NetNet's tools appear in Claude. No token to copy anywhere.</li></ol>`
        : `<ol class="steps">
          <li>In ChatGPT, open <b>Settings → Connectors → Create</b>.</li>
          <li>Paste the NetNet URL below and choose OAuth.</li>
          <li>Approve NetNet when the browser window opens.</li>
          <li>Done. NetNet's tools appear in ChatGPT. No token to copy anywhere.</li></ol>
          <div class="note warn" style="margin:12px 0 0">ChatGPT exposes custom connectors on paid plans only,
            and may need developer mode on. Stage 3 re-checks this before the architecture locks.</div>`}
        <div class="urlbox"><span class="mono">${MCP_URL}</span>
          <button class="btn ghost sm auto" data-act="copy-url">Copy</button></div>
        <button class="btn" style="margin-top:14px" data-act="connect" ${!S.account.verified ? 'disabled' : ''}>I've pasted it — continue</button>
        <button class="btn ghost sm" data-act="fail-connect">Simulate a failure (prototype)</button>
      </div>
    </div>
    <div class="g5">
      <div class="section-h"><h2>What it can do</h2></div>
      <div class="card">
        <p class="muted" style="margin:0 0 12px;font-size:14px">Everything you can do here, your agent can do —
          and nothing you can't undo.</p>
        <div class="kv"><span>Read position, history, currency exposure</span><b>✓</b></div>
        <div class="kv"><span>Create, update, archive, delete holdings</span><b>✓</b></div>
        <div class="kv"><span>Record and correct values</span><b>✓</b></div>
        <div class="kv"><span>Manage types, tags and accessibility</span><b>✓</b></div>
        <div class="kv"><span>Every write logged and reversible</span><b>✓</b></div>
      </div>
      <div class="note"><b>Your statements never reach us.</b> Your agent reads them where it runs and sends
        NetNet only the numbers. There is no AI in NetNet's backend.</div>
      <div class="btn-row"><button class="btn sec sm" data-go="#/activity">Open activity log</button></div>
    </div>
  </div>`;
}

/* ================= AGENT DEMO (J6, J8) ================= */
const SCRIPT = [
  { who:'user', text:"Here's my IBKR statement for September — update NetNet." },
  { who:'tool', text:'<b>netnet.find_holding</b> { query: "IBKR" }<br>→ 1 likely match: “IBKR” (USD, Stocks) · last value 21 Sep' },
  { who:'ai',   text:"Found your existing IBKR holding, so I'll update that rather than create a second one. The statement closes at USD 421,900." },
  { who:'tool', text:'<b>netnet.record_value</b> { holding_id: "h-ibkr", amount: 421900, currency: "USD", as_of: "2026-09-23" }<br>→ ok', write:true },
  { who:'ai',   text:'Done — IBKR is updated. Your net worth is now <b>{{NW}}</b>.' },
  { who:'user', text:"Can I afford a $120k car?" },
  { who:'tool', text:'<b>netnet.get_position_summary</b> { include: ["accessibility","staleness","currency_exposure"] }<br>→ one call, no follow-ups needed' },
  { who:'ai',   text:"Yes — comfortably, but the useful part isn't the yes.<br><br>You're worth <b>{{NW}}</b>, and of that <b>{{ACC}}</b> is <b>readily accessible</b>. The rest is CPF, the flat and unvested RSUs — locked or illiquid, and not money you can put toward a car. A $120k purchase is about <b>{{MULT}}×</b> covered by what you can actually reach.<br><br>Two things the numbers themselves flag: most of your accessible money is a single brokerage position, so you'd be selling equities to buy a depreciating asset; and your current car was last valued <b>{{CARSTALE}}</b>, so any trade-in figure in this is guesswork." }
];
function renderChat() {
  const step = S.chatStep || 0;
  const t = totals(S.holdings.filter(h => !h.archived));
  const car = holdingOf('h-car');
  const fill = s => s.replace(/\{\{NW\}\}/g, money(t.now)).replace(/\{\{ACC\}\}/g, money(t.accessible))
    .replace(/\{\{MULT\}\}/g, (t.accessible / 120000).toFixed(1))
    .replace(/\{\{CARSTALE\}\}/g, car && latest(car) ? ago(latest(car).date) : 'a while ago');
  $('#s-chat').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/agent">‹ Your agent</button>
    <h1 style="font-size:16px">Claude · NetNet connected</h1></div>
  <div class="note agent">A <b>replay of a real conversation shape</b>, to show what the connection buys you.
    In the product this happens inside Claude or ChatGPT, not here.</div>
  <div class="chat">${SCRIPT.slice(0, step).map(m =>
    `<div class="msg ${m.who}">${fill(m.text)}</div>`).join('') || '<div class="muted" style="padding:8px 2px">Press Play to walk through it.</div>'}</div>
  <div class="btn-row" style="max-width:420px">
    ${step < SCRIPT.length ? `<button class="btn" data-act="chat-next">${step ? 'Continue' : 'Play'}</button>` : ''}
    ${step ? '<button class="btn sec" data-act="chat-reset">Replay</button>' : ''}
  </div>
  ${step >= 5 ? `<div class="note"><b>That write is real in this prototype.</b> It is on Home, and in Activity
    you can see who made it and undo it.
    <button class="btn ghost sm auto" data-go="#/activity">Open activity log</button></div>` : ''}`;
}

/* ================= ACTIVITY / AUDIT (J7) ================= */
function renderActivity() {
  const turns = {};
  S.log.forEach(e => { if (e.turn && !e.undone) (turns[e.turn] = turns[e.turn] || []).push(e); });
  const seen = {};
  const html = S.log.slice(0, 80).map(e => {
    const h = holdingOf(e.holdingId);
    let head = '';
    if (e.turn && turns[e.turn] && turns[e.turn].length > 1 && !seen[e.turn]) {
      seen[e.turn] = true;
      head = `<div style="padding:10px 14px;display:flex;align-items:center;gap:8px;background:var(--agent-soft)">
        <span class="chip agent">${esc(e.client)} · one turn · ${turns[e.turn].length} changes</span>
        <span style="flex:1"></span>
        <button class="btn ghost sm auto" data-act="undo-turn" data-v="${esc(e.turn)}">Undo all</button></div>`;
    }
    return head + `<div class="row" style="${e.undone ? 'opacity:.45' : ''}">
      <span class="grow"><span class="name" style="font-weight:550">${esc(describeLog(e, h))}
        ${e.undone ? '<span class="chip">undone</span>' : ''}</span>
        <span class="sub">${esc(fmtDT(e.at))} · ${e.source === 'agent' ? esc(e.client) + ' (agent)' : 'you, on the web'}</span></span>
      ${!e.undone && e.kind !== 'holding.create' ? `<button class="btn ghost sm auto" data-act="undo" data-v="${e.id}">Undo</button>` : ''}
    </div>`;
  }).join('');
  $('#s-activity').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/home">‹ Home</button><h1 style="font-size:19px">Activity</h1></div>
  <div class="note">Every change, from the web or from an agent, in one list — what changed, from what to what,
    by whom. Undo restores the previous state exactly.</div>
  <div class="card flush">${html}</div>`;
}
function describeLog(e, h) {
  const n = h ? h.name : 'a holding';
  switch (e.kind) {
    case 'holding.create': return 'Added ' + n;
    case 'holding.archive': return 'Archived ' + n;
    case 'holding.unarchive': return 'Unarchived ' + n;
    case 'holding.delete': return 'Deleted ' + n;
    case 'holding.edit': return 'Edited ' + n;
    case 'value.create': return n + ' → ' + money(e.after.amount, e.after.ccy) + ' (' + fmtDate(e.after.date) + ')';
    case 'value.edit': return n + ': ' + money(e.before.amount, e.before.ccy) + ' → ' + money(e.after.amount, e.after.ccy);
    case 'value.delete': return n + ': removed ' + money(e.before.amount, e.before.ccy);
    case 'connection.revoke': return 'Revoked ' + (e.after.client || 'a client');
    default: return e.kind;
  }
}

/* ================= ACCOUNT (J9, J10) ================= */
function renderAccount() {
  const conns = (S.account.connections || []).filter(c => c.active);
  $('#s-account').innerHTML = `
  <div class="topbar"><h1>Account</h1></div>
  <div class="grid">
    <div class="g6">
      <div class="card flush">
        <div class="row"><div class="avatar">${esc(S.account.initials || '·')}</div>
          <span class="grow"><span class="name">${esc(S.account.name || 'Your account')}</span>
            <span class="sub">${esc(S.account.email || 'not signed in')}
              ${S.account.verified ? '' : ' · unverified'}</span></span></div>
      </div>
      <div class="section-h"><h2>Settings</h2></div>
      <div class="card flush">
        ${[['general','General', S.settings.defaultCcy],
           ['view','View Settings',''],
           ['types','Manage Types', S.types.length + ''],
           ['tags','Manage Tags', S.tags.length + ''],
           ['reminders','Reminders', S.settings.reminderOptOut ? 'Off' : 'On']]
          .map(([k, l, v]) => `<button class="row" data-go="#/sub/${k}">
            <span class="grow"><span class="name" style="font-weight:550">${esc(l)}</span></span>
            <span class="muted" style="font-size:13px">${esc(v)}</span><span class="chev">›</span></button>`).join('')}
      </div>
    </div>
    <div class="g6">
      <div class="section-h"><h2>Your agent</h2></div>
      <div class="card flush">
        <button class="row" data-go="#/agent"><span class="grow">
          <span class="name" style="font-weight:550">Connected clients</span>
          <span class="sub">${conns.length ? esc(conns.map(c => c.client).join(', ')) : 'none yet'}</span></span>
          <span class="chev">›</span></button>
        <button class="row" data-go="#/activity"><span class="grow">
          <span class="name" style="font-weight:550">Activity log</span>
          <span class="sub">${S.log.length} changes recorded</span></span><span class="chev">›</span></button>
      </div>
      <div class="section-h"><h2>Privacy and Security</h2></div>
      <div class="card flush">
        <button class="row" data-go="#/sub/export"><span class="grow">
          <span class="name" style="font-weight:550">Export everything</span>
          <span class="sub">Machine-readable, including full history</span></span><span class="chev">›</span></button>
        <button class="row" data-go="#/sub/delete"><span class="grow">
          <span class="name" style="font-weight:550;color:var(--neg)">Delete account</span>
          <span class="sub">Erases all your data</span></span><span class="chev">›</span></button>
      </div>
      <div class="note">NetNet never sells your data, never receives your documents, and runs no AI on your
        balance sheet. Export and delete are one tap each, on purpose.</div>
    </div>
  </div>`;
}

function renderSub(name) {
  const B = t => `<div class="topbar"><button class="back" data-go="#/account">‹ Account</button>
    <h1 style="font-size:19px">${esc(t)}</h1></div>`;
  let html = '';
  if (name === 'general') {
    html = B('General') + `<div class="card">
      <div class="field"><label>Default Currency</label>
        <select data-act="set-ccy">${['SGD','USD','MYR','HKD','AUD','GBP','EUR','JPY'].map(c =>
          `<option ${c === S.settings.defaultCcy ? 'selected' : ''}>${c}</option>`).join('')}</select>
        <div class="hint">The currency everything is totalled and displayed in. Holdings keep their own
          currency, and each value keeps the rate it was converted at.</div></div></div>`;
  } else if (name === 'view') {
    html = B('View Settings') + `
      <div class="section-h"><h2>Graphs</h2></div>
      <div class="card flush">
        <label class="switch"><span class="grow"><b>Show zero bounds</b>
          <div class="sub">Show the zero line and axis labels on trend and growth charts</div></span>
          <input type="checkbox" data-act="toggle-setting" data-v="showZeroBounds" ${S.settings.showZeroBounds ? 'checked' : ''}></label>
      </div>
      <div class="section-h"><h2>Holdings</h2></div>
      <div class="card flush">
        <label class="switch"><span class="grow"><b>Show default currency value</b>
          <div class="sub">Show holdings in your default currency rather than their own</div></span>
          <input type="checkbox" data-act="toggle-setting" data-v="showDefaultCcy" ${S.settings.showDefaultCcy ? 'checked' : ''}></label>
      </div>
      <div class="note">The mockups' “Show Legacy Trend Graph”, “Use Old Logic in New Trend Graph” and haptic
        feedback are deliberately not carried into v1 — compat cruft and a native-only concern.</div>`;
  } else if (name === 'types' || name === 'tags') {
    const isT = name === 'types';
    const items = isT ? S.types : S.tags.map(t => ({ id:t, name:t, colour:'var(--ink-3)' }));
    html = B(isT ? 'Manage Types' : 'Manage Tags') + `
      <div class="card flush">
        <button class="row" data-act="${isT ? 'new-type' : 'new-tag'}">
          <span class="grow"><span class="name" style="color:var(--accent)">+ Add New ${isT ? 'Type' : 'Tag'}</span></span></button>
        ${items.map(t => {
          const used = S.holdings.filter(h => isT ? h.typeId === t.id : h.tags.includes(t.name)).length;
          return `<button class="row" data-act="edit-${isT ? 'type' : 'tag'}" data-v="${esc(t.id)}">
            ${isT ? `<span class="dot" style="background:${t.colour}"></span>` : ''}
            <span class="grow"><span class="name" style="font-weight:550">${esc(t.name)}</span>
              <span class="sub">${used} holding${used === 1 ? '' : 's'}</span></span><span class="chev">›</span></button>`;
        }).join('')}
      </div>
      <div class="note">Tap ${isT ? 'a type' : 'a tag'} to rename or delete it. Existing holdings follow the
        change — nothing is left orphaned.</div>`;
  } else if (name === 'reminders') {
    html = B('Reminders') + `
      <div class="card flush">
        <label class="switch"><span class="grow"><b>Email me when holdings go stale</b>
          <div class="sub">Never sent after you opt out</div></span>
          <input type="checkbox" data-act="toggle-reminders" ${!S.settings.reminderOptOut ? 'checked' : ''}></label>
      </div>
      ${!S.settings.reminderOptOut ? `<div class="section-h"><h2>How often</h2></div>
      <div class="card flush">${['weekly','monthly','quarterly'].map(c => `
        <button class="opt" data-act="set-cadence" data-v="${c}"><span class="grow">${c[0].toUpperCase() + c.slice(1)}</span>
          ${S.settings.reminderCadence === c ? '<span class="tick">✓</span>' : ''}</button>`).join('')}</div>` : ''}
      <div class="note">A reminder names how many holdings are stale and links straight to them. It never
        contains any amounts.</div>`;
  } else if (name === 'export') {
    html = B('Export') + `<div class="card">
      <h3>Everything, in one file</h3>
      <p class="muted" style="margin:8px 0 14px;font-size:14px">Holdings, types, tags, accessibility, and the
        full value history with every original currency, rate and rate date — enough to rebuild your
        spreadsheet from, or to move to something else entirely.</p>
      <button class="btn" data-act="export">Download JSON</button>
      <button class="btn ghost sm" data-act="export-csv">Download CSV instead</button></div>`;
  } else if (name === 'delete') {
    html = B('Delete account') + `<div class="card">
      <h3 style="color:var(--neg)">This erases everything</h3>
      <p class="muted" style="margin:8px 0 6px;font-size:14px">Your holdings, value history, types, tags,
        audit log and agent connections are deleted within <b>30 days</b>, and immediately stop being
        readable by any connected agent.</p>
      <p class="muted" style="margin:0 0 14px;font-size:14px">Export first if you want a copy — we will not
        keep one for you.</p>
      <button class="btn sec sm" data-go="#/sub/export">Export first</button>
      <button class="btn danger" style="margin-top:8px" data-act="delete-account">Delete my account</button></div>`;
  } else if (name === 'archived') {
    const arch = S.holdings.filter(h => h.archived);
    html = `<div class="topbar"><button class="back" data-go="#/home">‹ Home</button>
      <h1 style="font-size:19px">Archived</h1></div>
      <div class="note">Archived holdings keep their full history but are left out of every total and chart.</div>
      <div class="card flush">${arch.map(h => `<div class="row">
        <span class="grow"><span class="name">${esc(h.name)}</span>
          <span class="sub">${esc(typeOf(h.typeId).name)} · ${h.values.length} values · last ${esc(ago(latest(h).date))}</span></span>
        <button class="btn ghost sm auto" data-act="unarchive" data-v="${h.id}">Unarchive</button></div>`).join('')
        || '<div class="empty"><p class="muted">Nothing archived.</p></div>'}</div>`;
  }
  $('#s-sub').innerHTML = html;
}

/* ================= ADD / EDIT HOLDING (J2) ================= */
function renderAdd(kind, presetType, editId) {
  const h = editId ? holdingOf(editId) : null;
  const k = h ? h.kind : (kind || 'asset');
  const tags = S.tags.length ? S.tags : SEED_TAGS;
  S.formTags = h ? h.tags.slice() : (S.formTags || []);
  const title = h ? 'Edit ' + (k === 'asset' ? 'Asset' : 'Liability') : 'New ' + (k === 'asset' ? 'Asset' : 'Liability');
  $('#s-add').innerHTML = `
  <div class="topbar">
    <button class="iconbtn" data-go="${h ? '#/holding/' + h.id : '#/home'}">${ICON.close}</button>
    <h1 style="font-size:18px;text-align:center">${esc(title)}</h1>
    <button class="btn ghost auto" data-act="save-holding" data-k="${k}" data-e="${editId || ''}">Save</button>
  </div>
  <div class="card" style="max-width:520px">
    ${!h ? `<div class="seg" style="margin-bottom:16px">
      <button class="${k === 'asset' ? 'on' : ''}" data-go="#/add/asset">Asset</button>
      <button class="${k === 'liability' ? 'on' : ''}" data-go="#/add/liability">Liability</button></div>` : ''}
    <div class="field"><label>${k === 'asset' ? 'Asset' : 'Liability'} Name <span class="req">*</span></label>
      <input id="f-name" value="${esc(h ? h.name : '')}" placeholder="${k === 'asset' ? 'e.g. DBS Multiplier' : 'e.g. HDB loan'}"></div>
    <div class="field"><label>Type <span class="req">*</span></label>
      <select id="f-type">${S.types.map(t => `<option value="${t.id}" ${
        (h ? h.typeId : presetType || 't-general') === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select></div>
    <div class="field"><label>Tags</label><div class="tagpick" id="f-tags">
      ${tags.map(t => `<button type="button" data-act="toggle-formtag" data-v="${esc(t)}"
        class="${S.formTags.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
    ${k === 'asset' ? `<div class="field"><label>How accessible is it?</label>
      <select id="f-access">${Object.keys(ACCESS).filter(a => a !== 'n/a').map(a =>
        `<option value="${a}" ${(h ? h.access : 'accessible') === a ? 'selected' : ''}>${esc(ACCESS[a].label)} — ${esc(ACCESS[a].hint)}</option>`).join('')}</select>
      <div class="hint">This is what stops your agent counting CPF or home equity when you ask whether you
        can afford something. It is a NetNet addition, not in the original mockups.</div></div>` : ''}
    ${!h ? `<div class="two">
      <div class="field"><label>Currency <span class="req">*</span></label>
        <select id="f-ccy">${['SGD','USD','MYR','HKD','AUD','GBP','EUR','JPY'].map(c =>
          `<option ${c === S.settings.defaultCcy ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      <div class="field"><label>${k === 'asset' ? 'Asset' : 'Liability'} Value <span class="req">*</span></label>
        <input id="f-amount" type="number" inputmode="decimal" placeholder="0"></div></div>
    <div class="field"><label>As of</label><input id="f-date" type="date" value="${TODAY}" max="${TODAY}">
      <div class="hint">Back-dating is fine — the newest date is what counts toward your total.</div></div>` : ''}
    <p class="privacy">For your privacy, do not enter sensitive information such as a password or account
      number. NetNet does not need it to function.</p>
  </div>`;
}

/* ================= mutations ================= */
function logIt(e) { S.log.unshift(Object.assign({ id:uid('lg'), at:new Date().toISOString(), undone:false }, e)); }
function recomputeBase(v) { v.rate = rateFor(v.ccy, v.date); v.rateDate = v.date; v.base = Math.round(v.amount * v.rate); }

function saveHolding(kind, editId) {
  const name = ($('#f-name').value || '').trim();
  const typeId = $('#f-type').value;
  if (!name) { alert('Give it a name.'); return; }
  if (editId) {
    const h = holdingOf(editId);
    const before = { name:h.name, typeId:h.typeId, tags:h.tags.slice(), access:h.access };
    h.name = name; h.typeId = typeId; h.tags = (S.formTags || []).slice();
    if (h.kind === 'asset' && $('#f-access')) h.access = $('#f-access').value;
    logIt({ kind:'holding.edit', holdingId:h.id, source:'web', client:null, turn:null,
            before, after:{ name:h.name, typeId:h.typeId, tags:h.tags.slice(), access:h.access } });
    S.formTags = []; save(); location.hash = '#/holding/' + h.id; return;
  }
  const amount = parseFloat($('#f-amount').value);
  if (!(amount >= 0)) { alert('Enter a value.'); return; }
  const ccy = $('#f-ccy').value, date = $('#f-date').value || TODAY;
  const h = { id:uid('h'), name, kind, typeId, tags:(S.formTags || []).slice(), ccy,
    access: kind === 'liability' ? 'n/a' : ($('#f-access') ? $('#f-access').value : 'accessible'),
    cadenceDays:30, archived:false, values:[] };
  const v = { id:uid('v'), date, amount, ccy, note:'', marked:false, source:'web', client:null, turn:null,
    enteredAt:new Date().toISOString() };
  recomputeBase(v); h.values.push(v);
  S.holdings.push(h);
  (S.formTags || []).forEach(t => { if (!S.tags.includes(t)) S.tags.push(t); });
  logIt({ kind:'holding.create', holdingId:h.id, source:'web', client:null, turn:null, before:null, after:{ name } });
  logIt({ kind:'value.create', holdingId:h.id, valueId:v.id, source:'web', client:null, turn:null,
          before:null, after:{ amount, ccy, date } });
  fire('holding_created', { source:'web' });
  fire('value_recorded', { source:'web' });
  S.formTags = []; save(); location.hash = '#/holding/' + h.id;
}

function saveValue(hid, vid) {
  const h = holdingOf(hid);
  const amount = parseFloat($('#v-amount').value);
  if (!(amount >= 0)) { alert('Enter an amount.'); return; }
  const date = $('#v-date').value || TODAY;
  const ccy = $('#v-ccy').value;
  const note = ($('#v-note').value || '').trim();
  const marked = $('#v-mark').checked;
  if (vid) {
    const v = h.values.find(x => x.id === vid);
    const before = { amount:v.amount, ccy:v.ccy, date:v.date };
    const wasAgent = v.source === 'agent';
    const age = daysBetween(v.date, TODAY);
    Object.assign(v, { amount, ccy, date, note, marked });
    recomputeBase(v);
    h.values.sort((a, b) => a.date.localeCompare(b.date));
    logIt({ kind:'value.edit', holdingId:h.id, valueId:v.id, source:'web', client:null, turn:null,
            originalSource: wasAgent ? 'agent' : 'web', before, after:{ amount, ccy, date } });
    fire('value_corrected', { original_source: wasAgent ? 'agent' : 'web', age_at_correction:age });
  } else {
    const clash = h.values.find(x => x.date === date);
    if (clash && !confirm('There is already a value on ' + fmtDate(date) +
        '. The newer entry wins and the older one stays in your history. Continue?')) return;
    const v = { id:uid('v'), date, amount, ccy, note, marked, source:'web', client:null, turn:null,
      enteredAt:new Date().toISOString() };
    recomputeBase(v);
    h.values.push(v); h.values.sort((a, b) => a.date.localeCompare(b.date));
    logIt({ kind:'value.create', holdingId:h.id, valueId:v.id, source:'web', client:null, turn:null,
            before:null, after:{ amount, ccy, date } });
    fire('value_recorded', { source:'web' });
  }
  closeSheet(); save(); render();
}

function undoEntry(e) {
  const h = holdingOf(e.holdingId);
  if (!h && e.kind !== 'connection.revoke') return;
  if (e.kind === 'value.create') { h.values = h.values.filter(v => v.id !== e.valueId); }
  else if (e.kind === 'value.edit') {
    const v = h.values.find(x => x.id === e.valueId);
    if (v) { Object.assign(v, e.before); recomputeBase(v); h.values.sort((a, b) => a.date.localeCompare(b.date)); }
  } else if (e.kind === 'value.delete') {
    h.values.push(Object.assign({ id:e.valueId, source:'web', note:'', marked:false,
      enteredAt:new Date().toISOString() }, e.before));
    const v = h.values[h.values.length - 1]; recomputeBase(v);
    h.values.sort((a, b) => a.date.localeCompare(b.date));
  } else if (e.kind === 'holding.archive') { h.archived = false; }
  else if (e.kind === 'holding.unarchive') { h.archived = true; }
  else if (e.kind === 'holding.edit') { Object.assign(h, e.before); }
  else if (e.kind === 'holding.delete') { S.holdings.push(e.before.holding); }
  e.undone = true;
  logIt({ kind:e.kind === 'value.create' ? 'value.delete' : 'holding.edit', holdingId:e.holdingId,
          source:'web', client:null, turn:null, before:e.after, after:e.before, undone:false, isUndo:true });
  fire('value_undone', {});
}

/* ================= sheets ================= */
function sheet(html) {
  $('#sheet').innerHTML = '<div class="grab"></div>' + html;
  $('#sheet').classList.add('on'); $('#scrim').classList.add('on');
}
function closeSheet() {
  $('#sheet').classList.remove('on'); $('#scrim').classList.remove('on');
  S.draft = null;
}
const tick = on => on ? '<span class="tick">✓</span>' : '';

function sheetBaseline() {
  sheet(`<h3 style="padding:0 18px 10px;text-align:center">Comparison Options</h3>
    ${BASELINES.map(b => `<button class="opt" data-act="set-baseline" data-v="${b.id}">
      <span class="grow">${esc(b.label)}</span>${tick(S.settings.baseline === b.id)}</button>`).join('')}`);
}
function sheetSort() {
  sheet(`<h3 style="padding:0 18px 10px;text-align:center">Sort By</h3>
    ${SORTS.map(([k, l]) => `<button class="opt" data-act="set-sort" data-v="${k}">
      <span class="grow">${esc(l)}</span>${tick(S.settings.sort === k)}</button>`).join('')}`);
}
function sheetAddMenu() {
  sheet(`<h3 style="padding:0 18px 10px;text-align:center">Start Tracking</h3>
    <button class="opt" data-go="#/add/asset"><span class="grow" style="color:var(--pos)">+ New Asset</span></button>
    <button class="opt" data-go="#/add/liability"><span class="grow" style="color:var(--neg)">− New Liability</span></button>
    <div class="note" style="margin:12px 18px 0">The mockups also offer <b>New Goal</b>. Net-worth goals are not
      in the v1 scope in <code>01-prd.md</code> — flagged as a gate decision rather than built.</div>`);
}
function sheetHoldingMenu(id) {
  const h = holdingOf(id);
  sheet(`<h3 style="padding:0 18px 10px;text-align:center">${esc(h.name)}</h3>
    <button class="opt" data-go="#/edit/${h.id}"><span class="grow">Edit</span></button>
    <button class="opt" data-act="archive" data-v="${h.id}"><span class="grow">${h.archived ? 'Unarchive' : 'Archive'}</span></button>
    <button class="opt destructive" data-act="delete-holding" data-v="${h.id}"><span class="grow">Delete</span></button>`);
}
function sheetValue(hid, vid) {
  const h = holdingOf(hid);
  const v = vid ? h.values.find(x => x.id === vid) : null;
  sheet(`
    <div class="sh-head"><button data-act="close-sheet">Cancel</button>
      <h3>${v ? 'Edit Value' : 'Add Value'}</h3>
      <button data-act="save-value" data-h="${hid}" data-v="${vid || ''}"><b>Save</b></button></div>
    <div class="sh-body">
      <div class="two">
        <div class="field" style="flex:2"><label>${h.kind === 'liability' ? 'Liability' : 'Asset'} Value</label>
          <input id="v-amount" type="number" inputmode="decimal" value="${v ? v.amount : ''}" placeholder="0" autofocus></div>
        <div class="field"><label>Currency</label><select id="v-ccy">${['SGD','USD','MYR','HKD','AUD','GBP','EUR','JPY']
          .map(c => `<option ${c === (v ? v.ccy : h.ccy) ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label>As of</label><input id="v-date" type="date" value="${v ? v.date : TODAY}" max="${TODAY}"></div>
      <div class="field"><label>Note (optional)</label>
        <textarea id="v-note" maxlength="80" placeholder="e.g. Rebalanced out of bonds">${esc(v ? v.note : '')}</textarea></div>
      <label class="check"><input type="checkbox" id="v-mark" ${v && v.marked ? 'checked' : ''}> Mark on graph</label>
      ${(v ? v.ccy : h.ccy) !== S.settings.defaultCcy ? `<div class="note" style="margin:14px 0 0">Saved in
        ${esc(v ? v.ccy : h.ccy)} <b>and</b> converted to ${esc(S.settings.defaultCcy)} at today's reference rate.
        Both the rate and its date are kept on the entry and never re-derived later.</div>` : ''}
    </div>`);
  setTimeout(() => { const el = $('#v-amount'); if (el) el.focus(); }, 60);
}

/* Filters — one builder for Home and Insights; Insights adds the "Don't Show" section. */
function sheetFilter(forInsights) {
  const s = S.settings;
  S.draft = S.draft || (forInsights
    ? { forInsights:true, showOnly:s.inShowOnly, types:s.inTypes.slice(), tags:s.inTags.slice(), tagMode:s.inTagMode,
        exTypes:s.exTypes.slice(), exTags:s.exTags.slice(), exTagMode:s.exTagMode, archived:s.inArchived }
    : { forInsights:false, showOnly:s.showOnly, types:s.filterTypes.slice(), tags:s.filterTags.slice(),
        tagMode:s.tagMode, archived:s.filterArchived });
  const d = S.draft;
  const tags = S.tags.length ? S.tags : SEED_TAGS;
  const chips = (items, sel, act, ex) => `<div class="tagpick">${items.map(i => `
    <button data-act="${act}" data-v="${esc(i.id)}" class="${ex ? 'ex ' : ''}${sel.includes(i.id) ? 'on' : ''}">${esc(i.name)}</button>`).join('')}</div>`;
  const modeToggle = (mode, act) => `<div class="seg sm" style="width:88px">
    ${['OR','AND'].map(m => `<button data-act="${act}" data-v="${m}" class="${mode === m ? 'on' : ''}">${m}</button>`).join('')}</div>`;

  sheet(`
    <div class="sh-head"><button data-act="close-sheet">Cancel</button>
      <h3>${forInsights ? 'Insights Filters' : 'Filters'}</h3>
      <button data-act="reset-filter" data-v="${forInsights ? '1' : ''}">Reset</button></div>
    <div class="sh-body">
      <div class="sh-grp" style="justify-content:center"><span style="margin:0 auto">Show Only</span></div>
      <div class="seg">${[['assets','Assets'],['all','All'],['liabilities','Liabilities']].map(([v, l]) =>
        `<button data-act="draft-showonly" data-v="${v}" class="${d.showOnly === v ? 'on' : ''}">${l}</button>`).join('')}</div>

      <div class="sh-grp"><span class="grow">Types</span></div>
      ${chips(S.types, d.types, 'draft-type')}

      <div class="sh-grp"><span class="grow">Tags</span>${modeToggle(d.tagMode, 'draft-tagmode')}</div>
      ${chips(tags.map(t => ({ id:t, name:t })), d.tags, 'draft-tag')}

      ${forInsights ? `
        <div style="text-align:center;margin:22px 0 4px;font-weight:650;font-size:15px">Don't Show</div>
        <div class="sh-grp"><span class="grow">Types</span></div>
        ${chips(S.types, d.exTypes, 'draft-extype', true)}
        <div class="sh-grp"><span class="grow">Tags</span>${modeToggle(d.exTagMode, 'draft-extagmode')}</div>
        ${chips(tags.map(t => ({ id:t, name:t })), d.exTags, 'draft-extag', true)}
        <div class="note" style="margin:14px 0 0">Excluded things drop out of <b>Insights only</b>. Your net
          worth on Home does not change, and the exclusion sticks until you clear it.</div>` : ''}

      <div class="sh-grp" style="justify-content:center;margin-top:20px"><span style="margin:0 auto">Filter Archived</span></div>
      <div class="seg" style="max-width:200px;margin:0 auto">
        ${[['1','Yes'],['','No']].map(([v, l]) => `<button data-act="draft-archived" data-v="${v}" class="${(!!d.archived === !!v) ? 'on' : ''}">${l}</button>`).join('')}</div>

      <div class="sh-foot"><button class="btn sec" data-act="close-sheet">Cancel</button>
        <button class="btn" data-act="apply-filter" data-v="${forInsights ? '1' : ''}">Apply</button></div>
    </div>`);
}

function sheetProto() {
  sheet(`<h3 style="padding:0 18px 6px;text-align:center">Prototype controls</h3>
    <div class="sheet-sub" style="padding:0 18px 12px;font-size:12.5px;color:var(--ink-3);text-align:center">
      Scaffolding for testing — not product UI.</div>
    <button class="opt" data-act="reset-seeded"><span class="grow">Reset to the sample account</span></button>
    <button class="opt" data-act="reset-empty"><span class="grow">Start from an empty account (first-run)</span></button>
    <div class="sh-grp" style="padding:0 18px">Analytics events fired (§3.5)</div>
    <div style="max-height:40vh;overflow:auto">${S.events.length ? S.events.map(e =>
      `<div class="ev"><b>${esc(e.name)}</b> ${esc(JSON.stringify(e.props))}</div>`).join('')
      : '<div class="ev muted">Nothing yet — move around the app.</div>'}</div>
    <div class="note" style="margin:12px 18px 0">Names, counts and timings only. Never amounts, never holding
      names (N9).</div>`);
}

/* ================= router ================= */
const TABS = [['#/home','Home',ICON.home],['#/insights','Insights',ICON.insights],
              ['#/agent','Agent',ICON.agent],['#/account','Account',ICON.account]];
function render() {
  const hash = location.hash || (S.account.signedIn ? '#/home' : '#/landing');
  const p = hash.replace(/^#\//, '').split('/');
  const screens = { landing:'s-landing', signup:'s-signup', home:'s-home', holding:'s-holding',
    add:'s-add', edit:'s-add', insights:'s-insights', period:'s-period', agent:'s-agent',
    activity:'s-activity', account:'s-account', sub:'s-sub' };
  let id = screens[p[0]] || 's-home';
  if (p[0] === 'agent' && p[1] === 'chat') id = 's-chat';

  if (p[0] === 'home') renderHome();
  else if (p[0] === 'holding') renderHolding(p[1]);
  else if (p[0] === 'add') renderAdd(p[1] || 'asset', p[2]);
  else if (p[0] === 'edit') renderAdd(null, null, p[1]);
  else if (p[0] === 'insights') renderInsights();
  else if (p[0] === 'period') renderPeriod(p[1], p[2]);
  else if (p[0] === 'agent' && p[1] === 'chat') renderChat();
  else if (p[0] === 'agent') renderAgent();
  else if (p[0] === 'activity') renderActivity();
  else if (p[0] === 'account') renderAccount();
  else if (p[0] === 'sub') renderSub(p[1]);
  else if (p[0] === 'landing') renderLandingDemo();

  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const chrome = !['landing','signup'].includes(p[0]);
  $('#tabbar').classList.toggle('hidden', !chrome);
  $('#sidebar').style.display = chrome ? '' : 'none';
  $('#devbtn').style.display = chrome ? '' : 'none';
  const tabFor = { home:'#/home', holding:'#/home', add:'#/home', edit:'#/home', insights:'#/insights',
    period:'#/insights', agent:'#/agent', activity:'#/agent', account:'#/account', sub:'#/account' }[p[0]];
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tabFor));
  window.scrollTo(0, 0);
  if (p[0] === 'home') fire('session_started', {});
}

function renderLandingDemo() {
  const el = $('#landing-demo');
  if (!el || el.dataset.done) return;
  el.dataset.done = '1';
  const t = totals(seededState().holdings.filter(h => !h.archived));
  el.innerHTML = `<div class="chat" style="padding:12px">
    <div class="msg user" style="font-size:13.5px">Can I afford a $120k car?</div>
    <div class="msg tool">netnet.get_position_summary → one call</div>
    <div class="msg ai" style="font-size:13.5px">Yes, comfortably. You're worth <b>${esc(money(t.now))}</b>,
      but only <b>${esc(money(t.accessible))}</b> of that is readily accessible — CPF, the flat and unvested
      RSUs are locked or illiquid. You'd be selling equities to buy a depreciating asset.</div>
  </div>`;
}

/* ================= wiring ================= */
document.addEventListener('click', ev => {
  const go = ev.target.closest('[data-go]');
  if (go) { closeSheet(); location.hash = go.dataset.go; return; }
  const tab = ev.target.closest('[data-tab]');
  if (tab) { location.hash = tab.dataset.tab; return; }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const a = el.dataset.act, v = el.dataset.v, s = S.settings;
  const rerender = () => { save(); render(); };

  switch (a) {
    case 'close-sheet': closeSheet(); return;
    case 'open-baseline': sheetBaseline(); return;
    case 'set-baseline': s.baseline = v; closeSheet(); rerender(); return;
    case 'open-sort': sheetSort(); return;
    case 'set-sort': s.sort = v; closeSheet(); rerender(); return;
    case 'open-add-menu': sheetAddMenu(); return;
    case 'open-filter': sheetFilter(false); return;
    case 'open-insights-filter': sheetFilter(true); return;
    case 'holding-menu': sheetHoldingMenu(el.dataset.h); return;
    case 'add-value': sheetValue(el.dataset.h, null); return;
    case 'edit-value': sheetValue(el.dataset.h, el.dataset.v); return;
    case 'save-value': saveValue(el.dataset.h, el.dataset.v || null); return;
    case 'save-holding': saveHolding(el.dataset.k, el.dataset.e || null); return;

    case 'draft-showonly': S.draft.showOnly = v; sheetFilter(S.draft.forInsights); return;
    case 'draft-type': case 'draft-tag': case 'draft-extype': case 'draft-extag': {
      const key = { 'draft-type':'types', 'draft-tag':'tags', 'draft-extype':'exTypes', 'draft-extag':'exTags' }[a];
      const arr = S.draft[key];
      const i = arr.indexOf(v); i < 0 ? arr.push(v) : arr.splice(i, 1);
      sheetFilter(S.draft.forInsights); return;
    }
    case 'draft-tagmode': S.draft.tagMode = v; sheetFilter(S.draft.forInsights); return;
    case 'draft-extagmode': S.draft.exTagMode = v; sheetFilter(true); return;
    case 'draft-archived': S.draft.archived = !!v; sheetFilter(S.draft.forInsights); return;
    case 'apply-filter': {
      const d = S.draft;
      if (v) { s.inShowOnly = d.showOnly; s.inTypes = d.types; s.inTags = d.tags; s.inTagMode = d.tagMode;
        s.exTypes = d.exTypes; s.exTags = d.exTags; s.exTagMode = d.exTagMode; s.inArchived = d.archived; }
      else { s.showOnly = d.showOnly; s.filterTypes = d.types; s.filterTags = d.tags;
        s.tagMode = d.tagMode; s.filterArchived = d.archived; }
      closeSheet(); rerender(); return;
    }
    case 'reset-filter': {
      S.draft = v ? { forInsights:true, showOnly:'all', types:[], tags:[], tagMode:'OR', exTypes:[], exTags:[], exTagMode:'OR', archived:false }
                  : { forInsights:false, showOnly:'all', types:[], tags:[], tagMode:'OR', archived:false };
      sheetFilter(!!v); return;
    }
    case 'clear-filter': s.showOnly = 'all'; s.filterTypes = []; s.filterTags = []; s.filterArchived = false; rerender(); return;
    case 'clear-exclusions': s.exTypes = []; s.exTags = []; s.exHoldings = []; rerender(); return;

    case 'set-range': s.range = +v; rerender(); return;
    case 'set-detail-range': s.detailRange = +v; rerender(); return;
    case 'pie-mode': s.pieMode = v; rerender(); return;
    case 'set-insights-view': s.insightsView = v; S.insightsPage = 0; rerender(); return;
    case 'set-insights-range': s.insightsRange = +v; S.insightsPage = 0; rerender(); return;
    case 'insights-page': S.insightsPage = Math.max(0, (S.insightsPage || 0) + +v); rerender(); return;
    case 'detail-view': S.detailView = v; S.detailPage = 0; rerender(); return;
    case 'detail-page': S.detailPage = Math.max(0, (S.detailPage || 0) + +v); rerender(); return;
    case 'expand-value': S.expanded = S.expanded === v ? null : v; rerender(); return;

    case 'quick-add': location.hash = '#/add/' + (v === 't-loan' ? 'liability' : 'asset') + '/' + v; return;
    case 'toggle-formtag': {
      S.formTags = S.formTags || [];
      const i = S.formTags.indexOf(v); i < 0 ? S.formTags.push(v) : S.formTags.splice(i, 1);
      el.classList.toggle('on'); return;
    }
    case 'archive': {
      const h = holdingOf(v);
      h.archived = !h.archived;
      logIt({ kind:h.archived ? 'holding.archive' : 'holding.unarchive', holdingId:h.id, source:'web',
              client:null, turn:null, before:{ archived:!h.archived }, after:{ archived:h.archived } });
      closeSheet(); location.hash = '#/home'; rerender(); return;
    }
    case 'unarchive': {
      const h = holdingOf(v); h.archived = false;
      logIt({ kind:'holding.unarchive', holdingId:h.id, source:'web', client:null, turn:null,
              before:{ archived:true }, after:{ archived:false } });
      rerender(); return;
    }
    case 'delete-holding': {
      const h = holdingOf(v);
      if (!confirm('Delete "' + h.name + '" and all ' + h.values.length + ' values? This appears in your activity log and can be undone there.')) return;
      logIt({ kind:'holding.delete', holdingId:h.id, source:'web', client:null, turn:null,
              before:{ holding:JSON.parse(JSON.stringify(h)) }, after:null });
      S.holdings = S.holdings.filter(x => x.id !== v);
      closeSheet(); location.hash = '#/home'; rerender(); return;
    }
    case 'delete-value': {
      const h = holdingOf(el.dataset.h), val = h.values.find(x => x.id === el.dataset.v);
      if (!confirm('Delete this value?')) return;
      logIt({ kind:'value.delete', holdingId:h.id, valueId:val.id, source:'web', client:null, turn:null,
              before:{ amount:val.amount, ccy:val.ccy, date:val.date }, after:null });
      h.values = h.values.filter(x => x.id !== val.id); rerender(); return;
    }
    case 'undo': { const e = S.log.find(x => x.id === v); if (e) undoEntry(e); rerender(); return; }
    case 'undo-turn': {
      S.log.filter(e => e.turn === v && !e.undone).forEach(undoEntry);
      rerender(); return;
    }

    case 'set-client': S.uiClient = v; rerender(); return;
    case 'copy-url': navigator.clipboard && navigator.clipboard.writeText(MCP_URL); el.textContent = 'Copied'; return;
    case 'mock-verify': S.account.verified = true; rerender(); return;
    case 'connect': {
      fire('agent_connection_started', { client:S.uiClient || 'Claude' });
      S.account.connections.push({ id:uid('c'), client:S.uiClient || 'Claude',
        connectedAt:new Date().toISOString(), lastCall:new Date().toISOString(), active:true });
      fire('agent_connection_completed', { client:S.uiClient || 'Claude' });
      rerender(); return;
    }
    case 'fail-connect': {
      fire('agent_connection_failed', { step:'callback', client:S.uiClient || 'Claude' });
      alert("Couldn't finish connecting to " + (S.uiClient || 'Claude') + ".\n\n" +
        "Your client sent us back without an approval. This usually means the browser window was closed " +
        "before you pressed Allow.\n\nTry again — nothing was changed.");
      return;
    }
    case 'revoke': {
      const c = S.account.connections.find(x => x.id === v);
      if (!confirm('Revoke ' + c.client + '? Later calls from it will be rejected.')) return;
      c.active = false;
      logIt({ kind:'connection.revoke', holdingId:null, source:'web', client:null, turn:null,
              before:null, after:{ client:c.client } });
      rerender(); return;
    }
    case 'chat-next': {
      S.chatStep = (S.chatStep || 0) + 1;
      const stepDef = SCRIPT[S.chatStep - 1];
      if (stepDef && stepDef.write) {
        const h = holdingOf('h-ibkr');
        if (h && !h.values.some(x => x.turn === 'turn-demo')) {
          const val = { id:uid('v'), date:TODAY, amount:421900, ccy:'USD', note:'', marked:false,
            source:'agent', client:'Claude', turn:'turn-demo', enteredAt:new Date().toISOString() };
          recomputeBase(val); h.values.push(val); h.values.sort((a, b) => a.date.localeCompare(b.date));
          logIt({ kind:'value.create', holdingId:h.id, valueId:val.id, source:'agent', client:'Claude',
                  turn:'turn-demo', before:null, after:{ amount:val.amount, ccy:val.ccy, date:val.date } });
          fire('agent_tool_called', { tool:'record_value', kind:'write', outcome:'ok', latency_ms:412, client:'Claude' });
          fire('value_recorded', { source:'agent' });
        }
      }
      if (stepDef && stepDef.who === 'tool' && !stepDef.write)
        fire('agent_tool_called', { tool:'read', kind:'read', outcome:'ok', latency_ms:180, client:'Claude' });
      rerender(); return;
    }
    case 'chat-reset': S.chatStep = 0; rerender(); return;

    case 'set-cadence': s.reminderCadence = v; rerender(); return;
    case 'new-type': {
      const n = prompt('Name the new type'); if (!n) return;
      S.types.push({ id:uid('t'), name:n.trim(),
        colour:['#38bdf8','#22c55e','#a78bfa','#f59e0b','#ec4899','#fb923c','#2dd4bf'][S.types.length % 7],
        access:'accessible' });
      rerender(); return;
    }
    case 'edit-type': {
      const t = S.types.find(x => x.id === v);
      const n = prompt('Rename type (blank to delete; holdings move to General)', t.name);
      if (n === null) return;
      if (!n.trim()) {
        S.holdings.forEach(h => { if (h.typeId === t.id) h.typeId = 't-general'; });
        S.types = S.types.filter(x => x.id !== t.id);
      } else t.name = n.trim();
      rerender(); return;
    }
    case 'new-tag': {
      const n = prompt('Name the new tag'); if (!n || !n.trim()) return;
      if (!S.tags.includes(n.trim())) S.tags.push(n.trim());
      rerender(); return;
    }
    case 'edit-tag': {
      const old = v;
      const n = prompt('Rename tag (blank to delete; it is removed from every holding)', old);
      if (n === null) return;
      if (!n.trim()) { S.tags = S.tags.filter(t => t !== old); S.holdings.forEach(h => h.tags = h.tags.filter(t => t !== old)); }
      else { S.tags = S.tags.map(t => t === old ? n.trim() : t);
             S.holdings.forEach(h => h.tags = h.tags.map(t => t === old ? n.trim() : t)); }
      rerender(); return;
    }
    case 'export': case 'export-csv': {
      const data = { exportedAt:new Date().toISOString(), defaultCurrency:s.defaultCcy,
        types:S.types, tags:S.tags, holdings:S.holdings };
      let blob, name;
      if (a === 'export') { blob = new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }); name = 'netnet-export.json'; }
      else {
        const rows = [['holding','type','tags','kind','accessibility','currency','date','amount','rate','rate_date','default_currency_value','source','note']];
        S.holdings.forEach(h => h.values.forEach(x => rows.push([h.name, typeOf(h.typeId).name, h.tags.join('|'),
          h.kind, h.access, x.ccy, x.date, x.amount, x.rate, x.rateDate, x.base, x.source, x.note])));
        blob = new Blob([rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')], { type:'text/csv' });
        name = 'netnet-export.csv';
      }
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
      return;
    }
    case 'delete-account': {
      if (!confirm('Delete your account and everything in it? In the real product this is irreversible.')) return;
      fire('account_deleted', {});
      reset('empty'); return;
    }
    case 'reset-seeded': reset('seeded'); return;
    case 'reset-empty': reset('empty'); return;
    case 'proto': sheetProto(); return;
  }
});

document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'toggle-setting') { S.settings[el.dataset.v] = el.checked; save(); render(); }
  if (el.dataset.act === 'toggle-reminders') { S.settings.reminderOptOut = !el.checked; save(); render(); }
  if (el.dataset.act === 'set-ccy') { S.settings.defaultCcy = el.value; save(); render(); }
});

$('#scrim').addEventListener('click', closeSheet);
$('#devbtn').addEventListener('click', sheetProto);
window.addEventListener('hashchange', render);

/* signup (J1) */
document.addEventListener('click', ev => {
  const b = ev.target.closest('#su-go, [data-social], [data-demo-landing]');
  if (!b) return;
  if (b.dataset.demoLanding !== undefined) { renderLandingDemo(); return; }
  fire('signup_started', { method: b.dataset.social || 'email' });
  const email = ($('#su-email') && $('#su-email').value) || (b.dataset.social ? 'you@example.com' : '');
  if (!b.dataset.social && !email) { alert('Enter an email.'); return; }
  S.account.signedIn = true; S.account.verified = false;
  S.account.email = email; S.account.name = email.split('@')[0] || 'there';
  S.account.initials = (S.account.name[0] || 'Y').toUpperCase();
  if ($('#su-ccy')) S.settings.defaultCcy = $('#su-ccy').value;
  fire('account_created', {});
  save(); location.hash = '#/home';
});

fire('landing_view', {});
render();
