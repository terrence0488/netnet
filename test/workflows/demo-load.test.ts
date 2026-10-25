import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inlineTokensIn } from './scan';

/**
 * The demo household's workflow (P4-T1): dispatched by hand for production only, it loads with
 * the repository's DATABASE_URL and waits for no reviewer, and the account's email never reaches
 * the log: it is read from the event payload, masked before anything else, and passed on by name.
 */
const FILE = '.github/workflows/demo-load.yml';
const workflow = readFileSync(resolve(import.meta.dirname, '..', '..', FILE), 'utf8');

/** The `run:` block of the step named `name`. */
function stepScript(name: string): string {
  const start = workflow.indexOf(`- name: ${name}\n`);
  expect(start, name).toBeGreaterThan(-1);
  const rest = workflow.slice(start + 1);
  const next = rest.search(/\n {6}- /);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('the demo household workflow (demo-load.yml)', () => {
  it('runs only when dispatched by hand, with an environment that is production only', () => {
    expect(workflow).toMatch(/^on:\n {2}workflow_dispatch:\n {4}inputs:\n/m);
    expect(workflow).not.toMatch(/^\s+(schedule|push|pull_request|workflow_run):/m);
    expect(workflow).toContain(
      [
        '      environment:',
        "        description: 'Where to load it'",
        '        required: true',
        '        default: production',
        '        type: choice',
        '        options:',
        '          - production',
      ].join('\n'),
    );
    expect(workflow).toMatch(/^ {6}email:\n(?: {8}.+\n)* {8}required: true\n/m);
  });

  it('reads only the repository', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\n/m);
  });

  it('waits for no reviewer: no `environment:` key on the job', () => {
    expect(workflow).not.toMatch(/^ {4}environment:/m);
    expect(workflow).not.toMatch(/^\s+environment: [A-Za-z]/m);
  });

  it('loads with the DATABASE_URL secret through env, never inline', () => {
    const load = stepScript('Load the household');
    expect(load).toContain('DATABASE_URL: ${{ secrets.DATABASE_URL }}');
    expect(load).toContain('run: pnpm --silent demo:load --env "$DEMO_ENV" --email "$DEMO_EMAIL"');
    expect(inlineTokensIn(FILE, workflow)).toStrictEqual([]);
  });

  it('never puts the email in an expression, so no step prints it', () => {
    const expressions = [...workflow.matchAll(/\$\{\{[\s\S]*?\}\}/g)].map((m) => m[0]);
    expect(expressions.length).toBeGreaterThan(0);
    expect(expressions.filter((e) => /email/i.test(e))).toStrictEqual([]);
  });

  it('masks the email first, read from the event payload, one line, before it is handed on', () => {
    const steps = [...workflow.matchAll(/^ {6}- (?:name|uses): (.+)$/gm)].map((m) => m[1]);
    expect(steps[0]).toBe('Mask the email');
    const mask = stepScript('Mask the email');
    const read = mask.indexOf(`email=$(jq -r '.inputs.email // ""' "$GITHUB_EVENT_PATH")`);
    // A value of more than one line would be masked by its first line only: it is refused unseen.
    const checked = mask.indexOf('if ! [[ "$email" =~ ^[^[:space:]@]+@[^[:space:]@]+$ ]]; then');
    const masked = mask.indexOf('echo "::add-mask::$email"');
    const handed = mask.indexOf('echo "DEMO_EMAIL=$email" >> "$GITHUB_ENV"');
    expect(read).toBeGreaterThan(-1);
    expect(checked).toBeGreaterThan(read);
    expect(masked).toBeGreaterThan(checked);
    expect(handed).toBeGreaterThan(masked);
    expect(mask.match(/\$email/g)).toHaveLength(3);
    expect(mask).not.toMatch(/^\s+env:/m);
  });
});
