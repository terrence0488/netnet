import { escapeIdentifier, escapeLiteral, type ClientBase } from 'pg';

/**
 * The roles the migrations grant to (architecture §6.1). Roles made in Neon's console inherit
 * `neon_superuser`, which bypasses row-level security, so these are made here, by SQL, as
 * `netnet_owner`. No password is ever stored in the repo: `netnet_app`'s comes from the
 * environment at run time. The other two cannot log in until a later task needs them to.
 */
export const APP_ROLE = 'netnet_app';
export const METRICS_ROLE = 'netnet_metrics';
export const CONTENT_ADMIN_ROLE = 'netnet_content_admin';
export const ROLES = [APP_ROLE, METRICS_ROLE, CONTENT_ADMIN_ROLE] as const;

/** It goes inside a connection string, so letters and digits only (`openssl rand -hex 32`). */
const PASSWORD = /^[A-Za-z0-9]{32,128}$/;

/** Attributes none of the roles may have. */
const FORBIDDEN = ['rolsuper', 'rolbypassrls', 'rolcreaterole', 'rolcreatedb', 'rolreplication'];

/** Serialises concurrent bootstraps, which would race on CREATE ROLE. */
const LOCK_KEY = 'netnet.db.bootstrap';

export interface BootstrapOptions {
  /** `netnet_app`'s password: `NETNET_APP_DB_PASSWORD`. */
  appPassword: string;
}

/**
 * Creates the three roles if they are missing and sets `netnet_app`'s password. Idempotent: run it
 * before every `db:migrate`. It refuses, rather than repairs, a role that already exists with a
 * forbidden attribute or a membership that bypasses row-level security: that needs a person.
 */
export async function bootstrapRoles(client: ClientBase, options: BootstrapOptions): Promise<void> {
  if (!PASSWORD.test(options.appPassword)) {
    throw new Error(
      'NETNET_APP_DB_PASSWORD must be 32 to 128 letters and digits (use `openssl rand -hex 32`).',
    );
  }
  await client.query('begin');
  try {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [LOCK_KEY]);
    for (const role of ROLES) {
      const { rowCount } = await client.query('select 1 from pg_roles where rolname = $1', [role]);
      if (rowCount === 0) {
        await client.query(
          `create role ${escapeIdentifier(role)} nologin nosuperuser nocreatedb nocreaterole ` +
            'noreplication nobypassrls inherit',
        );
      }
      await assertConfined(client, role);
    }
    await client.query(
      `alter role ${escapeIdentifier(APP_ROLE)} with login password ${escapeLiteral(options.appPassword)}`,
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

/** Throws if `role` has a forbidden attribute or reaches a role that bypasses RLS. */
async function assertConfined(client: ClientBase, role: string): Promise<void> {
  const { rows } = await client.query<Record<string, boolean>>(
    `select ${FORBIDDEN.join(', ')} from pg_roles where rolname = $1`,
    [role],
  );
  const attributes = rows[0] ?? {};
  const held = FORBIDDEN.filter((attribute) => attributes[attribute] === true);
  if (held.length > 0) {
    throw new Error(`Role ${role} has ${held.join(', ')}; remove it by hand, then run this again.`);
  }
  const { rows: bypassing } = await client.query<{ rolname: string }>(
    `with recursive member_of(oid) as (
       select m.roleid from pg_auth_members m join pg_roles r on r.oid = m.member
        where r.rolname = $1
       union
       select m.roleid from pg_auth_members m join member_of on m.member = member_of.oid
     )
     select r.rolname from member_of join pg_roles r on r.oid = member_of.oid
      where r.rolsuper or r.rolbypassrls`,
    [role],
  );
  if (bypassing.length > 0) {
    const names = bypassing.map((r) => r.rolname).join(', ');
    throw new Error(`Role ${role} is a member of ${names}, which bypasses row-level security.`);
  }
}
