/* NetNet prototype — seed data.
   EVERY NUMBER AND NAME HERE IS FICTIONAL. It is shaped like the beachhead user
   in docs/01-prd.md §2 (SG/SEA, ~S$1.2M net worth, 12 holdings, 2 currencies,
   CPF + property + unvested equity) so the prototype exercises the real cases.
   It is NOT the Founder's data and must never be replaced with real data. */

const TODAY = '2026-09-23';
const DEFAULT_CCY = 'SGD';

/* --- user-defined taxonomy (J2: not a fixed enum) --- */
const SEED_TYPES = [
  { id:'t-cash',  name:'Cash',        colour:'#3b82f6', access:'accessible' },
  { id:'t-inv',   name:'Investments', colour:'#0d7d72', access:'accessible' },
  { id:'t-cpf',   name:'CPF',         colour:'#8b5cf6', access:'locked'     },
  { id:'t-prop',  name:'Property',    colour:'#f59e0b', access:'illiquid'   },
  { id:'t-veh',   name:'Vehicle',     colour:'#ec4899', access:'illiquid'   },
  { id:'t-crypto',name:'Crypto',      colour:'#f97316', access:'accessible' },
  { id:'t-equity',name:'Equity comp', colour:'#14b8a6', access:'locked'     },
  { id:'t-loan',  name:'Loan',        colour:'#64748b', access:'n/a'        }
];
const SEED_TAGS = ['Emergency fund','Retirement','Long-term','Home','USD exposure','Speculative'];

/* --- FX. J2: the rate and rate-date used are recorded ON the entry,
       never re-derived later. §9 assumption: daily reference rate at entry time only. --- */
function fxUSDSGD(dateStr) {
  const t = Date.parse(dateStr) / 86400000;
  return +(1.325 + 0.052 * Math.sin(t / 61) + 0.024 * Math.sin(t / 19.5)).toFixed(4);
}
function rateFor(ccy, dateStr) { return ccy === 'SGD' ? 1 : fxUSDSGD(dateStr); }

/* --- deterministic noise so every session sees the same numbers --- */
function rng(seed) { let s = seed >>> 0 || 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

function addMonths(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 86400000); }

/* Each spec generates a dated value series. Cadence deliberately varies:
   monthly for liquid, quarterly for CPF, annual for property/vehicle — that is
   what makes staleness (J9) and carry-forward (J11) real rather than theoretical. */
const HOLDING_SPECS = [
  { id:'h-dbs',    name:'DBS Multiplier',        type:'t-cash',  tags:['Emergency fund'],            ccy:'SGD', start:61800,  growth:0.0042, vol:0.035, every:1,  months:24 },
  { id:'h-uob',    name:'UOB One Account',       type:'t-cash',  tags:[],                            ccy:'SGD', start:27400,  growth:0.0035, vol:0.028, every:1,  months:24 },
  { id:'h-ibkr',   name:'IBKR — global equities',type:'t-inv',   tags:['Long-term','USD exposure'],  ccy:'USD', start:144500, growth:0.0118, vol:0.055, every:1,  months:24 },
  { id:'h-endowus',name:'Endowus Core',          type:'t-inv',   tags:['Long-term','Retirement'],    ccy:'SGD', start:87600,  growth:0.0094, vol:0.032, every:1,  months:24 },
  { id:'h-cpfoa',  name:'CPF Ordinary Account',  type:'t-cpf',   tags:['Retirement','Home'],         ccy:'SGD', start:95800,  growth:0.0072, vol:0.002, every:3,  months:24 },
  { id:'h-cpfsa',  name:'CPF Special Account',   type:'t-cpf',   tags:['Retirement'],                ccy:'SGD', start:70900,  growth:0.0080, vol:0.001, every:3,  months:24 },
  { id:'h-hdb',    name:'HDB flat — Punggol',    type:'t-prop',  tags:['Home'],                      ccy:'SGD', start:648000, growth:0.0041, vol:0.004, every:12, months:24 },
  { id:'h-car',    name:'Toyota Corolla Altis',  type:'t-veh',   tags:[],                            ccy:'SGD', start:57500,  growth:-0.0115,vol:0.004, every:6,  months:18, staleAfter:'2025-09-15' },
  { id:'h-rsu',    name:'Unvested RSUs — Acme',  type:'t-equity',tags:['USD exposure'],              ccy:'USD', start:61200,  growth:0.0083, vol:0.048, every:3,  months:24 },
  { id:'h-btc',    name:'Bitcoin (self-custody)',type:'t-crypto',tags:['Speculative','USD exposure'],ccy:'USD', start:17600,  growth:0.0215, vol:0.115, every:1,  months:24 },
  { id:'h-hdbloan',name:'HDB loan',              type:'t-loan',  tags:['Home'],   kind:'liability',  ccy:'SGD', start:338500, growth:-0.0032,vol:0.0005,every:3,  months:24 },
  { id:'h-carloan',name:'Car loan',              type:'t-loan',  tags:[],         kind:'liability',  ccy:'SGD', start:34200,  growth:-0.0182,vol:0.0005,every:3,  months:24 }
];

