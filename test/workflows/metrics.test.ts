import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The metrics workflow (P4-T3): dispatched by hand with a window, it runs `pnpm metrics` as
 * `netnet_metrics` with the two repository secrets and writes the tables to the job summary. No
 * `environment:` key, so a dispatch never waits for a reviewer; nothing is deployed or migrated.
 */
const FILE = '.github/workflows/metrics.yml';
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

describe('the metrics workflow (metrics.yml)', () => {
  it('is dispatched by hand with a required from and an optional to', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request|workflow_run):/m);
    expect(workflow).toMatch(/^ {6}from:\n(?: {8}.+\n)* {8}required: true$/m);
    expect(workflow).toMatch(/^ {6}to:\n(?: {8}.+\n)* {8}required: false$/m);
  });

  it('waits for no reviewer: no `environment:` key, and reads only the repository', () => {
    expect(workflow).not.toMatch(/^ {4}environment:/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('runs pnpm metrics with the metrics secrets through env, never inline', () => {
    const run = stepScript('Run the metrics');
    expect(run).toContain('DATABASE_METRICS_URL: ${{ secrets.DATABASE_METRICS_URL }}');
    expect(run).toContain('METRICS_EXCLUDE_USERS: ${{ secrets.METRICS_EXCLUDE_USERS }}');
    expect(run).toContain('FROM: ${{ inputs.from }}');
    expect(run).toContain('TO: ${{ inputs.to }}');
    expect(run).toContain('args=(--env production --from "$FROM")');
    expect(run).toContain('if [ -n "$TO" ]; then args+=(--to "$TO"); fi');
    expect(run).toContain('pnpm --silent metrics "${args[@]}" | tee metrics.md');
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });

  it('writes the tables to the job summary, even when the run failed', () => {
    expect(workflow).toContain('- name: Write the tables to the job summary\n        if: always()');
    const summary = stepScript('Write the tables to the job summary');
    expect(summary).toContain('cat metrics.md >> "$GITHUB_STEP_SUMMARY"');
    expect(summary).toContain('echo \'No metrics output.\' >> "$GITHUB_STEP_SUMMARY"');
  });

  it('deploy passes the metrics password to db:bootstrap (F24)', () => {
    const deploy = readFileSync(resolve(ROOT, '.github/workflows/deploy.yml'), 'utf8');
    expect(deploy).toContain(
      'NETNET_METRICS_DB_PASSWORD: ${{ secrets.NETNET_METRICS_DB_PASSWORD_PROD }}',
    );
  });
});
