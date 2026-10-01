import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APP_ROLE, CONTENT_ADMIN_ROLE, METRICS_ROLE, ROLES } from '../../src/db/bootstrap';
import { createTestDatabase, sqlState, type TestDatabase } from '../isolation/harness';

/**
 * The roles and grants of architecture §6.1, read from the catalog for every table in each schema
 * (so tables added later are covered), then tried for real.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);

afterAll(async () => {
  await db?.close();
});

const PRIVILEGES = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
const WRITE = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
const INSERT_ONLY = ['INSERT', 'SELECT'];

/** Each table in `schema` with the privileges `role` holds on it. */
async function privileges(role: string, schema: string): Promise<Record<string, string[]>> {
  const { rows } = await db.owner.query<{ table: string; privilege: string }>(
    `select c.relname as table, p.privilege
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       cross join unnest($3::text[]) as p(privilege)
      where n.nspname = $2 and c.relkind in ('r', 'p', 'v', 'm')
        and has_table_privilege($1, c.oid, p.privilege)
      order by 1, 2`,
    [role, schema, PRIVILEGES],
  );
  const { rows: tables } = await db.owner.query<{ table: string }>(
    `select c.relname as table from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind in ('r', 'p', 'v', 'm') order by 1`,
    [schema],
  );
  const byTable: Record<string, string[]> = {};
  for (const { table } of tables) byTable[table] = [];
  for (const { table, privilege } of rows) byTable[table]?.push(privilege);
  return byTable;
}

function every(tables: Record<string, string[]>, granted: string[]): Record<string, string[]> {
  return Object.fromEntries(Object.keys(tables).map((table) => [table, [...granted].sort()]));
}

async function usage(role: string, schema: string): Promise<boolean> {
  const { rows } = await db.owner.query<{ ok: boolean }>(
    `select has_schema_privilege($1, $2, 'USAGE') as ok`,
    [role, schema],
  );
  return rows[0]?.ok === true;
}

describe('the roles', () => {
  it.each(ROLES)(
    '%s is no superuser, cannot bypass RLS and cannot make roles or databases',
    async (role) => {
      const { rows } = await db.owner.query(
        `select rolsuper, rolbypassrls, rolcreaterole, rolcreatedb, rolreplication
         from pg_roles where rolname = $1`,
        [role],
      );
      expect(rows).toEqual([
        {
          rolsuper: false,
          rolbypassrls: false,
          rolcreaterole: false,
          rolcreatedb: false,
          rolreplication: false,
        },
      ]);
    },
  );

  it('only netnet_app can log in', async () => {
    const { rows } = await db.owner.query<{ rolname: string; rolcanlogin: boolean }>(
      `select rolname, rolcanlogin from pg_roles where rolname = any($1) order by 1`,
      [ROLES],
    );
    expect(rows).toEqual([
      { rolname: APP_ROLE, rolcanlogin: true },
      { rolname: CONTENT_ADMIN_ROLE, rolcanlogin: false },
      { rolname: METRICS_ROLE, rolcanlogin: false },
    ]);
  });

  it('netnet_app owns nothing, in any database', async () => {
    const { rows: shared } = await db.owner.query(
      `select classid::regclass::text, objid from pg_shdepend
        where refobjid = (select oid from pg_roles where rolname = $1) and deptype = 'o'`,
      [APP_ROLE],
    );
    expect(shared).toEqual([]);
    const { rows: local } = await db.owner.query(
      `select 'relation' as kind, relname as name from pg_class
        where relowner = (select oid from pg_roles where rolname = $1)
       union all select 'schema', nspname from pg_namespace
        where nspowner = (select oid from pg_roles where rolname = $1)
       union all select 'function', proname from pg_proc
        where proowner = (select oid from pg_roles where rolname = $1)
       union all select 'type', typname from pg_type
        where typowner = (select oid from pg_roles where rolname = $1)
       union all select 'database', datname from pg_database
        where datdba = (select oid from pg_roles where rolname = $1)`,
      [APP_ROLE],
    );
    expect(local).toEqual([]);
  });

  it('netnet_app is a member of no role that bypasses RLS, directly or through another role', async () => {
    const { rows } = await db.owner.query<{
      rolname: string;
      rolsuper: boolean;
      rolbypassrls: boolean;
    }>(
      `with recursive member_of(oid) as (
         select m.roleid from pg_auth_members m where m.member = (select oid from pg_roles where rolname = $1)
         union
         select m.roleid from pg_auth_members m join member_of on m.member = member_of.oid
       )
       select r.rolname, r.rolsuper, r.rolbypassrls from member_of join pg_roles r on r.oid = member_of.oid`,
      [APP_ROLE],
    );
    expect(rows.filter((r) => r.rolsuper || r.rolbypassrls)).toEqual([]);
  });

  it('netnet_app gets all of this from the migrations, not from PUBLIC', async () => {
    for (const schema of ['core', 'ledger', 'analytics']) {
      expect({ schema, public: await usage('public', schema) }).toEqual({ schema, public: false });
    }
  });
});

