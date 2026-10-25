import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..', '..');

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/** A workflow's `- cron: '…'` schedules, in order. */
function schedules(workflow: string): string[] {
  return [...workflow.matchAll(/^\s+- cron: '([^']+)'$/gm)].map((match) => match[1] ?? '');
}

/**
 * Every scheduled job is a GitHub Actions schedule calling its handler with CRON_SECRET, and
 * vercel.json carries no crons: Vercel's scheduler never fired them (architecture §9.3).
 */
describe('scheduled work', () => {
  it('leaves vercel.json without crons', () => {
    const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>;
    expect(vercel).not.toHaveProperty('crons');
  });

  describe('the reminder runs (cron-reminders.yml)', () => {
    const workflow = read('.github/workflows/cron-reminders.yml');

    it('run at 01:00, 09:00 and 17:00 UTC, and by hand', () => {
      expect(schedules(workflow)).toStrictEqual(['0 1 * * *', '0 9 * * *', '0 17 * * *']);
      expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m);
    });

    it('call the reminders handler with the bearer secret and fail on anything but 200', () => {
      expect(workflow).toContain('PUBLIC_ORIGIN: ${{ vars.PUBLIC_ORIGIN }}');
      expect(workflow).toContain('CRON_SECRET: ${{ secrets.CRON_SECRET }}');
      expect(workflow).toContain(
        '-H "Authorization: Bearer $CRON_SECRET" "$PUBLIC_ORIGIN/api/cron/reminders"',
      );
      expect(workflow).toContain('if [ "$code" != 200 ]; then');
    });

    it('wait for no reviewer: no `environment:`', () => {
      expect(workflow).not.toMatch(/^\s*environment:/m);
    });
  });

  describe('the health check (cron-health.yml)', () => {
    const workflow = read('.github/workflows/cron-health.yml');

    it('runs daily at 01:00 UTC, in the reminder run’s wake, and by hand', () => {
      expect(schedules(workflow)).toStrictEqual(['0 1 * * *']);
      expect(workflow).toMatch(/^ {2}workflow_dispatch:$/m);
    });

    it('waits for no reviewer: no `environment:`', () => {
      expect(workflow).not.toMatch(/^\s*environment:/m);
    });
  });
});
