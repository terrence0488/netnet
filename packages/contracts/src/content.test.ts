import { describe, expect, expectTypeOf, it } from 'vitest';
import chatgptJson from '../../../content/agents/chatgpt.json' with { type: 'json' };
import claudeJson from '../../../content/agents/claude.json' with { type: 'json' };
import otherJson from '../../../content/agents/other.json' with { type: 'json' };
import countriesJson from '../../../content/countries.json' with { type: 'json' };
import gbJson from '../../../content/packs/gb.json' with { type: 'json' };
import genericJson from '../../../content/packs/generic.json' with { type: 'json' };
import myJson from '../../../content/packs/my.json' with { type: 'json' };
import sgJson from '../../../content/packs/sg.json' with { type: 'json' };
import denyList from '../../../test/n10/deny-list.json' with { type: 'json' };
import {
  CONTENT_SET,
  UNIVERSALS,
  agentGuideSchema,
  countriesSchema,
  packSchema,
  validateContent,
  type Access,
  type AgentGuide,
  type ContentDoc,
  type ContentError,
  type Countries,
  type Outcome,
  type Pack,
  type Universal,
} from './content';

/* ---- architecture §7.8, verbatim: the contract the inferred types must equal ---- */

type SpecUniversal =
  | 'cash'
  | 'listed'
  | 'retirement'
  | 'property'
  | 'vehicle'
  | 'equity'
  | 'crypto'
  | 'mortgage'
  | 'loan'
  | 'wrapper'
  | 'card'
  | 'other';
type SpecAccess = 'accessible' | 'illiquid' | 'locked';
type SpecOutcome = { access: SpecAccess; reason: string; until?: string };
/** §7.8 writes an answer as an intersection; flattened, the check compares its members. */
type Flat<T> = { [K in keyof T]: T[K] };
type SpecPack = {
  id: string;
  locale: string | null;
  currency: string | null;
  labels: Partial<Record<SpecUniversal, string>>;
  examples: Partial<Record<SpecUniversal, string>>;
  meaning: Partial<Record<SpecUniversal, string>>;
  cadenceDays: Partial<Record<SpecUniversal, number>>;
  defaults: Partial<Record<SpecUniversal, SpecOutcome>>;
  questions: Partial<
    Record<
      SpecUniversal,
      { ask: string; answers: Flat<{ id: string; label: string } & SpecOutcome>[] }
    >
  >;
  types: { key: string; u: SpecUniversal; label: string; example?: string }[];
  checklist: {
    id: string;
    u: SpecUniversal;
    type?: string;
    name: string;
    ask: string;
    amount: string;
    answer?: string;
    onlyIf?: string;
    hint?: string;
  }[];
};
type SpecCountries = Record<string, { currency: string; pack?: string }>;
type SpecAgentGuide = {
  id: string;
  name: string;
  logo?: string;
  listed: boolean;
  order: number;
  plans?: string;
  prefillUrl?: string;
  matchHosts?: string[];
  platforms: Partial<
    Record<
      'phone' | 'computer' | 'any',
      { steps: { text: string; image?: string; prompt?: string }[] }
    >
  >;
};

/* ---- the real content, and fresh typed copies of it to break one rule at a time ---- */

const REAL_DOCS: ContentDoc[] = [
  { kind: 'pack', doc: 'packs/generic.json', body: genericJson },
  { kind: 'pack', doc: 'packs/sg.json', body: sgJson },
  { kind: 'pack', doc: 'packs/my.json', body: myJson },
  { kind: 'pack', doc: 'packs/gb.json', body: gbJson },
  { kind: 'countries', doc: 'countries.json', body: countriesJson },
  { kind: 'agent', doc: 'agents/claude.json', body: claudeJson },
  { kind: 'agent', doc: 'agents/chatgpt.json', body: chatgptJson },
  { kind: 'agent', doc: 'agents/other.json', body: otherJson },
];

const copyOf = (body: unknown): unknown => JSON.parse(JSON.stringify(body));

interface Content {
  packs: Pack[];
  countries: Countries;
  agents: AgentGuide[];
}

/** A fresh, valid copy of the real content. */
function content(): Content {
  return {
    packs: [genericJson, sgJson, myJson, gbJson].map((p) => packSchema.parse(copyOf(p))),
    countries: countriesSchema.parse(copyOf(countriesJson)),
    agents: [claudeJson, chatgptJson, otherJson].map((g) => agentGuideSchema.parse(copyOf(g))),
  };
}

