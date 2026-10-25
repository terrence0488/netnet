import type { M12Question } from '@netnet/contracts';
import { ASSUMED_OUTPUT_TOKENS, JUDGE_EFFORT, JUDGE_MODEL, MAX_TOKENS } from './config';
import { SPREADSHEET_NAME } from './csv';
import type { ModelRequest, ToolSpec, Turn } from './model';

/**
 * The prompts (P4-T9, PRD M12): both arms get the same system prompt — a capable assistant
 * helping a person with their own finances, today's date and the household's end date — and the
 * same question. The NetNet arm's adds the server's own instructions and the tools, as a client
 * would put them; the spreadsheet arm's adds only the document in the user turn. The judge is
 * told the question, the ground truth and the two answers as A and B, and never which arm is
 * which, or that NetNet exists.
 */

/** The fixed frame both arms share: the run's date, the household's end date and its currency. */
export interface PromptFrame {
  /** The day the run is made, `YYYY-MM-DD`. */
  readonly today: string;
  /** The household's last date, which no value passes. */
  readonly endDate: string;
  readonly currency: string;
}

/** The system prompt both arms get, before anything arm-specific. */
export function baseSystem(frame: PromptFrame): string {
  return [
    'You are a capable assistant helping a person understand their own finances.',
    `Today is ${frame.today}. Their records end on ${frame.endDate}, and no value is later than that.`,
    `Amounts are as they were recorded on their dates. The base currency is ${frame.currency}.`,
    'Answer the question from the data you have. State anything the data cannot support, and do not guess.',
    'State facts and uncertainty only; do not tell the person what they should do.',
  ].join('\n');
}

/**
 * The NetNet arm's system prompt: the shared one, then the tools and the server's instructions,
 * which arrive through MCP's `initialize` and go where a client would put them. The spreadsheet
 * arm's is the same prompt minus this section, so the only difference is the data's form.
 */
export function netnetSystem(frame: PromptFrame, instructions: string | undefined): string {
  const tools = [
    'You can read the person’s NetNet account through the tools provided. Call them when you need them.',
    'Tool results are the record itself: every figure they state is computed and current as of their as-of date.',
  ];
  if (instructions !== undefined && instructions !== '') tools.push(instructions);
  return [baseSystem(frame), '', ...tools].join('\n');
}

/** The spreadsheet arm's system prompt: the shared one, plus where the data is. */
export function spreadsheetSystem(frame: PromptFrame): string {
  return [
    baseSystem(frame),
    '',
    `The person’s balance sheet is in the CSV document in their message, named ${SPREADSHEET_NAME}.`,
    'It holds what they recorded, nothing computed.',
  ].join('\n');
}

/** The user turn: the question, and for the spreadsheet arm the document after it. */
export function questionTurn(
  question: M12Question,
  document?: { name: string; text: string },
): Turn {
  const text =
    document === undefined
      ? question.prompt
      : [
          question.prompt,
          '',
          `<document name="${document.name}">`,
          document.text.trimEnd(),
          '</document>',
        ].join('\n');
  return { role: 'user', blocks: [{ type: 'text', text }] };
}

/** One arm's request for one question. */
export function answerRequest(options: {
  model: string;
  effort: 'low' | 'high';
  system: string;
  question: M12Question;
  tools?: readonly ToolSpec[];
  document?: { name: string; text: string };
}): ModelRequest {
  return {
    model: options.model,
    effort: options.effort,
    system: options.system,
    messages: [questionTurn(options.question, options.document)],
    tools: options.tools ?? [],
    maxTokens: MAX_TOKENS,
  };
}

/* ---------------------------------------------------------------- the judge */

/** The tool the judge answers through: one structured judgement of both answers. */
export const JUDGE_TOOL_NAME = 'record_judgement';

const judgementSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['figures', 'value', 'qualification', 'fabricated', 'reason'],
  properties: {
    figures: {
      type: 'array',
      description: 'Every figure the answer states, as numbers, in the order they appear.',
      items: { type: 'number' },
    },
    value: {
      type: 'string',
      description:
        'The short factual value the answer gives (a name, an accessibility, an "until", or "unknown"); empty when the question is answered by figures alone.',
    },
    qualification: {
      type: 'integer',
      minimum: 0,
      maximum: 2,
      description:
        'How well the answer qualifies what the data cannot support: 0 none, 1 some, 2 the qualifications the ground truth names.',
    },
    fabricated: {
      type: 'boolean',
      description: 'True when the answer states a figure or fact the data does not contain.',
    },
    reason: { type: 'string', description: 'One sentence saying why, quoting the answer.' },
  },
} as const;

export const JUDGE_TOOL: ToolSpec = {
  name: JUDGE_TOOL_NAME,
  description: 'Record the blind judgement of answers A and B. Call it once, with both.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    required: ['A', 'B'],
    properties: { A: judgementSchema, B: judgementSchema },
  },
};

/** The judge's system prompt: the rubric, and the fact that it is not told which arm is which. */
export function judgeSystem(): string {
  return [
    'You are grading two answers to one question about a person’s finances, blind.',
    'Both assistants were given the same data. You are not told which assistant produced which answer, or what either is called; do not try to guess.',
    'For each answer (A and B):',
    '- figures: every number it states, as a number (drop currency symbols and thousands separators).',
    '- value: the short factual value it gives when the question asks for a name, an accessibility or an "until"; "unknown" when it says the data cannot answer it; empty when figures answer the question.',
    '- qualification: 0 if it asserts as fact what the data cannot support; 1 if it hedges vaguely; 2 if it makes the qualifications the ground truth names, and gives no advice.',
    '- fabricated: true when it states a figure or fact the data does not contain.',
    'Compare each answer with the ground truth given. Do not reward verbosity or confidence.',
    `Call ${JUDGE_TOOL_NAME} once, with your judgement of A and B.`,
  ].join('\n');
}

/** What the judge is given, as one JSON document: no arm names, no hint of which is which. */
export interface JudgePayload {
  readonly question: string;
  readonly groundTruth: {
    readonly expected: number | string | null;
    readonly tolerance?: number;
    readonly qualifications: readonly string[];
  };
  readonly answers: { readonly A: string; readonly B: string };
}

/** The judge's request for one pair, in the seeded order it is given. */
export function judgeRequest(
  question: M12Question,
  answers: { readonly A: string; readonly B: string },
): ModelRequest {
  const payload: JudgePayload = {
    question: question.prompt,
    groundTruth: {
      expected: question.expected,
      ...(question.tolerance === undefined ? {} : { tolerance: question.tolerance }),
      qualifications: question.qualifications,
    },
    answers,
  };
  const turn: Turn = {
    role: 'user',
    blocks: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
  };
  return {
    model: JUDGE_MODEL,
    effort: JUDGE_EFFORT,
    system: judgeSystem(),
    messages: [turn],
    tools: [JUDGE_TOOL],
    maxTokens: MAX_TOKENS,
  };
}

/** The output tokens the estimate assumes one answer and one judgement spend. */
export const ESTIMATED_OUTPUT = ASSUMED_OUTPUT_TOKENS;
