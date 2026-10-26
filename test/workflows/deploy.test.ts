import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The deploy gate (P4-T14): production moves only on a commit whose own `Checks` job is green.
 * The merged pull request's run proves the tree it carried, not the tree main holds after a rebase
 * or a second merge, so the workflow reads main's `Checks` result by name — before it migrates,
 * publishes or deploys — and stops with a plain message when it is missing, running, red or
 * cancelled. Dispatch stays manual (docs/decisions.md, Delivery).
 */
const FILE = '.github/workflows/deploy.yml';
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

describe('the deploy gate (deploy.yml)', () => {
  it('stays manual, on main only, with the rollback proof still available', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(workflow).not.toMatch(/^ {2}(push|pull_request|schedule|workflow_run):/m);
    expect(workflow).toMatch(/^ {4}if: github\.ref == 'refs\/heads\/main'$/m);
    expect(workflow).toMatch(/^ {6}prove_rollback:/m);
  });

  it('may read the commit’s Checks, and still only the repository', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n {2}#.+\n {2}checks: read\n/m);
    expect(workflow).not.toMatch(/^\s+(actions|deployments|id-token|packages):/m);
  });

  it('reads `Checks` by name on the commit being deployed, not the merged PR run', () => {
    const run = stepScript("Wait for main's green Checks");
    expect(run).toContain('check-runs?check_name=Checks');
    expect(run).toContain('/commits/$GITHUB_SHA/');
    expect(run).toContain('GH_TOKEN: ${{ github.token }}');
    expect(run).toContain(`[ "$status" = 'completed' ] && [ "$conclusion" = 'success' ]`);
  });

  it('waits for a running Checks, then stops with a plain message when it is not green', () => {
    const run = stepScript("Wait for main's green Checks");
    expect(run).toContain('deadline=$((SECONDS + 900))');
    expect(run).toContain('sleep 30');
    expect(run).toContain('has not finished after 15 minutes');
    expect(run).toContain('finished $conclusion, not success');
    expect((run.match(/::error::/g) ?? []).length).toBe(2);
    expect((run.match(/exit 1/g) ?? []).length).toBe(2);
  });

  it('gates before anything is migrated, published or deployed', () => {
    const gate = workflow.indexOf("- name: Wait for main's green Checks");
    expect(gate).toBeGreaterThan(-1);
    for (const later of [
      '- name: Bootstrap, migrate and publish content to production',
      '- name: Pull the production settings',
      '- name: Build',
      '- name: Deploy to production',
      '- name: Smoke-test production',
    ]) {
      expect(workflow.indexOf(later), later).toBeGreaterThan(gate);
    }
  });

  it('passes every secret through env, never inline', () => {
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });
});
