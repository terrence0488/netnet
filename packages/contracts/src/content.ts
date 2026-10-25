import { z } from 'zod';

/**
 * Administered content (architecture §6.5, §7.8): jurisdiction packs, the country list and the
 * agent setup guides. The schemas check each document's shape and formats; `validateContent`
 * checks the rules that relate parts of a document or several documents (§7.8 "Validation").
 * A publish is all or nothing, so every error is returned, never only the first.
 */

/* ---------------------------------------------------------------- formats */

/** Text shown to a person or told to an agent. */
const copy = z
  .string()
  .min(1, 'Write the text; it cannot be empty.')
  .refine((s) => s.trim() === s, 'Remove the space at the start or end.');

/** A key other content refers to: a checklist item, a pack type, an answer or a guide. */
const slug = z
  .string()
  .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, digits and _, starting with a letter.');

/** `generic`, or a country's ISO 3166-1 alpha-2 code in lowercase. */
const packKey = z
  .string()
  .regex(/^(generic|[a-z]{2})$/, 'Use "generic" or a lowercase ISO 3166-1 code, such as "sg".');

const countryCode = z
  .string()
  .regex(/^[A-Z]{2}$/, 'Use an ISO 3166-1 alpha-2 code in capitals, such as "SG".');

/** A country as the country list keys it: ISO 3166-1 alpha-2, in capitals. */
export const countryCodeSchema = countryCode;

const locale = z.string().refine((s) => {
  try {
    return Intl.getCanonicalLocales(s)[0] === s;
  } catch {
    return false;
  }
}, 'Use a canonical BCP 47 locale, such as "en-SG".');

/**
 * ISO 4217 codes of the currencies in circulation: List One without funds, precious metals,
 * bond-market units, special drawing rights and the testing and no-currency codes.
 */
const CURRENCIES: ReadonlySet<string> = new Set(
  (
    'AED AFN ALL AMD AOA ARS AUD AWG AZN BAM BBD BDT BHD BIF BMD BND BOB BRL BSD BTN BWP BYN ' +
    'BZD CAD CDF CHF CLP CNY COP CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP ' +
    'GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS ' +
    'KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR ' +
    'MVR MWK MXN MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD ' +
    'RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP ' +
    'TRY TTD TWD TZS UAH UGX USD UYU UZS VED VES VND VUV WST XAF XCD XCG XOF XPF YER ZAR ZMW ZWG'
  ).split(' '),
);

const currency = z
  .string()
  .refine(
    (c) => CURRENCIES.has(c),
    'Use the ISO 4217 code of a currency in circulation, such as "SGD".',
  );

/** A content image, as a path under content/: `images/<folder>/<name>.<ext>`. */
const imagePath = z
  .string()
  .regex(
    /^images(\/[a-z0-9][a-z0-9_-]*)+\.(png|jpg|jpeg|webp|svg)$/,
    'Use a path under content/, such as "images/connect/claude-phone-1.png".',
  );

