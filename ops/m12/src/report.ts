import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { M12Question } from '@netnet/contracts';
import { agreement, blindCount, pickBlindPairs, type Agreement, type FounderScore } from './blind';
import { WIN_BAR } from './config';
import type { Estimate } from './spend';
import { usd } from './spend';
import type { Order, PairRecord, Summary } from './scoring';

/**
 * A run's outputs (P4-T9): `transcripts.jsonl` (written as the run goes), `scores.json`,
 * `blind-sheet.md` and `report.md`, in `ops/m12/runs/<date>-<seed>/`. Only `report.md` is not
 * gitignored, so a real run's result can be committed without the household's figures and the
 * transcripts beside it; `scores.json` keeps the unblinding the sheet never shows.
 */

/** One pair as it was asked and answered, with the order that unblinds it. */
export interface AnsweredPair {
  readonly run: number;
  readonly question: M12Question;
  readonly order: Order;
  /** The answers exactly as the models wrote them, A and B in the seeded order. */
  readonly answers: { readonly A: string; readonly B: string };
  readonly record: PairRecord;
}

/** Everything the three files are written from. */
export interface ReportInput {
  readonly dir: string;
  readonly date: string;
  readonly seed: number;
  readonly runs: number;
  readonly dryRun: boolean;
  readonly questionSetVersion: number;
  readonly questions: readonly M12Question[];
  readonly answerModel: string;
  readonly judgeModel: string;
  readonly estimate: Estimate;
  readonly capUsd: number;
  readonly spentUsd: number;
  /** True when the spend cap stopped the run before every pair. */
  readonly stopped: boolean;
  readonly pairs: readonly AnsweredPair[];
  readonly startedAt: string;
  readonly durationMs: number;
}

/** What the report says about the blind sheet, and where it is. */
export interface BlindResult {
  readonly pairs: readonly {
    readonly id: string;
    readonly questionId: string;
    readonly run: number;
  }[];
  readonly agreement: Agreement;
}

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

/** The Founder's scores, when they have saved them beside the sheet. */
function founderScores(dir: string): Record<string, FounderScore> | undefined {
  const path = join(dir, 'blind-scores.json');
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, FounderScore>;
  } catch {
    return undefined;
  }
}

/** The ten seeded pairs, as the sheet shows them: answers only, never an arm's name. */
function blindPairsOf(input: ReportInput): AnsweredPair[] {
  const ids = input.pairs.map((pair) => ({ id: `${pair.question.id}-r${pair.run}`, pair }));
  return pickBlindPairs(ids, input.seed, blindCount(input.pairs.length)).map(({ pair }) => pair);
}

/** `blind-sheet.md`: what to score, how, and nothing that says which arm is which. */
function blindSheet(input: ReportInput, pairs: readonly AnsweredPair[]): string {
  const lines = [
    `# M12 blind sheet — ${input.date}, seed ${input.seed}`,
    '',
    'Ten pairs, seeded and in an order you are not told. A and B are the two arms; the file that',
    'says which is which is `scores.json`, and you should not open it until you have scored.',
    '',
    'Score each pair on which answer is better for the person asking: more correct, better',
    'qualified, and nothing invented. Write `A`, `B` or `tie` in the table, save it as',
    '`blind-scores.json` in this folder (`{"pair-1": "A", ...}`), and a report made with it beside',
    'the sheet states your agreement with the judge.',
    '',
  ];
  pairs.forEach((pair, index) => {
    lines.push(
      `## Pair ${index + 1} — ${pair.question.id} (${pair.question.layer})`,
      '',
      `> ${pair.question.prompt}`,
      '',
      '**A**',
      '',
      pair.answers.A.trim() === '' ? '_(no answer)_' : pair.answers.A.trim(),
      '',
      '**B**',
      '',
      pair.answers.B.trim() === '' ? '_(no answer)_' : pair.answers.B.trim(),
      '',
    );
  });
  lines.push('## Your scores', '', '| Pair | Better (A, B or tie) |', '| --- | --- |');
  pairs.forEach((_, index) => lines.push(`| pair-${index + 1} |  |`));
  lines.push('');
  return lines.join('\n');
}

/** `scores.json`: every pair's scores, the order that unblinds it, and the summary. */
function scores(
  input: ReportInput,
  summary: Summary,
  blind: { pairs: readonly { id: string; pair: AnsweredPair }[]; agreement: Agreement },
): string {
  return JSON.stringify(
    {
      version: 1,
      questionSetVersion: input.questionSetVersion,
      date: input.date,
      seed: input.seed,
      dryRun: input.dryRun,
      models: { answer: input.answerModel, judge: input.judgeModel },
      spend: {
        estimateUsd: input.estimate.usd,
        capUsd: input.capUsd,
        spentUsd: input.spentUsd,
        stopped: input.stopped,
      },
      summary,
      pairs: input.pairs.map((pair) => ({
        run: pair.run,
        question: pair.question.id,
        layer: pair.question.layer,
        order: pair.order,
        A: pair.record.A,
        B: pair.record.B,
        netnet: pair.record.netnet,
        spreadsheet: pair.record.spreadsheet,
        winner: pair.record.winner,
      })),
      blind: {
        pairs: blind.pairs.map((entry) => ({ id: entry.id, order: entry.pair.order })),
        agreement: blind.agreement,
      },
    },
    null,
    2,
  );
}