describe('netnet_app', () => {
  it('reads and writes every core table; content documents are immutable', async () => {
    const found = await privileges(APP_ROLE, 'core');
    expect(Object.keys(found).length).toBeGreaterThan(0);
    expect(found).toEqual({ ...every(found, WRITE), content_doc: INSERT_ONLY });
  });

  it('reads and writes every ledger table, never TRUNCATE (which RLS does not cover)', async () => {
    const found = await privileges(APP_ROLE, 'ledger');
    expect(Object.keys(found).length).toBeGreaterThan(0);
    expect(found).toEqual(every(found, WRITE));
  });

  it('can only insert into analytics.event, and has nothing on any other analytics table', async () => {
    const found = await privileges(APP_ROLE, 'analytics');
    expect(found).toEqual({ ...every(found, []), event: ['INSERT'] });
  });

  it('inserts an event and cannot read, change or delete one', async () => {
    const insert = await db.app.query(
      `insert into analytics.event (name, segment, app_version) values ('session_started', 'unknown', 'test')`,
    );
    expect(insert.rowCount).toBe(1);
    expect(await sqlState(db.app.query('select * from analytics.event'))).toBe('42501');
    expect(await sqlState(db.app.query(`update analytics.event set name = 'x'`))).toBe('42501');
    expect(await sqlState(db.app.query('delete from analytics.event'))).toBe('42501');
  });

  it('cannot truncate a ledger table or change the schema', async () => {
    expect(await sqlState(db.app.query('truncate ledger.holding'))).toBe('42501');
    expect(
      await sqlState(db.app.query('alter table ledger.holding disable row level security')),
    ).toBe('42501');
    expect(await sqlState(db.app.query('drop policy user_isolation on ledger.holding'))).toBe(
      '42501',
    );
    expect(await sqlState(db.app.query('create table ledger.mine (user_id text)'))).toBe('42501');
  });
});

describe('netnet_metrics', () => {
  it('reads every analytics table and nothing else', async () => {
    const found = await privileges(METRICS_ROLE, 'analytics');
    expect(Object.keys(found).length).toBeGreaterThan(0);
    expect(found).toEqual(every(found, ['SELECT']));
    const core = await privileges(METRICS_ROLE, 'core');
    expect(core).toEqual(every(core, []));
    const ledger = await privileges(METRICS_ROLE, 'ledger');
    expect(ledger).toEqual(every(ledger, []));
    expect(await usage(METRICS_ROLE, 'core')).toBe(false);
    expect(await usage(METRICS_ROLE, 'ledger')).toBe(false);
  });

  it('is refused the ledger and core when it tries', async () => {
    const client = await db.owner.connect();
    try {
      await client.query(`set role ${METRICS_ROLE}`);
      expect((await client.query('select count(*) from analytics.event')).rowCount).toBe(1);
      expect(await sqlState(client.query('select * from ledger.holding'))).toBe('42501');
      expect(await sqlState(client.query('select * from core.profile'))).toBe('42501');
    } finally {
      await client.query('reset role');
      client.release();
    }
  });
});

describe('netnet_content_admin', () => {
  it('writes core.content_* and has nothing on any other table, identity included', async () => {
    const core = await privileges(CONTENT_ADMIN_ROLE, 'core');
    expect(core).toEqual({
      ...every(core, []),
      content_doc: INSERT_ONLY,
      content_current: ['INSERT', 'SELECT', 'UPDATE'],
      content_audit: INSERT_ONLY,
    });
    const ledger = await privileges(CONTENT_ADMIN_ROLE, 'ledger');
    expect(ledger).toEqual(every(ledger, []));
    const analytics = await privileges(CONTENT_ADMIN_ROLE, 'analytics');
    expect(analytics).toEqual(every(analytics, []));
    expect(await usage(CONTENT_ADMIN_ROLE, 'ledger')).toBe(false);
    expect(await usage(CONTENT_ADMIN_ROLE, 'analytics')).toBe(false);
  });

  it('publishes a content version, and is refused profiles and the ledger', async () => {
    const client = await db.owner.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${CONTENT_ADMIN_ROLE}`);
      await client.query(
        `insert into core.content_doc (kind, key, version, body, sha256, author)
         values ('pack', 'generic', 1, '{}', repeat('0', 64), 'test')`,
      );
      await client.query(
        `insert into core.content_audit (kind, key, to_version, actor) values ('pack', 'generic', 1, 'test')`,
      );
      await client.query('savepoint before_denied');
      expect(await sqlState(client.query('select * from core.profile'))).toBe('42501');
      await client.query('rollback to savepoint before_denied');
      expect(await sqlState(client.query('select * from ledger.holding'))).toBe('42501');
    } finally {
      await client.query('rollback');
      client.release();
    }
  });
});
