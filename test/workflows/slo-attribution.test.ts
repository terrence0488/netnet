import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The SLO attribution workflow (ops/launch-readiness.md N1): dispatched by hand with a window, it
 * runs `pnpm slo:attribute` as `netnet_metrics` with the two repository secrets and writes every
 * non-ok `agent_tool_called` — tool, kind, outcome, client, account — to the job summary. Read-only,
 * no reviewer, and it never touches the deploy rail.
 */
const FILE = '.github/workflows/slo-attribution.yml';
const ROOT = resolve(import.meta.dirname, '..', '..');
const workflow = readFileSync(resolve(ROOT, FILE), 'utf8');

/** The `run:` block of the step named `name`. */
function stepScript(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the SLO attribution workflow (slo-attribution.yml)', () => {
  it('is dispatched by hand only, with an optional window in days', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request|workflow_run):/m);
    expect(workflow).toMatch(/^ {6}days:\n(?: {8}.+\n)* {8}default: '7'$/m);
    expect(workflow).toMatch(/^ {6}user:\n(?: {8}.+\n)* {8}default: ''$/m);
  });

  it('waits for no reviewer: no `environment:` key, and reads only the repository', () => {
    expect(workflow).not.toMatch(/^ {4}environment:/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('runs pnpm slo:attribute with the metrics secrets through env, never inline', () => {
    const run = stepScript('Attribute the non-ok calls');
    expect(run).toContain('DATABASE_METRICS_URL: ${{ secrets.DATABASE_METRICS_URL }}');
    expect(run).toContain('METRICS_EXCLUDE_USERS: ${{ secrets.METRICS_EXCLUDE_USERS }}');
    expect(run).toContain('DAYS: ${{ inputs.days }}');
    expect(run).toContain('USER: ${{ inputs.user }}');
    expect(run).toContain('if [ -n "$USER" ]; then args+=(--user "$USER"); fi');
    expect(run).toContain('pnpm --silent slo:attribute "${args[@]}" | tee attribution.md');
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });

  it('writes the report to the job summary, even when the run failed', () => {
    expect(workflow).toContain('- name: Write the report to the job summary\n        if: always()');
    const summary = stepScript('Write the report to the job summary');
    expect(summary).toContain('cat attribution.md >> "$GITHUB_STEP_SUMMARY"');
    expect(summary).toContain('echo \'No attribution output.\' >> "$GITHUB_STEP_SUMMARY"');
  });

  it('deploys nothing, migrates nothing and dispatches no other workflow', () => {
    expect(workflow).not.toMatch(/vercel|db:migrate|db:bootstrap|content:publish|gh workflow run/);
  });
});
