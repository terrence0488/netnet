CREATE TABLE "core"."notification_endpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"channel" text DEFAULT 'webpush' NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"platform" text NOT NULL,
	"device_label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_success_at" timestamp with time zone,
	"failure_count" integer DEFAULT 0 NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "notification_endpoint_id_check" CHECK ("core"."notification_endpoint"."id" ~ '^nep_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "notification_endpoint_channel_check" CHECK ("core"."notification_endpoint"."channel" in ('webpush')),
	CONSTRAINT "notification_endpoint_platform_check" CHECK ("core"."notification_endpoint"."platform" in ('ios', 'android', 'desktop')),
	CONSTRAINT "notification_endpoint_failure_count" CHECK ("core"."notification_endpoint"."failure_count" >= 0)
);
--> statement-breakpoint
CREATE INDEX "notification_endpoint_user_id_idx" ON "core"."notification_endpoint" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_endpoint_user_endpoint_key" ON "core"."notification_endpoint" USING btree ("user_id","endpoint") WHERE "core"."notification_endpoint"."revoked_at" is null;