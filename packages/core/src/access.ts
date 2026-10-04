import type {
  AccessBasis,
  AccessBucket,
  AccessOutcome,
  AccessQuestion,
  AccessRule,
  HoldingIn,
  NOT_SURE as NotSure,
  Outcome,
  Pack,
  Universal,
  VersionedPack,
} from '@netnet/contracts';
import { findInChain } from './pack-chain';

/**
 * Accessibility (PRD J2, architecture §6.7): the pack chain decides, key by key, whether a type
 * has a default or a question. The outcome and its reason are applied once and kept with the
 * holding; only labels follow later packs.
 */

const NOT_SURE: typeof NotSure = 'not_sure';
const OTHER: Universal = 'other';

interface Found<P extends Pack> {
  pack: P;
  default?: Outcome;
  question?: { key: Universal; value: AccessQuestion };
}

/** The first pack in the chain with a default or a question for `u`; a default wins within one. */
function findRule<P extends Pack>(chain: readonly P[], u: Universal): Found<P> | undefined {
  for (const pack of chain) {
    const outcome = pack.defaults[u];
    if (outcome) return { pack, default: outcome };
    const question = pack.questions[u];
    if (question) return { pack, question: { key: u, value: question } };
  }
  return undefined;
}

/** The question an answer for `u` answers: its own, or else the chain's `other` question. */
function questionFor<P extends Pack>(
  chain: readonly P[],
  found: Found<P> | undefined,
): { pack: P; key: Universal; value: AccessQuestion } {
  if (found?.question) return { pack: found.pack, ...found.question };
  const other = findInChain(chain, 'questions', OTHER);
  if (!other) throw new Error('The pack chain has no "other" question: it must end with generic.');
  return { pack: other.pack, key: OTHER, value: other.value };
}

const outcomeOf = ({ access, reason, until }: Outcome): Outcome =>
  until === undefined ? { access, reason } : { access, reason, until };

/**
 * What applies to `u`: its default, if any, and the question to ask, which overrides a default
 * when there is one. Use it to show the question, and to check an answer before
 * `resolveAccess`.
 */
export function accessRule(chain: readonly Pack[], u: Universal): AccessRule {
  const found = findRule(chain, u);
  const question = questionFor(chain, found);
  return {
    default: found?.default ? outcomeOf(found.default) : null,
    questionKey: question.key,
    question: question.value,
  };
}

/**
 * The outcome for `u`, with its reason and the basis to store. No answer gives the default, or
 * undecided when the type asks a question; `"not_sure"` gives undecided; an answer id gives that
 * answer's outcome. An id that does not answer `accessRule`'s question throws a RangeError, so
 * check answers at the boundary.
 */
export function resolveAccess(
  chain: readonly VersionedPack[],
  u: Universal,
  answer?: string,
): AccessOutcome {
  const found = findRule(chain, u);
  const basis = (via: AccessBasis['via'], pack: VersionedPack, question: Universal | null) => ({
    via,
    pack: pack.id,
    pack_version: pack.version,
    question,
    answer: answer ?? null,
  });

  if (answer === undefined && found?.default) {
    return { ...outcomeOf(found.default), basis: basis('default', found.pack, null) };
  }
  const question = questionFor(chain, found);
  if (answer === undefined || answer === NOT_SURE) {
    return { access: 'undecided', basis: basis('undecided', question.pack, question.key) };
  }
  const chosen = question.value.answers.find((a) => a.id === answer);
  if (!chosen) {
    const ids = [...question.value.answers.map((a) => a.id), NOT_SURE].join('", "');
    throw new RangeError(
      `"${answer}" does not answer "${question.value.ask}". Use one of "${ids}".`,
    );
  }
  return { ...outcomeOf(chosen), basis: basis('answer', question.pack, question.key) };
}

/** Where a holding's value counts: assets by accessibility (undecided if unset), liabilities owed. */
export function accessBucket(holding: Pick<HoldingIn, 'kind' | 'access'>): AccessBucket {
  if (holding.kind === 'liability') return 'owed';
  switch (holding.access) {
    case 'accessible':
      return 'could_use';
    case 'illiquid':
      return 'sell_first';
    case 'locked':
      return 'locked';
    default:
      return 'undecided';
  }
}
