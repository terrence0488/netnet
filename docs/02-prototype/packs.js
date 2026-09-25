/* NetNet prototype — jurisdiction packs (PRD §2.3, N10).

   DATA, NOT CODE. Nothing in this file is a function, and nothing in app.js
   names a local institution, rule or default. Adding a market means adding an
   entry to PACKS (and a COUNTRY_PACK line pointing a country at it) — no change to the flow.

   A pack lists only what differs from the common default (the generic pack), key by
   key, so a new country is a short file. Its checklist replaces the common one whole;
   its types are added to the universal ones, never instead of them.

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

/* Where someone lives chooses the pack. Every country is listed (ISO 3166-1, plus Kosovo),
   with the currency its totals default to. A country with no pack gets generic, and the
   country is still recorded: that is the demand signal for which pack to write next
   (§2.3, "the second pack is cheap and should wait for demand"). Names come from the
   browser in English; REGION_NAMES only evens out browsers that disagree. */
const COUNTRY_CCY = {
  AD:'EUR', AE:'AED', AF:'AFN', AG:'XCD', AI:'XCD', AL:'ALL', AM:'AMD', AO:'AOA', AR:'ARS',
  AS:'USD', AT:'EUR', AU:'AUD', AW:'AWG', AX:'EUR', AZ:'AZN', BA:'BAM', BB:'BBD', BD:'BDT',
  BE:'EUR', BF:'XOF', BG:'EUR', BH:'BHD', BI:'BIF', BJ:'XOF', BL:'EUR', BM:'BMD', BN:'BND',
  BO:'BOB', BQ:'USD', BR:'BRL', BS:'BSD', BT:'BTN', BV:'NOK', BW:'BWP', BY:'BYN', BZ:'BZD',
  CA:'CAD', CC:'AUD', CD:'CDF', CF:'XAF', CG:'XAF', CH:'CHF', CI:'XOF', CK:'NZD', CL:'CLP',
  CM:'XAF', CN:'CNY', CO:'COP', CR:'CRC', CU:'CUP', CV:'CVE', CW:'XCG', CX:'AUD', CY:'EUR',
  CZ:'CZK', DE:'EUR', DJ:'DJF', DK:'DKK', DM:'XCD', DO:'DOP', DZ:'DZD', EC:'USD', EE:'EUR',
  EG:'EGP', EH:'MAD', ER:'ERN', ES:'EUR', ET:'ETB', FI:'EUR', FJ:'FJD', FK:'FKP', FM:'USD',
  FO:'DKK', FR:'EUR', GA:'XAF', GB:'GBP', GD:'XCD', GE:'GEL', GF:'EUR', GG:'GBP', GH:'GHS',
  GI:'GIP', GL:'DKK', GM:'GMD', GN:'GNF', GP:'EUR', GQ:'XAF', GR:'EUR', GS:'GBP', GT:'GTQ',
  GU:'USD', GW:'XOF', GY:'GYD', HK:'HKD', HM:'AUD', HN:'HNL', HR:'EUR', HT:'HTG', HU:'HUF',
  ID:'IDR', IE:'EUR', IL:'ILS', IM:'GBP', IN:'INR', IO:'USD', IQ:'IQD', IR:'IRR', IS:'ISK',
  IT:'EUR', JE:'GBP', JM:'JMD', JO:'JOD', JP:'JPY', KE:'KES', KG:'KGS', KH:'KHR', KI:'AUD',
  KM:'KMF', KN:'XCD', KP:'KPW', KR:'KRW', KW:'KWD', KY:'KYD', KZ:'KZT', LA:'LAK', LB:'LBP',
  LC:'XCD', LI:'CHF', LK:'LKR', LR:'LRD', LS:'LSL', LT:'EUR', LU:'EUR', LV:'EUR', LY:'LYD',
  MA:'MAD', MC:'EUR', MD:'MDL', ME:'EUR', MF:'EUR', MG:'MGA', MH:'USD', MK:'MKD', ML:'XOF',
  MM:'MMK', MN:'MNT', MO:'MOP', MP:'USD', MQ:'EUR', MR:'MRU', MS:'XCD', MT:'EUR', MU:'MUR',
  MV:'MVR', MW:'MWK', MX:'MXN', MY:'MYR', MZ:'MZN', NA:'NAD', NC:'XPF', NE:'XOF', NF:'AUD',
  NG:'NGN', NI:'NIO', NL:'EUR', NO:'NOK', NP:'NPR', NR:'AUD', NU:'NZD', NZ:'NZD', OM:'OMR',
  PA:'USD', PE:'PEN', PF:'XPF', PG:'PGK', PH:'PHP', PK:'PKR', PL:'PLN', PM:'EUR', PN:'NZD',
  PR:'USD', PS:'ILS', PT:'EUR', PW:'USD', PY:'PYG', QA:'QAR', RE:'EUR', RO:'RON', RS:'RSD',
  RU:'RUB', RW:'RWF', SA:'SAR', SB:'SBD', SC:'SCR', SD:'SDG', SE:'SEK', SG:'SGD', SH:'SHP',
  SI:'EUR', SJ:'NOK', SK:'EUR', SL:'SLE', SM:'EUR', SN:'XOF', SO:'SOS', SR:'SRD', SS:'SSP',
  ST:'STN', SV:'USD', SX:'XCG', SY:'SYP', SZ:'SZL', TC:'USD', TD:'XAF', TF:'EUR', TG:'XOF',
  TH:'THB', TJ:'TJS', TK:'NZD', TL:'USD', TM:'TMT', TN:'TND', TO:'TOP', TR:'TRY', TT:'TTD',
  TV:'AUD', TW:'TWD', TZ:'TZS', UA:'UAH', UG:'UGX', UM:'USD', US:'USD', UY:'UYU', UZ:'UZS',
  VA:'EUR', VC:'XCD', VE:'VES', VG:'USD', VI:'USD', VN:'VND', VU:'VUV', WF:'XPF', WS:'WST',
  XK:'EUR', YE:'YER', YT:'EUR', ZA:'ZAR', ZM:'ZMW', ZW:'ZWG'
};
const COUNTRY_PACK = { SG:'sg', MY:'my', GB:'gb' };
const REGION_NAMES = { HK:'Hong Kong', MO:'Macao' };

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

    /* Extra default types, on top of the universal ones. The common default adds none:
       a pack adds a type only where it is common enough in that country to deserve its
       own name (Singapore's car loan). Each is a local name for universal behaviour. */
    types: [],

    /* The basics: the guided list for someone who does not know what to list (J1), asked
       in onboarding, one question per screen. Each item asks only "do you have this?"
       and "roughly how much?". Where a type needs a fact to settle it, the fact is folded
       into the question (`answer`). `onlyIf` asks a follow-up only after a yes to the
       item it names. `type` files the answer under one of this pack's own types. */
    checklist: [
      { id:'bank',    u:'cash',       name:'Bank accounts',      ask:'Do you have money in a bank account?',
        amount:'Roughly how much, across all of them?' },
      { id:'pension', u:'retirement', name:'Retirement savings', ask:'Do you have a pension or retirement savings?',
        amount:'Roughly how much?', hint:'Your provider’s app or latest statement shows the total.' },
      { id:'invest',  u:'listed',     name:'Investments',        ask:'Any investments — shares, funds, an investing app?',
        amount:'Roughly what are they worth today?' },
      { id:'home',    u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { id:'car',     u:'vehicle',    name:'Car',                ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { id:'owed',    u:'loan',       name:'Loans',              ask:'Do you owe anything — a student loan, car loan, mortgage or card balance?',
        amount:'Roughly how much, all together?' }
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

    /* Car loans are common in Singapore, so a car loan is a default type of its own
       rather than a generic "Loan". A country where cars are usually bought outright
       (Japan, say) stays on the common default and never sees it. */
    types: [
      { key:'car_loan', u:'loan', label:'Car loan', example:'e.g. DBS car loan' }
    ],

    /* Home and car each get a follow-up about the loan on them, because in Singapore
       that is usually the biggest thing owed; "anything else" then catches the rest. */
    checklist: [
      { id:'bank',      u:'cash',       name:'Bank accounts', ask:'Do you have money in a bank account?',
        amount:'Roughly how much, across all of them?' },
      { id:'cpf',       u:'retirement', name:'CPF',           ask:'Do you have CPF savings?',
        amount:'Roughly how much, all accounts together?', hint:'The CPF app shows your total.' },
      { id:'invest',    u:'listed',     name:'Investments',   ask:'Any investments — shares, funds, a robo-advisor?',
        amount:'Roughly what are they worth today?' },
      { id:'home',      u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { id:'home_loan', u:'mortgage',   name:'Home loan', onlyIf:'home', ask:'Is there a home loan on it?',
        amount:'Roughly how much is left to pay?', hint:'Your latest loan statement shows what’s outstanding.' },
      { id:'car',       u:'vehicle',    name:'Car',           ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { id:'car_loan',  u:'loan', type:'car_loan', name:'Car loan', onlyIf:'car', ask:'Is there a car loan on it?',
        amount:'Roughly how much is left to pay?' },
      { id:'owed',      u:'loan',       name:'Other loans',   ask:'Anything else you owe — a study loan, a personal loan or a card balance?',
        amount:'Roughly how much, all together?' }
    ]
  },

  /* ------------------------------------------------------------------ */
  my: {
    id: 'my',
    locale: 'en-MY',
    currency: 'MYR',

    labels: {
      cash:'Cash', retirement:'EPF', vehicle:'Car', mortgage:'Home loan', wrapper:'PRS'
    },

    examples: {
      cash:'e.g. Maybank savings', listed:'e.g. Rakuten Trade, StashAway', retirement:'e.g. EPF Akaun Persaraan',
      property:'e.g. Condo in PJ', vehicle:'e.g. Perodua Myvi', mortgage:'e.g. Housing loan',
      loan:'e.g. PTPTN loan', wrapper:'e.g. PRS fund'
    },

    /* Hire purchase makes a car loan as ordinary here as in Singapore. */
    types: [
      { key:'car_loan', u:'loan', label:'Car loan', example:'e.g. Hire purchase on the Myvi' }
    ],

    defaults: {
      wrapper: { access:'locked', reason:'PRS withdrawals before retirement age carry a tax penalty',
                 until:'until retirement age' }
    },

    /* Where the common default has a fixed rule, a pack may ask instead. EPF is not all
       locked: Akaun Fleksibel can be withdrawn at any time, so the fact decides it. */
    questions: {
      retirement: { ask:'Is this your EPF Akaun Fleksibel?', answers:[
        { id:'yes', label:'Yes, Akaun Fleksibel', access:'accessible', reason:'Akaun Fleksibel can be withdrawn at any time' },
        { id:'no',  label:'No',                  access:'locked',     reason:'EPF is locked until you’re eligible to withdraw',
          until:'until you’re eligible to withdraw' } ] }
    },

    checklist: [
      { id:'bank',      u:'cash',       name:'Bank accounts', ask:'Do you have money in a bank account?',
        amount:'Roughly how much, across all of them?' },
      { id:'epf',       u:'retirement', name:'EPF', answer:'no', ask:'Do you have EPF savings?',
        amount:'Roughly how much in Akaun Persaraan and Akaun Sejahtera?', hint:'The KWSP app shows each account.' },
      { id:'epf_flex',  u:'retirement', name:'EPF Akaun Fleksibel', answer:'yes', onlyIf:'epf',
        ask:'Anything in Akaun Fleksibel?', amount:'Roughly how much?', hint:'This part you can withdraw at any time.' },
      { id:'invest',    u:'listed',     name:'Investments',   ask:'Any investments — shares, unit trusts, an investing app?',
        amount:'Roughly what are they worth today?' },
      { id:'home',      u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { id:'home_loan', u:'mortgage',   name:'Home loan', onlyIf:'home', ask:'Is there a home loan on it?',
        amount:'Roughly how much is left to pay?', hint:'Your latest loan statement shows what’s outstanding.' },
      { id:'car',       u:'vehicle',    name:'Car',           ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { id:'car_loan',  u:'loan', type:'car_loan', name:'Car loan', onlyIf:'car', ask:'Is there a car loan on it?',
        amount:'Roughly how much is left to pay?' },
      { id:'owed',      u:'loan',       name:'Other loans',   ask:'Anything else you owe — a PTPTN loan, a personal loan or a card balance?',
        amount:'Roughly how much, all together?' }
    ]
  },

  /* ------------------------------------------------------------------ */
  gb: {
    id: 'gb',
    locale: 'en-GB',
    currency: 'GBP',

    labels: {
      cash:'Cash & savings', retirement:'Pension', vehicle:'Car', mortgage:'Mortgage', wrapper:'ISA'
    },

    examples: {
      cash:'e.g. Monzo, Premium Bonds', listed:'e.g. Vanguard, Trading 212', retirement:'e.g. Workplace pension',
      property:'e.g. Flat in Leeds', vehicle:'e.g. Ford Focus', mortgage:'e.g. Nationwide mortgage',
      loan:'e.g. Student loan', wrapper:'e.g. Stocks & Shares ISA'
    },

    /* In the UK a car is usually bought on finance (PCP or HP), so it gets its own name. */
    types: [
      { key:'car_finance', u:'loan', label:'Car finance', example:'e.g. PCP on the Focus' }
    ],

    /* An ISA is left to the common question: most can be emptied at any time, a
       Lifetime ISA cannot, and the owner knows which they have. */
    defaults: {
      retirement: { access:'locked', reason:'a pension is locked until you can start drawing it',
                    until:'until you can draw it' }
    },

    checklist: [
      { id:'bank',      u:'cash',       name:'Bank accounts', ask:'Do you have money in a bank or savings account?',
        amount:'Roughly how much, across all of them?' },
      { id:'pension',   u:'retirement', name:'Pensions',      ask:'Do you have a workplace or personal pension?',
        amount:'Roughly how much, all of them together?', hint:'Your provider’s app or annual statement shows the value.' },
      { id:'invest',    u:'listed',     name:'Investments',   ask:'Any investments — an ISA, funds, shares, an investing app?',
        amount:'Roughly what are they worth today?' },
      { id:'home',      u:'property',   name:'Home', answer:'yes', ask:'Do you own the home you live in?',
        amount:'Roughly what would it sell for?' },
      { id:'mortgage',  u:'mortgage',   name:'Mortgage', onlyIf:'home', ask:'Is there a mortgage on it?',
        amount:'Roughly how much is left to pay?', hint:'Your latest mortgage statement shows what’s outstanding.' },
      { id:'car',       u:'vehicle',    name:'Car',           ask:'Do you own a car?',
        amount:'Roughly what would it sell for?' },
      { id:'car_finance', u:'loan', type:'car_finance', name:'Car finance', onlyIf:'car', ask:'Is there finance on it?',
        amount:'Roughly how much is left to pay?' },
      { id:'owed',      u:'loan',       name:'Other loans',   ask:'Anything else you owe — a student loan, a personal loan or a credit card?',
        amount:'Roughly how much, all together?' }
    ]
  }
};
