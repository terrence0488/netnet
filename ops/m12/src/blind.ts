import { BLIND_PAIRS } from './config';
import type { ModelTurn } from './model';
import { JUDGE_TOOL_NAME } from './prompts';
import type { Judgement } from './scoring';

/**
 * Reading the judge (P4-T9): the judge answers through one tool call, so its judgement is
 * structured rather than parsed out of prose. This validates that call and refuses a judgement
 * that is not shaped as the rubric asks — a malformed judgement is an error that stops the run,
 * never a silent tie.
 */

/** The judge did not answer as the rubric asks. */
export class JudgeFailed extends Error {
  override readonly name = 'JudgeFailed';
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readFigures(value: unknown): number[] {
  if (!Array.isArray(value)) throw new JudgeFailed('figures is not an array.');
  return value.map((figure) => {
    if (typeof figure === 'number' && Number.isFinite(figure)) return figure;
    if (typeof figure === 'string' && /^-?\d+(\.\d+)?$/.test(figure.trim())) return Number(figure);
    throw new JudgeFailed(`figures holds "${String(figure)}", which is not a number.`);
  });
}

function judgeOf(value: unknown, side: 'A' | 'B'): Judgement {
  if (!isRecord(value)) throw new JudgeFailed(`The judgement of ${side} is not an object.`);
  const figures = readFigures(value['figures']);
  const text = value['value'];
  if (typeof text !== 'string') throw new JudgeFailed(`The judgement of ${side} has no value.`);
  const qualification = value['qualification'];
  if (typeof qualification !== 'number' || !Number.isFinite(qualification)) {
    throw new JudgeFailed(`The judgement of ${side} has no qualification.`);
  }
  const fabricated = value['fabricated'];
  if (typeof fabricated !== 'boolean') {
    throw new JudgeFailed(`The judgement of ${side} has no fabricated flag.`);
  }
  const reason = value['reason'];
  return {
    figures,
    value: text,
    qualification: Math.max(0, Math.min(2, Math.round(qualification))),
    fabricated,
    reason: typeof reason === 'string' ? reason : '',
  };
}

/** The judge's two judgements from its one tool call. */
export function readJudgement(turn: ModelTurn): { A: Judgement; B: Judgement } {
  const call = turn.toolCalls.find((candidate) => candidate.name === JUDGE_TOOL_NAME);
  if (call === undefined) {
    throw new JudgeFailed(
      `The judge did not call ${JUDGE_TOOL_NAME}: ${turn.text === '' ? '(no text)' : turn.text}`,
    );
  }
  if (!isRecord(call.input)) throw new JudgeFailed('The judge’s tool call has no arguments.');
  return {
    A: judgeOf(call.input['A'], 'A'),
    B: judgeOf(call.input['B'], 'B'),
  };
}

/** A pair as the blind sheet shows it: answers A and B only, and an id the Founder writes down. */
export interface BlindPair {
  readonly id: string;
  readonly questionId: string;
  readonly layer: string;
  readonly A: string;
  readonly B: string;
}

/** How many pairs the blind sheet takes, unless the run has fewer. */
export function blindCount(pairs: number): number {
  return Math.min(BLIND_PAIRS, pairs);
}

/** FNV-1a over a string: a small, stable hash, so the same seed always makes the same order. */
export function hash32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Which arm's answer is A in one pair: a hash of the seed, the question and the run, so the
 * order is reproducible from the report's seed and nothing else. Roughly half the pairs have
 * NetNet as A; the order is recorded beside the scores, never in a judge prompt or the sheet.
 */
export function seededOrder(
  seed: number,
  questionId: string,
  run: number,
): 'netnet' | 'spreadsheet' {
  return hash32(`${seed}:${questionId}:${run}`) % 2 === 0 ? 'netnet' : 'spreadsheet';
}

/** The pairs the sheet shows: a seeded selection, so which ten is reproducible too. */
export function pickBlindPairs<T extends { readonly id: string }>(
  items: readonly T[],
  seed: number,
  count: number,
): T[] {
  return [...items]
    .sort(
      (a, b) =>
        hash32(`${seed}:blind:${a.id}`) - hash32(`${seed}:blind:${b.id}`) ||
        a.id.localeCompare(b.id),
    )
    .slice(0, count);
}

/** What the Founder scores: per pair, which answer read better, or a tie. */
export type FounderScore = 'A' | 'B' | 'tie';

/** One scored pair, as the agreement check needs it: the judge's winner and the seeded order. */
export interface AgreementPair {
  readonly id: string;
  readonly judged: 'netnet' | 'spreadsheet' | 'tie';
  readonly order: { readonly A: 'netnet' | 'spreadsheet'; readonly B: 'netnet' | 'spreadsheet' };
}

/** How much the Founder's hand scores agree with the judge's, over the pairs they scored. */
export interface Agreement {
  readonly scored: number;
  readonly agree: number;
  /** 0–1, or null when nothing was scored. */
  readonly rate: number | null;
}

/**
 * The agreement between the judge and the Founder: each hand score is unblinded through the
 * pair's recorded order, then compared with the judge's winner. A pair the Founder left out is
 * not scored; a run with none scored has no rate at all, rather than a made-up one.
 */
export function agreement(
  pairs: readonly AgreementPair[],
  founder: Readonly<Record<string, FounderScore | undefined>>,
): Agreement {
  let scored = 0;
  let agree = 0;
  for (const pair of pairs) {
    const score = founder[pair.id];
    if (score === undefined) continue;
    const hand = score === 'tie' ? 'tie' : pair.order[score];
    scored += 1;
    if (hand === pair.judged) agree += 1;
  }
  return { scored, agree, rate: scored === 0 ? null : agree / scored };
}
