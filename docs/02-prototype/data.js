/* NetNet prototype — seed data.
   EVERY NUMBER AND NAME IS FICTIONAL. Shaped like persona P-C (Established) in
   docs/01-prd.md §2 and like the Founder's mockups (SG, multi-currency, CPF +
   property + unvested equity + a stale car), so the prototype exercises the
   real cases. It is NOT the Founder's data and must never be replaced with it. */

const TODAY = '2026-09-23';
const DEFAULT_CCY = 'SGD';

/* --- the user's own taxonomy (J2), seeded with one type per universal type
       (packs.js). A type stores no name until the user renames it: its label
       comes from the jurisdiction pack, so switching region relabels every type
       the user has not renamed (§2.3, "types are universal; only labels are
       local"). Array order fixes each type's chart colour. --- */
const SEED_TYPES = [
  { id:'t-cash',       universal:'cash',       name:null },
  { id:'t-listed',     universal:'listed',     name:null },
  { id:'t-retirement', universal:'retirement', name:null },
  { id:'t-property',   universal:'property',   name:null },
  { id:'t-vehicle',    universal:'vehicle',    name:null },
  { id:'t-equity',     universal:'equity',     name:null },
  { id:'t-crypto',     universal:'crypto',     name:null },
  { id:'t-mortgage',   universal:'mortgage',   name:null },
  { id:'t-loan',       universal:'loan',       name:null },
  { id:'t-wrapper',    universal:'wrapper',    name:null },
  { id:'t-card',       universal:'card',       name:null },
  { id:'t-other',      universal:'other',      name:null }
];
const SEED_TAGS = ['Emergency','Cash Equivalent','Growth','Dividend','High Risk',
                   'Low Risk','Long Term','Short Term','Tax-Advantaged'];

/* --- FX. J2: the rate and rate-date used are recorded ON the entry and never
       re-derived later. §9 assumption: daily reference rate at entry time only.
       Invented rates, quoted per USD; SGD wobbles so history is not flat. --- */
const CCYS = ['SGD','USD','MYR','IDR','PHP','THB','VND','HKD','INR','AUD','GBP','EUR','JPY'];
const PER_USD = { USD:1, MYR:4.42, IDR:15850, PHP:56.2, THB:35.6, VND:24900, HKD:7.8,
                  INR:83.4, AUD:1.51, GBP:0.78, EUR:0.92, JPY:149 };
function fxUSDSGD(dateStr) {
  const t = Date.parse(dateStr) / 86400000;
  return +(1.325 + 0.052 * Math.sin(t / 61) + 0.024 * Math.sin(t / 19.5)).toFixed(4);
}
function perUSD(ccy, dateStr) { return ccy === 'SGD' ? fxUSDSGD(dateStr) : (PER_USD[ccy] || 1); }
function rateFor(ccy, dateStr, to) {
  to = to || DEFAULT_CCY;
  return ccy === to ? 1 : +(perUSD(to, dateStr) / perUSD(ccy, dateStr)).toFixed(6);
}

