ALTER TABLE "ledger"."audit" DROP CONSTRAINT "audit_undoes_fk";
--> statement-breakpoint
ALTER TABLE "ledger"."audit" DROP CONSTRAINT "audit_undone_by_fk";
--> statement-breakpoint
ALTER TABLE "ledger"."audit" DROP COLUMN "undoes";--> statement-breakpoint
ALTER TABLE "ledger"."audit" DROP COLUMN "undone_by";