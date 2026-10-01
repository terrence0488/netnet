import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit's view of the database (CONVENTIONS §10). `pnpm db:generate` writes a migration for
 * a schema change into apps/api/migrations; `pnpm db:migrate` applies them as the owner. Anything
 * drizzle-kit cannot express (FORCE ROW LEVEL SECURITY, grants) goes in a custom migration:
 * `pnpm db:generate --custom --name <what-it-does>`.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./apps/api/src/db/schema.ts', './apps/api/src/ledger/schema.ts'],
  out: './apps/api/migrations',
  schemaFilter: ['core', 'ledger', 'analytics'],
  strict: true,
  verbose: true,
});
