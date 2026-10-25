import type {
  Baseline,
  ContextConnection,
  ContextHolding,
  ContextInput,
  ContextTag,
  ContextType,
  ContextValue,
  FinancialContext,
  Freshness,
  MAX_CONTEXT_BYTES as MaxBytes,
  MAX_CONTEXT_HOLDINGS as MaxHoldings,
  MAX_CONTEXT_NOTES as MaxNotes,
  Pack,
  Staleness,
} from '@netnet/contracts';
import { accessBucket } from '../access';
import { baselineChange } from '../baseline';
import { compareText } from '../compare';
import { fromMinor } from '../money';
import { requireChainValue, typeLabel } from '../pack-chain';
import { latestValues, position } from '../position';
import { staleness } from '../staleness';
import { clipName, utf8Length } from './size';
import { ANSWER_GUIDE, OMITTED_HINT, pictureNotes } from './wording';

/**
 * The agent's context (architecture §7.5, PRD §2.4 and J8): arithmetic already done, what each
 * holding is, how current and complete the picture is, and which figure answers which question.
 * Deterministic (N11): the same input gives the same bytes. Every order is an explicit sort with
 * ties broken by id, and nothing reads a clock.
 */

const MAX_BYTES: typeof MaxBytes = 8192;
const MAX_HOLDINGS: typeof MaxHoldings = 25;
const MAX_NOTES: typeof MaxNotes = 5;
/** The largest assets `exposure.concentration` lists, before the size budget trims it. */
const MAX_CONCENTRATION = 10;
/** What the size budget trims concentration and notes to. */
const BUDGET_CONCENTRATION = 5;
const BUDGET_NOTES = 3;
/** The baseline `totals.change` and each holding's change compare with when none is asked for. */
export const DEFAULT_CONTEXT_BASELINE: Baseline = 'last_month';

type Doc = FinancialContext;
type HoldingEntry = Doc['holdings'][number];
type TypeMeaning = Doc['types'][number];

/** A holding's latest value on or before today, and how old that is. */
interface Latest {
  value: ContextValue;
  age: Staleness;
}

/** One holding that is not archived, with its latest value, if it has one. */
interface Fact {
  holding: ContextHolding;
  latest: Latest | undefined;
  /** The latest value in base minor units, either way: what "largest" means. 0 with no value. */
  size: number;
}

type Valued = Fact & { latest: Latest };
const isValued = (fact: Fact): fact is Valued => fact.latest !== undefined;

/** How much of each list the document carries; the size budget lowers them. */
interface Limits {
  holdings: number;
  concentration: number;
  notes: number;
  byType: number;
  byCurrency: number;
}

/** The parts of the document that do not change as the size budget trims it. */
interface Parts {
  asOf: string;
  currency: string;
  totals: Doc['totals'];
  picture: Omit<Doc['picture'], 'notes'>;
  notes: string[];
  byCurrency: Doc['exposure']['by_currency'];
  concentration: Doc['exposure']['concentration'];
  /** The first `MAX_HOLDINGS` facts as listed holdings. */
  entries: HoldingEntry[];
  /** What each entry's type is, from the pack, by holding id. */
  meanings: ReadonlyMap<string, string>;
  /** Every fact, largest first, so the ones not listed can be summarised. */
  facts: Fact[];
  label: (holding: ContextHolding) => string;
  major: (minor: number) => number;
}

/** Largest first, by the latest value's size in the base currency; ties by id. */
const bySize = (a: Fact, b: Fact) => b.size - a.size || compareText(a.holding.id, b.holding.id);

/** A ratio or percent to two decimal places, half away from zero, never -0. */
function round2(x: number): number {
  const rounded = (Math.sign(x) * Math.round(Math.abs(x) * 100)) / 100;
  return rounded === 0 ? 0 : rounded;
}

const isLiability = (h: ContextHolding) => h.kind === 'liability';
const nonEmpty = (text: string | null) => (text ? text : null);

