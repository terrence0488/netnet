import type { ClientBase, Pool } from 'pg';

/**
 * CONVENTIONS §10's rules for the `ledger` schema, read from the catalog. Returns one line per
 * broken rule, so an empty list means every table, including ones added later, follows them.
 */
export async function ledgerViolations(db: ClientBase | Pool): Promise<string[]> {
  const violations: string[] = [];
  const rows = async <T extends Record<string, unknown>>(text: string) =>
    (await db.query<T>(text)).rows;

  const tables = await rows<{
    table: string;
    userIdType: string | null;
    userIdNotNull: boolean | null;
    primaryKey: string[] | null;
    enabled: boolean;
    forced: boolean;
    ownedByState: boolean;
  }>(
    `select c.relname as table,
            format_type(a.atttypid, a.atttypmod) as "userIdType",
            a.attnotnull as "userIdNotNull",
            (select array_agg(pa.attname::text order by k.ord)
               from pg_constraint p
               cross join unnest(p.conkey) with ordinality k(attnum, ord)
               join pg_attribute pa on pa.attrelid = p.conrelid and pa.attnum = k.attnum
              where p.conrelid = c.oid and p.contype = 'p') as "primaryKey",
            c.relrowsecurity as enabled,
            c.relforcerowsecurity as forced,
            exists (select 1 from pg_constraint k
                     where k.conrelid = c.oid and k.contype = 'f'
                       and k.confrelid = 'ledger.ledger_state'::regclass
                       and k.conkey = array[a.attnum] and k.confdeltype = 'c') as "ownedByState"
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       left join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
      where n.nspname = 'ledger' and c.relkind in ('r', 'p')
      order by 1`,
  );
  for (const t of tables) {
    if (t.userIdType !== 'text' || t.userIdNotNull !== true) {
      violations.push(`${t.table}: user_id is not text not null`);
    }
    if (!t.primaryKey?.includes('user_id')) {
      violations.push(`${t.table}: user_id is not in the primary key`);
    }
    if (!t.enabled) violations.push(`${t.table}: row-level security is not enabled`);
    if (!t.forced) violations.push(`${t.table}: row-level security is not forced`);
    if (t.table !== 'ledger_state' && !t.ownedByState) {
      violations.push(`${t.table}: no user_id foreign key to ledger_state with on delete cascade`);
    }
  }

  const expected = "(user_id = current_setting('app.user_id'::text, true))";
  const policies = await rows<{
    table: string;
    name: string;
    permissive: string;
    roles: string[];
    cmd: string;
    qual: string | null;
    withCheck: string | null;
  }>(
    `select tablename as table, policyname as name, permissive, roles::text[] as roles, cmd,
            qual, with_check as "withCheck"
       from pg_policies where schemaname = 'ledger'`,
  );
  for (const t of tables) {
    const own = policies.filter((p) => p.table === t.table);
    const [only] = own;
    const isTheOne =
      own.length === 1 &&
      only?.name === 'user_isolation' &&
      only.permissive === 'PERMISSIVE' &&
      only.cmd === 'ALL' &&
      only.roles.length === 1 &&
      only.roles[0] === 'public' &&
      only.qual === expected &&
      only.withCheck === expected;
    if (!isTheOne) {
      violations.push(
        `${t.table}: policies are not exactly user_isolation (found ${own.map((p) => p.name).join(', ') || 'none'})`,
      );
    }
  }

  const foreignKeys = await rows<{
    name: string;
    table: string;
    target: string;
    pairs: [string, string][];
  }>(
    `select k.conname as name, c.relname as table, tn.nspname || '.' || t.relname as target,
            (select json_agg(json_build_array(ca.attname, ta.attname) order by u.ord)
               from unnest(k.conkey, k.confkey) with ordinality u(child, parent, ord)
               join pg_attribute ca on ca.attrelid = k.conrelid and ca.attnum = u.child
               join pg_attribute ta on ta.attrelid = k.confrelid and ta.attnum = u.parent) as pairs
       from pg_constraint k
       join pg_class c on c.oid = k.conrelid
       join pg_namespace n on n.oid = c.relnamespace
       join pg_class t on t.oid = k.confrelid
       join pg_namespace tn on tn.oid = t.relnamespace
      where k.contype = 'f' and n.nspname = 'ledger'`,
  );
  for (const k of foreignKeys) {
    if (!k.target.startsWith('ledger.')) {
      violations.push(`${k.table}: foreign key ${k.name} points outside ledger, at ${k.target}`);
    }
    if (!k.pairs.some(([child, parent]) => child === 'user_id' && parent === 'user_id')) {
      violations.push(`${k.table}: foreign key ${k.name} does not pair user_id with user_id`);
    }
  }

  const uniques = await rows<{ table: string; index: string; hasUserId: boolean }>(
    `select c.relname as table, i.relname as index,
            exists (select 1 from unnest(x.indkey) as k(attnum)
                      join pg_attribute a on a.attrelid = x.indrelid and a.attnum = k.attnum
                     where a.attname = 'user_id') as "hasUserId"
       from pg_index x
       join pg_class i on i.oid = x.indexrelid
       join pg_class c on c.oid = x.indrelid
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'ledger' and x.indisunique`,
  );
  for (const u of uniques) {
    if (!u.hasUserId) {
      violations.push(`${u.table}: unique index ${u.index} does not include user_id`);
    }
  }

  const others = await rows<{ name: string; kind: string }>(
    `select c.relname as name, c.relkind::text as kind
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'ledger' and c.relkind in ('v', 'm', 'f')`,
  );
  for (const o of others) {
    violations.push(`${o.name}: a relation of kind ${o.kind}, which the policies do not cover`);
  }

  const definers = await rows<{ name: string }>(
    `select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'ledger' and p.prosecdef`,
  );
  for (const d of definers) {
    violations.push(`${d.name}: a SECURITY DEFINER function, which runs as its owner`);
  }

  return violations.sort();
}
