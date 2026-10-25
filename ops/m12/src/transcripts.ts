import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * The transcript (P4-T9): every model call and every tool call, one JSON object a line, in
 * `transcripts.jsonl`. It is the evidence a report's figures came from — the model, the round,
 * the latency and the tokens — and it is gitignored with the rest of the run folder, because it
 * carries the household's fictional figures and whatever a model wrote about them.
 */

/** One call, as it happened. */
export interface TranscriptEvent {
  readonly run: number;
  readonly questionId: string;
  /** The arm that spoke, or `judge` for the blind judgement. */
  readonly arm: 'netnet' | 'spreadsheet' | 'judge';
  /** The tool round the call belongs to: 1 is the first model call. */
  readonly round: number;
  readonly kind: 'model' | 'tool';
  readonly model: string;
  readonly latencyMs: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** The model's text, or the tool's result. */
  readonly text?: string;
  readonly tool?: string;
  readonly input?: unknown;
  readonly isError?: boolean;
}

/** Appends events to one run's `transcripts.jsonl`; every line is written as it happens. */
export class Transcripts {
  private readonly path: string;

  constructor(path: string) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
  }

  write(event: TranscriptEvent): void {
    appendFileSync(this.path, `${JSON.stringify(event)}\n`);
  }
}
