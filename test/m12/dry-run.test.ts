import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { ask } from '../../ops/m12/src/ask';
import { seededOrder } from '../../ops/m12/src/blind';
import { readJudgement } from '../../ops/m12/src/blind';
import { SPREADSHEET_NAME, buildSpreadsheet } from '../../ops/m12/src/csv';
import { FakeAnswerer, FakeJudge } from '../../ops/m12/src/fake';
import { readGroundTruth } from '../../ops/m12/src/ground-truth';
import { readHousehold } from '../../ops/m12/src/household';
import type { ModelRequest, ToolSpec } from '../../ops/m12/src/model';
import {
  answerRequest,
  judgeRequest,
  netnetSystem,
  spreadsheetSystem,
} from '../../ops/m12/src/prompts';
import { readQuestions } from '../../ops/m12/src/questions';
import { writeRun, type AnsweredPair } from '../../ops/m12/src/report';
import { pairOutcome, summarise } from '../../ops/m12/src/scoring';
import { estimateCalls } from '../../ops/m12/src/spend';
import { Transcripts } from '../../ops/m12/src/transcripts';

/**
 * The dry run (P4-T9): both arms against deterministic fakes, with no key and no network. The
 * test drives the same pieces a real run does — the prompts, the own agent loop, the MCP tool
 * proxy (through a fake that answers as `get_financial_context` does), the blind judge, scoring
 * and the three files — so the only thing a real run adds is the network and the app. The end to
 * end path with the server and Postgres is the run itself, recorded in the PR.
 */

const truth = readGroundTruth();
const household = readHousehold();
const set = readQuestions();
const sheet = buildSpreadsheet(household);
const frame = { today: '2026-10-26', endDate: household.endDate, currency: household.baseCurrency };
const netnetPrompt = netnetSystem(frame, 'Call get_financial_context first.');
const sheetPrompt = spreadsheetSystem(frame);
const tools: ToolSpec[] = [
  {
    name: 'get_financial_context',
    description: 'The whole picture in one call.',
    inputSchema: { type: 'object', properties: {} },
  },
];
const callTool = () =>
  Promise.resolve({ text: JSON.stringify(truth.doc), isError: false, latencyMs: 0 });

const netnetRequest = (index: number): ModelRequest =>
  answerRequest({
    model: 'claude-haiku-5-5',
    effort: 'low',
    system: netnetPrompt,
    question: set.questions[index] ?? set.questions[0]!,
    tools,
  });

const sheetRequest = (index: number): ModelRequest =>
  answerRequest({
    model: 'claude-haiku-5-5',
    effort: 'low',
    system: sheetPrompt,
    question: set.questions[index] ?? set.questions[0]!,
    document: { name: SPREADSHEET_NAME, text: sheet.csv },
  });

const dir = mkdtempSync(join(tmpdir(), 'm12-dry-run-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('the fake answering arm', () => {
  it('calls the tool first, then answers from its result', async () => {
    const fake = new FakeAnswerer();
    const request = netnetRequest(0);
    const first = await fake.complete(request);
    expect(first.toolCalls).toHaveLength(1);
    expect(first.toolCalls[0]?.name).toBe('get_financial_context');
    expect(first.text).not.toBe('');

    const second = await fake.complete({
      ...request,
      messages: [
        ...request.messages,
        { role: 'assistant', blocks: first.blocks },
        {
          role: 'user',
          blocks: [
            {
              type: 'tool_result',
              toolUseId: first.toolCalls[0]?.id ?? '',
              content: JSON.stringify(truth.doc),
              isError: false,
            },
          ],
        },
      ],
    });
    expect(second.toolCalls).toStrictEqual([]);
    expect(second.text).toContain(String(truth.value('net_worth')));
  });

  it('says it cannot tell when it was handed no tools, as the spreadsheet arm is', async () => {
    const fake = new FakeAnswerer();
    const turn = await fake.complete(sheetRequest(0));
    expect(turn.toolCalls).toStrictEqual([]);
    expect(turn.text.toLowerCase()).toContain("can't");
  });
});

describe('the fake judge', () => {
  const judge = new FakeJudge();
  const question = set.questions.find((candidate) => candidate.metric === 'net_worth');

  it('extracts the figures each answer states, blind', async () => {
    expect(question).toBeDefined();
    const turn = await judge.complete(
      judgeRequest(question!, {
        A: `The net worth figure is ${String(truth.value('net_worth'))}.`,
        B: 'I cannot tell.',
      }),
    );
    const judged = readJudgement(turn);
    expect(judged.A.figures).toStrictEqual([truth.value('net_worth')]);
    expect(judged.B.figures).toStrictEqual([]);
  });

  it('marks a figure on a question the data cannot answer as fabrication', async () => {
    const unknown = set.questions.find((candidate) => candidate.metric === 'unknown');
    expect(unknown).toBeDefined();
    const turn = await judge.complete(
      judgeRequest(unknown!, { A: 'You earn 5,000 a month.', B: 'The records do not say.' }),
    );
    const judged = readJudgement(turn);
    expect(judged.A.fabricated).toBe(true);
    expect(judged.B.fabricated).toBe(false);
  });
});

