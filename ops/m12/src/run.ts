import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { M12Question } from '@netnet/contracts';
import { ask } from './ask';
import type { Options } from './args';
import { readJudgement, seededOrder } from './blind';
import { ANSWER_EFFORT, ASSUMED_OUTPUT_TOKENS, JUDGE_MODEL, RUNS_DIR } from './config';
import { SPREADSHEET_NAME, buildSpreadsheet } from './csv';
import { FakeAnswerer, FakeJudge } from './fake';
import { GroundTruth, mismatches } from './ground-truth';
import { REPO_ROOT, buildHousehold, readContentDocs, readHousehold } from './household';
import {
  APPROXIMATE_COUNTER,
  AnthropicModel,
  type Counter,
  type Model,
  type ModelRequest,
  type ToolSpec,
} from './model';
import type { NetNetAgent } from './netnet/arm';
import { authorize, connect, makeAccount, runEmail } from './netnet/arm';
import {
  createScratchDatabase,
  loadHousehold,
  publishRepositoryContent,
  startApp,
  verifyAccount,
  type RunningApp,
  type ScratchDatabase,
} from './netnet/server';
import {
  answerRequest,
  judgeRequest,
  netnetSystem,
  spreadsheetSystem,
  type PromptFrame,
} from './prompts';
import { readQuestions } from './questions';
import { writeRun, type AnsweredPair, type BlindResult, type ReportInput } from './report';
import {
  pairOutcome,
  summarise,
  type Arm,
  type Order,
  type PairRecord,
  type Summary,
} from './scoring';
import {
  Spend,
  SpendCapReached,
  estimateCalls,
  requireApproval,
  usd,
  type Estimate,
  type Usage,
} from './spend';
import { Transcripts } from './transcripts';

/**
 * One run of the harness (P4-T9): both arms on the same household and question set, judged
 * blind, scored against `core`'s ground truth, and written out with the spend. The flow is the
 * brief's: check the question set against core (a stale pin stops the run before it costs
 * anything), build a scratch Postgres and the built app, make one account and load the household,
 * connect a real MCP client, count the tokens for a dry pass and print the estimate, run only
 * with the approval at or above it, then ask, judge and report.
 *
 * A dry run (`--dry-run`) takes the same path with a fake model and a fake judge: no key, no
 * network, no spend. Everything else — server, MCP connection, tool proxy, CSV, prompts, scoring,
 * report — is real.
 */

/** Where a run reads the machine: the repository, the database, the key and the clock. */
export interface RunDeps {
  readonly databaseUrl: string;
  readonly root?: string;
  readonly apiKey?: string;
  readonly log?: (line: string) => void;
  readonly now?: () => Date;
}

/** A finished run: its folder, its scores and what it was expected to cost. */
export interface RunResult {
  readonly dir: string;
  readonly summary: Summary;
  readonly estimate: Estimate;
  readonly spendUsd: number;
  readonly blind: BlindResult;
}

const day = (date: Date) => date.toISOString().slice(0, 10);

/** A stand-in answer for the estimate's judge calls: about what a model writes. */
const PLACEHOLDER_ANSWER =
  '[An answer of a few sentences: the figures it reads, the dates they are as of, and the ' +
  'qualifications the data needs. About four hundred characters, which is the length the ' +
  'estimate assumes a real answer takes.]';

/** A handful of the context document, as a tool result would be: the estimate's second call. */
const PLACEHOLDER_TOOL_RESULT = '{"totals":{"net_worth":0},"holdings":[]}';

/** The order NetNet's answer and the spreadsheet's answer are shown to the judge as A and B. */
function orderOf(seed: number, questionId: string, run: number): Order {
  const first = seededOrder(seed, questionId, run);
  return { A: first, B: first === 'netnet' ? 'spreadsheet' : 'netnet' };
}

/** The scratch machine one run works against, closed in one place whatever happens. */
interface Machine {
  readonly scratch: ScratchDatabase;
  app: RunningApp | undefined;
  agent: NetNetAgent | undefined;
  close(): Promise<void>;
}

async function startMachine(
  deps: RunDeps,
  root: string,
  household: ReturnType<typeof readHousehold>,
): Promise<{ machine: Machine; origin: string; agent: NetNetAgent }> {
  const scratch = await createScratchDatabase(deps.databaseUrl);
  const machine: Machine = {
    scratch,
    app: undefined,
    agent: undefined,
    close: async () => {
      await machine.agent?.close();
      await machine.app?.stop();
      await machine.scratch.close();
    },
  };
  try {
    const documents = await publishRepositoryContent(scratch.ownerUrl, root);
    deps.log?.(`m12: published ${documents} content documents into ${scratch.name}`);
    machine.app = await startApp({ databaseUrl: scratch.appUrl, root });
    const origin = machine.app.origin;
    const email = runEmail(randomBytes(4).toString('hex'));
    const session = await makeAccount({
      origin,
      email,
      verify: (address) => verifyAccount(scratch.ownerUrl, address),
    });
    const loaded = await loadHousehold({ appUrl: scratch.appUrl, household, email });
    deps.log?.(
      `m12: loaded ${loaded.holdings} holdings (${loaded.values} values, ${loaded.withoutValue} without one)`,
    );
    const { token } = await authorize(origin, session, 'M12 harness');
    machine.agent = await connect(origin, token);
    deps.log?.(`m12: connected over MCP with ${machine.agent.tools.length} tools`);
    return { machine, origin, agent: machine.agent };
  } catch (error) {
    await machine.close();
    throw error;
  }
}

