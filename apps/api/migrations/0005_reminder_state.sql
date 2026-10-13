CREATE TABLE "core"."reminder_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"email_enabled" boolean DEFAULT true NOT NULL,
	"last_checked_on" date,
	"next_due_on" date,
	"sent_since_check" integer DEFAULT 0 NOT NULL,
	"last_sent_at" timestamp with time zone,
	"last_channel" text,
	"last_opened_at" timestamp with time zone,
	CONSTRAINT "reminder_state_sent_since_check" CHECK ("core"."reminder_state"."sent_since_check" >= 0),
	CONSTRAINT "reminder_state_last_channel_check" CHECK ("core"."reminder_state"."last_channel" in ('push', 'email'))
);
--> statement-breakpoint
-- Backfill (P3-T5): everyone so far starts as if they checked today, so nobody gets a surprise
-- reminder on deploy day; the clock then runs normally. netnet_app reaches the table through
-- 0001's default privileges; no grant needed.
INSERT INTO "core"."reminder_state" ("user_id", "last_checked_on", "next_due_on")
SELECT "id", CURRENT_DATE, CURRENT_DATE + 30 FROM "core"."user"
ON CONFLICT ("user_id") DO NOTHING;
