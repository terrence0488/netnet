import type { M12Layer, M12Question } from '@netnet/contracts';
import { WIN_BAR } from './config';

/**
 * Scoring (P4-T9, PRD M12): each answer is checked against the ground truth for numeric
 * correctness, and scored by the blind judge for qualification and fabrication. A pair goes to
 * the higher total, and a tie is no win for either — a lift has to be visible in the answers, not
 * in a tiebreak. The totals are the rubric the judge is given, so nothing here is tuned to a
 * result: the question set and this file are committed before the first paid run.
 *
 * correctness 2 points, qualification 0–2, fabrication 1 when nothing was invented: 0–5.
 */

/** The arm's name, used only where the harness knows it: never in a judge's prompt. */
export type Arm = 'netnet' | 'spreadsheet';

/** One answer as the judge read it (see `prompts.JUDGE_TOOL`). */
export interface Judgement {
  /** Every figure the answer stated, as numbers. */
  readonly figures: readonly number[];
  /** The short value it gave for a question that asks for one, or "unknown". */
  readonly value: string;
  /** 0 none, 1 vague, 2 the qualifications the ground truth names. */
  readonly qualification: number;
  /** True when it stated a figure or fact the data does not contain. */
  readonly fabricated: boolean;
  readonly reason: string;
}

/** One answer's score, and the parts it is made of. */
export interface Scored {
  readonly correctness: 0 | 1;
  readonly qualification: number;
  readonly fabrication: 0 | 1;
  readonly total: number;
}

/** Words too common to show that an answer means the same thing: matched on the rest. */
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'you',
  'your',
  'are',
  'was',
  'can',
  'not',
  'its',
  'it’s',
  "it's",
  'until',
  'while',
  'when',
]);

/** The words a text value is compared on: lowercase, without punctuation or stopwords. */
function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9’'\s]+/g, ' ')
      .split(/\s+/)
      .map((word) => word.replace(/^'+|'+$/g, ''))
      .filter((word) => word.length >= 3 && !STOPWORDS.has(word)),
  );
}

/**
 * Whether a text answer gives the expected value: it contains it, or shares most of its
 * significant words (a model paraphrases "until you're eligible to withdraw" as "when you can
 * withdraw"). A short expected value ("locked") has to appear as it is.
 */
export function matchesText(value: string, expected: string): boolean {
  const given = value.trim();
  if (given === '') return false;
  const lower = given.toLowerCase();
  const target = expected.toLowerCase();
  if (lower.includes(target) || target.includes(lower)) return true;
  const wanted = significantWords(expected);
  if (wanted.size === 0) return false;
  const found = significantWords(given);
  let shared = 0;
  for (const word of wanted) if (found.has(word)) shared += 1;
  return shared / wanted.size >= 0.6;
}

/** One answer's score against its question's ground truth. */
export function scoreAnswer(
  question: Pick<M12Question, 'metric' | 'expected' | 'tolerance'>,
  judgement: Judgement,
): Scored {
  const correctness: 0 | 1 = (() => {
    if (question.expected === null) {
      // The data cannot answer it: the right answer is to say so and state no figure.
      return judgement.figures.length === 0 && !judgement.fabricated ? 1 : 0;
    }
    if (typeof question.expected === 'number') {
      const expected = question.expected;
      const tolerance = question.tolerance ?? 0;
      return judgement.figures.some((figure) => Math.abs(figure - expected) <= tolerance + 1e-9)
        ? 1
        : 0;
    }
    return matchesText(judgement.value, question.expected) ? 1 : 0;
  })();
  const qualification = Math.max(0, Math.min(2, Math.round(judgement.qualification)));
  const fabrication: 0 | 1 = judgement.fabricated ? 0 : 1;
  return {
    correctness,
    qualification,
    fabrication,
    total: correctness * 2 + qualification + fabrication,
  };
}