/** `report.md`: the result, the bar, fabrication, each layer, the spend and the models. */
function report(
  input: ReportInput,
  summary: Summary,
  blind: {
    pairs: readonly { id: string; pair: AnsweredPair }[];
    agreement: Agreement;
  },
): string {
  const lines: string[] = ['# M12 — NetNet against a spreadsheet', ''];
  if (input.dryRun) {
    lines.push(
      '**DRY RUN — no result.** The answering model and the judge were deterministic fakes with no',
      'network and no key. The run proves the harness works end to end (server, household, MCP',
      'connection, tool proxy, CSV, prompts, judging, report); no figure below is evidence about',
      'M12.',
      '',
    );
  }
  if (input.stopped) {
    lines.push(
      `**Stopped at the spend cap.** The run stopped after ${usd(input.spentUsd)} of the approved`,
      `${usd(input.capUsd)}; the pairs below are the ones that finished.`,
      '',
    );
  }

  lines.push(
    '## Result',
    '',
    `- Pairs: ${summary.pairs} (${input.runs} run${input.runs === 1 ? '' : 's'} of ${input.questions.length} questions)`,
    `- NetNet won ${summary.wins}, the spreadsheet arm won ${summary.losses}, and ${summary.ties} tied`,
    `- Win rate: ${percent(summary.winRate)} — the bar is at least ${percent(WIN_BAR)}: ${summary.meetsBar ? 'met' : 'not met'}`,
    '',
    '## Fabrication',
    '',
    `- NetNet invented something in ${summary.fabricated.netnet} of ${summary.pairs} answers`,
    `- The spreadsheet arm invented something in ${summary.fabricated.spreadsheet} of ${summary.pairs} answers`,
    `- NetNet never scores worse on fabrication: ${summary.fabricationBarMet ? 'met' : 'not met'}`,
    '',
    '## Each layer',
    '',
    '| Layer | Pairs | NetNet | Spreadsheet | Ties |',
    '| --- | --- | --- | --- | --- |',
  );
  for (const [layer, result] of Object.entries(summary.layers)) {
    lines.push(
      `| ${layer} | ${result.pairs} | ${result.wins} | ${result.losses} | ${result.ties} |`,
    );
  }
  lines.push(
    '',
    '## Spend',
    '',
    `- Estimate: ${usd(input.estimate.usd)} (${input.estimate.calls} calls, ${usd(input.capUsd)} approved)`,
    `- Spent: ${usd(input.spentUsd)}${input.dryRun ? ' (a dry run sends nothing)' : ''}`,
    '',
    '## Models and question set',
    '',
    `- Answering model: \`${input.answerModel}\` at effort \`low\``,
    `- Judge: \`${input.judgeModel}\` at effort \`high\``,
    `- Question set: version ${input.questionSetVersion} (${input.questions.length} questions), ground truth from \`core\``,
    `- Run: ${input.startedAt}, ${Math.round(input.durationMs / 1000)}s, seed ${input.seed}`,
    '',
    '## Blind sheet',
    '',
    `- ${blind.pairs.length} seeded pairs are in \`blind-sheet.md\`, with no arm labels`,
  );
  if (blind.agreement.rate === null) {
    lines.push(
      '- Agreement with the judge: not scored yet — the Founder scores the sheet by hand',
      '  (`blind-scores.json` beside it), and a report made with it states the agreement',
    );
  } else {
    lines.push(
      `- Agreement with the judge: ${blind.agreement.agree} of ${blind.agreement.scored} scored pairs (${percent(blind.agreement.rate)})`,
    );
  }
  lines.push('', '## Notes', '');
  if (input.dryRun) {
    lines.push(
      '- The dry run’s scores are the two fakes’ behaviour, not M12’s: they exist to prove the',
      '  pipeline end to end, not to compare the arms.',
    );
  }
  lines.push(
    '- The NetNet arm ran against a scratch Postgres and the built app, connected by a real MCP',
    '  client (discovery, DCR, PKCE, approval, code exchange); tools were listed and proxied here,',
    '  and the tool result text is what the model received.',
    '- The spreadsheet arm was the same household as one CSV: a row per holding, a column per',
    '  month-end, blank where nothing was recorded, and the rates the household used. No derived',
    '  layers.',
    '- Open issue F22: the model ids and the per-token rates are checked against the Models API',
    '  before the first paid run, which has not happened yet.',
    '',
  );
  return lines.join('\n');
}

/**
 * Writes `scores.json`, `blind-sheet.md` and `report.md` into the run's folder, and returns the
 * blind result. `transcripts.jsonl` is written by the run as it goes.
 */
export function writeRun(input: ReportInput, summary: Summary): BlindResult {
  mkdirSync(input.dir, { recursive: true });
  const founder = founderScores(input.dir);
  const chosen = blindPairsOf(input);
  const sheetPairs = chosen.map((pair, index) => ({
    id: `pair-${index + 1}`,
    pair,
  }));

  const agreementPairs = sheetPairs.map(({ id, pair }) => ({
    id,
    judged: pair.record.winner,
    order: pair.order,
  }));
  const found = agreement(agreementPairs, founder ?? {});

  writeFileSync(join(input.dir, 'blind-sheet.md'), blindSheet(input, chosen));
  writeFileSync(
    join(input.dir, 'scores.json'),
    scores(input, summary, { pairs: sheetPairs, agreement: found }),
  );
  writeFileSync(
    join(input.dir, 'report.md'),
    report(input, summary, { pairs: sheetPairs, agreement: found }),
  );

  return {
    pairs: sheetPairs.map(({ id, pair }) => ({
      id,
      questionId: pair.question.id,
      run: pair.run,
    })),
    agreement: found,
  };
}