const toDocs = ({ packs, countries, agents }: Content): ContentDoc[] => [
  ...packs.map((body): ContentDoc => ({ kind: 'pack', doc: `packs/${body.id}.json`, body })),
  { kind: 'countries', doc: 'countries.json', body: countries },
  ...agents.map((body): ContentDoc => ({ kind: 'agent', doc: `agents/${body.id}.json`, body })),
];

function errorsOf(docs: readonly ContentDoc[]): ContentError[] {
  const result = validateContent(docs);
  return result.ok ? [] : result.errors;
}

/** The errors once `change` has been applied to a valid copy, as `doc path` pairs. */
function breaking(change: (c: Content) => void): string[] {
  const c = content();
  change(c);
  return errorsOf(toDocs(c)).map((e) => `${e.doc} ${e.path}`);
}

function pack(c: Content, id: string): Pack {
  const found = c.packs.find((p) => p.id === id);
  if (!found) throw new Error(`no pack ${id}`);
  return found;
}

function guide(c: Content, id: string): AgentGuide {
  const found = c.agents.find((g) => g.id === id);
  if (!found) throw new Error(`no guide ${id}`);
  return found;
}

function item(p: Pack, id: string): Pack['checklist'][number] {
  const found = p.checklist.find((i) => i.id === id);
  if (!found) throw new Error(`no checklist item ${id}`);
  return found;
}

/** A small invented pack, so a test needs no real scheme's name. */
const zz = (): Pack => ({
  id: 'zz',
  locale: 'en-GB',
  currency: 'EUR',
  labels: { retirement: 'Fund' },
  examples: {},
  meaning: {},
  cadenceDays: {},
  defaults: {},
  questions: {},
  types: [{ key: 'boat_loan', u: 'loan', label: 'Boat loan' }],
  checklist: [
    { id: 'boat', u: 'vehicle', name: 'Boat', ask: 'Do you own a boat?', amount: 'Worth?' },
    {
      id: 'boat_loan',
      u: 'loan',
      type: 'boat_loan',
      name: 'Boat loan',
      ask: 'Is there a loan on it?',
      amount: 'How much is left?',
      onlyIf: 'boat',
    },
  ],
});

/* ---------------------------------------------------------------- tests */

describe('content schemas', () => {
  it('infer exactly the types of architecture §7.8', () => {
    expectTypeOf<Universal>().toEqualTypeOf<SpecUniversal>();
    expectTypeOf<Access>().toEqualTypeOf<SpecAccess>();
    expectTypeOf<Outcome>().toEqualTypeOf<SpecOutcome>();
    expectTypeOf<Pack>().toEqualTypeOf<SpecPack>();
    expectTypeOf<Countries>().toEqualTypeOf<SpecCountries>();
    expectTypeOf<AgentGuide>().toEqualTypeOf<SpecAgentGuide>();
  });

  it('accept every real document, and the real content validates as a whole', () => {
    for (const { kind, doc, body } of REAL_DOCS) {
      const schema = { pack: packSchema, countries: countriesSchema, agent: agentGuideSchema }[
        kind
      ];
      expect(schema.safeParse(body).error?.issues, doc).toBeUndefined();
    }
    expect(validateContent(REAL_DOCS)).toStrictEqual({ ok: true });
  });

  it('reject an unknown key, an empty text and a wrong type, naming where', () => {
    const c = content();
    const sg = pack(c, 'sg');
    Object.assign(sg.types[0] ?? {}, { exmaple: 'typo' });
    item(sg, 'bank').ask = '';
    (sg.cadenceDays as Record<string, unknown>).cash = '30';
    const errors = errorsOf(toDocs(c));
    expect(errors.map((e) => `${e.doc} ${e.path}`)).toStrictEqual([
      'packs/sg.json cadenceDays.cash',
      'packs/sg.json types[0]',
      'packs/sg.json checklist[0].ask',
    ]);
    expect(errors[1]?.message).toBe('Unrecognized key: "exmaple"');
    expect(errors[2]?.message).toBe('Write the text; it cannot be empty.');
  });

  it('reject a type that is not universal, and a reserved answer id', () => {
    expect(
      breaking((c) => {
        (pack(c, 'gb').labels as Record<string, string>).boat = 'Boat';
        const other = pack(c, 'generic').questions.other;
        if (other?.answers[0]) other.answers[0].id = 'not_sure';
      }),
    ).toStrictEqual(['packs/generic.json questions.other.answers[0].id', 'packs/gb.json labels']);
  });

  it('reject a country key that is not an ISO 3166-1 code, with the code format’s message', () => {
    const c = content();
    c.countries.ZZZ = { currency: 'EUR' };
    expect(errorsOf(toDocs(c))).toStrictEqual([
      {
        doc: 'countries.json',
        path: 'ZZZ',
        message: 'Use an ISO 3166-1 alpha-2 code in capitals, such as "SG".',
      },
    ]);
  });
});

