/* NetNet prototype — behaviour.
   Stage 2 design code: deliberately throwaway. Vanilla JS, no build, no framework.
   Stack decisions belong to Stage 3. */

/* ================= state ================= */
const LS = 'netnet-proto-v3';
let S = null;   // loaded at the bottom of this file, once every helper exists

function load() {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) {
      const st = JSON.parse(raw);
      /* saved before onboarding existed: a signed-in account had already answered it */
      if (st.account && st.account.onboarded == null) st.account.onboarded = !!(st.account.signedIn && st.account.region);
      return st;
    }
  } catch (e) {}
  return hydrate(seededState());
}
function save() { try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
function reset(mode) {
  S = hydrate(mode === 'empty' ? emptyState() : seededState());
  save(); closeSheet();
  lastRoute = null; sessionStarted = false;
  location.hash = mode === 'empty' ? '#/signup' : '#/home';
  render();
}

/* The audit log (J7) is built FROM the value history, so every row on screen has
   a log entry behind it rather than the log being a separate fiction. */
function hydrate(s) {
  s.holdings.forEach(h => {
    if (h.kind === 'asset' && !h.access)
      h.access = accessFromBasis(h.accessBasis, universalOf(h.typeId, s), PACKS[s.account.pack]);
  });
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
  props = Object.assign({}, props || {}, { segment:(S.account && S.account.segment) || 'unknown' });
  S.events.unshift({ name, props, at:new Date().toISOString() });
  if (S.events.length > 150) S.events.pop();
  console.log('[event]', name, props);
  save();
}

/* ================= helpers ================= */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const holdingOf = id => S.holdings.find(h => h.id === id);
const uid = p => p + '-' + Math.random().toString(36).slice(2, 9);

/* ---- jurisdiction packs (§2.3). The flow reads the world ONLY through these. ---- */
const pack = () => PACKS[(S && S.account && S.account.pack) || 'generic'] || PACKS.generic;
function packVal(section, key) {
  const p = pack(), g = PACKS.generic;
  if (p[section] && p[section][key] != null) return p[section][key];
  return g[section] ? g[section][key] : undefined;
}
const packList = section => pack()[section] || PACKS.generic[section];
/* Every country, alphabetical by its English name. No country is pinned to the top. */
const REGIONS = (() => {
  let dn = null; try { dn = new Intl.DisplayNames(['en'], { type:'region' }); } catch (e) {}
  return Object.keys(COUNTRY_CCY).map(code => ({ code, ccy:COUNTRY_CCY[code], pack:COUNTRY_PACK[code] || null,
    name:REGION_NAMES[code] || (dn && dn.of(code)) || code })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
})();
const regionOf = code => REGIONS.find(r => r.code === code) || null;
/* Currency choices: the one in use first, then every currency, alphabetical. */
const ALL_CCYS = [...new Set([...CCYS, ...Object.values(COUNTRY_CCY)])].sort();
const ccyOptions = selected => [selected, ...ALL_CCYS.filter(c => c !== selected)]
  .map(c => `<option ${c === selected ? 'selected' : ''}>${c}</option>`).join('');
const LIAB = UNIVERSAL_TYPES.filter(u => u.side === 'liability').map(u => u.id);

/* A pack's own default type ("Car loan"): a local name for universal behaviour. */
const packTypeDef = key => (pack().types || []).find(x => x.key === key) ||
  (PACKS.generic.types || []).find(x => x.key === key) || null;
/* A type shows the user's own name if they renamed it, else the pack's label. A pack's
   own type keeps the label it arrived with if the user later moves to a pack without it. */
const typeName = t => t.name || (t.key && (packTypeDef(t.key) || {}).label) || t.label ||
  packVal('labels', t.universal) || 'Other';
const typeExample = typeId => {
  const t = S.types.find(x => x.id === typeId) || {};
  return (t.key && (packTypeDef(t.key) || {}).example) || packVal('examples', t.universal || 'other') || '';
};
/* Add the current pack's own types. Never removes one: packs set defaults, they never
   restrict (§2.3 rule 3), and a type may already have holdings in it. */
function applyPackTypes() {
  (pack().types || []).forEach(d => {
    if (!S.types.some(t => t.key === d.key))
      S.types.push({ id:'t-' + d.key, universal:d.u, name:null, key:d.key, label:d.label });
  });
}
function typeOf(id) {
  const t = S.types.find(x => x.id === id) || { id:'t-other', universal:'other', name:null };
  return Object.assign({}, t, { name:typeName(t) });
}
const universalOf = (typeId, s) => ((s || S).types.find(t => t.id === typeId) || { universal:'other' }).universal;
/* The plain type for a universal behaviour — never a pack's own type such as "Car loan". */
function typeForUniversal(u) {
  let t = S.types.find(x => x.universal === u && !x.name && !x.key) || S.types.find(x => x.universal === u && !x.key);
  if (!t) { t = { id:uid('t'), universal:u, name:null }; S.types.push(t); }
  return t;
}

/* ---- accessibility (J2). Stored as accessible / illiquid / locked, plus 'unset'
   when the user has not decided — saving is never blocked. The category names
   are the data model; the user only ever sees a fact question and a consequence. */
function accessRule(u, pk) {
  for (const src of [pk || pack(), PACKS.generic]) {
    if (src.defaults && src.defaults[u]) return { fixed:src.defaults[u] };
    if (src.questions && src.questions[u]) return { q:u, question:src.questions[u] };
  }
  return { q:'other', question:packVal('questions', 'other') };
}
const questionFor = q => packVal('questions', q);
function answerFor(basis) {
  if (!basis || !basis.q) return null;
  if (basis.q === 'default') return null;
  const qu = questionFor(basis.q);
  return qu ? qu.answers.find(a => a.id === basis.a) || null : null;
}
function accessFromBasis(basis, u, pk) {
  if (!basis || basis.q === 'unset') return 'unset';
  if (basis.q === 'default') { const r = accessRule(u, pk); return r.fixed ? r.fixed.access : 'unset'; }
  const a = answerFor(basis);
  return a ? a.access : 'unset';
}
/* The one-line stated reason, always read from the CURRENT pack, so a region
   change re-words it. Returns { reason, until } or null when undecided. */
function reasonFor(h) {
  const b = h.accessBasis;
  if (!b || b.q === 'unset') return null;
  if (b.q === 'default') {
    const u = universalOf(h.typeId);
    const r = (pack().defaults || {})[u] || (PACKS.generic.defaults || {})[u];
    return r ? { reason:r.reason, until:r.until } : { reason:'you set this when you added it' };
  }
  const a = answerFor(b);
  return a ? { reason:a.reason, until:a.until } : null;
}
/* The consequence, never the label: "counts toward the $X you could use this month".
   Pass usable = null to leave the amount out where it would repeat a figure on screen. */
function consequence(access, reason, usable) {
  const tail = reason ? ' — ' + esc(reason) + '.' : '.';
  const X = usable == null ? 'what' : `the <span class="amount">${esc(money(usable))}</span>`;
  if (access === 'accessible') return `<b>Counts toward ${X} you could use this month</b>${tail}`;
  if (access === 'illiquid' || access === 'locked')
    return `<b>Counts toward your net worth, not ${X} you could use this month</b>${tail}`;
  return `<b>Counts toward your net worth.</b> Not toward ${X} you could use this month until you decide.`;
}

/* ---- conventions: the pack's, or the browser's own for the generic pack ---- */
function LOC() {
  const p = pack();
  try { return p.locale || navigator.language || 'en-GB'; } catch (e) { return 'en-GB'; }
}
const FMT = {};
function nf(ccy, d) {
  const k = LOC() + ccy + d;
  if (!FMT[k]) {
    try { FMT[k] = new Intl.NumberFormat(LOC(), { style:'currency', currency:ccy, currencyDisplay:'narrowSymbol',
            minimumFractionDigits:d, maximumFractionDigits:d }); }
    catch (e) { FMT[k] = new Intl.NumberFormat('en-GB', { style:'currency', currency:ccy,
            minimumFractionDigits:d, maximumFractionDigits:d }); }
  }
  return FMT[k];
}
function sym(ccy) {
  const part = nf(ccy || S.settings.defaultCcy, 0).formatToParts(0).find(x => x.type === 'currency');
  return part ? part.value : '$';
}
function money(n, ccy, o) {
  o = o || {};
  const c = ccy || S.settings.defaultCcy;
  /* cents:'auto' shows cents only when there are some — $797,992 but $28,100.53 */
  const d = o.decimals != null ? o.decimals
    : o.cents === 'auto' ? (Math.round(Math.abs(n) * 100) % 100 ? 2 : 0) : (o.cents ? 2 : 0);
  return (n < 0 ? '−' : (o.signed && n > 0 ? '+' : '')) + nf(c, d).format(Math.abs(n)) + (o.ccy ? ' ' + c : '');
}
function compact(n) {
  const a = Math.abs(n), sign = n < 0 ? '−' : '', $ = sym();
  if (a >= 1e6) return sign + $ + (a / 1e6).toFixed(2).replace(/\.00$/, '') + 'M';
  if (a >= 1e3) return sign + $ + Math.round(a / 1e3) + 'K';
  return sign + $ + Math.round(a);
}
function compactSigned(n) { return (n > 0 ? '+' : '') + compact(n); }
const pct = n => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(2) + '%';
const cls = n => n > 0 ? 'pos' : n < 0 ? 'neg' : 'muted';
const fmtDate = d => new Date(d + 'T00:00:00Z').toLocaleDateString(LOC(), { day:'numeric', month:'short', year:'numeric', timeZone:'UTC' });
const fmtDT = iso => new Date(iso).toLocaleDateString(LOC(), { day:'numeric', month:'short', year:'numeric' }) +
  ', ' + new Date(iso).toLocaleTimeString(LOC(), { hour:'numeric', minute:'2-digit' });
/* "3 weeks ago" from a whole number of days. */
function daysAgo(n) {
  if (n < 1) return 'today';
  if (n < 2) return 'yesterday';
  if (n < 7) return n + ' days ago';
  if (n < 45) { const w = Math.round(n / 7); return w === 1 ? 'a week ago' : w + ' weeks ago'; }
  if (n < 400) { const m = Math.round(n / 30); return m === 1 ? 'a month ago' : m + ' months ago'; }
  const y = n / 365;
  return (y < 1.5 ? 'a year' : Math.round(y) + ' years') + ' ago';
}
/* How old a value is — the date it is FOR. */
const ago = d => daysAgo(daysBetween(d, TODAY));
/* When something was typed in — a timestamp, not the date it is for. */
function since(iso) {
  const min = Math.max(0, (Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) { const m = Math.round(min); return m === 1 ? 'a minute ago' : m + ' minutes ago'; }
  if (min < 1440) { const h = Math.round(min / 60); return h === 1 ? 'an hour ago' : h + ' hours ago'; }
  return daysAgo(Math.floor(min / 1440));
}

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
  let now = 0, base = 0, assets = 0, liabilities = 0, exact = true;
  const by = { accessible:0, illiquid:0, locked:0, unset:0 };
  list.forEach(h => {
    const c = changeFor(h);
    now += c.now; base += c.base; if (!c.exact) exact = false;
    if (h.kind === 'liability') liabilities += Math.abs(c.now);
    else { assets += c.now; by[by[h.access] != null ? h.access : 'unset'] += c.now; }
  });
  return { now, base, abs:now - base, pct: base ? ((now - base) / Math.abs(base)) * 100 : 0,
           assets, liabilities, accessible:by.accessible, illiquid:by.illiquid, locked:by.locked,
           unset:by.unset, exact };
}
const usableNow = () => totals(S.holdings.filter(h => !h.archived)).accessible;
const isStale = h => {
  const v = latest(h);
  return !v || daysBetween(v.date, TODAY) > Math.max(45, (h.cadenceDays || 30) * 1.6);
};
function byType(list) {
  const map = {};
  list.filter(h => h.kind === 'asset').forEach(h => {
    const t = typeOf(h.typeId);
    (map[t.id] = map[t.id] || { id:t.id, name:t.name, colour:typeColour(t.id), value:0 }).value += signed(h, latest(h));
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
/* The window a chart pager is showing, e.g. "Jun – Sep 2026", "Q3 2025 – Q3 2026", "2022 – 2026". */
function windowLabel(ps, view) {
  if (!ps.length) return '';
  const a = ps[0], b = ps[ps.length - 1];
  if (view === 'quarterly') return a.label.replace('/', ' ') + (ps.length > 1 ? ' – ' + b.label.replace('/', ' ') : '');
  if (view === 'yearly') return a.label + (ps.length > 1 ? ' – ' + b.label : '');
  const d = x => new Date(x.end + 'T00:00:00Z'), m = x => d(x).toLocaleDateString('en-SG', { month:'short', timeZone:'UTC' });
  const y = x => d(x).getUTCFullYear();
  if (ps.length === 1) return m(a) + ' ' + y(a);
  return y(a) === y(b) ? `${m(a)} – ${m(b)} ${y(b)}` : `${m(a)} ${y(a)} – ${m(b)} ${y(b)}`;
}
function periodLabel(view, end, short) {
  const d = new Date(end + 'T00:00:00Z');
  /* Short labels sit under a chart whose pager already states the years. */
  if (view === 'monthly') return d.toLocaleDateString(LOC(), short ? { month:'short', timeZone:'UTC' }
    : { month:'long', year:'numeric', timeZone:'UTC' });
  if (view === 'quarterly') return 'Q' + (Math.floor(d.getUTCMonth() / 3) + 1) + (short ? '' : ' ' + d.getUTCFullYear());
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
      (segs[t.id] = segs[t.id] || { id:t.id, name:t.name, colour:typeColour(t.id), value:0 })
        .value += h.kind === 'liability' ? -v.base : v.base;
    });
    return { p, segs:Object.values(segs), total:p.value };
  });
}

/* --- ranges --- */
const HOME_RANGES = [['All',0],['6M',6],['YTD',-1],['1Y',12],['2Y',24],['4Y',48],['8Y',96]];
const INSIGHT_RANGES = {
  monthly:  [['All',0],['YTD',-1],['6M',6],['1Y',12],['2Y',24],['4Y',48]],
  quarterly:[['All',0],['YTD',-1],['1Y',4],['2Y',8],['4Y',16],['8Y',32]],
  yearly:   [['All',0],['2Y',2],['4Y',4],['8Y',8],['10Y',10]]
};
function ytdMonths() { return new Date(TODAY + 'T00:00:00Z').getUTCMonth() + 1; }
function rangeMonths(v) { return v === -1 ? ytdMonths() : v; }

/* ================= chart palette =================
   The validated default categorical set, documented order, verified against both
   NetNet grounds. Per design-system.md §4.4: the two brand inks never appear inside
   a categorical chart, and these hues never appear as UI chrome. Fixed order — a
   ninth category folds into "Other" rather than getting a generated hue. */
const CAT_LIGHT = ['#2a78d6','#eb6834','#1baf7a','#eda100','#e87ba4','#008300','#4a3aa7','#e34948'];
const CAT_DARK  = ['#3987e5','#d95926','#199e70','#c98500','#d55181','#008300','#9085e9','#e66767'];
const isDark = () => !window.matchMedia || window.matchMedia('(prefers-color-scheme: dark)').matches;
const catColour = i => { const p = isDark() ? CAT_DARK : CAT_LIGHT; return i >= 0 && i < p.length ? p[i] : 'var(--ink-3)'; };
const typeColour = id => catColour(S.types.findIndex(t => t.id === id));

/* ================= charts =================
   SVG carries geometry only, in a 0–100 x 0–100 box with preserveAspectRatio="none",
   so a chart fills whatever card it is in. Every piece of text is HTML positioned
   over or under it, so nothing is ever stretched. No chart library. */
function niceTicks(min, max, n) {
  const out = []; for (let i = 0; i <= n; i++) out.push(min + (max - min) * (i / n)); return out;
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
  const yl = S.settings.showZeroBounds ? ticks.map(t =>
    `<span class="yt" style="top:${fy(t).toFixed(2)}%">${esc(compact(t))}</span>`).join('') : '';
  const idx = [0, Math.round((pts0.length - 1) / 3), Math.round((pts0.length - 1) * 2 / 3), pts0.length - 1]
    .filter((v, i, a) => a.indexOf(v) === i);
  const xl = idx.map(i => `<span>${esc(new Date(pts0[i].x + 'T00:00:00Z')
    .toLocaleDateString(LOC(), { month:'short', year:'numeric', timeZone:'UTC' }))}</span>`).join('');
  return `<div class="plot" style="height:${h}px;padding-left:${PADL}px">${yl}
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}${body}</svg></div>
    <div class="axis" style="padding-left:${PADL}px">${xl}</div>`;
}

/* Growth bars with the change label above each bar — the mockups' signature chart.
   The label states each bar's value, so there is no y-axis to read it off as well, and
   the scale covers only the side(s) the bars use: all-positive bars get the full height. */
function growthBars(periods, o) {
  o = o || {};
  const n = periods.length;
  if (!n) return '<div class="muted" style="padding:30px 0;text-align:center;font-size:13px">No periods to show yet.</div>';
  const h = o.px || 170;
  const vals = periods.map(p => p.abs || 0);
  const top = Math.max(0, ...vals), bot = Math.min(0, ...vals), span = (top - bot) || 1;
  const fy = v => 2 + ((top - v) / span) * 96;
  const z = fy(0);
  const cellW = 100 / n, bw = Math.min(cellW * 0.52, 9);
  const grid = S.settings.showZeroBounds && top > 0
    ? `<line class="grid-l" x1="0" y1="${fy(top).toFixed(2)}" x2="100" y2="${fy(top).toFixed(2)}" vector-effect="non-scaling-stroke"/>` : '';
  const bars = periods.map((p, i) => {
    const v = p.abs || 0;
    const y = v >= 0 ? fy(v) : z;
    const bh = Math.max(0.7, Math.abs(fy(v) - z));
    const colour = v > 0 ? 'var(--gain)' : v < 0 ? 'var(--loss)' : 'var(--rule-strong)';
    return `<rect x="${(cellW * i + cellW / 2 - bw / 2).toFixed(2)}" y="${y.toFixed(2)}"
      width="${bw.toFixed(2)}" height="${bh.toFixed(2)}" fill="${colour}"/>`;
  }).join('');
  const labels = periods.map(p => {
    const v = p.abs || 0, c = v > 0 ? 'pos' : v < 0 ? 'neg' : 'muted';
    return `<div class="${c}">${p.abs == null ? '—' : esc(compactSigned(v))}</div>`;
  }).join('');
  const xl = periods.map(p => `<div>${esc(p.short)}</div>`).join('');
  return `<div class="bl">${labels}</div>
    <div class="plot" style="height:${h}px">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${grid}
        <line class="zero" x1="0" y1="${z.toFixed(2)}" x2="100" y2="${z.toFixed(2)}" vector-effect="non-scaling-stroke"/>${bars}</svg></div>
    <div class="xl">${xl}</div>`;
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

/* Allocation as a ranked list, not a donut. Name + percentage sit beside every
   swatch, which is what satisfies the light-mode relief rule (four categorical
   slots fall below 3:1 on paper, so labels are mandatory, not optional). */
function allocationList(segs, mode) {
  const total = segs.reduce((s, x) => s + x.value, 0) || 1;
  return segs.map(s => {
    const share = s.value / total;
    return `<div class="lrow" style="color:${s.colour}">
      <span class="bar" style="width:${(share * 68 + 4).toFixed(1)}px"></span>
      <span class="grow" style="color:var(--ink)">${esc(s.name)}</span>
      <b style="color:var(--ink-2)">${mode === '$' ? esc(compact(s.value)) : (share * 100).toFixed(1) + '%'}</b>
    </div>`;
  }).join('');
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
  const hasHistory = list.some(h => h.values.length > 1);
  const months = rangeMonths(S.settings.range);
  const first = earliestDate(list);
  const span = months || (first ? Math.max(2, Math.ceil(daysBetween(first, TODAY) / 30)) : 12);
  const pts = [];
  for (let m = span; m >= 0; m--) {
    const d = m === 0 ? TODAY : addMonths(TODAY, -m);
    pts.push({ x:d, y:netWorthAsOf(d, list) });
  }
  const segs = byType(list);
  const stale = list.filter(isStale).length;

  /* One change figure per row: the money, or the percentage when that is what the list is sorted by. */
  const byPct = S.settings.sort === 'chg-pct';
  const rows = list.slice().sort(sorter(S.settings.sort)).map(h => {
    const c = changeFor(h), v = latest(h);
    const byAgent = v && v.source === 'agent';
    return `<button class="row ${byAgent ? 'by-agent' : ''}" data-go="#/holding/${h.id}">
      <span class="grow">
        <span class="name">${esc(h.name)}</span>
        <span class="sub">${esc(typeOf(h.typeId).name)}
          ${isStale(h) ? ' · <span class="chip stale">stale</span>' : ''}
          ${h.kind === 'asset' && h.access === 'unset' ? ' · <span class="chip stale">not decided</span>' : ''}
          ${v ? ' · ' + esc(ago(v.date)) : ' · no value yet'}</span>
      </span>
      <span class="amt"><b>${h.kind === 'liability' ? '−' : ''}${esc(money(Math.abs(c.now)))}</b>
        ${hasHistory && c.abs ? `<span class="chg ${cls(c.abs)}">${esc(byPct ? pct(c.pct) : compactSigned(c.abs))}</span>` : ''}</span>
    </button>`;
  }).join('');
  const archived = S.holdings.filter(h => h.archived).length;

  /* Phone order: total → trend → position → holdings → allocation. Desktop puts the
     summary (position, allocation) in the right column; see styles.css. */
  $('#s-home').innerHTML = `
  <div class="topbar">
    <div class="wordmark"><i></i>NetNet</div>
    <button class="iconbtn ${homeFiltered() ? 'on' : ''}" data-act="open-filter" title="Filters">${ICON.filter}</button>
    <button class="iconbtn" data-go="#/activity" title="Activity">${ICON.activity}</button>
    <button class="iconbtn" data-act="open-add-menu" title="Add tracking">${ICON.plus}</button>
  </div>

  ${homeFiltered() ? `<div class="note"><b>Filtered:</b> ${esc(filterSummary())}.
    <button class="btn ghost sm auto" data-act="clear-filter">Clear</button></div>` : ''}

  <div class="nw-wrap">
    <div class="label">${homeFiltered() ? 'Filtered total' : 'Net worth'}</div>
    <div class="nw">${esc(money(t.now))}</div>
    ${hasHistory ? changeLine(t.abs, t.pct) : ''}
  </div>

  <div class="grid">
    <div class="g5">
      <div class="o-pos"><div class="section-h"><h2>Position</h2></div>
      ${positionLedger(list, t)}
      ${stale ? staleNote(stale) : ''}</div>

      ${segs.length > 1 ? `<div class="o-alloc"><div class="section-h"><h2>Allocation</h2>
        <button class="link" data-act="pie-mode" data-v="${S.settings.pieMode === '$' ? '%' : '$'}">${S.settings.pieMode === '$' ? 'Show %' : 'Show ' + esc(sym())}</button></div>
      <div class="card">${allocationList(segs, S.settings.pieMode)}</div></div>` : ''}
    </div>

    <div class="g7">
      ${hasHistory ? `<div class="o-trend card">
        ${lineChart([{ points:pts, colour:'var(--brand)', fill:true }], { px:150 })}
        <div class="rangebar">${HOME_RANGES.map(([l, v]) =>
          `<button data-act="set-range" data-v="${v}" class="${S.settings.range === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      </div>` : ''}

      <div class="o-list"><div class="section-h"><h2>Holdings · ${list.length}</h2>
        <button class="link" data-act="open-sort">${esc(sortLabel())}</button></div>
      <div class="card flush">${rows || '<div class="empty"><p class="muted">Nothing matches this filter.</p></div>'}</div>
      ${archived ? `<div class="list-foot"><button class="link" data-go="#/sub/archived">${archived} archived ›</button></div>` : ''}</div>
    </div>
  </div>`;
}

/* Out-of-date holdings. With an agent connected, one tap hands it the job (the prompt
   carries no data: the agent finds what is stale through the MCP layer). Without one,
   the way to keep it current is to connect one. */
function staleNote(n) {
  const head = `<b>${n} holding${n > 1 ? 's are' : ' is'} out of date.</b>`;
  const conn = activeConns()[0], cl = conn && clientByName(conn.client);
  if (!cl) return `<div class="note warn">${head}
    <button class="btn ghost sm auto" data-act="connect-start" data-v="home">Connect your agent to keep it current</button></div>`;
  const c = cl[1], them = n > 1 ? 'them' : 'it';
  return `<div class="note warn">${head}
    ${c.deepLink ? `<a class="btn ghost sm auto" href="${esc(c.deepLink + encodeURIComponent(REFRESH_PROMPT))}" target="_blank" rel="noopener">Ask ${esc(c.name)} to update ${them}</a>`
      : `<button class="btn ghost sm auto" data-act="copy-prompt" data-v="${esc(REFRESH_PROMPT)}">Copy a prompt for ${esc(c.name)}</button>`}</div>`;
}

/* The change against the comparison baseline. The baseline's name is the control
   that changes it — no separate "Change comparison" button. */
function changeLine(abs, p) {
  return `<button class="nw-chg" data-act="open-baseline"><span class="num ${cls(abs)}">${esc(money(abs, null, { signed:true }))}
    · ${esc(pct(p))}</span> <span class="vs">vs ${esc(baselineLabel().toLowerCase())} ▾</span></button>`;
}

/* Position as a ledger — the first picture (J1): what you could use, what needs selling,
   what is locked, what is undecided, and what you owe. One amount per row; the row
   beneath names what is in it and nothing else. */
function positionLedger(list, t) {
  const assets = list.filter(h => h.kind === 'asset');
  const names = hs => {
    const n = hs.map(h => esc(h.name));
    return n.length > 3 ? n.slice(0, 2).join(' · ') + ' · +' + (n.length - 2) + ' more' : n.join(' · ');
  };
  const inBucket = a => assets.filter(h => (h.access || 'unset') === a);
  /* Locked holdings are named by type: "Property · CPF", not five account names. */
  const typesIn = hs => [...new Set(hs.map(h => typeOf(h.typeId).name))].map(esc).join(' · ');
  const row = (label, amount, sub, extra) => `<div class="lg-row${extra ? ' ' + extra : ''}">
      <span class="grow"><span class="t">${label}</span>${sub ? `<span class="s">${sub}</span>` : ''}</span>
      <b class="amount${amount < 0 ? ' neg' : ''}">${esc(money(amount))}</b></div>`;
  return `<div class="card flush ledger">
    ${row('You could use this month', t.accessible, names(inBucket('accessible')) || 'Nothing yet')}
    ${t.illiquid ? row('You’d have to sell first', t.illiquid, names(inBucket('illiquid'))) : ''}
    ${t.locked ? row('Locked away', t.locked, typesIn(inBucket('locked'))) : ''}
    ${t.unset ? row('Not decided yet', t.unset, names(inBucket('unset'))) : ''}
    ${t.liabilities ? row('You owe', -t.liabilities, names(list.filter(h => h.kind === 'liability')), 'owe') : ''}
  </div>`;
}

/* ---- the basics (J1, P-A). Asked in onboarding, one question per screen, after
   where-you-live and the segment; reachable again from the empty Home. Every "yes"
   is saved the moment it is answered, "Done for now" is always one tap away, and
   nothing asked here is final. Follow-ups (`onlyIf`) are asked only after a yes. ---- */
const newGuide = () => ({ done:false, i:0, stage:'ask', answered:{}, last:null });
const guideItems = () => packList('checklist');
function typeForItem(item) {
  if (item.type) { applyPackTypes(); const t = S.types.find(x => x.key === item.type); if (t) return t; }
  return typeForUniversal(item.u);
}
function guideCovered(item) {
  const t = typeForItem(item);
  return S.holdings.some(h => !h.archived && h.typeId === t.id &&
    (!item.answer || (h.accessBasis && h.accessBasis.a === item.answer)));
}
function guideApplies(item) {
  if (!item.onlyIf) return true;
  const parent = guideItems().find(x => x.id === item.onlyIf);
  return S.guide.answered[item.onlyIf] === 'yes' || (parent && guideCovered(parent));
}
function guideCurrent() {
  const items = guideItems();
  for (let i = S.guide.i || 0; i < items.length; i++) {
    const it = items[i];
    if (S.guide.answered[it.id] || !guideApplies(it) || guideCovered(it)) continue;
    /* a follow-up shares its question's number, so "3 of 6" never jumps to "3 of 7" */
    const base = items.filter(x => !x.onlyIf);
    const anchor = it.onlyIf ? items.find(x => x.id === it.onlyIf) : it;
    return { item:it, idx:i, n:base.indexOf(anchor) + 1, total:base.length };
  }
  return null;
}
function renderBasics() {
  const g = S.guide || (S.guide = newGuide());
  const cur = guideCurrent();
  if (!cur) { finishBasics(); return; }
  const { item, n, total } = cur;
  const last = g.last && holdingOf(g.last);
  const lastLine = last ? `<div class="guide-last">Added <b>${esc(last.name)}</b>,
      <span class="amount">${esc(money(Math.abs(latest(last).base)))}</span>.
      ${last.kind === 'asset' ? consequence(last.access, (reasonFor(last) || {}).reason, null)
        : 'Subtracted from your net worth.'}</div>` : '';
  authShell(`
    <div class="basics-top"><span class="auth-step">What you have · ${n} of ${total}</span>
      <button class="link-sm" data-act="guide-stop">Done for now</button></div>
    ${lastLine}
    ${g.stage === 'amount' ? `
      <p class="basics-asked">${esc(item.ask)} <b>Yes</b></p>
      <h1>${esc(item.amount)}</h1>
      <div class="amt-in"><span>${esc(sym())}</span>
        <input id="g-amount" type="number" inputmode="decimal" min="0" placeholder="0" aria-label="${esc(item.amount)}">
        <button class="btn auto" data-act="guide-add">Add</button></div>
      <div class="hint" style="margin-top:10px">${esc(item.hint || 'A round number is fine. You can change it any time.')}</div>
      <button class="link-sm basics-back" data-act="guide-back">‹ Back</button>`
    : `
      <h1>${esc(item.ask)}</h1>
      <div class="choice basics-yn"><button data-act="guide-yes">Yes</button><button data-act="guide-no">No</button></div>`}`);
}
function finishBasics() {
  S.guide.done = true; S.guide.last = null;
  Object.assign(S.account, { onboarded:true, obStep:null });
  save(); location.hash = '#/home';
}
function guideAdd() {
  const cur = guideCurrent();
  const el = $('#g-amount');
  if (!cur || !el) return;
  const amount = parseFloat(el.value);
  if (!(amount >= 0)) { el.classList.add('bad'); el.focus(); return; }
  const { item, idx } = cur;
  const kind = LIAB.includes(item.u) ? 'liability' : 'asset';
  const t = typeForItem(item);
  /* A fact folded into the question ("the home you live in") is recorded as that
     fact's answer; otherwise the type's usual default. */
  const basis = kind === 'liability' ? null
    : item.answer ? { q:item.u, a:item.answer } : (startingBasis(t.id) || { q:'unset' });
  const h = createHolding({ name:item.name, kind, typeId:t.id, ccy:S.settings.defaultCcy,
    amount, date:TODAY, basis, via:'guided' });
  Object.assign(S.guide, { i:idx + 1, stage:'ask', last:h.id });
  S.guide.answered[item.id] = 'yes';
  save(); render(true);
}

/* Empty Home: a sentence and one action (design-system §6), plus one quiet alternative. */
function emptyHome() {
  return `
  <div class="topbar">
    <div class="avatar">${esc(S.account.initials || '·')}</div>
    <div class="greet"><small>${esc(greeting())}</small><b>${esc(S.account.name || 'there')}</b></div>
    <button class="iconbtn" data-act="open-add-menu" title="Add tracking">${ICON.plus}</button>
  </div>
  <div class="nw-wrap">
    <div class="label">Net worth</div>
    <div class="nw muted">${esc(money(0))}</div>
    <div class="lead">Nothing here yet.</div>
  </div>
  ${emptyNext()}`;
}
/* The agent as the other way to start, wherever the user is choosing how to begin: under a
   rule, a subtitle and an outlined button with the agent's icon. Visible enough to be a real
   choice, never a second filled button (design-system §2.1 rule 10). */
const agentAlt = entry => `<div class="alt-route">
    <p class="alt-title">Let your AI agent do this</p>
    <p class="alt-sub">Works with Claude and ChatGPT.</p>
    <button class="btn sec btn-icon" data-act="connect-start" data-v="${entry}">${ICON.agent}Connect to agent</button>
  </div>`;
function emptyNext() {
  const conn = activeConns()[0], cl = conn && clientByName(conn.client);
  if (!cl) return `<div class="empty-next">
    <button class="btn" data-act="basics-start">Add what you have</button>
    ${agentAlt('home')}
  </div>`;
  const c = cl[1];
  return `<div class="empty-next">
    <p class="empty-hint">${esc(c.name)} is connected. Ask it to set things up:</p>
    <div class="urlbox prompt"><span class="grow">${esc(START_PROMPT)}</span>
      ${c.deepLink ? `<button class="btn ghost sm auto" data-act="copy-prompt" data-v="${esc(START_PROMPT)}">Copy</button>` : ''}</div>
    ${c.deepLink
      ? `<a class="btn" href="${esc(c.deepLink + encodeURIComponent(START_PROMPT))}" target="_blank" rel="noopener">Let ${esc(c.name)} do it</a>`
      : `<button class="btn" data-act="copy-prompt" data-v="${esc(START_PROMPT)}">Copy the prompt</button>`}
    <button class="link" data-act="basics-start">Or add it yourself ›</button>
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

/* ‹ period › — a pager says what it is paging (design-system §6.1 rule 6). */
function pager(act, ps, view, noEarlier, noLater, lead) {
  return `<div class="chartnav${lead ? ' lead' : ''}">
    <button data-act="${act}" data-v="1" ${noEarlier ? 'aria-disabled="true"' : ''} aria-label="Earlier periods">‹</button>
    <span class="span">${esc(windowLabel(ps, view))}</span>
    <button data-act="${act}" data-v="-1" ${noLater ? 'aria-disabled="true"' : ''} aria-label="Later periods">›</button>
  </div>`;
}

/* ================= HOLDING DETAIL (J3, J4) ================= */
function renderHolding(id) {
  const h = holdingOf(id);
  if (!h) { location.hash = '#/home'; return; }
  const c = changeFor(h), tp = typeOf(h.typeId);
  const card = S.detailCard || 0;
  const view = S.detailView || 'monthly';
  const page = S.detailPage || 0;

  const months = rangeMonths(S.settings.detailRange != null ? S.settings.detailRange : 0);
  const hist = h.values.slice();
  const pts = (months ? hist.filter(x => x.date >= addMonths(TODAY, -months)) : hist)
    .map(x => ({ x:x.date, y:Math.abs(x.base) }));

  const pers = periodsFor(view, [h], 5 + page * 5).slice(page * 5, page * 5 + 5).reverse();
  const noEarlier = periodsFor(view, [h], 5 + (page + 1) * 5).length <= (page + 1) * 5;

  /* Each value: date, amount, one change figure. Opening it adds only what the row does
     not already say — the original-currency amount, who added it and when — and the actions. */
  const foreign = h.ccy !== S.settings.defaultCcy;
  const history = hist.slice().reverse().map((x, i, arr) => {
    const prev = arr[i + 1];
    const d = prev ? Math.abs(x.base) - Math.abs(prev.base) : 0;
    const open = S.expanded === x.id;
    const orig = x.ccy !== S.settings.defaultCcy;
    return `<button class="row ${x.source === 'agent' ? 'by-agent' : ''} ${open ? 'open' : ''}" data-act="expand-value" data-v="${x.id}" aria-expanded="${open}">
      <span class="grow"><span class="name">${esc(fmtDate(x.date))}</span></span>
      <span class="amt"><b class="num">${esc(money(Math.abs(x.base), null, { cents:'auto' }))}</b>
        ${prev && d ? `<span class="chg num ${cls(d)}">${esc(compactSigned(d))}</span>` : ''}</span>
    </button>
    ${open ? `<div class="vx">
      ${orig ? `<div class="kv"><span>In ${esc(x.ccy)}</span><b class="num">${esc(
        x.amount.toLocaleString(LOC(), { minimumFractionDigits:0, maximumFractionDigits:2 }))}</b></div>` : ''}
      <div class="vx-foot"><span class="grow">Added ${esc(since(x.enteredAt))}${x.source === 'agent' ? ' by ' + esc(x.client || 'your agent') : ''}</span>
        <button class="link-sm" data-act="edit-value" data-h="${h.id}" data-v="${x.id}">Edit</button>
        <button class="link-sm danger" data-act="delete-value" data-h="${h.id}" data-v="${x.id}">Delete</button></div>
    </div>` : ''}`;
  }).join('');

  $('#s-holding').innerHTML = `
  <div class="topbar">
    <button class="iconbtn" data-go="#/home" title="Close">${ICON.close}</button>
    <span style="flex:1"></span>
    <button class="iconbtn" data-act="holding-menu" data-h="${h.id}">${ICON.dots}</button>
  </div>
  <div class="nw-wrap">
    <div class="label">${[tp.name, h.kind === 'liability' ? 'Liability' : '', foreign ? h.ccy : '']
      .filter(Boolean).map(esc).join(' · ')}</div>
    <h1 class="h-name">${esc(h.name)}</h1>
    <div class="nw h-nw">${h.kind === 'liability' ? '−' : ''}${esc(money(Math.abs(c.now), null, { cents:'auto' }))}</div>
    ${hist.length > 1 ? changeLine(c.abs, c.pct) : ''}
    ${h.kind === 'asset' ? `<div class="conseq">${consequence(h.access, (reasonFor(h) || {}).reason, null)}
      <span class="conseq-acts">
        <button class="link-sm" data-act="open-access" data-h="${h.id}">${h.access === 'unset' ? 'Decide' : 'Change'}</button>
        ${h.access === 'unset' ? `<button class="link-sm" data-act="ask-agent" data-h="${h.id}">Ask your agent</button>` : ''}
      </span></div>` : ''}
  </div>

  ${hist.length > 1 ? `<div class="carousel" id="detail-carousel">
    <div class="slide"><div class="card">
      ${lineChart([{ points:pts, colour:'var(--brand)', fill:true }], { px:160 })}
      <div class="rangebar">${HOME_RANGES.map(([l, val]) =>
        `<button data-act="set-detail-range" data-v="${val}" class="${(S.settings.detailRange||0) === val ? 'on' : ''}">${l}</button>`).join('')}</div>
    </div></div>
    <div class="slide"><div class="card">
      ${pager('detail-page', pers, view, noEarlier, page === 0, true)}
      ${growthBars(pers, { px:175 })}
      <div class="seg sm" style="max-width:240px;margin:12px auto 0">
        ${['monthly','quarterly','yearly'].map(x => `<button data-act="detail-view" data-v="${x}" class="${view === x ? 'on' : ''}">${x[0].toUpperCase() + x.slice(1)}</button>`).join('')}
      </div>
    </div></div>
  </div>
  <div class="dots">${[0,1].map(i => `<i class="${card === i ? 'on' : ''}"></i>`).join('')}</div>` : ''}

  <div class="section-h" style="margin-top:18px"><h2>History · ${hist.length}</h2></div>
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
  const periods = all.slice(0, Math.max(1, take));
  const oldestFirst = periods.slice().reverse();
  const comparable = periods.filter(p => p.abs != null);
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

  ${exclusionCount() ? `<div class="note" style="margin-top:12px"><b>Hidden here:</b> ${esc(exclusionSummary())}.
    Your net worth on Home is unchanged. <button class="btn ghost sm auto" data-act="clear-exclusions">Clear</button></div>` : ''}
  ${insightsFiltered() ? `<div class="note" style="margin-top:12px"><b>Filtered.</b> Every figure below covers the filtered set only.</div>` : ''}

  ${comparable.length ? `<p class="summary">Averaging <b class="num ${cls(avgAbs)}">${esc(compactSigned(avgAbs))}</b>
    (${esc(pct(avgPct))}) a ${esc(VIEW_NOUN[view].toLowerCase())}
    over the last ${comparable.length} ${esc(comparable.length === 1 ? VIEW_NOUN[view].toLowerCase() : VIEW_PLURAL[view])}.</p>` : ''}

  ${noHistory ? `<div class="card" style="margin-top:14px">
      <h3>Not enough history yet</h3>
      <p class="muted" style="margin:8px 0 0;font-size:14px">A ${esc(VIEW_NOUN[view].toLowerCase())}-on-${esc(VIEW_NOUN[view].toLowerCase())}
        comparison needs two ${esc(VIEW_PLURAL[view])} of values. The first one appears next ${esc(VIEW_NOUN[view].toLowerCase())}.</p></div>` : `

  <div class="grid" style="margin-top:14px">
    <div class="g6"><div class="card">
      <div class="chart-h"><h3>${esc(VIEW_ADJ[view])} growth</h3>
        ${pager('insights-page', windowed, view, (page+1)*5 >= oldestFirst.length, page === 0)}</div>
      <div style="margin-top:10px">${growthBars(windowed, { px:180 })}</div>
    </div></div>

    <div class="g6"><div class="card">
      <div class="chart-h"><h3>Assets vs. liabilities</h3></div>
      <div style="margin-top:12px">${lineChart([
        { points:oldestFirst.map(p => ({ x:p.end, y:p.assets })), colour:'var(--gain)', fill:true },
        { points:oldestFirst.map(p => ({ x:p.end, y:p.liabilities })), colour:'var(--loss)', fill:true },
        { points:oldestFirst.map(p => ({ x:p.end, y:p.value })), colour:'var(--ink-3)' }
      ], { px:180, includeZero:true })}</div>
      <div class="legend"><div><i style="background:var(--gain)"></i>Assets</div>
        <div><i style="background:#7d8794"></i>Net worth</div>
        <div><i style="background:var(--loss)"></i>Liabilities</div></div>
    </div></div>

    <div class="g12"><div class="card">
      <div class="chart-h"><h3>Distribution</h3>
        ${pager('insights-page', windowed, view, (page+1)*5 >= oldestFirst.length, page === 0)}</div>
      <div class="legend" style="margin:8px 0 4px">${distTypes.map(s => `<div><i style="background:${s.colour}"></i>${esc(s.name)}</div>`).join('')}</div>
      ${stackedBars(dist, { px:190 })}
    </div></div>
  </div>`}

  <div class="section-h"><h2>${esc(VIEW_NOUN[view])} by ${esc(VIEW_NOUN[view].toLowerCase())}</h2></div>
  <div class="card flush">${periods.map(p => `
    <button class="row" data-go="#/period/${view}/${p.i}">
      <span class="grow"><span class="name">${esc(p.label)}${p.current ? ' <span class="chip">so far</span>' : ''}</span></span>
      <span class="amt"><b class="num ${p.abs == null ? 'muted' : cls(p.abs)}">${p.abs == null ? '—' : esc(compactSigned(p.abs))}</b>
        ${p.pct == null ? '' : `<span class="chg num ${cls(p.abs)}">${esc(pct(p.pct))}</span>`}</span>
      <span class="chev">›</span></button>`).join('')}</div>`;
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
    <div class="nw num">${esc(money(p.value))}</div>
    <div class="nw-chg num ${p.abs == null ? 'muted' : cls(p.abs)}">
      ${p.abs == null ? 'No earlier period to compare with'
        : esc(money(p.abs, null, { signed:true })) + ' · ' + esc(pct(p.pct))}</div>
    ${p.current ? `<div class="muted" style="font-size:12.5px;margin-top:8px">${esc(fmtDate(p.start))} – today</div>` : ''}
  </div>
  <div class="section-h"><h2>What drove it</h2></div>
  <div class="card flush">${cs.map(c => `
    <button class="row" data-go="#/holding/${c.h.id}">
      <span class="dot" style="background:${typeColour(c.h.typeId)}"></span>
      <span class="grow"><span class="name">${esc(c.h.name)}${c.carried ? ' <span class="chip carried">carried</span>' : ''}</span>
        <span class="sub">${esc(typeOf(c.h.typeId).name)}</span></span>
      <span class="amt"><b class="num ${cls(c.delta)}">${esc(money(c.delta, null, { signed:true }))}</b></span>
      <span class="chev">›</span></button>`).join('') || '<div class="empty"><p class="muted">Nothing moved in this period.</p></div>'}</div>
  ${cs.some(c => c.carried) ? `<div class="note"><b>Carried:</b> nothing was recorded in this period, so the
    last value before it was used.</div>` : ''}`;
}

/* ================= AGENT (J5) ================= */
function renderAgent() {
  const conns = activeConns();
  const unconnected = Object.entries(CLIENTS).filter(([, c]) => !conns.some(x => x.client === c.name));
  $('#s-agent').innerHTML = `
  <div class="topbar"><h1>Your agent</h1></div>
  <div class="grid">
    <div class="g7">
      ${conns.map(c => `<div class="card">
        <div style="display:flex;align-items:center;gap:9px">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--gain);display:block"></span>
          <h3 style="flex:1">${esc(c.client)}</h3></div>
        <div class="muted" style="font-size:12.5px;margin:4px 0 0 18px">Connected ${esc(fmtDate(c.connectedAt.slice(0, 10)))}
          · last used ${esc(since(c.lastCall))}</div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <button class="btn sm" data-go="#/agent/chat">Try it</button>
          <button class="btn sec sm" data-act="revoke" data-v="${c.id}" style="color:var(--loss)">Revoke</button></div>
      </div>`).join('')}
      ${unconnected.length ? `<div class="section-h"><h2>${conns.length ? 'Connect another' : 'Connect your agent'}</h2></div>
      <div class="card flush">${unconnected.map(([id, c]) => `<button class="row" data-act="connect-start" data-v="agent" data-client="${id}">
        <span class="grow"><span class="name">Connect ${esc(c.name)}</span></span><span class="chev">›</span></button>`).join('')}</div>` : ''}
    </div>
    <div class="g5">
      <div class="section-h"><h2>What it can do</h2></div>
      <p class="summary" style="margin-top:0">Anything you can do here — and you can undo anything it changes.
        Your statements stay with your agent; NetNet only receives the numbers.</p>
      <div class="list-foot" style="justify-content:flex-start"><button class="link" data-go="#/activity">Activity log ›</button></div>
    </div>
  </div>`;
}

/* ================= CONNECT AN AGENT (J5) =================
   One flow, reached from onboarding, the empty Home, a holding and the Agent tab:
   which agent → verify your email (email sign-ups only) → setup steps for this
   platform, with screenshots → NetNet's approval page → done. There is no "I've done
   it" button: NetNet sees the approval and moves on by itself. The prototype has no
   server, so the two outside events (opening the verification link, the agent opening
   NetNet's approval page) are simulated by clearly marked prototype buttons. */
const activeConns = () => (S.account.connections || []).filter(c => c.active);
const clientByName = n => Object.entries(CLIENTS).find(([, c]) => c.name === n) || null;
const md = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
const isPhone = () => { try { return matchMedia('(pointer:coarse)').matches && innerWidth < 900; } catch (e) { return false; } };
function connectBack() {
  if (!S.account.onboarded) return '#/welcome/start';
  return S.connectEntry === 'agent' ? '#/agent' : '#/home';
}
function renderConnect(id, step) {
  /* back to the choice of agent if that is where they came from, else to where they started */
  const back = `<button class="back" data-go="${id && S.connectEntry !== 'agent' ? '#/connect' : connectBack()}">‹ Back</button>`;
  const instead = !S.account.onboarded
    ? `<button class="link auth-alt" data-act="ob-start">Or answer a few questions instead ›</button>` : '';
  const c = CLIENTS[id];
  if (!c) {
    authShell(`${back}
      <h1>Which AI agent do you use?</h1>
      <div class="choice col">${Object.entries(CLIENTS).map(([cid, x]) =>
        `<button data-act="connect-client" data-v="${cid}">${esc(x.name)}</button>`).join('')}</div>
      ${instead}`);
    return;
  }
  if (!S.account.verified) {
    authShell(`${back}
      <h1>Verify your email first</h1>
      <p class="auth-sub">We sent a link to ${esc(S.account.email)}. Open it on any device, and this page
        moves on by itself.</p>
      ${S.account.verifyResent ? `<div class="hint">Sent again.</div>`
        : `<button class="link-sm" data-act="resend-verify">Resend the link</button>`}
      <button class="proto-mock" data-act="mock-verify">Prototype: simulate opening the link</button>
      ${instead}`);
    return;
  }
  if (step === 'allow') {
    authShell(`
      <h1>${esc(c.name)} wants to connect to your NetNet</h1>
      <p class="auth-sub">Signed in as ${esc(S.account.email)}</p>
      <p class="consent">It will be able to see your holdings and their history, and add or update them.
        Every change it makes is logged, and you can undo it.</p>
      <button class="btn" data-act="connect-allow" data-v="${id}">Allow</button>
      <button class="link-sm consent-cancel" data-act="connect-cancel" data-v="${id}">Cancel</button>`);
    return;
  }
  const plat = S.connectPlatform || (isPhone() ? 'phone' : 'computer');
  authShell(`${back}
    <h1>Connect ${esc(c.name)}</h1>
    ${S.connectNotice ? `<p class="auth-sub">${esc(S.connectNotice)}</p>` : ''}
    <div class="seg sm plat">${[['phone', 'On a phone'], ['computer', 'On a computer']].map(([k, l]) =>
      `<button data-act="set-platform" data-v="${k}" class="${plat === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <ol class="steps guide-steps">${c.guides[plat].map((st, i) => `<li>${md(st.text)}
      ${st.url ? `<div class="urlbox"><span class="mono">${MCP_URL}</span>
        <button class="btn ghost sm auto" data-act="copy-url">Copy</button></div>` : ''}
      <figure class="shot"><img src="connect/${id}-${plat}-${i + 1}.png" alt="" loading="lazy"
        onerror="this.parentNode.classList.add('missing')"><figcaption>Screenshot · connect/${id}-${plat}-${i + 1}.png</figcaption></figure>
    </li>`).join('')}</ol>
    <p class="waiting">Waiting for ${esc(c.name)}. This page moves on by itself once you press Allow.</p>
    <button class="proto-mock" data-go="#/connect/${id}/allow">Prototype: simulate ${esc(c.name)} opening NetNet’s approval page</button>
    ${instead}`);
}
function startConnect(entry, id) {
  S.connectEntry = entry; S.connectNotice = null;
  if (id) fire('agent_connection_started', { client:CLIENTS[id].name, entry });
  save(); location.hash = id ? '#/connect/' + id : '#/connect';
}

/* ================= AGENT DEMO (J6, J8) ================= */
const SCRIPT = [
  { who:'user', text:"Here's my IBKR statement for September — update NetNet." },
  { who:'tool', text:'<b>netnet.find_holding</b> { query: "IBKR" }<br>→ 1 likely match: “IBKR” (USD, Investments) · last value 21 Sep' },
  { who:'ai',   text:"Found your existing IBKR holding, so I'll update that rather than create a second one. The statement closes at USD {{IBKRNEW}}." },
  { who:'tool', text:'<b>netnet.record_value</b> { holding_id: "h-ibkr", amount: {{IBKRNEW}}, currency: "USD", as_of: "2026-09-23" }<br>→ ok', write:true },
  { who:'ai',   text:'Done — IBKR is updated. Your net worth is now <b>{{NW}}</b>.' },
  { who:'user', text:"Can I afford a $120k car?" },
  { who:'tool', text:'<b>netnet.get_position_summary</b> { include: ["accessibility","staleness","currency_exposure"] }<br>→ one call, no follow-ups needed' },
  { who:'ai',   text:"Yes — comfortably, but the useful part isn't the yes.<br><br>You're worth <b>{{NW}}</b>, and <b>{{ACC}}</b> of that is money you could use this month. The rest — {{REST}} — is locked or would have to be sold first, so it isn't money you can put toward a car. A $120k purchase is about <b>{{MULT}}×</b> covered by what you can actually reach.<br><br>Two things the numbers themselves flag: most of your usable money is a single brokerage position, so you'd be selling equities to buy a depreciating asset; and your current car was last valued <b>{{CARSTALE}}</b>, so any trade-in figure in this is guesswork." }
];
/* A statement update nudges the position; it does not halve it. Deriving the
   demo's written value from the holding's own latest value keeps the trend
   plausible however the seed data drifts. */
function demoIbkrAmount() {
  const h = holdingOf('h-ibkr'), v = h && latest(h);
  const base = v ? (v.turn === 'turn-demo' ? v.amount / 1.021 : v.amount) : 600000;
  return Math.round(base * 1.021 / 100) * 100;
}
function renderChat() {
  const step = S.chatStep || 0;
  const t = totals(S.holdings.filter(h => !h.archived));
  const car = holdingOf('h-car');
  const rest = [...new Set(S.holdings.filter(h => !h.archived && h.kind === 'asset' && h.access !== 'accessible')
    .map(h => typeOf(h.typeId).name))].join(', ');
  const fill = s => s.replace(/\{\{IBKRNEW\}\}/g, demoIbkrAmount().toLocaleString(LOC()))
    .replace(/\{\{REST\}\}/g, esc(rest || 'nothing else'))
    .replace(/\{\{NW\}\}/g, money(t.now)).replace(/\{\{ACC\}\}/g, money(t.accessible))
    .replace(/\{\{MULT\}\}/g, (t.accessible / 120000).toFixed(1))
    .replace(/\{\{CARSTALE\}\}/g, car && latest(car) ? ago(latest(car).date) : 'a while ago');
  $('#s-chat').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/agent">‹ Your agent</button>
    <h1 style="font-size:16px">Claude · NetNet connected</h1></div>
  <div class="note agent">A replay. In the product this happens inside Claude or ChatGPT.</div>
  <div class="chat">${SCRIPT.slice(0, step).map(m =>
    `<div class="msg ${m.who}">${fill(m.text)}</div>`).join('') || '<div class="muted" style="padding:8px 2px">Press Play to walk through it.</div>'}</div>
  <div class="btn-row" style="max-width:420px">
    ${step < SCRIPT.length ? `<button class="btn" data-act="chat-next">${step ? 'Continue' : 'Play'}</button>` : ''}
    ${step ? '<button class="btn sec" data-act="chat-reset">Replay</button>' : ''}
  </div>
  ${step >= 5 ? `<div class="note">The update is on Home now, and you can undo it.
    <button class="btn ghost sm auto" data-go="#/activity">Activity log</button></div>` : ''}`;
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
      head = `<div class="turn-h">
        <span>${esc(e.client)} · ${turns[e.turn].length} changes at once</span>
        <button class="btn ghost sm auto" data-act="undo-turn" data-v="${esc(e.turn)}">Undo all</button></div>`;
    }
    return head + `<div class="row ${e.source === 'agent' && !e.undone ? 'by-agent' : ''}" style="${e.undone ? 'opacity:.45' : ''}">
      <span class="grow"><span class="name">${esc(describeLog(e, h))}
        ${e.undone ? '<span class="chip">undone</span>' : ''}</span>
        <span class="sub">${e.source === 'agent' ? esc(e.client) : 'You'} · ${esc(fmtDT(e.at))}</span></span>
      ${!e.undone && e.kind !== 'holding.create' ? `<button class="btn ghost sm auto" data-act="undo" data-v="${e.id}">Undo</button>` : ''}
    </div>`;
  }).join('');
  $('#s-activity').innerHTML = `
  <div class="topbar"><button class="back" data-go="#/home">‹ Home</button><h1 style="font-size:19px">Activity</h1></div>
  <div class="card flush">${html}</div>`;
}
function describeLog(e, h) {
  const n = h ? h.name : 'a holding';
  /* "USD 587,580" for a foreign amount — a bare "$" would read as the default currency */
  const amt = x => x.ccy !== S.settings.defaultCcy
    ? x.ccy + ' ' + x.amount.toLocaleString(LOC(), { maximumFractionDigits:2 })
    : money(x.amount, x.ccy, { cents:'auto' });
  const asOf = x => x.date && x.date !== (e.at || '').slice(0, 10)
    ? ' · for ' + (x.date.slice(0, 4) === (e.at || '').slice(0, 4)
      ? new Date(x.date + 'T00:00:00Z').toLocaleDateString(LOC(), { day:'numeric', month:'short', timeZone:'UTC' })
      : fmtDate(x.date)) : '';
  switch (e.kind) {
    case 'holding.create': return 'Added ' + n;
    case 'holding.archive': return 'Archived ' + n;
    case 'holding.unarchive': return 'Unarchived ' + n;
    case 'holding.delete': return 'Deleted ' + n;
    case 'holding.edit': return 'Edited ' + n;
    case 'value.create': return n + ' → ' + amt(e.after) + asOf(e.after);
    case 'value.edit': return n + ': ' + amt(e.before) + ' → ' + amt(e.after);
    case 'value.delete': return n + ': removed ' + amt(e.before);
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
        ${[['general','General', [(regionOf(S.account.region) || {}).name, S.settings.defaultCcy].filter(Boolean).join(' · ')],
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
          <span class="name" style="font-weight:550;color:var(--loss)">Delete account</span>
          <span class="sub">Erases all your data</span></span><span class="chev">›</span></button>
      </div>
      <div class="note">NetNet never sells your data or sees your documents.</div>
      <div class="card flush"><button class="row" data-act="logout"><span class="grow"><span class="name">Log out</span></span></button></div>
    </div>
  </div>`;
}

function renderSub(name) {
  const B = t => `<div class="topbar"><button class="back" data-go="#/account">‹ Account</button>
    <h1 style="font-size:19px">${esc(t)}</h1></div>`;
  let html = '';
  if (name === 'general') {
    html = B('General') + `<div class="card">
      <div class="field"><label>Where you live</label>
        <select data-act="set-region">${regionOf(S.account.region) ? '' : '<option value="" selected>Not set</option>'}${REGIONS.map(r =>
          `<option value="${r.code}" ${r.code === S.account.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
        <div class="hint">Sets local names and suggestions. You can still track anything.</div></div>
      <div class="field"><label>Default Currency</label>
        <select data-act="set-ccy">${ccyOptions(S.settings.defaultCcy)}</select>
        <div class="hint">Everything is totalled in this currency.</div></div></div>`;
  } else if (name === 'view') {
    html = B('View Settings') + `
      <div class="section-h"><h2>Graphs</h2></div>
      <div class="card flush">
        <label class="switch"><span class="grow"><b>Show zero bounds</b>
          <div class="sub">Axis labels and gridlines on trend charts</div></span>
          <input type="checkbox" data-act="toggle-setting" data-v="showZeroBounds" ${S.settings.showZeroBounds ? 'checked' : ''}></label>
      </div>
      <div class="section-h"><h2>Holdings</h2></div>
      <div class="card flush">
        <label class="switch"><span class="grow"><b>Show default currency value</b>
          <div class="sub">Show holdings in your default currency rather than their own</div></span>
          <input type="checkbox" data-act="toggle-setting" data-v="showDefaultCcy" ${S.settings.showDefaultCcy ? 'checked' : ''}></label>
      </div>
      `;
  } else if (name === 'types' || name === 'tags') {
    const isT = name === 'types';
    const items = isT ? S.types.map(t => ({ id:t.id, name:typeName(t), colour:typeColour(t.id) }))
                      : S.tags.map(t => ({ id:t, name:t, colour:'var(--ink-3)' }));
    html = B(isT ? 'Manage Types' : 'Manage Tags') + `
      <div class="card flush">
        <button class="row" data-act="${isT ? 'new-type' : 'new-tag'}">
          <span class="grow"><span class="name" style="color:var(--brand-text)">+ Add New ${isT ? 'Type' : 'Tag'}</span></span></button>
        ${items.map(t => {
          const used = S.holdings.filter(h => isT ? h.typeId === t.id : h.tags.includes(t.name)).length;
          return `<button class="row" data-act="edit-${isT ? 'type' : 'tag'}" data-v="${esc(t.id)}">
            ${isT ? `<span class="dot" style="background:${t.colour}"></span>` : ''}
            <span class="grow"><span class="name" style="font-weight:550">${esc(t.name)}</span>
              <span class="sub">${used} holding${used === 1 ? '' : 's'}</span></span><span class="chev">›</span></button>`;
        }).join('')}
      </div>
`;
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
      <div class="note">Reminders never contain amounts.</div>`;
  } else if (name === 'export') {
    html = B('Export') + `<div class="card">
      <h3>Everything, in one file</h3>
      <p class="muted" style="margin:8px 0 14px;font-size:14px">Every holding and its full history, including
        original currencies and the rates used.</p>
      <button class="btn" data-act="export">Download JSON</button>
      <button class="btn ghost sm" data-act="export-csv">Download CSV instead</button></div>`;
  } else if (name === 'delete') {
    html = B('Delete account') + `<div class="card">
      <h3 style="color:var(--loss)">This erases everything</h3>
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
      <div class="note">Archived holdings keep their history but leave every total.</div>
      <div class="card flush">${arch.map(h => `<div class="row">
        <span class="grow"><span class="name">${esc(h.name)}</span>
          <span class="sub">${esc(typeOf(h.typeId).name)} · ${esc(ago(latest(h).date))}</span></span>
        <button class="btn ghost sm auto" data-act="unarchive" data-v="${h.id}">Unarchive</button></div>`).join('')
        || '<div class="empty"><p class="muted">Nothing archived.</p></div>'}</div>`;
  }
  $('#s-sub').innerHTML = html;
}

/* ================= ADD / EDIT HOLDING (J2) ================= */
const sideOf = u => (UNIVERSAL_TYPES.find(x => x.id === u) || { side:'any' }).side;
const typesFor = k => S.types.filter(t => { const s = sideOf(t.universal); return s === 'any' || s === k; });
/* The starting answer for a type: its default if the pack has one, else
   nothing yet — the question is shown and saving without an answer is fine. */
const startingBasis = typeId => accessRule(universalOf(typeId)).fixed ? { q:'default' } : null;

function renderAdd(kind, presetType, editId) {
  const h = editId ? holdingOf(editId) : null;
  const k = h ? h.kind : (kind || 'asset');
  const tags = S.tags.length ? S.tags : SEED_TAGS;
  S.formTags = h ? h.tags.slice() : (S.formTags || []);
  const choices = typesFor(k);
  const typeId = h ? h.typeId : (choices.find(t => t.id === presetType) || choices[0]).id;
  S.form = { typeId, basis: h ? (h.accessBasis || { q:'unset' }) : startingBasis(typeId), changing:false,
             editId: h ? h.id : null,
             via:'form' };
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
    <div class="field"><label>${k === 'asset' ? 'Asset' : 'Liability'} Name</label>
      <input id="f-name" value="${esc(h ? h.name : '')}" placeholder="${esc(typeExample(typeId))}"></div>
    <div class="field"><label>Type</label>
      <select id="f-type" data-act="form-type">${choices.map(t => `<option value="${t.id}" ${
        typeId === t.id ? 'selected' : ''}>${esc(typeName(t))}</option>`).join('')}</select></div>
    ${k === 'asset' ? '<div class="field" id="f-access"></div>' : ''}
    ${!h ? `<div class="two">
      <div class="field"><label>Currency</label>
        <select id="f-ccy" data-act="form-amount">${ccyOptions(S.settings.defaultCcy)}</select></div>
      <div class="field"><label>${k === 'asset' ? 'Asset' : 'Liability'} Value</label>
        <input id="f-amount" type="number" inputmode="decimal" placeholder="0"></div></div>
    <div class="field"><label>As of</label><input id="f-date" type="date" value="${TODAY}" max="${TODAY}"></div>` : ''}
    <div class="field"><label>Tags</label><div class="tagpick" id="f-tags">
      ${tags.map(t => `<button type="button" data-act="toggle-formtag" data-v="${esc(t)}"
        class="${S.formTags.includes(t) ? 'on' : ''}">${esc(t)}</button>`).join('')}</div></div>
    <p class="privacy">Never enter passwords or account numbers. NetNet doesn't need them.</p>
  </div>`;
  paintAccess(h);
}

/* The accessibility block. A fact question only when the type is genuinely
   ambiguous (or the user asks to change it); otherwise the default and its
   reason, stated once, with the consequence in money. */
function paintAccess(h) {
  const el = $('#f-access');
  if (!el || !S.form) return;
  h = h || (S.form.editId && holdingOf(S.form.editId));
  const f = S.form, u = universalOf(f.typeId), rule = accessRule(u);
  const showQ = f.changing ? (rule.question ? rule.q : 'other') : (!f.basis && rule.question ? rule.q : null);
  const access = f.basis ? accessFromBasis(f.basis, u) : null;

  /* What "the $X you could use" would be once this is saved. */
  let own = 0;
  if (h) { const v = latest(h); own = v ? v.base : 0; }
  else {
    const amt = parseFloat(($('#f-amount') || {}).value) || 0;
    own = Math.round(amt * rateFor(($('#f-ccy') || {}).value || S.settings.defaultCcy, TODAY, S.settings.defaultCcy));
  }
  const others = usableNow() - (h && h.access === 'accessible' && !h.archived ? own : 0);
  const usable = others + (access === 'accessible' ? own : 0);

  let html = '';
  if (showQ) {
    const qu = questionFor(showQ);
    const on = (q, a) => f.basis && f.basis.q === q && (a == null || f.basis.a === a) ? 'on' : '';
    html += `<label>${esc(qu.ask)}</label>
      <div class="choice">${qu.answers.map(a =>
        `<button type="button" data-act="form-answer" data-q="${esc(showQ)}" data-a="${esc(a.id)}" class="${on(showQ, a.id)}">${esc(a.label)}</button>`).join('')}
        <button type="button" data-act="form-answer" data-q="unset" class="${on('unset')}">Not sure</button></div>
      ${f.changing && rule.fixed ? `<button type="button" class="link-sm" data-act="form-answer" data-q="default">Keep the usual</button>` : ''}`;
  }
  if (f.basis) {
    const r = f.basis.q === 'default' ? rule.fixed : answerFor(f.basis);
    html += `<div class="conseq">${consequence(access, r && r.reason, usable)}
      ${!showQ ? '<button type="button" class="link-sm" data-act="form-change">Change</button>' : ''}</div>`;
    if (access === 'unset') html += `<div class="hint">Saving is fine as it is. Your agent can help you decide later.</div>`;
  }
  el.innerHTML = html;
}


/* ================= mutations ================= */
function logIt(e) { S.log.unshift(Object.assign({ id:uid('lg'), at:new Date().toISOString(), undone:false }, e)); }
function recomputeBase(v) { v.rate = rateFor(v.ccy, v.date, S.settings.defaultCcy); v.rateDate = v.date; v.base = Math.round(v.amount * v.rate); }

function saveHolding(kind, editId) {
  const name = ($('#f-name').value || '').trim();
  const typeId = $('#f-type').value;
  if (!name) { alert('Give it a name.'); return; }
  const u = universalOf(typeId);
  /* Accessibility never blocks saving: no answer is recorded as undecided. */
  const basis = (editId ? holdingOf(editId).kind : kind) === 'liability' ? null : (S.form.basis || { q:'unset' });
  if (editId) {
    const h = holdingOf(editId);
    const before = { name:h.name, typeId:h.typeId, tags:h.tags.slice(), access:h.access, accessBasis:h.accessBasis };
    h.name = name; h.typeId = typeId; h.tags = (S.formTags || []).slice();
    if (h.kind === 'asset') { h.accessBasis = basis; h.access = accessFromBasis(basis, u); }
    logIt({ kind:'holding.edit', holdingId:h.id, source:'web', client:null, turn:null,
            before, after:{ name:h.name, typeId:h.typeId, tags:h.tags.slice(), access:h.access, accessBasis:h.accessBasis } });
    S.formTags = []; save(); location.hash = '#/holding/' + h.id; return;
  }
  const amount = parseFloat($('#f-amount').value);
  if (!(amount >= 0)) { alert('Enter a value.'); return; }
  createHolding({ name, kind, typeId, tags:(S.formTags || []).slice(), ccy:$('#f-ccy').value,
    amount, date:$('#f-date').value || TODAY, basis, via:S.form.via || 'form' });
  (S.formTags || []).forEach(t => { if (!S.tags.includes(t)) S.tags.push(t); });
  /* Back to Home, where the new holding is listed under the total (J1). */
  S.formTags = []; save(); location.hash = '#/home';
}

function createHolding(o) {
  const u = universalOf(o.typeId);
  const h = { id:uid('h'), name:o.name, kind:o.kind, typeId:o.typeId, tags:o.tags || [], ccy:o.ccy,
    access: o.kind === 'liability' ? 'n/a' : accessFromBasis(o.basis, u),
    accessBasis: o.kind === 'liability' ? null : o.basis,
    cadenceDays:30, archived:false, values:[] };
  const v = { id:uid('v'), date:o.date, amount:o.amount, ccy:o.ccy, source:'web',
    client:null, turn:null, enteredAt:new Date().toISOString() };
  recomputeBase(v); h.values.push(v);
  S.holdings.push(h);
  logIt({ kind:'holding.create', holdingId:h.id, source:'web', client:null, turn:null, before:null, after:{ name:h.name } });
  logIt({ kind:'value.create', holdingId:h.id, valueId:v.id, source:'web', client:null, turn:null,
          before:null, after:{ amount:v.amount, ccy:v.ccy, date:v.date } });
  fire('holding_created', { source:'web', via:o.via || 'form' });
  fire('value_recorded', { source:'web' });
  return h;
}

function setAccess(h, basis) {
  const before = { access:h.access, accessBasis:h.accessBasis };
  h.accessBasis = basis; h.access = accessFromBasis(basis, universalOf(h.typeId));
  logIt({ kind:'holding.edit', holdingId:h.id, source:'web', client:null, turn:null,
          before, after:{ access:h.access, accessBasis:h.accessBasis } });
}

function saveValue(hid, vid) {
  const h = holdingOf(hid);
  const amount = parseFloat($('#v-amount').value);
  if (!(amount >= 0)) { alert('Enter an amount.'); return; }
  const date = $('#v-date').value || TODAY;
  const ccy = $('#v-ccy').value;
  if (vid) {
    const v = h.values.find(x => x.id === vid);
    const before = { amount:v.amount, ccy:v.ccy, date:v.date };
    const wasAgent = v.source === 'agent';
    const age = daysBetween(v.date, TODAY);
    Object.assign(v, { amount, ccy, date });
    recomputeBase(v);
    h.values.sort((a, b) => a.date.localeCompare(b.date));
    logIt({ kind:'value.edit', holdingId:h.id, valueId:v.id, source:'web', client:null, turn:null,
            originalSource: wasAgent ? 'agent' : 'web', before, after:{ amount, ccy, date } });
    fire('value_corrected', { original_source: wasAgent ? 'agent' : 'web', age_at_correction:age });
  } else {
    const clash = h.values.find(x => x.date === date);
    if (clash && !confirm('There is already a value on ' + fmtDate(date) +
        '. The newer entry wins and the older one stays in your history. Continue?')) return;
    const v = { id:uid('v'), date, amount, ccy, source:'web', client:null, turn:null,
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
    h.values.push(Object.assign({ id:e.valueId, source:'web', 
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
    <button class="opt" data-go="#/add/asset"><span class="grow" style="color:var(--gain)">+ New Asset</span></button>
    <button class="opt" data-go="#/add/liability"><span class="grow" style="color:var(--loss)">− New Liability</span></button>`);
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
        <div class="field"><label>Currency</label><select id="v-ccy">${ccyOptions(v ? v.ccy : h.ccy)}</select></div>
      </div>
      <div class="field"><label>As of</label><input id="v-date" type="date" value="${v ? v.date : TODAY}" max="${TODAY}"></div>
      ${(v ? v.ccy : h.ccy) !== S.settings.defaultCcy ? `<div class="hint" style="margin-top:10px">Totalled in
        ${esc(S.settings.defaultCcy)} at the rate on that date.</div>` : ''}
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
      ${chips(S.types.map(t => ({ id:t.id, name:typeName(t) })), d.types, 'draft-type')}

      <div class="sh-grp"><span class="grow">Tags</span>${modeToggle(d.tagMode, 'draft-tagmode')}</div>
      ${chips(tags.map(t => ({ id:t, name:t })), d.tags, 'draft-tag')}

      ${forInsights ? `
        <div style="text-align:center;margin:22px 0 4px;font-weight:650;font-size:15px">Don't Show</div>
        <div class="sh-grp"><span class="grow">Types</span></div>
        ${chips(S.types.map(t => ({ id:t.id, name:typeName(t) })), d.exTypes, 'draft-extype', true)}
        <div class="sh-grp"><span class="grow">Tags</span>${modeToggle(d.exTagMode, 'draft-extagmode')}</div>
        ${chips(tags.map(t => ({ id:t, name:t })), d.exTags, 'draft-extag', true)}
        <div class="hint" style="margin-top:10px">Hidden from Insights only. Home is unchanged.</div>` : ''}

      <div class="sh-grp" style="justify-content:center;margin-top:20px"><span style="margin:0 auto">Filter Archived</span></div>
      <div class="seg" style="max-width:200px;margin:0 auto">
        ${[['1','Yes'],['','No']].map(([v, l]) => `<button data-act="draft-archived" data-v="${v}" class="${(!!d.archived === !!v) ? 'on' : ''}">${l}</button>`).join('')}</div>

      <div class="sh-foot"><button class="btn sec" data-act="close-sheet">Cancel</button>
        <button class="btn" data-act="apply-filter" data-v="${forInsights ? '1' : ''}">Apply</button></div>
    </div>`);
}

/* Change or decide accessibility on a saved holding: the same fact question,
   never the category. */
function sheetAccess(hid) {
  const h = holdingOf(hid), rule = accessRule(universalOf(h.typeId));
  const q = rule.question ? rule.q : 'other', qu = questionFor(q), b = h.accessBasis || {};
  const on = (qq, a) => tick(b.q === qq && (a == null || b.a === a));
  sheet(`<h3 style="padding:0 22px 4px;text-align:center">${esc(h.name)}</h3>
    <div class="sheet-q">${esc(qu.ask)}</div>
    ${qu.answers.map(a => `<button class="opt" data-act="set-access" data-h="${h.id}" data-q="${esc(q)}" data-a="${esc(a.id)}">
      <span class="grow">${esc(a.label)}</span>${on(q, a.id)}</button>`).join('')}
    ${rule.fixed ? `<button class="opt" data-act="set-access" data-h="${h.id}" data-q="default">
      <span class="grow">Keep the usual <span class="muted">— ${esc(rule.fixed.reason)}</span></span>${on('default')}</button>` : ''}
    <button class="opt" data-act="set-access" data-h="${h.id}" data-q="unset"><span class="grow">Not sure</span>${on('unset')}</button>
    <div class="note" style="margin:14px 22px 0">Not sure is fine. It still counts toward your net worth.
      <button class="btn ghost sm auto" data-act="ask-agent" data-h="${h.id}">Ask your agent</button></div>`);
}
function sheetAskAgent(hid) {
  const h = holdingOf(hid);
  const conns = (S.account.connections || []).filter(c => c.active);
  const text = `Look at my “${h.name}” in NetNet. Help me work out whether it’s money I could use within a month, then update it.`;
  sheet(`<h3 style="padding:0 22px 10px;text-align:center">Ask your agent</h3>
    <div class="sh-body">
      <p class="muted" style="font-size:14px;margin:0">Paste this into ${conns.length ? esc(conns.map(c => c.client).join(' or '))
        : 'Claude or ChatGPT'}. ${conns.length ? 'It can read this holding, work it out with you, and set the answer — and you can undo anything it changes.'
        : 'Connect it first, so it can see this holding.'}</p>
      <div class="urlbox"><span class="grow">${esc(text)}</span>
        <button class="btn ghost sm auto" data-act="copy-prompt" data-v="${esc(text)}">Copy</button></div>
      ${conns.length ? '' : '<button class="btn" style="margin-top:14px" data-act="connect-start" data-v="holding">Connect your agent</button>'}
    </div>`);
}

/* ---- prototype-only: pretend the browser is somewhere else, so the region
   confirmation (§2.3 rule 2) can be tested from anywhere. ---- */
const PL = 'netnet-proto-locale';
function protoLocale() { try { return localStorage.getItem(PL); } catch (e) { return null; } }

function sheetProto() {
  sheet(`<h3 style="padding:0 18px 6px;text-align:center">Prototype controls</h3>
    <div class="sheet-sub" style="padding:0 18px 12px;font-size:12.5px;color:var(--ink-3);text-align:center">
      Scaffolding for testing — not product UI.</div>
    <button class="opt" data-act="reset-seeded"><span class="grow">Reset to the sample account</span></button>
    <button class="opt" data-act="reset-empty"><span class="grow">Start from an empty account (first-run)</span></button>
    ${!S.account.verified ? '<button class="opt" data-act="mock-verify"><span class="grow">Mark email verified</span></button>' : ''}
    <div class="sh-grp" style="padding:0 22px">Country detected from IP, for the next sign-up</div>
    ${[['', 'Use this browser’s time zone'], ['SG', 'Singapore'], ['MY', 'Malaysia'], ['GB', 'United Kingdom'], ['DE', 'Germany'], ['none', 'Not detected']]
      .map(([v, l]) => `<button class="opt" data-act="proto-locale" data-v="${v}"><span class="grow">${l}</span>${tick((protoLocale() || '') === v)}</button>`).join('')}
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
/* A render is either a navigation (the route changed) or an in-place update of the same
   route (a chart pager, a range, undo). Only navigation moves the page to the top or counts
   as a screen view; an in-place update must leave the reader exactly where they were. */
let lastRoute = null, lastInsightsView = null, sessionStarted = false;
const AUTH_ROUTES = ['signup', 'login', 'welcome'];
/* Where a visitor must be, whatever they asked for: signed out → sign up (or log in, if
   this browser has an account); signed in but not onboarded → onboarding; signed in and
   onboarded → never back to the auth screens. */
function guardRoute(hash) {
  const p0 = hash.replace(/^#\//, '').split('/')[0];
  if (!S.account.signedIn) return ['signup', 'login'].includes(p0) ? hash : hasAccount() ? '#/login' : '#/signup';
  if (!S.account.onboarded)
    return ['welcome', 'basics', 'connect'].includes(p0) ? hash
      : S.account.obStep === 'basics' ? '#/basics' : S.account.obStep === 'start' ? '#/welcome/start' : '#/welcome';
  return AUTH_ROUTES.includes(p0) ? '#/home' : hash;
}
function render(keepScroll) {
  let hash = location.hash || '#/home';
  const to = guardRoute(hash);
  if (to !== hash) { history.replaceState(null, '', to); hash = to; }
  const p = hash.replace(/^#\//, '').split('/');
  const navigated = hash !== lastRoute;
  lastRoute = hash;
  const screens = { signup:'s-auth', login:'s-auth', welcome:'s-auth', basics:'s-auth', connect:'s-auth', home:'s-home', holding:'s-holding',
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
  else if (p[0] === 'signup' || p[0] === 'login') renderAuth(p[0], p[1]);
  else if (p[0] === 'welcome') renderWelcome(p[1]);
  else if (p[0] === 'basics') renderBasics();
  else if (p[0] === 'connect') renderConnect(p[1], p[2]);

  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  const chrome = !AUTH_ROUTES.includes(p[0]) && !['basics', 'connect'].includes(p[0]);
  $('#tabbar').classList.toggle('hidden', !chrome);
  $('#sidebar').style.display = chrome ? '' : 'none';
  // Hiding the sidebar removes it from the grid, and .main would then auto-place into
  // the 232px sidebar track. Without chrome (sign-up, log-in, onboarding) the shell is one column.
  document.querySelector('.shell').classList.toggle('no-chrome', !chrome);
  $('#devbtn').style.display = chrome ? '' : 'none';
  const tabFor = { home:'#/home', holding:'#/home', add:'#/home', edit:'#/home', insights:'#/insights',
    period:'#/insights', agent:'#/agent', activity:'#/agent', account:'#/account', sub:'#/account' }[p[0]];
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tabFor));
  if (navigated && !keepScroll) window.scrollTo(0, 0);
  if (chrome && S.account.signedIn && !sessionStarted) { sessionStarted = true; fire('session_started', {}); }
  if (p[0] === 'insights') {
    const view = S.settings.insightsView;
    if (navigated || view !== lastInsightsView) fire('insights_viewed', { view });
    lastInsightsView = view;
  }
}

/* ================= wiring ================= */
document.addEventListener('click', ev => {
  const go = ev.target.closest('[data-go]');
  if (go) { closeSheet(); location.hash = go.dataset.go; return; }
  const tab = ev.target.closest('[data-tab]');
  if (tab) { location.hash = tab.dataset.tab; return; }
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  /* Unavailable controls use aria-disabled, not the disabled attribute: iOS treats a
     disabled button as dead space and double-tap-zooms on it (§6.1 rule 9). */
  if (el.getAttribute('aria-disabled') === 'true') return;
  const a = el.dataset.act, v = el.dataset.v, s = S.settings;
  const rerender = () => { save(); render(); };
  const keep = () => { save(); render(true); };

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

    /* guided assembly (J1) */
    case 'guide-yes': S.guide.stage = 'amount'; keep(); setTimeout(() => { const i = $('#g-amount'); if (i) i.focus(); }, 30); return;
    case 'guide-back': S.guide.stage = 'ask'; keep(); return;
    case 'guide-no': { const c = guideCurrent(); if (c) { S.guide.answered[c.item.id] = 'no'; S.guide.i = c.idx + 1; }
      S.guide.stage = 'ask'; S.guide.last = null; keep(); return; }
    case 'guide-add': guideAdd(); return;
    case 'guide-stop': finishBasics(); return;
    case 'basics-start': S.guide = newGuide(); save(); location.hash = '#/basics'; return;

    /* accessibility, in the Add/Edit form (J2) */
    case 'form-answer':
      S.form.basis = el.dataset.q === 'unset' ? { q:'unset' } : el.dataset.q === 'default' ? { q:'default' }
                   : { q:el.dataset.q, a:el.dataset.a };
      S.form.changing = false; paintAccess(); return;
    case 'form-change': S.form.changing = true; paintAccess(); return;

    /* accessibility, on an existing holding */
    case 'open-access': sheetAccess(el.dataset.h); return;
    case 'set-access': {
      const h = holdingOf(el.dataset.h);
      setAccess(h, el.dataset.q === 'unset' ? { q:'unset' } : el.dataset.q === 'default' ? { q:'default' }
                 : { q:el.dataset.q, a:el.dataset.a });
      closeSheet(); rerender(); return;
    }
    case 'ask-agent': sheetAskAgent(el.dataset.h); return;
    case 'copy-prompt': navigator.clipboard && navigator.clipboard.writeText(el.dataset.v); el.textContent = 'Copied'; return;
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

    case 'copy-url': navigator.clipboard && navigator.clipboard.writeText(MCP_URL); el.textContent = 'Copied'; return;
    case 'mock-verify': S.account.verified = true; closeSheet(); rerender(); return;
    case 'connect-start': closeSheet(); startConnect(v || 'home', el.dataset.client || null); return;
    case 'connect-client': startConnect(S.connectEntry || 'home', v); return;
    case 'set-platform': S.connectPlatform = v; keep(); return;
    case 'connect-allow': {
      const c = CLIENTS[v], now = new Date().toISOString();
      S.account.connections.push({ id:uid('c'), client:c.name, connectedAt:now, lastCall:now, active:true });
      fire('agent_connection_completed', { client:c.name, entry:S.connectEntry || 'agent' });
      /* On the agent route, connecting IS the end of onboarding: a blank Home follows. */
      if (!S.account.onboarded) { Object.assign(S.account, { onboarded:true, obStep:null }); S.guide = Object.assign(newGuide(), { done:true }); }
      S.connectNotice = null; save();
      location.hash = S.connectEntry === 'agent' ? '#/agent' : '#/home'; return;
    }
    case 'connect-cancel':
      fire('agent_connection_failed', { step:'authorise', client:CLIENTS[v].name, entry:S.connectEntry || 'agent' });
      S.connectNotice = 'Not connected: you pressed Cancel. Try again whenever you’re ready.';
      save(); location.hash = '#/connect/' + v; return;
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
          const val = { id:uid('v'), date:TODAY, amount:demoIbkrAmount(), ccy:'USD', 
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
      /* The user's own type has no universal meaning, so its holdings get the
         universal fact question rather than a guessed default. */
      S.types.push({ id:uid('t'), universal:'other', name:n.trim() });
      rerender(); return;
    }
    case 'edit-type': {
      const t = S.types.find(x => x.id === v);
      const n = prompt('Rename type (blank to delete; its holdings move to ' + typeName({ universal:'other' }) + ')', typeName(t));
      if (n === null) return;
      if (!n.trim()) {
        S.types = S.types.filter(x => x.id !== t.id);
        const fallback = typeForUniversal('other');
        S.holdings.forEach(h => { if (h.typeId === t.id) h.typeId = fallback.id; });
      } else if (n.trim() !== typeName(t)) t.name = n.trim();
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
        const rows = [['holding','type','tags','kind','accessibility','currency','date','amount','rate','rate_date','default_currency_value','source']];
        S.holdings.forEach(h => h.values.forEach(x => rows.push([h.name, typeOf(h.typeId).name, h.tags.join('|'),
          h.kind, h.access, x.ccy, x.date, x.amount, x.rate, x.rateDate, x.base, x.source])));
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
    case 'logout': S.account.signedIn = false; S.signup = { email:S.account.email }; sessionStarted = false;
      save(); location.hash = '#/login'; return;
    case 'resend-verify': S.account.verifyResent = true; rerender(); return;
    case 'reset-empty': reset('empty'); return;
    case 'proto': sheetProto(); return;
    case 'proto-locale': try { v ? localStorage.setItem(PL, v) : localStorage.removeItem(PL); } catch (e) {} sheetProto(); return;

    default: authAction(a, v, el); return;
  }
});

document.addEventListener('change', ev => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'toggle-setting') { S.settings[el.dataset.v] = el.checked; save(); render(); }
  if (el.dataset.act === 'toggle-reminders') { S.settings.reminderOptOut = !el.checked; save(); render(); }
  if (el.dataset.act === 'set-ccy') { S.settings.defaultCcy = el.value; save(); render(); }
  if (el.dataset.act === 'set-region') {
    const r = regionOf(el.value); if (!r) return;
    S.account.region = r.code; S.account.pack = r.pack || 'generic'; applyPackTypes(); save(); render();
  }
  if (el.dataset.act === 'form-type') {
    S.form.typeId = el.value; S.form.basis = startingBasis(el.value); S.form.changing = false;
    const n = $('#f-name'); if (n) n.placeholder = typeExample(el.value);
    paintAccess();
  }
  if (el.dataset.act === 'form-amount') paintAccess();
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'f-amount') paintAccess();
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.id === 'g-amount') { ev.preventDefault(); guideAdd(); }
  /* Enter submits the auth form it is in */
  if (ev.key === 'Enter' && ['au-email', 'au-pw'].includes(ev.target.id)) {
    ev.preventDefault();
    const btn = document.querySelector('#s-auth [data-act="auth-email"], #s-auth [data-act="auth-create"], #s-auth [data-act="auth-login"]');
    if (btn) btn.click();
  }
});

$('#scrim').addEventListener('click', closeSheet);
$('#devbtn').addEventListener('click', sheetProto);
/* Real navigation (including the phone's back gesture) must never leave a sheet
   stranded over the next screen. Only hash changes close sheets — in-sheet
   re-renders call render() directly and must keep their sheet open. */
window.addEventListener('hashchange', () => { closeSheet(); render(); });

/* ================= SIGN UP, LOG IN, ONBOARDING (J1) =================
   Sign-up asks for nothing but a way in: a provider, or an email and a password.
   Everything else waits until the account exists. Onboarding is then: where you live,
   confirmed and never applied silently (§2.3 rule 2); an optional segment (§3.5); and
   the basics, one question per screen, which Home no longer mixes with anything else. */
const SEGMENTS = [
  { id:'starting_out', label:'Just starting out' },
  { id:'accumulating', label:'Building up — saving toward something big' },
  { id:'established',  label:'Established — a lot to keep track of' }
];
const PROVIDERS = [['google', 'Google', 'you@gmail.com'], ['apple', 'Apple', 'you@icloud.com']];
/* The country the visitor is in, to pre-select "Where do you live?". In production this
   is the visitor's IP, looked up by our own server or CDN — never a third-party call from
   the browser — and it is only ever a default the user confirms (§2.3 rule 2). The
   prototype has no server: the PROTO sheet simulates the lookup, and otherwise the
   browser's time zone stands in for it. */
const TZ_STANDIN = { 'Asia/Singapore':'SG', 'Asia/Kuala_Lumpur':'MY', 'Asia/Kuching':'MY', 'Asia/Jakarta':'ID',
  'Asia/Manila':'PH', 'Asia/Bangkok':'TH', 'Asia/Ho_Chi_Minh':'VN', 'Asia/Saigon':'VN', 'Asia/Hong_Kong':'HK',
  'Asia/Kolkata':'IN', 'Asia/Calcutta':'IN', 'Australia/Sydney':'AU', 'Australia/Melbourne':'AU',
  'Europe/London':'GB', 'Europe/Berlin':'DE', 'Europe/Paris':'FR', 'America/New_York':'US',
  'America/Chicago':'US', 'America/Los_Angeles':'US', 'Asia/Tokyo':'JP', 'Asia/Dubai':'AE' };
function detectCountry() {
  const sim = protoLocale();
  if (sim) return sim === 'none' ? null : sim;
  try {
    const byTz = TZ_STANDIN[Intl.DateTimeFormat().resolvedOptions().timeZone || ''];
    if (byTz) return byTz;
    const cc = ((navigator.language || '').split('-')[1] || '').toUpperCase();
    if (regionOf(cc)) return cc;
  } catch (e) {}
  return null;
}
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
const hasAccount = () => !!S.account.email;
const draft = () => S.signup || (S.signup = {});

function authShell(inner) {
  $('#s-auth').innerHTML = `<div class="auth"><div class="brand auth-mark"><i></i>NetNet</div>${inner}</div>`;
}
const providerButtons = () => PROVIDERS.map(([id, name]) =>
  `<button class="btn sec" data-act="auth-provider" data-v="${id}">Continue with ${name}</button>`).join('');

function renderAuth(route, step) {
  const f = draft();
  if (route === 'signup' && step === 'password') {
    if (!f.email) { location.replace('#/signup'); return; }
    authShell(`
      <button class="back" data-go="#/signup">‹ Back</button>
      <h1>Set a password</h1>
      <p class="auth-sub">For ${esc(f.email)}</p>
      <div class="field"><label for="au-pw">Password</label>
        <div class="pw"><input id="au-pw" type="password" autocomplete="new-password" minlength="8">
          <button type="button" class="link-sm" data-act="auth-reveal">Show</button></div>
        <div class="hint ${f.err ? 'warn-t' : ''}">${f.err || 'At least 8 characters.'}</div></div>
      <button class="btn" data-act="auth-create">Create account</button>`);
    return;
  }
  if (route === 'login') {
    authShell(`
      <h1>Log in</h1>
      ${f.notice ? `<p class="auth-sub">${esc(f.notice)}</p>` : ''}
      <div class="auth-stack">${providerButtons()}</div>
      <div class="or"><span>or</span></div>
      <div class="field"><label for="au-email">Email</label>
        <input id="au-email" type="email" autocomplete="email" inputmode="email" value="${esc(f.email || '')}"></div>
      <div class="field"><label for="au-pw">Password</label>
        <div class="pw"><input id="au-pw" type="password" autocomplete="current-password">
          <button type="button" class="link-sm" data-act="auth-reveal">Show</button></div>
        ${f.err ? `<div class="hint warn-t">${esc(f.err)}</div>` : ''}</div>
      <button class="btn" data-act="auth-login">Log in</button>
      <div class="auth-foot">
        <button class="link-sm" data-act="auth-forgot">Forgot password?</button>
        ${f.forgot ? `<div class="hint">${esc(f.forgot)}</div>` : ''}
        <div>New to NetNet? <button class="link-sm" data-go="#/signup">Create an account</button></div>
      </div>`);
    return;
  }
  authShell(`
    <h1>Create your account</h1>
    <div class="auth-stack">${providerButtons()}</div>
    <div class="or"><span>or</span></div>
    <div class="field"><label for="au-email">Email</label>
      <input id="au-email" type="email" autocomplete="email" inputmode="email" value="${esc(f.email || '')}">
      ${f.err ? `<div class="hint warn-t">${esc(f.err)}</div>` : ''}</div>
    <button class="btn" data-act="auth-email">Continue with email</button>
    <div class="auth-foot"><div>Already have an account? <button class="link-sm" data-go="#/login">Log in</button></div></div>`);
}

/* Onboarding: after the account exists, before Home. Two questions, one screen each. */
function renderWelcome(step) {
  const f = draft();
  if (step === 'start') {
    authShell(`
      <h1>Let’s start by getting to know a little about your finances.</h1>
      <p class="auth-sub">A few quick questions. Round numbers are fine, and you can change anything later.</p>
      <button class="btn" data-act="ob-start">Start</button>
      ${agentAlt('onboarding')}`);
    return;
  }
  if (step === '2') {
    authShell(`
      <div class="auth-step">2 of 2</div>
      <h1>Which is closest to you?</h1>
      <div class="choice col">${SEGMENTS.map(x =>
        `<button data-act="ob-seg" data-v="${x.id}" class="${f.segment === x.id ? 'on' : ''}">${esc(x.label)}</button>`).join('')}</div>
      <div class="hint" style="margin-top:10px">Optional. It changes nothing you see.</div>
      <button class="btn" style="margin-top:22px" data-act="ob-finish">${f.segment ? 'Continue' : 'Skip'}</button>`);
    return;
  }
  const guess = detectCountry();
  if (f.region === undefined) f.region = guess || null;
  const reg = regionOf(f.region);
  const ccy = f.ccy || (reg ? reg.ccy : 'USD');
  const picking = f.other || !guess;
  authShell(`
    ${S.account.verifySent && !S.account.verified ? `<p class="auth-sub">We’ve sent a link to ${esc(S.account.email)}
      to verify your email. Carry on in the meantime.</p>` : ''}
    <div class="auth-step">1 of 2</div>
    <h1>Where do you live?</h1>
    ${guess ? `<div class="choice">
      <button data-act="ob-region" data-v="${guess}" class="${f.region === guess && !f.other ? 'on' : ''}">${esc(regionOf(guess).name)}</button>
      <button data-act="ob-other" class="${f.other ? 'on' : ''}">Somewhere else</button></div>` : ''}
    ${picking ? `<div class="field" style="margin-top:12px"><select id="ob-region" data-act="ob-region-pick" aria-label="Where you live">
      <option value="">Choose…</option>${REGIONS.filter(r => r.code !== guess).map(r =>
        `<option value="${r.code}" ${f.region === r.code ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>` : ''}
    <div class="hint" style="margin-top:10px">For local names and suggestions. You can still track anything.</div>
    ${f.err ? `<div class="hint warn-t">${esc(f.err)}</div>` : ''}
    ${reg ? `<div class="auth-ccy">Totals in ${f.ccyOpen
      ? `<select id="ob-ccy" data-act="ob-ccy" aria-label="Currency for totals">${ccyOptions(ccy)}</select>`
      : `<b>${esc(ccy)}</b> <button class="link-sm" data-act="ob-ccy-open">Change</button>`}</div>` : ''}
    <button class="btn" style="margin-top:22px" data-act="ob-next">Continue</button>`);
}

/* One account per browser in this prototype. A provider signs in to it if it exists,
   and creates it if not; the provider's own consent screens are not simulated. */
function createAccount(email, method) {
  Object.assign(S.account, { email, signedIn:true, onboarded:false,
    verified: method !== 'email', verifySent: method === 'email',
    name: email.split('@')[0] || 'there', initials: (email[0] || 'Y').toUpperCase(),
    region:null, pack:'generic', segment:'unknown', connections:[] });
  fire('account_created', { method });
  S.signup = { region:undefined }; save();
  location.hash = '#/welcome';
}
function signIn() {
  S.account.signedIn = true; S.signup = null; save();
  /* Home, or wherever onboarding was left — guardRoute decides */
  location.hash = '#/home';
}
function authAction(a, v, el) {
  const f = draft();
  const val = id => (($('#' + id) || {}).value || '').trim();
  switch (a) {
    case 'auth-provider': {
      const [, , email] = PROVIDERS.find(x => x[0] === v);
      if (hasAccount()) { signIn(); return true; }
      fire('signup_started', { method:v });
      createAccount(email, v); return true;
    }
    case 'auth-email': {
      const email = val('au-email').toLowerCase();
      f.email = email; f.err = null;
      if (!validEmail(email)) { f.err = 'Enter an email address.'; save(); renderAuth('signup'); return true; }
      if (hasAccount() && S.account.email.toLowerCase() === email) {
        S.signup = { email, notice:'You already have an account. Log in instead.' }; save();
        location.hash = '#/login'; return true;
      }
      fire('signup_started', { method:'email' });
      save(); location.hash = '#/signup/password'; return true;
    }
    case 'auth-create': {
      /* The password is checked, never stored — not even by this prototype. */
      if (val('au-pw').length < 8) { f.err = 'Use at least 8 characters.'; save(); renderAuth('signup', 'password'); return true; }
      createAccount(f.email, 'email'); return true;
    }
    case 'auth-login': {
      const email = val('au-email').toLowerCase();
      f.email = email; f.notice = null; f.forgot = null;
      if (!hasAccount() || S.account.email.toLowerCase() !== email || !val('au-pw')) {
        f.err = 'That email and password don’t match.'; save(); renderAuth('login'); return true;
      }
      signIn(); return true;
    }
    case 'auth-forgot': {
      const email = val('au-email');
      f.email = email; f.err = null;
      f.forgot = validEmail(email) ? 'If there’s an account for ' + email + ', a reset link is on its way.'
                                   : 'Enter your email above first.';
      save(); renderAuth('login'); return true;
    }
    case 'auth-reveal': {
      const i = $('#au-pw'); if (!i) return true;
      i.type = i.type === 'password' ? 'text' : 'password';
      el.textContent = i.type === 'password' ? 'Show' : 'Hide'; return true;
    }
    case 'ob-region': Object.assign(f, { region:v, other:false, err:null }); if (!f.ccyTouched) f.ccy = null; save(); renderWelcome(); return true;
    case 'ob-other': Object.assign(f, { region:null, other:true, err:null }); if (!f.ccyTouched) f.ccy = null; save(); renderWelcome(); return true;
    case 'ob-ccy-open': f.ccyOpen = true; save(); renderWelcome(); return true;
    case 'ob-next': {
      const r = regionOf(f.region);
      if (!r) { f.err = 'Choose where you live to carry on.'; save(); renderWelcome(); return true; }
      Object.assign(S.account, { region:r.code, pack:r.pack || 'generic' });
      S.settings.defaultCcy = f.ccy || r.ccy;
      applyPackTypes();
      save(); location.hash = '#/welcome/2'; return true;
    }
    case 'ob-seg': f.segment = f.segment === v ? null : v; save(); renderWelcome('2'); return true;
    case 'ob-finish': {
      Object.assign(S.account, { segment:f.segment || 'unknown', obStep:'start' });
      S.signup = null; save(); location.hash = '#/welcome/start'; return true;
    }
    case 'ob-start': {
      if (!S.account.onboarded) S.account.obStep = 'basics';
      S.guide = newGuide(); save(); location.hash = '#/basics'; return true;
    }
  }
  return false;
}
document.addEventListener('change', ev => {
  const f = draft();
  if (ev.target.id === 'ob-region') { f.region = ev.target.value || null; f.err = null; if (!f.ccyTouched) f.ccy = null; save(); renderWelcome(); }
  if (ev.target.id === 'ob-ccy') { f.ccy = ev.target.value; f.ccyTouched = true; save(); }
});

S = load();
render();