/** `web`, `system`, or `agent:` and the guide's name; never the name the agent registered. */
function writtenBy(value: ContextValue, connections: ReadonlyMap<string, ContextConnection>) {
  if (value.source !== 'agent') return value.source;
  const connection = value.connectionId === null ? undefined : connections.get(value.connectionId);
  const guide = connection?.client === 'other' ? undefined : connection?.guideName;
  return `agent:${guide ? guide : 'other'}`;
}

/** Each holding's values, for its own change against the baseline. */
function valuesByHolding(values: readonly ContextValue[]): Map<string, ContextValue[]> {
  const tracks = new Map<string, ContextValue[]>();
  for (const value of values) {
    const track = tracks.get(value.holdingId);
    if (track) track.push(value);
    else tracks.set(value.holdingId, [value]);
  }
  return tracks;
}

function freshness(valued: number, stale: number): Freshness {
  if (valued === 0) return 'empty';
  if (stale === 0) return 'fresh';
  return stale * 2 > valued ? 'mostly_stale' : 'some_stale';
}

/** The holdings not listed, summarised by type, largest first (by assets plus owed). */
function omitted(parts: Parts, rest: readonly Fact[], limit: number): Doc['omitted'] {
  const groups = new Map<
    string,
    { holding: ContextHolding; n: number; assets: number; owed: number }
  >();
  for (const { holding, latest } of rest) {
    const group = groups.get(holding.typeId) ?? { holding, n: 0, assets: 0, owed: 0 };
    group.n += 1;
    if (latest && isLiability(holding)) group.owed += latest.value.baseMinor;
    else if (latest) group.assets += latest.value.baseMinor;
    groups.set(holding.typeId, group);
  }
  const weight = (g: { assets: number; owed: number }) => Math.abs(g.assets) + Math.abs(g.owed);
  const byType = [...groups.entries()]
    .sort(([aId, a], [bId, b]) => weight(b) - weight(a) || compareText(aId, bId))
    .slice(0, limit)
    .map(([, g]) => ({
      type: clipName(parts.label(g.holding)),
      holdings: g.n,
      assets: parts.major(g.assets),
      owed: parts.major(g.owed),
    }));
  return { holdings: rest.length, by_type: byType, hint: OMITTED_HINT };
}

/** What each listed holding's type is, once per type, in the order the holdings first use it. */
function typeMeanings(entries: readonly HoldingEntry[], meanings: ReadonlyMap<string, string>) {
  const seen = new Set<string>();
  const types: TypeMeaning[] = [];
  for (const entry of entries) {
    const meaning = meanings.get(entry.id)!;
    const key = `${entry.type}\n${meaning}`;
    if (seen.has(key)) continue;
    seen.add(key);
    types.push({ type: entry.type, meaning });
  }
  return types;
}

/** The document with each list cut to its limit, keys in §7.5's order. */
function assemble(parts: Parts, limits: Limits): Doc {
  const { picture } = parts;
  const listed = parts.entries.slice(0, limits.holdings);
  return {
    as_of: parts.asOf,
    currency: parts.currency,
    answer_guide: ANSWER_GUIDE.map((entry) => ({ ...entry })),
    totals: parts.totals,
    picture: {
      holdings: picture.holdings,
      stale: picture.stale,
      undecided: picture.undecided,
      without_value: picture.without_value,
      oldest_value_days: picture.oldest_value_days,
      freshness: picture.freshness,
      notes: parts.notes.slice(0, limits.notes),
    },
    exposure: {
      by_currency: parts.byCurrency.slice(0, limits.byCurrency),
      concentration: parts.concentration.slice(0, limits.concentration),
    },
    types: typeMeanings(listed, parts.meanings),
    holdings: listed,
    omitted: omitted(parts, parts.facts.slice(limits.holdings), limits.byType),
  };
}

const fits = (doc: Doc) => utf8Length(JSON.stringify(doc)) <= MAX_BYTES;

