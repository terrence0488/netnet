import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The health workflow (P4-T4): daily at 01:00 UTC and by hand with a `test_alert` boolean, it runs
 * `pnpm health`, which reads Neon and the N1 SLO and posts them to `/api/cron/health`. The
 * function adds the `core` figures and emails the Founder. The step fails when the handler reports
 * a trigger, so a red run is the second signal after the email.
 */
const FILE = '.github/workflows/cron-health.yml';
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

describe('the health workflow (cron-health.yml)', () => {
  it('runs daily at 01:00 UTC and by hand with a test_alert boolean', () => {
    expect(workflow).toMatch(/^on:\n {2}schedule:\n {4}- cron: '0 1 \* \* \*'\n/m);
    expect(workflow).toMatch(/^ {2}workflow_dispatch:\n {4}inputs:\n {6}test_alert:/m);
    expect(workflow).toMatch(/^ {8}type: boolean$/m);
    expect(workflow).toMatch(/^ {8}default: false$/m);
  });

  it('waits for no reviewer: no `environment:` key, and reads only the repository', () => {
    expect(workflow).not.toMatch(/^\s*environment:/m);
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('passes every secret and variable through env, never inline', () => {
    const run = stepScript('Read Neon and the N1 SLO, then post them');
    expect(run).toContain('PUBLIC_ORIGIN: ${{ vars.PUBLIC_ORIGIN }}');
    expect(run).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}');
    expect(run).toContain('NEON_API_KEY: ${{ secrets.NEON_API_KEY }}');
    expect(run).toContain('NEON_PROD_PROJECT_ID: ${{ vars.NEON_PROD_PROJECT_ID }}');
    expect(run).toContain('DATABASE_METRICS_URL: ${{ secrets.DATABASE_METRICS_URL }}');
    expect(run).toContain('METRICS_EXCLUDE_USERS: ${{ secrets.METRICS_EXCLUDE_USERS }}');
    expect(run).toContain('TEST_ALERT: ${{ inputs.test_alert }}');
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });

  it('runs pnpm health, adding --test-alert for a dispatched test', () => {
    const run = stepScript('Read Neon and the N1 SLO, then post them');
    expect(run).toContain('args=(--env production)');
    expect(run).toContain('if [ "$TEST_ALERT" = "true" ]; then args+=(--test-alert); fi');
    expect(run).toContain('pnpm --silent health "${args[@]}"');
  });

  it('fails the run when a trigger fired: the step has no continue-on-error or `|| true`', () => {
    expect(workflow).not.toContain('continue-on-error');
    expect(stepScript('Read Neon and the N1 SLO, then post them')).not.toContain('|| true');
  });
});