function rng(seed) { let s = seed >>> 0 || 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

/* Cadence deliberately varies — monthly for liquid, quarterly for CPF, annual for
   property and the car. That is what makes staleness (J9) and Insights'
   carry-forward (J11) real rather than theoretical. 40 months of history so the
   Quarterly and Yearly views have something to show. */
const HOLDING_SPECS = [
  { id:'h-ibkr',   name:'IBKR',                  type:'t-listed',tags:['Growth','Long Term','High Risk'], ccy:'USD', start:392000, growth:0.0118, vol:0.052, every:1,  months:40 },
  { id:'h-house',  name:'HDB flat — Punggol',    type:'t-property',tags:['Long Term'], basis:{ q:'property', a:'yes' }, ccy:'SGD', start:612000, growth:0.0044, vol:0.004, every:12, months:40 },
  { id:'h-cpfoa',  name:'CPF Ordinary Account',  type:'t-retirement',tags:['Low Risk','Tax-Advantaged'], ccy:'SGD', start:88400,  growth:0.0072, vol:0.002, every:3,  months:40 },
  { id:'h-cpfsa',  name:'CPF Special Account',   type:'t-retirement',tags:['Low Risk','Tax-Advantaged','Long Term'], ccy:'SGD', start:64200, growth:0.0080, vol:0.001, every:3, months:40 },
  { id:'h-rsu',    name:'Acme RSU (unvested)',   type:'t-equity',tags:['High Risk','Long Term'], basis:{ q:'equity', a:'no' },ccy:'USD', start:78500,  growth:0.0091, vol:0.047, every:3,  months:40 },
  { id:'h-car',    name:'Toyota Corolla Altis',  type:'t-vehicle',tags:[], ccy:'SGD', start:141000, growth:-0.0092,vol:0.004, every:6,  months:40, staleAfter:'2024-09-23' },
  { id:'h-dbs',    name:'DBS Multiplier',        type:'t-cash',  tags:['Emergency','Cash Equivalent'], ccy:'SGD', start:58900, growth:0.0042, vol:0.035, every:1, months:40 },
  { id:'h-uob',    name:'UOB One Account',       type:'t-cash',  tags:['Cash Equivalent'],      ccy:'SGD', start:26100,  growth:0.0035, vol:0.028, every:1,  months:40 },
  { id:'h-endowus',name:'Endowus Core',          type:'t-listed',tags:['Growth','Long Term'], ccy:'SGD', start:74300,  growth:0.0094, vol:0.031, every:1,  months:40 },
  { id:'h-btc',    name:'Bitcoin (self-custody)',type:'t-crypto',tags:['High Risk','Short Term'],ccy:'USD',start:14800,  growth:0.0215, vol:0.110, every:1,  months:40 },
  { id:'h-hdbloan',name:'HDB loan',              type:'t-mortgage',  tags:[], kind:'liability',     ccy:'SGD', start:392000, growth:-0.0030,vol:0.0004,every:3,  months:40 },
  { id:'h-carloan',name:'Car loan',              type:'t-loan',  tags:[], kind:'liability',     ccy:'SGD', start:62400,  growth:-0.0155,vol:0.0004,every:3,  months:40 }
];

/* Values the agent wrote, so J6/J7 have something real to show. The most recent
   n entries of each holding are attributed to Claude, grouped into two turns. */
const AGENT_WRITES = {
  'h-ibkr':   { count:1, client:'Claude', turn:'turn-2', at:'2026-09-21T09:14:00Z' },
  'h-dbs':    { count:1, client:'Claude', turn:'turn-2', at:'2026-09-21T09:14:06Z' },
  'h-endowus':{ count:1, client:'Claude', turn:'turn-2', at:'2026-09-21T09:14:11Z' },
  'h-btc':    { count:2, client:'Claude', turn:'turn-1', at:'2026-08-04T21:40:00Z' },
  'h-cpfoa':  { count:1, client:'Claude', turn:'turn-1', at:'2026-08-04T21:40:09Z' }
};
function buildHoldings() {
  return HOLDING_SPECS.map(spec => {
    const r = rng(hashStr(spec.id));
    const kind = spec.kind || 'asset';
    const values = [];
    let amount = spec.start;
    const first = addMonths(TODAY, -spec.months);

    for (let m = 0; m <= spec.months; m += spec.every) {
      const date = addMonths(first, m);
      if (Date.parse(date) > Date.parse(TODAY)) break;
      if (spec.staleAfter && Date.parse(date) > Date.parse(spec.staleAfter)) break;
      if (m > 0) amount = amount * (1 + spec.growth * spec.every + (r() - 0.5) * 2 * spec.vol);
      const step = spec.ccy === 'USD' ? 10 : 100;
      const rounded = Math.max(0, Math.round(amount / step) * step);
      const rate = rateFor(spec.ccy, date);
      values.push({
        id: spec.id + '-v' + m, date, amount: rounded, ccy: spec.ccy, rate, rateDate: date,
        base: Math.round(rounded * rate), source: 'web', client: null, turn: null,
        enteredAt: date + 'T12:00:00Z'
      });
    }
    const aw = AGENT_WRITES[spec.id];
    if (aw) values.slice(-aw.count).forEach(v => {
      v.source = 'agent'; v.client = aw.client; v.turn = aw.turn; v.enteredAt = aw.at;
    });
    return {
      id: spec.id, name: spec.name, kind, typeId: spec.type, tags: spec.tags.slice(),
      ccy: spec.ccy, access: kind === 'liability' ? 'n/a' : null,
      accessBasis: kind === 'liability' ? null : (spec.basis || { q:'default' }),
      cadenceDays: spec.every * 30, archived: false,
      values: values.sort((a, b) => a.date.localeCompare(b.date))
    };
  });
}

/* One archived holding, to prove archive keeps history but leaves the totals (J2). */
function archivedExtra() {
  const mk = (i, date, amount) => ({ id:'h-sold-v'+i, date, amount, ccy:'SGD', rate:1, rateDate:date,
    base:amount, source:'web', client:null, turn:null, enteredAt:date+'T12:00:00Z' });
  return { id:'h-sold', name:'Syfe Equity100 (closed)', kind:'asset', typeId:'t-listed',
    tags:['Growth'], ccy:'SGD', access:null, accessBasis:{ q:'default' }, cadenceDays:30, archived:true,
    values:[mk(0,'2024-10-01',18400), mk(1,'2025-04-01',21250), mk(2,'2025-08-12',22900)] };
}

function seededState() {
  const holdings = buildHoldings();
  holdings.push(archivedExtra());
  return {
    mode:'seeded',
    account: { email:'sam@example.com', name:'Sam Tan', initials:'ST', verified:true, signedIn:true, onboarded:true,
      region:'SG', pack:'sg', segment:'established',
      connections:[{ id:'c-claude', client:'Claude', connectedAt:'2026-08-04T21:32:00Z',
                     lastCall:'2026-09-21T09:14:11Z', active:true }] },
    types: SEED_TYPES.map(t => ({ ...t })),
    tags: SEED_TAGS.slice(),
    holdings,
    log: [],
    guide: { done:true, i:0, stage:'ask', answered:{}, last:null },
    settings: {
      baseline:'last-quarter', defaultCcy:DEFAULT_CCY, sort:'value-desc', range:12,
      homeCard:0, pieMode:'%',
      showOnly:'all', filterTypes:[], filterTags:[], tagMode:'OR', filterArchived:false,
      insightsView:'quarterly', insightsRange:16,
      inShowOnly:'all', inTypes:[], inTags:[], inTagMode:'OR',
      exTypes:[], exTags:[], exHoldings:[], exTagMode:'OR', inArchived:false,
      showZeroBounds:true, showDefaultCcy:true,
      reminderCadence:'monthly', reminderOptOut:false
    },
    events: []
  };
}

function emptyState() {
  const s = seededState();
  s.mode = 'empty';
  s.holdings = [];
  s.tags = [];
  s.events = [];
  s.account = { email:'', name:'', initials:'', verified:false, signedIn:false, onboarded:false, connections:[],
                region:null, pack:'generic', segment:'unknown' };
  s.guide = { done:false, i:0, stage:'ask', answered:{}, last:null };
  return s;
}
