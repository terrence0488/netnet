-- Row-level security binds the tables' owner too (architecture §6.1). 0000 enabled it with each
-- table's policy; drizzle-kit cannot express FORCE. A new ledger table needs the same line in its
-- own migration: apps/api/test/rls/schema.test.ts fails the build without it.
ALTER TABLE "ledger"."ledger_state" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."user_type" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."tag" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."holding" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."holding_tag" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."batch" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."value" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."prefs" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "ledger"."audit" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint

-- Grants (architecture §6.1). The roles come from `pnpm db:bootstrap`, which runs first. Default
-- privileges cover tables the owner adds later; the schema test checks every table either way.
REVOKE ALL ON SCHEMA "core", "ledger", "analytics" FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "core" TO netnet_app, netnet_content_admin;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "ledger" TO netnet_app;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "analytics" TO netnet_app, netnet_metrics;
--> statement-breakpoint

-- netnet_app reads and writes core. Content documents are immutable once written.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "core" TO netnet_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "core" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO netnet_app;
--> statement-breakpoint
REVOKE UPDATE, DELETE ON "core"."content_doc" FROM netnet_app;
--> statement-breakpoint

-- netnet_app reaches ledger rows only through the policy. Never TRUNCATE: RLS does not cover it.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA "ledger" TO netnet_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "ledger" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO netnet_app;
--> statement-breakpoint

-- netnet_app inserts events and cannot read them back.
GRANT INSERT ON "analytics"."event" TO netnet_app;
--> statement-breakpoint

-- netnet_metrics reads analytics, and nothing else.
GRANT SELECT ON ALL TABLES IN SCHEMA "analytics" TO netnet_metrics;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "analytics" GRANT SELECT ON TABLES TO netnet_metrics;
--> statement-breakpoint

-- netnet_content_admin (the future portal) writes content, and nothing else.
GRANT SELECT, INSERT ON "core"."content_doc" TO netnet_content_admin;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "core"."content_current" TO netnet_content_admin;
--> statement-breakpoint
GRANT SELECT, INSERT ON "core"."content_audit" TO netnet_content_admin;
