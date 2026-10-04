import { sql } from 'drizzle-orm';
import type { Executor } from './client';
import { rateLimit } from './schema';

/**
 * Counts one hit on `key` in the fixed window starting at `windowStart` (architecture §8) and
 * returns the window's count, this hit included. One upsert, so concurrent hits on any function
 * instance never lose a count.
 */
export async function countHit(db: Executor, key: string, windowStart: Date): Promise<number> {
  const rows = await db
    .insert(rateLimit)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimit.key, rateLimit.windowStart],
      set: { count: sql`${rateLimit.count} + 1` },
    })
    .returning({ count: rateLimit.count });
  const count = rows[0]?.count;
  if (count === undefined) throw new Error('countHit(): the upsert returned no row');
  return count;
}
