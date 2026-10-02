/**
 * `pnpm db:generate [--custom] [--name <what-it-does>]`: drizzle-kit writes a migration for a
 * schema change into apps/api/migrations, then Prettier formats its JSON, so `pnpm lint` passes.
 * drizzle-kit reads the formatted files as they are.
 */
import { spawnSync } from 'node:child_process';

function step(command: string, args: string[]): void {
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
}

step('drizzle-kit', ['generate', ...process.argv.slice(2)]);
step('prettier', ['--write', '--log-level', 'warn', 'apps/api/migrations']);
