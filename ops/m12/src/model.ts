import { PRICING, type Effort } from './config';
import type { Usage } from './spend';

/**
 * The model boundary (P4-T9): the harness's own loop over a model, not the SDK's tool runner, so
 * every call, tool round and latency is logged. One interface serves the answering arm, the judge
 * and the dry run's fakes; `AnthropicModel` is the only thing that reaches the API, and the rest
 * of the harness cannot tell a fake from it.
 *
 * The `@anthropic-ai/sdk` dependency lives here and nowhere else (N2): a lint rule refuses it in
 * `apps/*` and `packages/*`, and the harness is never part of the product.
 */

/** A tool as the model sees it: the name, description and JSON schema MCP served. */
export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
}

/** One block of a turn: what either side said, discriminated by `type`. */
export type Block =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly toolUseId: string;
      readonly content: string;
      readonly isError: boolean;
    };

/** What the model said: text, and the tools it asked to call. */
export type AssistantBlock = Extract<Block, { readonly type: 'text' | 'tool_use' }>;

/** What the harness said back: the question, and each tool's result. */
export type UserBlock = Extract<Block, { readonly type: 'text' | 'tool_result' }>;

/** One turn of the conversation, as the API takes it: a user's blocks or an assistant's. */
export type Turn =
  | { readonly role: 'user'; readonly blocks: readonly UserBlock[] }
  | { readonly role: 'assistant'; readonly blocks: readonly AssistantBlock[] };

/** Everything one call needs. */
export interface ModelRequest {
  readonly model: string;
  readonly effort: Effort;
  readonly system: string;
  readonly messages: readonly Turn[];
  readonly tools: readonly ToolSpec[];
  readonly maxTokens: number;
}

/** One call's answer, its cost and how long it took. */
export interface ModelTurn {
  readonly blocks: readonly AssistantBlock[];
  /** The text blocks joined: the answer, or the judge's prose beside its tool call. */
  readonly text: string;
  readonly toolCalls: readonly {
    readonly id: string;
    readonly name: string;
    readonly input: unknown;
  }[];
  readonly usage: Usage;
  readonly latencyMs: number;
}

/** A model the harness can call: the API's, or a deterministic fake in a dry run. */
export interface Model {
  readonly id: string;
  complete(request: ModelRequest): Promise<ModelTurn>;
}

/** A token counter for the estimate: the API's `countTokens`, or a dry run's own. */
export interface Counter {
  readonly id: string;
  count(request: ModelRequest): Promise<number>;
}

/** The SDK's own wire types lag or lead the API's fields; only these are read from a response. */
interface AnthropicResponse {
  readonly content: readonly {
    readonly type: string;
    readonly text?: string;
    readonly id?: string;
    readonly name?: string;
    readonly input?: unknown;
  }[];
  readonly usage: { readonly input_tokens: number; readonly output_tokens: number };
}

/** A content block as the API takes it back. */
type ApiBlock =
  | { readonly type: 'text'; readonly text: string }
  | {
      readonly type: 'tool_use';
      readonly id: string;
      readonly name: string;
      readonly input: unknown;
    }
  | {
      readonly type: 'tool_result';
      readonly tool_use_id: string;
      readonly content: string;
      readonly is_error?: boolean;
    };

/** The request fields the harness sets; the SDK fills the rest with its defaults. */
interface CreateParams {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly {
    readonly role: 'user' | 'assistant';
    readonly content: readonly ApiBlock[];
  }[];
  readonly tools: readonly {
    readonly name: string;
    readonly description: string;
    readonly input_schema: Readonly<Record<string, unknown>>;
  }[];
  readonly output_config: { readonly effort: Effort };
}

/** `messages.create` as the harness calls it: the fields it sets, the answer it reads. */
type Create = (params: CreateParams) => Promise<AnthropicResponse>;
type Count = (params: Omit<CreateParams, 'max_tokens' | 'output_config'>) => Promise<{
  readonly input_tokens: number;
}>;