describe('the dry run end to end', () => {
  it('asks both arms, judges blind, scores, and writes the three files', async () => {
    const answerer = new FakeAnswerer();
    const judge = new FakeJudge();
    const transcripts = new Transcripts(join(dir, 'transcripts.jsonl'));
    const pairs: AnsweredPair[] = [];

    for (const [index, question] of set.questions.entries()) {
      const run = 1;
      const arm = async (name: 'netnet' | 'spreadsheet', request: ModelRequest) =>
        ask({
          model: answerer,
          request,
          callTool,
          onModel: (turn, round) =>
            transcripts.write({
              run,
              questionId: question.id,
              arm: name,
              round,
              kind: 'model',
              model: request.model,
              latencyMs: turn.latencyMs,
              inputTokens: turn.usage.inputTokens,
              outputTokens: turn.usage.outputTokens,
              text: turn.text,
            }),
          onTool: (call, outcome, round) =>
            transcripts.write({
              run,
              questionId: question.id,
              arm: name,
              round,
              kind: 'tool',
              model: request.model,
              latencyMs: outcome.latencyMs,
              inputTokens: 0,
              outputTokens: 0,
              tool: call.name,
              input: call.input,
              text: outcome.text,
              isError: outcome.isError,
            }),
        });

      const answers = {
        netnet: (await arm('netnet', netnetRequest(index))).text,
        spreadsheet: (await arm('spreadsheet', sheetRequest(index))).text,
      };
      const first = seededOrder(1, question.id, run);
      const order = {
        A: first,
        B: first === 'netnet' ? ('spreadsheet' as const) : ('netnet' as const),
      };
      const presented = { A: answers[order.A], B: answers[order.B] };
      const judged = readJudgement(await judge.complete(judgeRequest(question, presented)));
      pairs.push({
        run,
        question,
        order,
        answers: presented,
        record: {
          ...pairOutcome(question, order, judged),
          run,
          questionId: question.id,
          layer: question.layer,
        },
      });
    }

    const summary = summarise(pairs.map((pair) => pair.record));
    const estimate = estimateCalls([
      { model: 'claude-haiku-5-5', usage: { inputTokens: 1000, outputTokens: 500 } },
    ]);
    const blind = writeRun(
      {
        dir,
        date: '2026-10-26',
        seed: 1,
        runs: 1,
        dryRun: true,
        questionSetVersion: set.version,
        questions: set.questions,
        answerModel: 'claude-haiku-5-5 (fake)',
        judgeModel: 'claude-opus-5-5 (fake)',
        estimate,
        capUsd: 2,
        spentUsd: 0,
        stopped: false,
        pairs,
        startedAt: '2026-10-26T00:00:00.000Z',
        durationMs: 1000,
      },
      summary,
    );

    // The pair the fake can answer: the NetNet arm states net worth, the spreadsheet arm cannot.
    const netWorthQuestion = set.questions.find((question) => question.metric === 'net_worth');
    const netWorthPair = pairs.find((pair) => pair.question.id === netWorthQuestion?.id);
    expect(netWorthPair?.record.winner).toBe('netnet');
    expect(summary.wins).toBeGreaterThan(0);

    // The files, as a run leaves them.
    for (const name of ['transcripts.jsonl', 'scores.json', 'blind-sheet.md', 'report.md']) {
      expect(existsSync(join(dir, name)), name).toBe(true);
    }
    const transcriptsText = readFileSync(join(dir, 'transcripts.jsonl'), 'utf8').trim().split('\n');
    expect(transcriptsText.length).toBeGreaterThan(set.questions.length * 2);
    const toolLines = transcriptsText.filter(
      (line) => (JSON.parse(line) as { kind: string }).kind === 'tool',
    );
    expect(toolLines.length).toBeGreaterThanOrEqual(set.questions.length);

    // The report says it is a dry run, and names the models, the bar, fabrication and the spend.
    const report = readFileSync(join(dir, 'report.md'), 'utf8');
    expect(report).toContain('DRY RUN — no result');
    expect(report).toContain('claude-haiku-5-5 (fake)');
    expect(report).toContain('the bar is at least 80.0%');
    expect(report).toContain('Fabrication');
    expect(report).toContain('Estimate:');

    // The blind sheet never names an arm, and holds ten pairs with no unblinding.
    const blindSheet = readFileSync(join(dir, 'blind-sheet.md'), 'utf8');
    expect(blindSheet.toLowerCase()).not.toContain('netnet');
    expect(blindSheet.toLowerCase()).not.toContain('spreadsheet');
    expect(blindSheet).toContain('| pair-10 |');
    expect(blind.pairs).toHaveLength(10);
    expect(blind.agreement.rate).toBeNull();

    // scores.json keeps the unblinding beside the scores, and the summary.
    const scores = JSON.parse(readFileSync(join(dir, 'scores.json'), 'utf8')) as {
      dryRun: boolean;
      pairs: { order: { A: string } }[];
      summary: { pairs: number };
      blind: { pairs: { id: string; order: { A: string } }[] };
    };
    expect(scores.dryRun).toBe(true);
    expect(scores.pairs).toHaveLength(set.questions.length);
    expect(scores.summary.pairs).toBe(set.questions.length);
    expect(scores.blind.pairs).toHaveLength(10);
    for (const pair of scores.blind.pairs) {
      expect(['netnet', 'spreadsheet']).toContain(pair.order.A);
    }
  });
});
