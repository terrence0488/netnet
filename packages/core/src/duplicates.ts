import type { Candidate, HoldingDraft, HoldingIn, Universal, ValueIn } from '@netnet/contracts';
import { compareText } from './compare';

/**
 * Likely duplicates (PRD J6, architecture §7.4): an agent should find an existing holding before
 * creating a second one. Deterministic text comparison, no inference (N11).
 */

/** How similar two normalised names must be, from 0 to 1, to count as a likely duplicate. */
export const DUPLICATE_SIMILARITY = 0.6;

/** At most this many candidates are returned. */
export const MAX_CANDIDATES = 3;

/** Lower case, without accents, with every run of punctuation and spaces as one space. */
export function normaliseName(name: string): string {
  const normalised = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return normalised || name.trim().toLowerCase();
}

function bigrams(text: string): Map<string, number> {
  const chars = Array.from(text);
  const counts = new Map<string, number>();
  for (let i = 1; i < chars.length; i += 1) {
    const pair = `${chars[i - 1]}${chars[i]}`;
    counts.set(pair, (counts.get(pair) ?? 0) + 1);
  }
  return counts;
}

/** Sørensen–Dice coefficient over character pairs, counted with repeats. */
function dice(a: string, b: string): number {
  const pairsA = bigrams(a);
  const pairsB = bigrams(b);
  let shared = 0;
  let size = 0;
  for (const [pair, count] of pairsA) {
    shared += Math.min(count, pairsB.get(pair) ?? 0);
    size += count;
  }
  for (const count of pairsB.values()) size += count;
  return size === 0 ? 0 : (2 * shared) / size;
}

/** Jaccard index over words, so word order does not matter. */
function wordOverlap(a: string, b: string): number {
  const wordsA = new Set(a.split(' '));
  const wordsB = new Set(b.split(' '));
  const shared = [...wordsA].filter((w) => wordsB.has(w)).length;
  return shared / (wordsA.size + wordsB.size - shared);
}

/** Similarity of two names, from 0 (nothing alike) to 1 (the same once normalised). */
export function nameSimilarity(a: string, b: string): number {
  const x = normaliseName(a);
  const y = normaliseName(b);
  return x === y ? 1 : Math.max(dice(x, y), wordOverlap(x, y));
}

/** Types are compatible when they share a universal type, or either is `other`. */
const compatible = (a: Universal, b: Universal) => a === b || a === 'other' || b === 'other';

/**
 * Existing holdings (archived ones included) that a new holding probably duplicates: the same
 * kind and currency, a compatible type and a similar name. At most `MAX_CANDIDATES`, most similar
 * first, then by name and id. `latest` (from `latestValues`) fills each candidate's latest value.
 */
export function likelyDuplicates(
  existing: readonly HoldingIn[],
  draft: HoldingDraft,
  latest?: ReadonlyMap<string, ValueIn>,
): Candidate[] {
  return existing
    .filter(
      (h) =>
        h.kind === draft.kind &&
        h.currency === draft.currency &&
        compatible(h.universal, draft.universal),
    )
    .map((holding) => ({ holding, similarity: nameSimilarity(holding.name, draft.name) }))
    .filter((c) => c.similarity >= DUPLICATE_SIMILARITY)
    .sort(
      (a, b) =>
        b.similarity - a.similarity ||
        compareText(a.holding.name, b.holding.name) ||
        compareText(a.holding.id, b.holding.id),
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ holding }) => {
      const value = latest?.get(holding.id);
      return {
        id: holding.id,
        name: holding.name,
        latest: value
          ? { date: value.date, amountMinor: value.amountMinor, currency: value.currency }
          : null,
      };
    });
}