function toApi(turn: Turn): { role: 'user' | 'assistant'; content: ApiBlock[] } {
  if (turn.role === 'user') {
    return {
      role: 'user',
      content: turn.blocks.map((block) =>
        block.type === 'tool_result'
          ? {
              type: 'tool_result',
              tool_use_id: block.toolUseId,
              content: block.content,
              ...(block.isError ? { is_error: true } : {}),
            }
          : { type: 'text', text: block.text },
      ),
    };
  }
  return {
    role: 'assistant',
    content: turn.blocks.map((block) =>
      block.type === 'tool_use'
        ? { type: 'tool_use', id: block.id, name: block.name, input: block.input }
        : { type: 'text', text: block.text },
    ),
  };
}

/** The SDK's `messages.create` and `messages.countTokens`, typed for the fields used here. */
function apiOf(client: { messages: { create: unknown; countTokens: unknown } }): {
  create: Create;
  count: Count;
} {
  return {
    create: client.messages.create as Create,
    count: client.messages.countTokens as Count,
  };
}

/**
 * The API's model and token counter. `connect` is the only place the SDK is imported, so a dry
 * run never loads it and the harness runs with no key at all. The model ids are the config's; the
 * API refuses one it does not serve, which is the check the brief asks for at start.
 */
export class AnthropicModel implements Model, Counter {
  readonly id: string;
  private readonly create: Create;
  private readonly countTokens: Count;

  private constructor(id: string, create: Create, countTokens: Count) {
    this.id = id;
    this.create = create;
    this.countTokens = countTokens;
  }

  /** Connects with `apiKey`, or `ANTHROPIC_API_KEY`: the key is read here and never printed. */
  static async connect(apiKey?: string): Promise<AnthropicModel> {
    const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. A paid run needs it; --dry-run needs no key and spends nothing.',
      );
    }
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: key });
    const { create, count } = apiOf(client);
    return new AnthropicModel('anthropic', create, count);
  }

  async complete(request: ModelRequest): Promise<ModelTurn> {
    const started = Date.now();
    const response = await this.create({
      model: request.model,
      max_tokens: request.maxTokens,
      system: request.system,
      messages: request.messages.map(toApi),
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
      output_config: { effort: request.effort },
    });
    const latencyMs = Date.now() - started;
    const blocks: AssistantBlock[] = [];
    for (const block of response.content) {
      if (block.type === 'text' && typeof block.text === 'string') {
        blocks.push({ type: 'text', text: block.text });
      } else if (
        block.type === 'tool_use' &&
        typeof block.id === 'string' &&
        typeof block.name === 'string'
      ) {
        blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
      }
    }
    return turnOf(
      blocks,
      {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
      latencyMs,
    );
  }

  async count(request: ModelRequest): Promise<number> {
    const response = await this.countTokens({
      model: request.model,
      system: request.system,
      messages: request.messages.map(toApi),
      tools: request.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema,
      })),
    });
    return response.input_tokens;
  }
}

/** A turn from its blocks: the text joined, the tool calls listed. */
export function turnOf(
  blocks: readonly AssistantBlock[],
  usage: Usage,
  latencyMs: number,
): ModelTurn {
  return {
    blocks,
    text: blocks
      .filter((block): block is Extract<AssistantBlock, { type: 'text' }> => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim(),
    toolCalls: blocks
      .filter(
        (block): block is Extract<AssistantBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      )
      .map((block) => ({ id: block.id, name: block.name, input: block.input })),
    usage,
    latencyMs,
  };
}

/**
 * A dry run's counter: four characters to the token over the whole request, which is the usual
 * English approximation. It is deterministic and needs no key, so the estimate runs with no
 * network at all; the printed figure is marked as the approximation it is.
 */
export const APPROXIMATE_COUNTER: Counter = {
  id: 'approximate',
  count: (request) => {
    const text = [
      request.system,
      ...request.messages.flatMap((message) =>
        message.blocks.map((block) =>
          block.type === 'tool_result'
            ? block.content
            : block.type === 'text'
              ? block.text
              : JSON.stringify(block.input),
        ),
      ),
      ...request.tools.map((tool) => JSON.stringify(tool)),
    ].join('\n');
    return Promise.resolve(Math.max(1, Math.ceil(text.length / 4)));
  },
};

/** True when the model's name is one the config prices; a run refuses one it cannot price. */
export function isPriced(model: string): boolean {
  return Object.hasOwn(PRICING, model);
}
