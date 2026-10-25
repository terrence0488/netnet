ALTER TABLE "ledger"."value" ADD COLUMN "given_rate" numeric;--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD COLUMN "given_rate_into" char(3);--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD COLUMN "given_rate_by" text;--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_given_rate_check" CHECK ("ledger"."value"."given_rate" > 0);--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_given_rate_into_check" CHECK ("ledger"."value"."given_rate_into" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_given_rate_by_check" CHECK ("ledger"."value"."given_rate_by" in ('user', 'agent'));--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_given_rate_all_or_none_check" CHECK (("ledger"."value"."given_rate" is null) = ("ledger"."value"."given_rate_into" is null) and ("ledger"."value"."given_rate" is null) = ("ledger"."value"."given_rate_by" is null));--> statement-breakpoint
-- Backfill (P3-T12, architecture §6.6): a rate the person or their agent gave is kept as given, so
-- every change of the default currency starts from it. Each current value with such a rate takes
-- it from its stored rate, into the base currency that rate converts into; a rate an earlier round
-- trip already lost is not recovered. Row-level security binds the tables' owner too (0001), so
-- this one statement runs with it lifted, inside the migration's transaction.
ALTER TABLE "ledger"."value" NO FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
UPDATE "ledger"."value"
SET "given_rate" = "fx_rate", "given_rate_into" = "base_currency", "given_rate_by" = "fx_source"
WHERE "fx_source" IN ('user', 'agent');
--> statement-breakpoint
ALTER TABLE "ledger"."value" FORCE ROW LEVEL SECURITY;