describe('validateContent: the rules of architecture §7.8', () => {
  it('generic defines every label, meaning and cadence', () => {
    expect(
      breaking((c) => {
        const g = pack(c, 'generic');
        delete g.labels.card;
        delete g.meaning.crypto;
        delete g.cadenceDays.other;
      }),
    ).toStrictEqual([
      'packs/generic.json labels.card',
      'packs/generic.json meaning.crypto',
      'packs/generic.json cadenceDays.other',
    ]);
  });

  it('generic defines the other question', () => {
    expect(breaking((c) => delete pack(c, 'generic').questions.other)).toStrictEqual([
      'packs/generic.json questions.other',
    ]);
  });

  it('every onlyIf names an earlier checklist item', () => {
    expect(
      breaking((c) => {
        const p = zz();
        p.checklist.reverse();
        c.packs.push(p);
        item(pack(c, 'gb'), 'mortgage').onlyIf = 'nowhere';
      }),
    ).toStrictEqual(['packs/gb.json checklist[4].onlyIf', 'packs/zz.json checklist[0].onlyIf']);
  });

  it('every type names a pack type', () => {
    expect(
      breaking((c) => {
        const p = zz();
        p.types = [];
        c.packs.push(p);
      }),
    ).toStrictEqual(['packs/zz.json checklist[1].type']);
  });

  it('answer ids are unique within a question', () => {
    expect(
      breaking((c) => {
        const answers = pack(c, 'generic').questions.other?.answers ?? [];
        answers.push({ id: 'sell', label: 'Again', access: 'locked', reason: 'it’s tied up' });
      }),
    ).toStrictEqual(['packs/generic.json questions.other.answers[3].id']);
  });

  it('every country’s currency is ISO 4217', () => {
    expect(
      breaking((c) => {
        c.countries.XK = { currency: 'XYZ' };
        c.countries.ZZ = { currency: 'eur' };
      }),
    ).toStrictEqual(['countries.json XK.currency', 'countries.json ZZ.currency']);
  });

  it('pack ids are unique', () => {
    const docs = [...REAL_DOCS, { kind: 'pack', doc: 'packs/copy.json', body: gbJson } as const];
    expect(errorsOf(docs)).toStrictEqual([
      {
        doc: 'packs/copy.json',
        path: 'id',
        message: 'Pack id "gb" is already used by packs/gb.json.',
      },
    ]);
  });

  it('the other guide has only any steps, no images, no logo and no matchHosts', () => {
    expect(
      breaking((c) => {
        const other = guide(c, 'other');
        const steps = other.platforms.any?.steps ?? [];
        other.platforms.phone = { steps: [{ text: 'Open it.' }] };
        if (steps[0]) steps[0].image = 'images/connect/other-any-1.png';
        other.logo = 'images/agents/other.svg';
        other.matchHosts = ['agent.example'];
      }),
    ).toStrictEqual([
      'agents/other.json platforms.phone',
      'agents/other.json platforms.any.steps[0].image',
      'agents/other.json logo',
      'agents/other.json matchHosts',
    ]);
  });

  it('every other listed guide has a logo and matchHosts', () => {
    expect(
      breaking((c) => {
        const claude = guide(c, 'claude');
        delete claude.logo;
        delete claude.matchHosts;
        const unlisted = guide(c, 'chatgpt');
        unlisted.listed = false;
        delete unlisted.logo;
        delete unlisted.matchHosts;
      }),
    ).toStrictEqual(['agents/claude.json logo', 'agents/claude.json matchHosts']);
  });

  it('no host is claimed twice', () => {
    expect(
      breaking((c) => {
        const hosts = guide(c, 'chatgpt').matchHosts ?? [];
        hosts.push(guide(c, 'claude').matchHosts?.[0] ?? '', 'agent.example', 'agent.example');
      }),
    ).toStrictEqual(['agents/chatgpt.json matchHosts[2]', 'agents/chatgpt.json matchHosts[4]']);
  });
});

