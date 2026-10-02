import { sql, type SQL } from 'drizzle-orm';
import { check, timestamp, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { IdPrefix } from '../lib/ids';

/**
 * Column and constraint helpers shared by the `core`, `analytics` and `ledger` schemas
 * (architecture §6): instants are `timestamptz`, and every enum is text with a check constraint,
 * so adding a value is an expand-only migration.
 */

/** An instant: `timestamptz`, read as a `Date`. */
export function instant(name: string) {
  return timestamp(name, { withTimezone: true, mode: 'date' });
}

/** `column IN ('a', 'b', …)`. The values are code constants, never user input. */
export function oneOf(column: AnyPgColumn, values: readonly string[]): SQL {
  const list = values.map((value) => {
    if (!/^[a-z0-9_]+$/.test(value)) throw new Error(`oneOf(): "${value}" is not a plain token`);
    return `'${value}'`;
  });
  return sql`${column} in (${sql.raw(list.join(', '))})`;
}

/** A check constraint named `<table>_<column>_check` that keeps `column` to `values`. */
export function checkOneOf(table: string, column: AnyPgColumn, values: readonly string[]) {
  return check(`${table}_${column.name}_check`, oneOf(column, values));
}

/** A check constraint that `column` holds a prefixed ULID such as `hld_01J…` (architecture §6). */
export function checkId(table: string, column: AnyPgColumn, prefix: IdPrefix) {
  return check(
    `${table}_${column.name}_check`,
    sql`${column} ~ ${sql.raw(`'^${prefix}_[0-7][0-9A-HJKMNP-TV-Z]{25}$'`)}`,
  );
}

/** A check constraint that `column` is an ISO 4217 code: three capital letters. */
export function checkCurrency(table: string, column: AnyPgColumn) {
  return check(`${table}_${column.name}_check`, sql`${column} ~ '^[A-Z]{3}$'`);
}