const host = z
  .string()
  .regex(
    /^(?=.{1,253}$)[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/,
    'Use a lowercase host name, such as "claude.ai", with no scheme or path.',
  );

/** Where `prefillUrl` puts the URL-encoded prompt. */
export const PROMPT_SLOT = '{prompt}';

const prefillUrl = z
  .string()
  .refine(
    (s) => /^https:\/\/\S+$/.test(s) && s.includes(PROMPT_SLOT),
    `Use an https:// address with ${PROMPT_SLOT} where the prompt goes.`,
  );

/** An answer id the API reserves for "Not sure" (architecture §7.4, `access_answer`). */
const NOT_SURE = 'not_sure';

/* ---------------------------------------------------------------- schemas */

/** The universal types. Types are universal; only labels are local (PRD §2.3). */
export const UNIVERSALS = [
  'cash',
  'listed',
  'retirement',
  'property',
  'vehicle',
  'equity',
  'crypto',
  'mortgage',
  'loan',
  'wrapper',
  'card',
  'other',
] as const;
export const universalSchema = z.enum(UNIVERSALS);
export type Universal = z.infer<typeof universalSchema>;

export const ACCESSES = ['accessible', 'illiquid', 'locked'] as const;
export const accessSchema = z.enum(ACCESSES);
export type Access = z.infer<typeof accessSchema>;

export const outcomeSchema = z.strictObject({
  access: accessSchema,
  reason: copy,
  until: copy.exactOptional(),
});
export type Outcome = z.infer<typeof outcomeSchema>;

const answerSchema = z.strictObject({
  id: slug.refine(
    (id) => id !== NOT_SURE,
    `"${NOT_SURE}" is reserved for an undecided answer; use another id.`,
  ),
  label: copy,
  ...outcomeSchema.shape,
});

const questionSchema = z.strictObject({
  ask: copy,
  answers: z.array(answerSchema).min(2, 'A question needs at least two answers.'),
});

const byUniversal = <T extends z.ZodType>(value: T) => z.partialRecord(universalSchema, value);

export const packSchema = z.strictObject({
  id: packKey,
  locale: locale.nullable(),
  currency: currency.nullable(),
  labels: byUniversal(copy),
  examples: byUniversal(copy),
  meaning: byUniversal(copy),
  cadenceDays: byUniversal(z.int().positive()),
  defaults: byUniversal(outcomeSchema),
  questions: byUniversal(questionSchema),
  types: z.array(
    z.strictObject({ key: slug, u: universalSchema, label: copy, example: copy.exactOptional() }),
  ),
  checklist: z.array(
    z.strictObject({
      id: slug,
      u: universalSchema,
      type: slug.exactOptional(),
      name: copy,
      ask: copy,
      amount: copy,
      answer: slug.exactOptional(),
      onlyIf: slug.exactOptional(),
      hint: copy.exactOptional(),
    }),
  ),
});
export type Pack = z.infer<typeof packSchema>;

export const countriesSchema = z.record(
  countryCode,
  z.strictObject({ currency, pack: packKey.exactOptional() }),
);
export type Countries = z.infer<typeof countriesSchema>;

export const PLATFORMS = ['phone', 'computer', 'any'] as const;
export const platformSchema = z.enum(PLATFORMS);
export type Platform = z.infer<typeof platformSchema>;

const stepSchema = z.strictObject({
  text: copy,
  image: imagePath.exactOptional(),
  prompt: copy.exactOptional(),
});

export const agentGuideSchema = z.strictObject({
  id: slug,
  name: copy,
  logo: imagePath.exactOptional(),
  listed: z.boolean(),
  order: z.int().nonnegative(),
  plans: copy.exactOptional(),
  prefillUrl: prefillUrl.exactOptional(),
  matchHosts: z
    .array(host)
    .min(1, 'List at least one host, or leave matchHosts out.')
    .exactOptional(),
  platforms: z
    .partialRecord(
      platformSchema,
      z.strictObject({ steps: z.array(stepSchema).min(1, 'Give at least one step.') }),
    )
    .refine((p) => Object.keys(p).length > 0, 'Give the steps for at least one platform.'),
});
export type AgentGuide = z.infer<typeof agentGuideSchema>;

/* ---------------------------------------------------------------- validation */

export const CONTENT_KINDS = ['pack', 'countries', 'agent'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** One document to validate. `doc` names it in errors: content:check uses its path in content/. */
export interface ContentDoc {
  kind: ContentKind;
  doc: string;
  body: unknown;
}

/** `path` locates the problem inside the document, e.g. `checklist[4].onlyIf`; '' is all of it. */
export interface ContentError {
  doc: string;
  path: string;
  message: string;
}

export type ContentResult = { ok: true } | { ok: false; errors: ContentError[] };

/** The `doc` of an error about the set as a whole, such as a missing generic pack. */
export const CONTENT_SET = 'content';

/** The pack every other pack falls back to, key by key (architecture §6.7). */
export const GENERIC_PACK = 'generic';

/** The guide for any agent that is not named (PRD J5). */
export const OTHER_GUIDE = 'other';

type Path = readonly PropertyKey[];

interface Parsed<T> {
  doc: string;
  value: T;
}

interface ContentSet {
  packs: Parsed<Pack>[];
  countries: Parsed<Countries>[];
  agents: Parsed<AgentGuide>[];
  /** Kinds with a document that failed its schema: a rule about what is missing stays quiet. */
  invalid: ReadonlySet<ContentKind>;
}

type Report = (doc: string, path: Path, message: string) => void;
type Rule = (set: ContentSet, report: Report) => void;

function formatPath(path: Path): string {
  return path
    .map((key, i) => (typeof key === 'number' ? `[${key}]` : `${i ? '.' : ''}${String(key)}`))
    .join('');
}

function genericPack(set: ContentSet): Parsed<Pack> | undefined {
  return set.packs.find((p) => p.value.id === GENERIC_PACK);
}

/** Calls `onRepeat` for each value after the first that `key` maps to a value already seen. */
function eachRepeat<T>(
  items: readonly T[],
  key: (item: T) => string,
  onRepeat: (item: T, index: number, first: T) => void,
): void {
  const seen = new Map<string, T>();
  items.forEach((item, index) => {
    const first = seen.get(key(item));
    if (first === undefined) seen.set(key(item), item);
    else onRepeat(item, index, first);
  });
}

/* Each rule below is one sentence of §7.8 "Validation", or (after them) an integrity rule the
   content needs so that every reference in it resolves. */

const genericIsComplete: Rule = (set, report) => {
  const generic = genericPack(set);
  if (!generic) {
    if (!set.invalid.has('pack')) {
      report(CONTENT_SET, [], `There is no generic pack. Add one with id "${GENERIC_PACK}".`);
    }
    return;
  }
  for (const section of ['labels', 'meaning', 'cadenceDays'] as const) {
    for (const u of UNIVERSALS) {
      if (generic.value[section][u] === undefined) {
        report(generic.doc, [section, u], `The generic pack defines ${section} for every type.`);
      }
    }
  }
  if (generic.value.questions.other === undefined) {
    report(
      generic.doc,
      ['questions', 'other'],
      'The generic pack defines the "other" question: it settles the user’s own types.',
    );
  }
};

const onlyIfNamesEarlierItem: Rule = (set, report) => {
  for (const { doc, value } of set.packs) {
    const earlier = new Set<string>();
    value.checklist.forEach((item, i) => {
      if (item.onlyIf !== undefined && !earlier.has(item.onlyIf)) {
        report(
          doc,
          ['checklist', i, 'onlyIf'],
          `"${item.onlyIf}" is not an earlier checklist item. A follow-up comes after the item it depends on.`,
        );
      }
      earlier.add(item.id);
    });
  }
};

/** A pack's own types, then generic's: what a checklist item's `type` may name. */
function packTypes(pack: Pack, generic: Pack | undefined): Map<string, Pack['types'][number]> {
  return new Map([...(generic?.types ?? []), ...pack.types].map((t) => [t.key, t]));
}

const typeNamesPackType: Rule = (set, report) => {
  const generic = genericPack(set)?.value;
  for (const { doc, value } of set.packs) {
    if (!generic && value.id !== GENERIC_PACK) continue;
    const types = packTypes(value, generic);
    value.checklist.forEach((item, i) => {
      if (item.type !== undefined && !types.has(item.type)) {
        report(
          doc,
          ['checklist', i, 'type'],
          `"${item.type}" is not one of this pack's types. Add it to types, or leave type out.`,
        );
      }
    });
  }
};

const answerIdsAreUnique: Rule = (set, report) => {
  for (const { doc, value } of set.packs) {
    for (const [u, question] of Object.entries(value.questions)) {
      eachRepeat(
        question.answers,
        (a) => a.id,
        (a, i) => {
          report(doc, ['questions', u, 'answers', i, 'id'], `Another answer is already "${a.id}".`);
        },
      );
    }
  }
};

// "Every country's currency is ISO 4217" is a format: countriesSchema checks it.

const packIdsAreUnique: Rule = (set, report) => {
  eachRepeat(
    set.packs,
    (p) => p.value.id,
    (p, _, first) => {
      report(p.doc, ['id'], `Pack id "${p.value.id}" is already used by ${first.doc}.`);
    },
  );
};

const otherGuideIsGeneric: Rule = (set, report) => {
  for (const { doc, value } of set.agents) {
    if (value.id !== OTHER_GUIDE) continue;
    const why = 'we cannot know its screens';
    for (const platform of PLATFORMS) {
      if (platform !== 'any' && value.platforms[platform] !== undefined) {
        report(doc, ['platforms', platform], `The other guide has only "any" steps: ${why}.`);
      }
    }
    if (value.platforms.any === undefined) {
      report(doc, ['platforms'], 'The other guide gives its steps under "any".');
    }
    value.platforms.any?.steps.forEach((step, i) => {
      if (step.image !== undefined) {
        report(
          doc,
          ['platforms', 'any', 'steps', i, 'image'],
          `The other guide has no screenshots: ${why}.`,
        );
      }
    });
    if (value.logo !== undefined) {
      report(doc, ['logo'], 'The other guide has no logo: the app uses its own agent icon.');
    }
    if (value.matchHosts !== undefined) {
      report(doc, ['matchHosts'], 'The other guide claims no hosts: it is what nothing matches.');
    }
  }
};

const listedGuideIsComplete: Rule = (set, report) => {
  for (const { doc, value } of set.agents) {
    if (value.id === OTHER_GUIDE || !value.listed) continue;
    if (value.logo === undefined) {
      report(doc, ['logo'], 'A listed guide has a logo: the Connect button shows it.');
    }
    if (value.matchHosts === undefined) {
      report(doc, ['matchHosts'], 'A listed guide has matchHosts: they classify its connections.');
    }
  }
};

const hostsAreClaimedOnce: Rule = (set, report) => {
  const claims = set.agents.flatMap(({ doc, value }) =>
    (value.matchHosts ?? []).map((host, i) => ({ doc, host, i })),
  );
  eachRepeat(
    claims,
    (c) => c.host,
    (c, _, first) => {
      report(c.doc, ['matchHosts', c.i], `"${c.host}" is already claimed by ${first.doc}.`);
    },
  );
};

const oneCountryList: Rule = (set, report) => {
  if (set.countries.length === 0 && !set.invalid.has('countries')) {
    report(CONTENT_SET, [], 'There is no country list.');
  }
  set.countries.slice(1).forEach(({ doc }) => {
    report(doc, [], 'There is already a country list; keep one.');
  });
};

const countryPackExists: Rule = (set, report) => {
  if (set.invalid.has('pack')) return;
  const ids = new Set(set.packs.map((p) => p.value.id));
  for (const { doc, value } of set.countries) {
    for (const [code, country] of Object.entries(value)) {
      if (country.pack !== undefined && !ids.has(country.pack)) {
        report(doc, [code, 'pack'], `There is no pack "${country.pack}".`);
      }
    }
  }
};

const checklistIdsAreUnique: Rule = (set, report) => {
  for (const { doc, value } of set.packs) {
    eachRepeat(
      value.checklist,
      (item) => item.id,
      (item, i) => {
        report(doc, ['checklist', i, 'id'], `Another checklist item is already "${item.id}".`);
      },
    );
  }
};

const packTypeKeysAreUnique: Rule = (set, report) => {
  for (const { doc, value } of set.packs) {
    eachRepeat(
      value.types,
      (t) => t.key,
      (t, i) => {
        report(doc, ['types', i, 'key'], `Another type is already "${t.key}".`);
      },
    );
  }
};

const itemTypeMatchesUniversal: Rule = (set, report) => {
  const generic = genericPack(set)?.value;
  for (const { doc, value } of set.packs) {
    const types = packTypes(value, generic);
    value.checklist.forEach((item, i) => {
      const type = item.type === undefined ? undefined : types.get(item.type);
      if (type !== undefined && type.u !== item.u) {
        report(
          doc,
          ['checklist', i, 'u'],
          `Type "${type.key}" is a ${type.u}, so the item's u is "${type.u}", not "${item.u}".`,
        );
      }
    });
  }
};

const itemAnswerExists: Rule = (set, report) => {
  const generic = genericPack(set)?.value;
  for (const { doc, value } of set.packs) {
    if (!generic && value.id !== GENERIC_PACK) continue;
    value.checklist.forEach((item, i) => {
      if (item.answer === undefined) return;
      const question = value.questions[item.u] ?? generic?.questions[item.u];
      if (question === undefined) {
        report(
          doc,
          ['checklist', i, 'answer'],
          `No question settles ${item.u}, so there is nothing to answer. Leave answer out.`,
        );
      } else if (!question.answers.some((a) => a.id === item.answer)) {
        const ids = question.answers.map((a) => `"${a.id}"`).join(', ');
        report(
          doc,
          ['checklist', i, 'answer'],
          `"${item.answer}" is not an answer to "${question.ask}". Use one of ${ids}.`,
        );
      }
    });
  }
};

const guideIdsAreUnique: Rule = (set, report) => {
  eachRepeat(
    set.agents,
    (g) => g.value.id,
    (g, _, first) => {
      report(g.doc, ['id'], `Guide id "${g.value.id}" is already used by ${first.doc}.`);
    },
  );
};

const RULES: readonly Rule[] = [
  genericIsComplete,
  onlyIfNamesEarlierItem,
  typeNamesPackType,
  answerIdsAreUnique,
  packIdsAreUnique,
  otherGuideIsGeneric,
  listedGuideIsComplete,
  hostsAreClaimedOnce,
  oneCountryList,
  countryPackExists,
  checklistIdsAreUnique,
  packTypeKeysAreUnique,
  itemTypeMatchesUniversal,
  itemAnswerExists,
  guideIdsAreUnique,
];

/**
 * Validates a whole set of content: each document against its schema, then every rule. A
 * document that fails its schema is left out of the rules, which cannot be read on a broken shape.
 */
export function validateContent(docs: readonly ContentDoc[]): ContentResult {
  const errors: ContentError[] = [];
  const report: Report = (doc, path, message) => {
    errors.push({ doc, path: formatPath(path), message });
  };
  const invalid = new Set<ContentKind>();
  const set: ContentSet = { packs: [], countries: [], agents: [], invalid };

  const parse = <T>(schema: z.ZodType<T>, { kind, doc, body }: ContentDoc, into: Parsed<T>[]) => {
    const result = schema.safeParse(body);
    if (result.success) {
      into.push({ doc, value: result.data });
    } else {
      invalid.add(kind);
      for (const issue of result.error.issues) {
        // A bad record key carries the key format's own message inside it.
        const inner = issue.code === 'invalid_key' ? issue.issues[0]?.message : undefined;
        report(doc, issue.path, inner ?? issue.message);
      }
    }
  };
  for (const doc of docs) {
    if (doc.kind === 'pack') parse(packSchema, doc, set.packs);
    else if (doc.kind === 'countries') parse(countriesSchema, doc, set.countries);
    else parse(agentGuideSchema, doc, set.agents);
  }

  for (const rule of RULES) rule(set, report);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/* ---------------------------------------------------------------- the review record */

/**
 * The review record (CONVENTIONS §8): each pack key → the review of one version of that pack by
 * someone who knows the market. `sha256` is the pack document's own hash as `content:publish`
 * computes it, so an edit after the review needs a review of its own. The record lives beside the
 * content in the repository and is never published: a production publish reads it to refuse any
 * new or changed pack without a matching review.
 */
export const reviewSchema = z.strictObject({
  sha256: z
    .string()
    .regex(
      /^[0-9a-f]{64}$/,
      'Use the pack’s SHA-256 as content:publish computes it: 64 lowercase hex characters.',
    ),
  /** As the reviewer agrees to be named: a name or initials. */
  reviewer: copy,
  on: z.iso.date('Use the date of the review, as YYYY-MM-DD.'),
  notes: copy.exactOptional(),
});
export type Review = z.infer<typeof reviewSchema>;

export const reviewsSchema = z.record(packKey, reviewSchema);
export type Reviews = z.infer<typeof reviewsSchema>;

/**
 * Every problem with the review record `body`, named as `doc`: its shape, and any key that is not
 * one of `packIds`, the packs that are published (a draft has no review until it moves out).
 */
export function validateReviews(
  body: unknown,
  packIds: ReadonlySet<string>,
  doc: string,
): ContentError[] {
  const result = reviewsSchema.safeParse(body);
  if (!result.success) {
    return result.error.issues.map((issue) => ({
      doc,
      path: formatPath(issue.path),
      message:
        (issue.code === 'invalid_key' ? issue.issues[0]?.message : undefined) ?? issue.message,
    }));
  }
  return Object.keys(result.data)
    .filter((key) => !packIds.has(key))
    .map((key) => ({
      doc,
      path: key,
      message: `There is no pack "${key}". A pack's review is recorded as it moves out of drafts.`,
    }));
}
