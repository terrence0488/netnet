import { MAX_ROUNDS } from './config';
import type { Model, ModelRequest, ModelTurn, Turn, UserBlock } from './model';
import type { ToolOutcome } from './netnet/arm';

/**
 * The harness's own agent loop (P4-T9): one model call at a time, every tool call run through
 * the MCP client, every result handed back as text, at most `MAX_ROUNDS` rounds per question.
 * It is deliberately not the SDK's tool runner, so each call and its latency is logged, and the
 * tools are the client's — the server never sees them.
 */

export interface AskOptions {
  readonly model: Model;
  readonly request: ModelRequest;
  /** Runs one tool call: the MCP client's `tools/call` in the NetNet arm. */
  callTool(name: string, input: unknown): Promise<ToolOutcome>;
  maxRounds?: number;
  /** Every model call, as it returned. */
  onModel?(turn: ModelTurn, round: number): void;
  /** Every tool call and its result. */
  onTool?(
    call: { readonly name: string; readonly input: unknown },
    outcome: ToolOutcome,
    round: number,
  ): void;
  /** After each model call: the spend check, which may throw and stop the run. */
  afterModel?(turn: ModelTurn): void;
}

/** What one question's answer came to. */
export interface AskResult {
  readonly text: string;
  readonly rounds: number;
  /** `rounds` when the model was still calling tools at the limit: its last text stands. */
  readonly stop: 'answered' | 'rounds';
}

/** Asks one question, running every tool the model calls through `callTool`. */
export async function ask(options: AskOptions): Promise<AskResult> {
  const maxRounds = options.maxRounds ?? MAX_ROUNDS;
  const messages: Turn[] = [...options.request.messages];
  let lastText = '';

  for (let round = 1; round <= maxRounds; round += 1) {
    const turn = await options.model.complete({ ...options.request, messages });
    options.onModel?.(turn, round);
    options.afterModel?.(turn);
    if (turn.toolCalls.length === 0) {
      return { text: turn.text, rounds: round, stop: 'answered' };
    }
    messages.push({ role: 'assistant', blocks: turn.blocks });
    const results: UserBlock[] = [];
    // One at a time: an MCP client's calls are not a batch, and each one's latency is logged.
    for (const call of turn.toolCalls) {
      const outcome = await options.callTool(call.name, call.input);
      options.onTool?.(call, outcome, round);
      results.push({
        type: 'tool_result',
        toolUseId: call.id,
        content: outcome.text,
        isError: outcome.isError,
      });
    }
    messages.push({ role: 'user', blocks: results });
    lastText = turn.text;
  }
  return { text: lastText, rounds: maxRounds, stop: 'rounds' };
}