describe('validateContent: integrity, so every reference resolves', () => {
  it('there is a generic pack, unless a pack failed its schema', () => {
    const withoutGeneric = REAL_DOCS.filter((d) => d.doc !== 'packs/generic.json');
    expect(errorsOf(withoutGeneric)).toStrictEqual([
      {
        doc: CONTENT_SET,
        path: '',
        message: 'There is no generic pack. Add one with id "generic".',
      },
    ]);
    const broken = { kind: 'pack', doc: 'packs/generic.json', body: { id: 'generic' } } as const;
    expect(errorsOf([...withoutGeneric, broken]).map((e) => e.doc)).not.toContain(CONTENT_SET);
  });

  it('there is one country list', () => {
    const withoutCountries = REAL_DOCS.filter((d) => d.kind !== 'countries');
    expect(errorsOf(withoutCountries).map((e) => `${e.doc} ${e.path}`)).toStrictEqual([
      `${CONTENT_SET} `,
    ]);
    const twice = [...REAL_DOCS, { kind: 'countries', doc: 'more.json', body: {} } as const];
    expect(errorsOf(twice).map((e) => `${e.doc} ${e.path}`)).toStrictEqual(['more.json ']);
  });

  it('a country’s pack exists', () => {
    expect(breaking((c) => (c.countries.XK = { currency: 'EUR', pack: 'xk' }))).toStrictEqual([
      'countries.json XK.pack',
    ]);
  });

  it('checklist ids and pack type keys are unique within a pack', () => {
    expect(
      breaking((c) => {
        const p = zz();
        p.checklist.push({ id: 'boat', u: 'vehicle', name: 'Boat', ask: 'A?', amount: 'B?' });
        p.types.push({ key: 'boat_loan', u: 'loan', label: 'Again' });
        c.packs.push(p);
      }),
    ).toStrictEqual(['packs/zz.json checklist[2].id', 'packs/zz.json types[1].key']);
  });

  it('a checklist item’s universal is its type’s', () => {
    expect(
      breaking((c) => {
        const p = zz();
        const loan = p.checklist[1];
        if (loan) loan.u = 'mortgage';
        c.packs.push(p);
      }),
    ).toStrictEqual(['packs/zz.json checklist[1].u']);
  });

  it('a checklist answer answers the question for its universal', () => {
    expect(
      breaking((c) => {
        const p = zz();
        const boat = p.checklist[0];
        if (boat) boat.answer = 'yes';
        item(pack(c, 'generic'), 'home').answer = 'maybe';
        c.packs.push(p);
      }),
    ).toStrictEqual([
      'packs/generic.json checklist[3].answer',
      'packs/zz.json checklist[0].answer',
    ]);
  });

  it('a pack’s own question is the one its checklist answers', () => {
    expect(
      breaking((c) => {
        const p = zz();
        p.questions.vehicle = {
          ask: 'Is it moored?',
          answers: [
            { id: 'moored', label: 'Yes', access: 'illiquid', reason: 'you’d have to sell it' },
            { id: 'afloat', label: 'No', access: 'illiquid', reason: 'you’d have to sell it' },
          ],
        };
        const boat = p.checklist[0];
        if (boat) boat.answer = 'moored';
        c.packs.push(p);
      }),
    ).toStrictEqual([]);
  });

  it('guide ids are unique', () => {
    const docs = [
      ...REAL_DOCS,
      { kind: 'agent', doc: 'agents/copy.json', body: otherJson } as const,
    ];
    expect(errorsOf(docs).map((e) => `${e.doc} ${e.path}`)).toStrictEqual(['agents/copy.json id']);
  });

  it('returns every error, in every document, not the first', () => {
    const errors = breaking((c) => {
      delete pack(c, 'generic').labels.card;
      item(pack(c, 'gb'), 'mortgage').onlyIf = 'nowhere';
      c.countries.XK = { currency: 'XYZ' };
      delete guide(c, 'claude').logo;
    });
    expect(errors).toHaveLength(4);
  });
});

