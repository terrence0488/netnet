import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The M12 harness's workflow (P4-T9, architecture §12 risk 9): dispatched by hand with the
 * amount the Founder approves, the answering model and the runs; the key is a repository secret
 * that never reaches a script, and the run folder comes back as an artifact. No `environment:`
 * key, as in demo-load.yml: the secret is the repository's, and a reviewer would hold nothing.
 */
const FILE = '.github/workflows/m12.yml';
const workflow = readFileSync(resolve(import.meta.dirname, '..', '..', FILE), 'utf8');

/** The `run:` block of the step named `name`. */
function stepScript(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The step named `name`, from its `- name:` line to the next step. */
function step(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the M12 harness workflow (m12.yml)', () => {
  it('runs only when dispatched by hand, with the approval, model and runs', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request|workflow_run):/m);
    expect(workflow).toMatch(/^ {6}approve_spend:\n(?: {8}.+\n)* {8}required: true\n/m);
    expect(workflow).toMatch(
      /^ {6}model:\n(?: {8}.+\n)* {10}- claude-haiku-5-5\n {10}- claude-haiku-4-5\n/m,
    );
    expect(workflow).toMatch(/^ {6}runs:\n(?: {8}.+\n)* {8}default: '1'\n/m);
  });

  it('reads only the repository', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('waits for no reviewer: no `environment:` key on the job', () => {
    expect(workflow).not.toMatch(/^ {4}environment:/m);
    expect(workflow).not.toMatch(/^\s+environment: [A-Za-z]/m);
  });

  it('gives the harness its own Postgres and the app build the NetNet arm serves', () => {
    expect(step('Run the harness')).toBeDefined();
    expect(workflow).toMatch(/^ {8}image: postgres:18\n/m);
    expect(workflow).toContain('--health-cmd "pg_isready -U postgres"');
    const build = stepScript('Build the app the NetNet arm serves');
    expect(build).toContain('pnpm --filter @netnet/api build');
  });

  it('runs the harness with the approval, model and runs through env, never inline', () => {
    const run = stepScript('Run the harness');
    expect(run).toContain('DATABASE_URL: postgres://postgres:postgres@localhost:5432/netnet_test');
    expect(run).toContain('ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}');
    expect(run).toContain('APPROVE_SPEND: ${{ inputs.approve_spend }}');
    expect(run).toContain('ANSWER_MODEL: ${{ inputs.model }}');
    expect(run).toContain('RUNS: ${{ inputs.runs }}');
    expect(run).toContain('--approve-spend "$APPROVE_SPEND"');
    expect(run).toContain('--model "$ANSWER_MODEL" --runs "$RUNS"');
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });

  it('never puts the key in an expression inside a script, and never fails to upload the run', () => {
    const expressions = [...workflow.matchAll(/\$\{\{[\s\S]*?\}\}/g)].map((match) => match[0]);
    expect(expressions.filter((expression) => /api_key|secret/i.test(expression))).toStrictEqual([
      '${{ secrets.ANTHROPIC_API_KEY }}',
    ]);
    const upload = step('Upload the run folder');
    expect(upload).toContain('if: always()');
    expect(upload).toContain('path: ops/m12/runs/');
  });
});