/* Values the agent wrote, so J6/J7 have something to show. Keyed by holding id:
   the n most recent entries are attributed to Claude, in two distinct turns. */
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
    const type = SEED_TYPES.find(t => t.id === spec.type);
    const values = [];
    let amount = spec.start;
    const first = addMonths(TODAY, -spec.months);

    for (let m = 0; m <= spec.months; m += spec.every) {
      const date = addMonths(first, m);
      if (Date.parse(date) > Date.parse(TODAY)) break;
      if (spec.staleAfter && Date.parse(date) > Date.parse(spec.staleAfter)) break;
      if (m > 0) amount = amount * (1 + spec.growth * spec.every + (r() - 0.5) * 2 * spec.vol);
      const rounded = Math.max(0, Math.round(amount / (spec.ccy === 'USD' ? 10 : 100)) * (spec.ccy === 'USD' ? 10 : 100));
      const rate = rateFor(spec.ccy, date);
      values.push({
        id: spec.id + '-v' + m,
        date,
        amount: rounded,
        ccy: spec.ccy,
        rate,
        rateDate: date,
        base: Math.round(rounded * rate),
        source: 'web',
        client: null,
        turn: null,
        enteredAt: date + 'T12:00:00Z'
      });
    }
    // attribute the most recent entries to the agent
    const aw = AGENT_WRITES[spec.id];
    if (aw) {
      values.slice(-aw.count).forEach(v => { v.source = 'agent'; v.client = aw.client; v.turn = aw.turn; v.enteredAt = aw.at; });
    }
    return {
      id: spec.id,
      name: spec.name,
      kind,
      typeId: spec.type,
      tags: spec.tags.slice(),
      ccy: spec.ccy,
      access: kind === 'liability' ? 'n/a' : (spec.access || type.access),
      cadenceDays: spec.every * 30,
      archived: false,
      values: values.sort((a, b) => a.date.localeCompare(b.date))
    };
  });
}

/* One archived holding, to prove archive keeps history but leaves the totals (J2). */
function archivedExtra() {
  return {
    id: 'h-sold', name: 'Syfe Equity100 (closed)', kind: 'asset', typeId: 't-inv',
    tags: ['Long-term'], ccy: 'SGD', access: 'accessible', cadenceDays: 30, archived: true,
    values: [
      { id:'h-sold-v0', date:'2024-10-01', amount:18400, ccy:'SGD', rate:1, rateDate:'2024-10-01', base:18400, source:'web', client:null, turn:null, enteredAt:'2024-10-01T12:00:00Z' },
      { id:'h-sold-v1', date:'2025-04-01', amount:21250, ccy:'SGD', rate:1, rateDate:'2025-04-01', base:21250, source:'web', client:null, turn:null, enteredAt:'2025-04-01T12:00:00Z' },
      { id:'h-sold-v2', date:'2025-08-12', amount:22900, ccy:'SGD', rate:1, rateDate:'2025-08-12', base:22900, source:'web', client:null, turn:null, enteredAt:'2025-08-12T12:00:00Z' }
    ]
  };
}

function seededState() {
  const holdings = buildHoldings();
  holdings.push(archivedExtra());
  return {
    mode: 'seeded',
    account: {
      email: 'sam@example.com', name: 'Sam', verified: true, signedIn: true,
      connections: [{ id:'c-claude', client:'Claude', connectedAt:'2026-08-04T21:32:00Z', lastCall:'2026-09-21T09:14:11Z', active:true }]
    },
    types: SEED_TYPES.map(t => ({ ...t })),
    tags: SEED_TAGS.slice(),
    holdings,
    log: [],           // built by app.js from value history + explicit entries
    settings: {
      baseline: 'last-month',
      defaultCcy: DEFAULT_CCY,
      sort: 'value-desc',
      filterTypes: [],
      filterTags: [],
      insightsView: 'monthly',
      insightsExclude: [],
      reminderCadence: 'monthly',
      reminderOptOut: false
    },
    events: []
  };
}

function emptyState() {
  const s = seededState();
  s.mode = 'empty';
  s.holdings = [];
  s.account = { email:'', name:'', verified:false, signedIn:false, connections:[] };
  s.tags = [];
  s.events = [];
  return s;
}