/* ---------------------------------------------------------------- the starting content */

/** ISO 3166-1 alpha-2, every officially assigned code. */
const ISO_3166_1 = (
  'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR ' +
  'BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ ' +
  'EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW ' +
  'GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY ' +
  'KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV ' +
  'MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY ' +
  'QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG ' +
  'TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
).split(' ');

/** Every text a pack holds, for the copy rules. */
function texts(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(texts);
  if (typeof value === 'object' && value !== null) return Object.values(value).flatMap(texts);
  return [];
}

describe('the starting content', () => {
  const c = content();

  it('has the generic, SG, MY and GB packs', () => {
    expect(c.packs.map((p) => p.id)).toStrictEqual(['generic', 'sg', 'my', 'gb']);
    const generic = pack(c, 'generic');
    for (const u of UNIVERSALS) {
      expect(generic.labels[u], u).toBeTruthy();
      expect(generic.meaning[u], u).toBeTruthy();
      expect(generic.cadenceDays[u], u).toBeGreaterThan(0);
    }
  });

  it('lists every country (ISO 3166-1 but Antarctica, which has no currency) and Kosovo', () => {
    const expected = [...ISO_3166_1.filter((code) => code !== 'AQ'), 'XK'].sort();
    expect(Object.keys(c.countries).sort()).toStrictEqual(expected);
  });

  it('points SG, MY and GB at their packs, and no other country at any pack', () => {
    const packed = Object.entries(c.countries).filter(([, country]) => country.pack !== undefined);
    expect(Object.fromEntries(packed.map(([code, country]) => [code, country.pack]))).toStrictEqual(
      {
        GB: 'gb',
        MY: 'my',
        SG: 'sg',
      },
    );
  });

  it('names no local scheme in the generic pack', () => {
    const words = [
      ...denyList.caseSensitive.map((t) => ({ t, flags: '' })),
      ...denyList.caseInsensitive.map((t) => ({ t, flags: 'i' })),
    ].map(({ t, flags }) => {
      const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`, flags);
    });
    const found = texts(pack(c, 'generic')).filter((s) => words.some((w) => w.test(s)));
    expect(found).toStrictEqual([]);
  });

  it('states no age in a reason or an until', () => {
    const outcomes = c.packs.flatMap((p) => [
      ...Object.values(p.defaults),
      ...Object.values(p.questions).flatMap((q) => q.answers),
    ]);
    expect(outcomes.length).toBeGreaterThan(0);
    expect(texts(outcomes.map((o) => [o.reason, o.until])).filter((s) => /\d/.test(s))).toEqual([]);
  });

  it('gives Claude and ChatGPT phone and computer steps, a screenshot per step and the rest', () => {
    for (const id of ['claude', 'chatgpt']) {
      const g = guide(c, id);
      expect(Object.keys(g.platforms).sort(), id).toStrictEqual(['computer', 'phone']);
      for (const platform of ['computer', 'phone'] as const) {
        const steps = g.platforms[platform]?.steps ?? [];
        expect(steps.length, `${id} ${platform}`).toBeGreaterThan(0);
        expect(steps.map((s) => s.image)).toStrictEqual(
          steps.map((_, i) => `images/connect/${id}-${platform}-${i + 1}.png`),
        );
      }
      expect(g.logo).toBe(`images/agents/${id}.svg`);
      expect(g.prefillUrl).toMatch(/^https:\/\/.+\{prompt\}$/);
      expect(g.matchHosts?.length).toBeGreaterThan(0);
      expect(g.listed).toBe(true);
    }
  });

  it('gives Other agent its steps under any, with no images, logo or hosts', () => {
    const other = guide(c, 'other');
    expect(Object.keys(other.platforms)).toStrictEqual(['any']);
    expect(other.platforms.any?.steps.every((s) => s.image === undefined)).toBe(true);
    expect([other.logo, other.matchHosts, other.prefillUrl]).toStrictEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('orders the listed guides Claude, ChatGPT, Other agent', () => {
    const listed = c.agents.filter((g) => g.listed).sort((a, b) => a.order - b.order);
    expect(listed.map((g) => g.id)).toStrictEqual(['claude', 'chatgpt', 'other']);
  });
});