/**
 * The spend plan: the answer each arm and the judge would send, counted as tokens, with an
 * assumed output for each. The NetNet arm's second call (the tool result handed back) is counted
 * too, so the estimate covers a normal tool round rather than only the first request.
 */
async function plan(
  options: Options,
  questions: readonly M12Question[],
  frame: PromptFrame,
  instructions: string | undefined,
  csv: string,
  tools: readonly ToolSpec[],
  counter: Counter,
): Promise<Estimate> {
  const calls: { model: string; usage: Usage }[] = [];
  const netnetSystemPrompt = netnetSystem(frame, instructions);
  const sheetSystemPrompt = spreadsheetSystem(frame);
  for (let run = 1; run <= options.runs; run += 1) {
    for (const question of questions) {
      const netnet = answerRequest({
        model: options.model,
        effort: ANSWER_EFFORT,
        system: netnetSystemPrompt,
        question,
        tools,
      });
      const first: ModelRequest = netnet;
      calls.push({
        model: first.model,
        usage: {
          inputTokens: await counter.count(first),
          outputTokens: Math.round(ASSUMED_OUTPUT_TOKENS.answer / 3),
        },
      });
      const second: ModelRequest = {
        ...netnet,
        messages: [
          ...netnet.messages,
          {
            role: 'assistant',
            blocks: [
              { type: 'text', text: 'Let me read the account.' },
              { type: 'tool_use', id: 'estimate', name: tools[0]?.name ?? 'tool', input: {} },
            ],
          },
          {
            role: 'user',
            blocks: [
              {
                type: 'tool_result',
                toolUseId: 'estimate',
                content: PLACEHOLDER_TOOL_RESULT,
                isError: false,
              },
            ],
          },
        ],
      };
      calls.push({
        model: second.model,
        usage: {
          inputTokens: await counter.count(second),
          outputTokens: ASSUMED_OUTPUT_TOKENS.answer,
        },
      });
      const sheet = answerRequest({
        model: options.model,
        effort: ANSWER_EFFORT,
        system: sheetSystemPrompt,
        question,
        document: { name: SPREADSHEET_NAME, text: csv },
      });
      calls.push({
        model: sheet.model,
        usage: {
          inputTokens: await counter.count(sheet),
          outputTokens: ASSUMED_OUTPUT_TOKENS.answer,
        },
      });
      const judge = judgeRequest(question, { A: PLACEHOLDER_ANSWER, B: PLACEHOLDER_ANSWER });
      calls.push({
        model: judge.model,
        usage: {
          inputTokens: await counter.count(judge),
          outputTokens: ASSUMED_OUTPUT_TOKENS.judge,
        },
      });
    }
  }
  return estimateCalls(calls);
}

