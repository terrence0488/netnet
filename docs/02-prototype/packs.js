/* NetNet prototype — jurisdiction packs (PRD §2.3, N10).

   DATA, NOT CODE. Nothing in this file is a function, and nothing in app.js
   names a local institution, rule or default. Adding a market means adding an
   entry to PACKS (and pointing a REGIONS row at it) — no change to the flow.

   Two kinds of opinion are kept apart (§2.3):
   - opinions about the INTERACTION (ask a fact, default with a stated reason,
     show the consequence, never block saving) live in app.js and are universal;
   - opinions about the WORLD (what holdings are called here, which are locked
     and why, which question settles an ambiguous one) live here.

   The generic pack is first-class, not a fallback: it is complete on its own.
   A local pack overrides only what is genuinely local; anything it leaves out
   is read from generic. */

/* The universal type system. Types are universal; only labels are local.
   `retirement` is the mandatory-retirement type — CPF here, EPF, MPF,
   Superannuation or a workplace pension elsewhere. Same behaviour everywhere. */
const UNIVERSAL_TYPES = [
  { id:'cash',       side:'asset' },
  { id:'listed',     side:'asset' },
  { id:'retirement', side:'asset' },
  { id:'property',   side:'asset' },
  { id:'vehicle',    side:'asset' },
  { id:'equity',     side:'asset' },
  { id:'crypto',     side:'asset' },
  { id:'mortgage',   side:'liability' },
  { id:'loan',       side:'liability' },
  { id:'wrapper',    side:'asset' },
  { id:'card',       side:'liability' },
  { id:'other',      side:'any' }
];

/* Where someone lives chooses the pack. Rows with no `pack` get generic.
   Recording the country even when there is no pack for it is deliberate:
   it is the demand signal for which pack to write next (§2.3, "the second
   pack is cheap and should wait for demand"). */
const REGIONS = [
  { code:'SG', name:'Singapore',      ccy:'SGD', pack:'sg', tz:['Asia/Singapore'] },
  { code:'MY', name:'Malaysia',       ccy:'MYR', tz:['Asia/Kuala_Lumpur','Asia/Kuching'] },
  { code:'ID', name:'Indonesia',      ccy:'IDR', tz:['Asia/Jakarta','Asia/Makassar','Asia/Jayapura'] },
  { code:'PH', name:'Philippines',    ccy:'PHP', tz:['Asia/Manila'] },
  { code:'TH', name:'Thailand',       ccy:'THB', tz:['Asia/Bangkok'] },
  { code:'VN', name:'Vietnam',        ccy:'VND', tz:['Asia/Ho_Chi_Minh','Asia/Saigon'] },
  { code:'HK', name:'Hong Kong',      ccy:'HKD', tz:['Asia/Hong_Kong'] },
  { code:'IN', name:'India',          ccy:'INR', tz:['Asia/Kolkata','Asia/Calcutta'] },
  { code:'AU', name:'Australia',      ccy:'AUD', tz:['Australia/Sydney','Australia/Melbourne','Australia/Brisbane',
                                                     'Australia/Perth','Australia/Adelaide','Australia/Hobart'] },
  { code:'GB', name:'United Kingdom', ccy:'GBP', tz:['Europe/London'] },
  { code:'US', name:'United States',  ccy:'USD', tz:['America/New_York','America/Chicago','America/Denver',
                                                     'America/Los_Angeles','America/Phoenix'] },
  { code:'ZZ', name:'Somewhere else', ccy:'USD', tz:[] }
];