/** Which arm answered better: the higher total, or a tie. */
export function compareScores(a: Scored, b: Scored): 'A' | 'B' | 'tie' {
  if (a.total > b.total) return 'A';
  if (b.total > a.total) return 'B';
  return 'tie';
}

/** The seeded order of one pair: which arm's answer the judge saw as A. */
export interface Order {
  readonly A: Arm;
  readonly B: Arm;
}

/** One pair's outcome, with the order that unblinds it kept beside the scores. */
export interface PairOutcome {
  readonly order: Order;
  readonly A: Scored;
  readonly B: Scored;
  readonly netnet: Scored;
  readonly spreadsheet: Scored;
  readonly winner: Arm | 'tie';
}

/** The pair's outcome from the judge's two judgements, mapped back through the order. */
export function pairOutcome(
  question: Pick<M12Question, 'metric' | 'expected' | 'tolerance'>,
  order: Order,
  judged: { readonly A: Judgement; readonly B: Judgement },
): PairOutcome {
  const A = scoreAnswer(question, judged.A);
  const B = scoreAnswer(question, judged.B);
  const side = compareScores(A, B);
  return {
    order,
    A,
    B,
    netnet: order.A === 'netnet' ? A : B,
    spreadsheet: order.A === 'netnet' ? B : A,
    winner: side === 'tie' ? 'tie' : order[side],
  };
}

/** One scored pair, with where it came from. */
export interface PairRecord extends PairOutcome {
  readonly run: number;
  readonly questionId: string;
  readonly layer: M12Layer;
}

/** A layer's part of the result. */
export interface LayerResult {
  pairs: number;
  wins: number;
  losses: number;
  ties: number;
}

/** What the report states: pairs won, the bar, fabrication and each layer. */
export interface Summary {
  readonly pairs: number;
  readonly wins: number;
  readonly losses: number;
  readonly ties: number;
  readonly winRate: number;
  /** NetNet won at least `WIN_BAR` of the pairs (PRD M12). */
  readonly meetsBar: boolean;
  /** Per arm: answers that invented something. NetNet must never have more. */
  readonly fabricated: Readonly<Record<Arm, number>>;
  /** NetNet's fabricated count is at most the spreadsheet's (PRD M12's second half). */
  readonly fabricationBarMet: boolean;
  readonly layers: Readonly<Record<M12Layer, LayerResult>>;
}

const emptyLayer = (): LayerResult => ({ pairs: 0, wins: 0, losses: 0, ties: 0 });

/** The summary over every scored pair, with each layer's part of it. */
export function summarise(records: readonly PairRecord[]): Summary {
  const layers: Record<M12Layer, LayerResult> = {
    arithmetic: emptyLayer(),
    semantics: emptyLayer(),
    provenance: emptyLayer(),
    answer_shape: emptyLayer(),
    fabrication: emptyLayer(),
  };
  let wins = 0;
  let losses = 0;
  let ties = 0;
  let netnetFabricated = 0;
  let spreadsheetFabricated = 0;
  for (const record of records) {
    const layer = layers[record.layer];
    layer.pairs += 1;
    if (record.winner === 'netnet') {
      wins += 1;
      layer.wins += 1;
    } else if (record.winner === 'spreadsheet') {
      losses += 1;
      layer.losses += 1;
    } else {
      ties += 1;
      layer.ties += 1;
    }
    if (record.netnet.fabrication === 0) netnetFabricated += 1;
    if (record.spreadsheet.fabrication === 0) spreadsheetFabricated += 1;
  }
  const pairs = records.length;
  const winRate = pairs === 0 ? 0 : wins / pairs;
  return {
    pairs,
    wins,
    losses,
    ties,
    winRate,
    meetsBar: pairs > 0 && winRate >= WIN_BAR,
    fabricated: { netnet: netnetFabricated, spreadsheet: spreadsheetFabricated },
    fabricationBarMet: netnetFabricated <= spreadsheetFabricated,
    layers,
  };
}