/**
 * Past `MAX_BYTES`, each step in turn lowers one limit until the document fits (architecture
 * §7.5): listed holdings, smallest first, join `omitted`; concentration keeps five entries; notes
 * keep three. Undecided is always the first note, so it is never dropped. Only an account with
 * hundreds of types or currencies needs the last two steps, which drop the smallest of each.
 */
const BUDGET_STEPS: readonly ((limits: Limits, doc: Doc) => Limits | undefined)[] = [
  (l) => (l.holdings > 0 ? { ...l, holdings: l.holdings - 1 } : undefined),
  (l, doc) =>
    doc.exposure.concentration.length > BUDGET_CONCENTRATION
      ? { ...l, concentration: BUDGET_CONCENTRATION }
      : undefined,
  (l, doc) => (doc.picture.notes.length > BUDGET_NOTES ? { ...l, notes: BUDGET_NOTES } : undefined),
  (l, doc) =>
    doc.omitted.by_type.length > 0 ? { ...l, byType: doc.omitted.by_type.length - 1 } : undefined,
  (l, doc) =>
    doc.exposure.by_currency.length > 0
      ? { ...l, byCurrency: doc.exposure.by_currency.length - 1 }
      : undefined,
];

function fitToBudget(parts: Parts): Doc {
  let limits: Limits = {
    holdings: parts.entries.length,
    concentration: MAX_CONCENTRATION,
    notes: MAX_NOTES,
    byType: Infinity,
    byCurrency: Infinity,
  };
  let doc = assemble(parts, limits);
  for (const step of BUDGET_STEPS) {
    while (!fits(doc)) {
      const next = step(limits, doc);
      if (!next) break;
      limits = next;
      doc = assemble(parts, limits);
    }
  }
  return doc;
}

/**
 * The agent's context for one user (architecture §7.5) as of `today`, read through the current
 * pack chain. At most 8 KB of JSON. Archived holdings are left out of everything. Totals come
 * from `position` and `baselineChange` over each value's stored base amount; types are labelled
 * by the current pack, while accessibility and its reason stay as applied (§6.7). The baseline is
 * last month unless `opts.baseline` names another.
 */