const PACKS = {

  /* ------------------------------------------------------------------ */
  generic: {
    id: 'generic',
    locale: null,      // null: the browser's own number and date conventions
    currency: null,    // null: taken from the region

    labels: {
      cash:'Cash & savings', listed:'Investments', retirement:'Retirement account',
      property:'Property', vehicle:'Vehicle', equity:'Employee shares', crypto:'Crypto',
      mortgage:'Mortgage', loan:'Loan', wrapper:'Tax-advantaged account',
      card:'Credit card', other:'Other'
    },

    examples: {
      cash:'e.g. Everyday savings', listed:'e.g. Brokerage account',
      retirement:'e.g. Workplace pension', property:'e.g. Home', vehicle:'e.g. Car',
      equity:'e.g. Company RSUs', crypto:'e.g. Bitcoin', mortgage:'e.g. Home mortgage',
      loan:'e.g. Student loan', wrapper:'e.g. Tax-free savings account',
      card:'e.g. Credit card', other:'e.g. Something I own'
    },

    /* Types whose answer is not in doubt: nothing is asked. The reason is shown
       in one line and can be overridden (J2). */
    defaults: {
      cash:       { access:'accessible', reason:'it’s money in the bank' },
      listed:     { access:'accessible', reason:'listed investments can be sold within days' },
      retirement: { access:'locked',     reason:'a retirement account is locked until you’re eligible to withdraw',
                    until:'until you’re eligible to withdraw' },
      vehicle:    { access:'illiquid',   reason:'you’d have to sell it first' },
      crypto:     { access:'accessible', reason:'it can be sold within days' }
    },

    /* Types that are genuinely ambiguous get ONE question, asking for a fact the
       user already knows — never for the category (J2). `other` is the universal
       question, used for the user's own types and to override any default. */
    questions: {
      property: { ask:'Do you live in it?', answers:[
        { id:'yes', label:'Yes, it’s my home', access:'locked',   reason:'it’s your home', until:'while you live in it' },
        { id:'no',  label:'No',                access:'illiquid', reason:'you’d have to sell it first' } ] },
      equity: { ask:'Has it vested?', answers:[
        { id:'yes', label:'Yes',     access:'accessible', reason:'vested shares are yours to sell' },
        { id:'no',  label:'Not yet', access:'locked',     reason:'unvested shares are locked until they vest', until:'until vesting' } ] },
      wrapper: { ask:'Could you take money out today without a penalty?', answers:[
        { id:'yes', label:'Yes', access:'accessible', reason:'you can take money out without a penalty' },
        { id:'no',  label:'No',  access:'locked',     reason:'taking money out early costs a penalty',
          until:'until you can withdraw without a penalty' } ] },
      other: { ask:'If you needed this money, could you use it within a month?', answers:[
        { id:'now',  label:'Yes',                access:'accessible', reason:'you said you could use it within a month' },
        { id:'sell', label:'Only by selling it', access:'illiquid',   reason:'you said you’d have to sell it first' },
        { id:'tied', label:'No, it’s tied up',   access:'locked',     reason:'you said it’s tied up' } ] }
    },

    /* The guided list for someone who does not know what to list (J1). Each item
       asks only "do you have this?" and "roughly how much?". Where a type needs a
       fact to settle it, the fact is folded into the first question (`answer`). */
    checklist: [
      { u:'cash',       name:'Bank accounts',      ask:'Do you have money in a bank account?',
        amount:'Roughly how much, across all of them?' },
      { u:'retirement', name:'Retirement savings', ask:'Do you have a pension or retirement savings?',
        amount:'Roughly how much?', hint:'Your provider’s app or latest statement shows the total.' },
      { u:'listed',     name:'Investments',        ask:'Any investments — shares, funds, an investing app?',
        amount:'Roughly what are they worth today?' },
      { u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { u:'vehicle',    name:'Car',                ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { u:'loan',       name:'Loans',              ask:'Do you owe anything — a student loan, car loan, mortgage or card balance?',
        amount:'Roughly how much, all together?' }
    ],

    /* One-tap starting points on the empty state (J1): suggestions, not a chart of accounts. */
    starters: [
      { u:'cash',       sub:'Bank accounts, deposits' },
      { u:'retirement', sub:'Workplace or state pension' },
      { u:'property',   sub:'Home or investment' },
      { u:'vehicle',    sub:'Car, motorbike' },
      { u:'listed',     sub:'Brokerage, funds' },
      { u:'loan',       sub:'Mortgage, car, student' }
    ]
  },

  /* ------------------------------------------------------------------ */
  sg: {
    id: 'sg',
    locale: 'en-SG',
    currency: 'SGD',

    labels: {
      cash:'Cash', retirement:'CPF', vehicle:'Car', equity:'RSUs & options',
      mortgage:'Home loan', wrapper:'SRS'
    },

    examples: {
      cash:'e.g. DBS Multiplier', listed:'e.g. IBKR, Endowus', retirement:'e.g. CPF Ordinary Account',
      property:'e.g. HDB flat', vehicle:'e.g. Toyota Corolla', mortgage:'e.g. HDB loan',
      loan:'e.g. Car loan', wrapper:'e.g. SRS account'
    },

    /* In Singapore the tax-advantaged wrapper is SRS, and its answer is not in
       doubt — so where generic asks a question, this pack sets a default. */
    defaults: {
      retirement: { access:'locked', reason:'CPF is locked until you’re eligible to withdraw',
                    until:'until you’re eligible to withdraw' },
      wrapper:    { access:'locked', reason:'SRS withdrawals before retirement age carry a penalty',
                    until:'until retirement age' }
    },

    checklist: [
      { u:'cash',       name:'Bank accounts', ask:'Do you have money in a bank account?',
        amount:'Roughly how much, across all of them?' },
      { u:'retirement', name:'CPF',           ask:'Do you have CPF savings?',
        amount:'Roughly how much, all accounts together?', hint:'The CPF app shows your total.' },
      { u:'listed',     name:'Investments',   ask:'Any investments — shares, funds, a robo-advisor?',
        amount:'Roughly what are they worth today?' },
      { u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { u:'vehicle',    name:'Car',           ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { u:'loan',       name:'Loans',         ask:'Do you owe anything — a study loan, car loan, home loan or card balance?',
        amount:'Roughly how much, all together?' }
    ],

    starters: [
      { u:'cash',       sub:'Bank accounts, fixed deposits' },
      { u:'retirement', sub:'OA, SA, MA' },
      { u:'property',   sub:'HDB, condo, landed' },
      { u:'vehicle',    sub:'Car, motorcycle' },
      { u:'listed',     sub:'Brokerage, robo, funds' },
      { u:'loan',       sub:'Car, study, personal' }
    ]
  }
};