/** Runs the harness once. */
export async function runM12(options: Options, deps: RunDeps): Promise<RunResult> {
  const root = deps.root ?? REPO_ROOT;
  const log = deps.log ?? (() => {});
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const date = day(startedAt);

  const set = readQuestions(root);
  const household = readHousehold(root);
  const { packs, countries } = readContentDocs(root);
  const data = buildHousehold(household, packs, countries);
  const truth = new GroundTruth(data);
  if (set.asOf !== household.endDate || set.currency !== household.baseCurrency) {
    throw new Error(
      `The question set is for ${set.asOf} in ${set.currency}, but the household ends ` +
        `${household.endDate} in ${household.baseCurrency}: run pnpm content:check.`,
    );
  }
  const stale = mismatches(set.questions, truth);
  const firstStale = stale[0];
  if (firstStale !== undefined) {
    throw new Error(
      `The question set's ground truth is stale: ${firstStale.id} commits ${String(firstStale.expected)} ` +
        `but core computes ${String(firstStale.computed)} (${stale.length} of ${set.questions.length}). ` +
        'Fix the set before a run: nothing was sent.',
    );
  }
  const spreadsheet = buildSpreadsheet(household);

  const models = options.dryRun
    ? {
        answerer: new FakeAnswerer() as Model,
        judge: new FakeJudge() as Model,
        counter: APPROXIMATE_COUNTER,
      }
    : await (async () => {
        const anthropic = await AnthropicModel.connect(deps.apiKey);
        return {
          answerer: anthropic as Model,
          judge: anthropic as Model,
          counter: anthropic as Counter,
        };
      })();

  const { machine, agent } = await startMachine(deps, root, household);
  const dir = join(root, RUNS_DIR, `${date}-${options.seed}`);
  let finished = false;
  try {
    const frame: PromptFrame = {
      today: date,
      endDate: household.endDate,
      currency: household.baseCurrency,
    };
    const estimate = await plan(
      options,
      set.questions,
      frame,
      agent.instructions,
      spreadsheet.csv,
      agent.tools,
      models.counter,
    );
    log(
      `m12: estimate ${usd(estimate.usd)} for ${estimate.calls} calls ` +
        `(${options.dryRun ? 'approximate counter' : 'messages.countTokens'}); ` +
        `approved ${usd(options.approveSpend)}`,
    );
    for (const [model, usage] of Object.entries(estimate.byModel)) {
      log(`m12:   ${model}: ${usage.inputTokens} in, ${usage.outputTokens} out`);
    }
    requireApproval(estimate.usd, options.approveSpend);
    if (options.dryRun)
      log('m12: dry run — a fake model and a fake judge; no key, no network, no spend');

    mkdirSync(dir, { recursive: true });
    const transcripts = new Transcripts(join(dir, 'transcripts.jsonl'));
    const spend = new Spend(options.approveSpend);
    const netnetSystemPrompt = netnetSystem(frame, agent.instructions);
    const sheetSystemPrompt = spreadsheetSystem(frame);

    const recordUsage = (model: string, usage: Usage) => {
      if (!options.dryRun) spend.record(model, usage);
    };

    const askArm = async (
      run: number,
      question: M12Question,
      arm: Arm,
      request: ModelRequest,
    ): Promise<string> => {
      const asked = await ask({
        model: models.answerer,
        request,
        callTool: (name, input) => agent.callTool(name, input),
        onModel: (turn, round) => {
          transcripts.write({
            run,
            questionId: question.id,
            arm,
            round,
            kind: 'model',
            model: request.model,
            latencyMs: turn.latencyMs,
            inputTokens: turn.usage.inputTokens,
            outputTokens: turn.usage.outputTokens,
            text: turn.text,
          });
          recordUsage(request.model, turn.usage);
        },
        onTool: (call, outcome, round) => {
          transcripts.write({
            run,
            questionId: question.id,
            arm,
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
          });
        },
      });
      return asked.text;
    };

    const pairs: AnsweredPair[] = [];
    let stopped = false;
    try {
      for (let run = 1; run <= options.runs; run += 1) {
        for (const question of set.questions) {
          const answers = {
            netnet: await askArm(
              run,
              question,
              'netnet',
              answerRequest({
                model: options.model,
                effort: ANSWER_EFFORT,
                system: netnetSystemPrompt,
                question,
                tools: agent.tools,
              }),
            ),
            spreadsheet: await askArm(
              run,
              question,
              'spreadsheet',
              answerRequest({
                model: options.model,
                effort: ANSWER_EFFORT,
                system: sheetSystemPrompt,
                question,
                document: { name: SPREADSHEET_NAME, text: spreadsheet.csv },
              }),
            ),
          };
          const order = orderOf(options.seed, question.id, run);
          const presented = { A: answers[order.A], B: answers[order.B] };
          const request = judgeRequest(question, presented);
          const turn = await models.judge.complete(request);
          transcripts.write({
            run,
            questionId: question.id,
            arm: 'judge',
            round: 1,
            kind: 'model',
            model: request.model,
            latencyMs: turn.latencyMs,
            inputTokens: turn.usage.inputTokens,
            outputTokens: turn.usage.outputTokens,
            text: turn.text,
          });
          recordUsage(request.model, turn.usage);
          const judged = readJudgement(turn);
          const record: PairRecord = {
            ...pairOutcome(question, order, judged),
            run,
            questionId: question.id,
            layer: question.layer,
          };
          pairs.push({ run, question, order, answers: presented, record });
        }
      }
    } catch (error) {
      if (error instanceof SpendCapReached) {
        stopped = true;
        log(`m12: ${error.message}`);
      } else {
        throw error;
      }
    }

    const summary = summarise(pairs.map((pair) => pair.record));
    const input: ReportInput = {
      dir,
      date,
      seed: options.seed,
      runs: options.runs,
      dryRun: options.dryRun,
      questionSetVersion: set.version,
      questions: set.questions,
      answerModel: options.dryRun ? `${options.model} (fake)` : options.model,
      judgeModel: options.dryRun ? `${JUDGE_MODEL} (fake)` : JUDGE_MODEL,
      estimate,
      capUsd: options.approveSpend,
      spentUsd: spend.spentUsd,
      stopped,
      pairs,
      startedAt: startedAt.toISOString(),
      durationMs: now().getTime() - startedAt.getTime(),
    };
    const blind = writeRun(input, summary);
    finished = true;
    return { dir, summary, estimate, spendUsd: spend.spentUsd, blind };
  } finally {
    await machine.close();
    if (!finished) log(`m12: stopped; the run folder is ${dir}`);
  }
}
