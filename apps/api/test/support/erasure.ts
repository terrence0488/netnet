import type { Pool } from 'pg';

/**
 * Where an account's id is still written down (PRD J10): every text column of every table in
 * `core` (identity included) and `ledger`, read from the catalog, so a table or column added later
 * is searched too. Returns `schema.table.column` → how many rows hold `id` there, for the columns
 * that hold it at all. `analytics` is left out: its events are re-keyed, which their own tests
 * check. Run as the owner, which row-level security does not hide rows from.
 */
export async function rowsCarrying(owner: Pool, id: string): Promise<Record<string, number>> {
  const { rows: columns } = await owner.query<{ schema: string; table: string; column: string }>(
    `select c.table_schema as schema, c.table_name as table, c.column_name as column
       from information_schema.columns c
       join information_schema.tables t
         on t.table_schema = c.table_schema and t.table_name = c.table_name
      where c.table_schema in ('core', 'ledger') and t.table_type = 'BASE TABLE'
        and c.data_type = 'text'
      order by 1, 2, 3`,
  );
  const found: Record<string, number> = {};
  for (const { schema, table, column } of columns) {
    const { rows } = await owner.query<{ n: number }>(
      `select count(*)::int as n from "${schema}"."${table}" where "${column}" = $1`,
      [id],
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) found[`${schema}.${table}.${column}`] = n;
  }
  return found;
}