export function compileContext(
  data: ContextInput,
  chain: readonly Pack[],
  today: string,
  opts: { baseline?: Baseline } = {},
): FinancialContext {
  const baseline = opts.baseline ?? DEFAULT_CONTEXT_BASELINE;
  const major = (minor: number) => Number(fromMinor(minor, data.baseCurrency));
  const types = new Map<string, ContextType>(data.types.map((t) => [t.id, t]));
  const tags = new Map<string, ContextTag>(data.tags.map((t) => [t.id, t]));
  const connections = new Map(data.connections.map((c) => [c.id, c]));
  const label = (h: ContextHolding) =>
    typeLabel(
      chain,
      types.get(h.typeId) ?? { universal: h.universal, packTypeKey: null, customName: null },
    );

  const live = data.holdings.filter((h) => !h.archived);
  const latest = latestValues(data.values, today);
  const facts: Fact[] = live
    .map((holding) => {
      const value = latest.get(holding.id);
      return value
        ? {
            holding,
            latest: { value, age: staleness(holding, value, today, chain) },
            size: Math.abs(value.baseMinor),
          }
        : { holding, latest: undefined, size: 0 };
    })
    .sort(bySize);

  /* Totals: position and change, in the base currency. */
  const pos = position(live, latest);
  const change = baselineChange(data.values, live, baseline, today);
  const totals: Doc['totals'] = {
    net_worth: major(pos.netWorth),
    assets: major(pos.assets),
    owed: major(pos.owed),
    could_use: major(pos.couldUse),
    sell_first: major(pos.sellFirst),
    locked: major(pos.locked),
    undecided: major(pos.undecided),
    owed_to_could_use: pos.couldUse > 0 ? round2(pos.owed / pos.couldUse) : null,
    change: {
      baseline,
      since: change.since,
      amount: change.amount === null ? null : major(change.amount),
      pct: change.pct === null ? null : round2(change.pct),
    },
  };

  /* Picture: how current and complete it is. */
  const valued = facts.filter(isValued);
  const stale = valued.filter((f) => f.latest.age.stale);
  const undecided = facts.filter(
    (f) => !isLiability(f.holding) && accessBucket(f.holding) === 'undecided',
  );
  const withoutValue = facts.filter((f) => !isValued(f));
  const days = valued.map((f) => f.latest.age.days);
  const otherCurrencies = new Set(
    valued.map((f) => f.latest.value.currency).filter((c) => c !== data.baseCurrency),
  );
  const name = (f: Fact) => clipName(f.holding.name);

  /* Exposure: shares of assets, by currency and by holding. */
  const assets = valued.filter((f) => !isLiability(f.holding));
  const byCurrency = new Map<string, number>();
  for (const { value } of assets.map((f) => f.latest)) {
    byCurrency.set(value.currency, (byCurrency.get(value.currency) ?? 0) + value.baseMinor);
  }
  const share = (minor: number) => round2(minor / pos.assets);

  /* Holdings: the largest, each with what it is, its access, its value and its change. */
  const tracks = valuesByHolding(data.values);
  const entry = ({ holding, latest: valued }: Fact): HoldingEntry => {
    const own = baselineChange(tracks.get(holding.id) ?? [], [holding], baseline, today);
    return {
      id: holding.id,
      name: clipName(holding.name),
      type: clipName(label(holding)),
      tags: [...new Set(holding.tagIds)]
        .flatMap((id) => tags.get(id) ?? [])
        .sort((a, b) => compareText(a.name, b.name) || compareText(a.id, b.id))
        .map((t) => clipName(t.name)),
      currency: holding.currency,
      access: isLiability(holding) ? 'owed' : (holding.access ?? 'undecided'),
      access_reason: nonEmpty(holding.accessReason),
      until: nonEmpty(holding.accessUntil),
      value: valued
        ? {
            amount: Number(fromMinor(valued.value.amountMinor, valued.value.currency)),
            currency: valued.value.currency,
            base: major(valued.value.baseMinor),
            as_of: valued.value.date,
            age_days: valued.age.days,
            stale: valued.age.stale,
            written_by: writtenBy(valued.value, connections),
          }
        : null,
      change:
        own.amount === null
          ? null
          : { amount: major(own.amount), pct: own.pct === null ? null : round2(own.pct) },
    };
  };

  return fitToBudget({
    asOf: today,
    currency: data.baseCurrency,
    totals,
    picture: {
      holdings: facts.length,
      stale: stale.length,
      undecided: undecided.length,
      without_value: withoutValue.length,
      oldest_value_days: days.length === 0 ? null : Math.max(...days),
      freshness: freshness(valued.length, stale.length),
    },
    notes: pictureNotes({
      holdings: facts.length,
      undecided: undecided.map(name),
      withoutValue: withoutValue.map(name),
      stale: stale.map((f) => ({ name: name(f), days: f.latest.age.days })),
      otherCurrencies: otherCurrencies.size,
    }),
    byCurrency:
      pos.assets > 0
        ? [...byCurrency.entries()]
            .filter(([, minor]) => minor !== 0)
            .sort(([a, x], [b, y]) => y - x || compareText(a, b))
            .map(([currency, minor]) => ({ currency, share: share(minor) }))
        : [],
    concentration:
      pos.assets > 0
        ? assets
            .filter((f) => f.latest.value.baseMinor > 0)
            .slice(0, MAX_CONCENTRATION)
            .map((f) => ({
              holding_id: f.holding.id,
              name: name(f),
              share: share(f.latest.value.baseMinor),
            }))
        : [],
    entries: facts.slice(0, MAX_HOLDINGS).map(entry),
    meanings: new Map(
      facts
        .slice(0, MAX_HOLDINGS)
        .map(({ holding }) => [holding.id, requireChainValue(chain, 'meaning', holding.universal)]),
    ),
    facts,
    label,
    major,
  });
}
