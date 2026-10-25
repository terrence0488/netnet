import { JUDGE_MODEL } from './config';
import {
  APPROXIMATE_COUNTER,
  turnOf,
  type AssistantBlock,
  type Model,
  type ModelRequest,
  type ModelTurn,
} from './model';
import { JUDGE_TOOL_NAME, type JudgePayload } from './prompts';
import type { Judgement } from './scoring';
import type { Usage } from './spend';

/**
 * The dry run's model and judge (P4-T9): deterministic fakes, with no key and no network, so the
 * whole harness runs end to end — server, MCP client, tool proxy, CSV, prompts, scoring, report —
 * before F22 exists. They are not a result: the answering fake reads one figure from the first
 * tool result and otherwise says it cannot tell, and the judging fake extracts figures with a
 * regular expression. `report.md` says so at the top, and no number from a dry run is evidence
 * about M12.
 */

/** Tokens a request and a short answer cost, as the approximate counter sees them. */
async function usageOf(request: ModelRequest, answer: string): Promise<Usage> {
  return {
    inputTokens: await APPROXIMATE_COUNTER.count(request),
    outputTokens: Math.max(1, Math.ceil(answer.length / 4)),
  };
}

/** The first tool result in the conversation, as the fake's "reading" of the account. */
function lastToolResult(request: ModelRequest): string | undefined {
  for (let i = request.messages.length - 1; i >= 0; i -= 1) {
    const turn = request.messages[i];
    if (turn === undefined || turn.role !== 'user') continue;
    for (const block of turn.blocks) {
      if (block.type === 'tool_result') return block.content;
    }
  }
  return undefined;
}

/** The net worth the fake reads from the context document, when it can find one. */
function netWorthOf(document: string): number | undefined {
  try {
    const body = JSON.parse(document) as { totals?: { net_worth?: unknown } };
    const value = body.totals?.net_worth;
    return typeof value === 'number' ? value : undefined;
  } catch {
    return undefined;
  }
}

/** The answering fake: a tool call, then one figure; without tools, a refusal. */
export class FakeAnswerer implements Model {
  readonly id = 'fake-answerer';

  /** The approximate input usage is counted once, so the estimate and the run agree. */
  async complete(request: ModelRequest): Promise<ModelTurn> {
    if (request.tools.length > 0) {
      const document = lastToolResult(request);
      if (document === undefined) {
        const tool =
          request.tools.find((t) => t.name === 'get_financial_context') ?? request.tools[0];
        const call: AssistantBlock = {
          type: 'tool_use',
          id: `fake_tool_${request.messages.length}`,
          name: tool?.name ?? 'get_financial_context',
          input: {},
        };
        const text = 'Let me read the account.';
        return turnOf([{ type: 'text', text }, call], await usageOf(request, text), 0);
      }
      const netWorth = netWorthOf(document);
      const text =
        netWorth === undefined
          ? 'I could not read a total from the account.'
          : `The net worth figure is ${netWorth}.`;
      return turnOf([{ type: 'text', text }], await usageOf(request, text), 0);
    }
    const text = "I can't work that out from the data I was given.";
    return turnOf([{ type: 'text', text }], await usageOf(request, text), 0);
  }
}

/** A figure as the fake judge sees it: digits, with thousands separators allowed. */
function figuresIn(answer: string): number[] {
  return [...answer.matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((match) =>
    Number((match[0] ?? '').replace(/,/g, '')),
  );
}

/** The judging fake: the rubric applied mechanically, with no model behind it. */
export class FakeJudge implements Model {
  readonly id = 'fake-judge';

  async complete(request: ModelRequest): Promise<ModelTurn> {
    if (!request.tools.some((tool) => tool.name === JUDGE_TOOL_NAME)) {
      throw new Error('The fake judge was called without its tool.');
    }
    const text = request.messages[0]?.blocks[0];
    if (text === undefined || text.type !== 'text')
      throw new Error('The fake judge has no payload.');
    const payload = JSON.parse(text.text) as JudgePayload;
    const judge = (answer: string, expected: number | string | null): Judgement => {
      const figures = figuresIn(answer);
      const fabricated = expected === null ? figures.length > 0 : false;
      return {
        figures,
        value: figures.length === 0 ? 'unknown' : '',
        qualification: expected === null ? 2 : 1,
        fabricated,
        reason: 'Dry run: the deterministic fake judge read the answer mechanically.',
      };
    };
    const input = {
      A: judge(payload.answers.A, payload.groundTruth.expected),
      B: judge(payload.answers.B, payload.groundTruth.expected),
    };
    const block: AssistantBlock = {
      type: 'tool_use',
      id: 'fake_judgement',
      name: JUDGE_TOOL_NAME,
      input,
    };
    return turnOf([block], await usageOf(request, JSON.stringify(input)), 0);
  }
}

/** The fake judge's model id, so a transcript names what answered. */
export const FAKE_JUDGE_MODEL = JUDGE_MODEL;
