CREATE SCHEMA "analytics";
--> statement-breakpoint
CREATE SCHEMA "core";
--> statement-breakpoint
CREATE SCHEMA "ledger";
--> statement-breakpoint
CREATE TABLE "core"."agent_connection" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"registration" text NOT NULL,
	"client" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_call_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"security_email_sent_at" timestamp with time zone,
	CONSTRAINT "agent_connection_id_check" CHECK ("core"."agent_connection"."id" ~ '^con_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "agent_connection_registration_check" CHECK ("core"."agent_connection"."registration" in ('cimd', 'dcr')),
	CONSTRAINT "agent_connection_client_check" CHECK ("core"."agent_connection"."client" in ('claude', 'chatgpt', 'other'))
);
--> statement-breakpoint
CREATE TABLE "core"."connection_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"client" text NOT NULL,
	"entry" text NOT NULL,
	"platform" text NOT NULL,
	"state" text DEFAULT 'started' NOT NULL,
	"failed_step" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connection_attempt_id_check" CHECK ("core"."connection_attempt"."id" ~ '^att_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "connection_attempt_client_check" CHECK ("core"."connection_attempt"."client" in ('claude', 'chatgpt', 'other')),
	CONSTRAINT "connection_attempt_entry_check" CHECK ("core"."connection_attempt"."entry" in ('onboarding', 'home', 'holding', 'agent')),
	CONSTRAINT "connection_attempt_platform_check" CHECK ("core"."connection_attempt"."platform" in ('phone', 'computer', 'any')),
	CONSTRAINT "connection_attempt_state_check" CHECK ("core"."connection_attempt"."state" in ('started', 'approved', 'live', 'failed')),
	CONSTRAINT "connection_attempt_failed_step_check" CHECK ("core"."connection_attempt"."failed_step" in ('authorise', 'callback', 'discovery', 'first_call')),
	CONSTRAINT "connection_attempt_failed_step_state_check" CHECK (("core"."connection_attempt"."state" = 'failed') = ("core"."connection_attempt"."failed_step" is not null))
);
--> statement-breakpoint
CREATE TABLE "core"."content_audit" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "core"."content_audit_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"from_version" integer,
	"to_version" integer NOT NULL,
	"actor" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core"."content_current" (
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "content_current_kind_key_pk" PRIMARY KEY("kind","key")
);
--> statement-breakpoint
CREATE TABLE "core"."content_doc" (
	"kind" text NOT NULL,
	"key" text NOT NULL,
	"version" integer NOT NULL,
	"body" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"author" text NOT NULL,
	"source_commit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_doc_kind_key_version_pk" PRIMARY KEY("kind","key","version"),
	CONSTRAINT "content_doc_version_check" CHECK ("core"."content_doc"."version" >= 1),
	CONSTRAINT "content_doc_sha256_check" CHECK ("core"."content_doc"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "analytics"."event" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "analytics"."event_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"visitor" text,
	"segment" text NOT NULL,
	"props" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"app_version" text NOT NULL,
	CONSTRAINT "event_segment_check" CHECK ("analytics"."event"."segment" in ('starting_out', 'accumulating', 'established', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "core"."fx_rate" (
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"per_usd" numeric NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "fx_rate_date_currency_pk" PRIMARY KEY("date","currency"),
	CONSTRAINT "fx_rate_currency_check" CHECK ("core"."fx_rate"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "fx_rate_per_usd_check" CHECK ("core"."fx_rate"."per_usd" > 0),
	CONSTRAINT "fx_rate_source_check" CHECK ("core"."fx_rate"."source" in ('ecb', 'fallback'))
);
--> statement-breakpoint
CREATE TABLE "core"."profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"country" text,
	"time_zone" text DEFAULT 'UTC' NOT NULL,
	"segment" text DEFAULT 'unknown' NOT NULL,
	"onboarding_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_country_check" CHECK ("core"."profile"."country" ~ '^[A-Z]{2}$'),
	CONSTRAINT "profile_time_zone_check" CHECK ("core"."profile"."time_zone" <> ''),
	CONSTRAINT "profile_segment_check" CHECK ("core"."profile"."segment" in ('starting_out', 'accumulating', 'established', 'unknown'))
);
--> statement-breakpoint
CREATE TABLE "core"."rate_limit" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limit_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "ledger"."audit" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"actor" text NOT NULL,
	"client_name" text,
	"connection_id" text,
	"batch_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"before" jsonb,
	"after" jsonb,
	"undoes" text,
	"undone_by" text,
	CONSTRAINT "audit_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "audit_id_check" CHECK ("ledger"."audit"."id" ~ '^aud_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "audit_actor_check" CHECK ("ledger"."audit"."actor" in ('user', 'agent', 'system'))
);
--> statement-breakpoint
ALTER TABLE "ledger"."audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."batch" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"connection_id" text NOT NULL,
	"opened_at" timestamp with time zone NOT NULL,
	"last_write_at" timestamp with time zone NOT NULL,
	CONSTRAINT "batch_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "batch_id_check" CHECK ("ledger"."batch"."id" ~ '^bat_[0-7][0-9A-HJKMNP-TV-Z]{25}$')
);
--> statement-breakpoint
ALTER TABLE "ledger"."batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."holding" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"type_id" text NOT NULL,
	"currency" text NOT NULL,
	"cadence_days" integer,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	"access" text,
	"access_basis" jsonb,
	"access_reason" text,
	"access_until" text,
	CONSTRAINT "holding_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "holding_id_check" CHECK ("ledger"."holding"."id" ~ '^hld_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "holding_kind_check" CHECK ("ledger"."holding"."kind" in ('asset', 'liability')),
	CONSTRAINT "holding_currency_check" CHECK ("ledger"."holding"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "holding_access_check" CHECK ("ledger"."holding"."access" in ('accessible', 'illiquid', 'locked', 'undecided')),
	CONSTRAINT "holding_access_kind_check" CHECK (("ledger"."holding"."kind" = 'liability') = ("ledger"."holding"."access" is null)),
	CONSTRAINT "holding_cadence_days_check" CHECK ("ledger"."holding"."cadence_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "ledger"."holding" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."holding_tag" (
	"user_id" text NOT NULL,
	"holding_id" text NOT NULL,
	"tag_id" text NOT NULL,
	CONSTRAINT "holding_tag_user_id_holding_id_tag_id_pk" PRIMARY KEY("user_id","holding_id","tag_id")
);
--> statement-breakpoint
ALTER TABLE "ledger"."holding_tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."ledger_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"base_currency" text NOT NULL,
	"data_version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_state_base_currency_check" CHECK ("ledger"."ledger_state"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "ledger_state_data_version_check" CHECK ("ledger"."ledger_state"."data_version" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ledger"."ledger_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."prefs" (
	"user_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	CONSTRAINT "prefs_user_id_key_pk" PRIMARY KEY("user_id","key")
);
--> statement-breakpoint
ALTER TABLE "ledger"."prefs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."tag" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tag_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "tag_id_check" CHECK ("ledger"."tag"."id" ~ '^tag_[0-7][0-9A-HJKMNP-TV-Z]{25}$')
);
--> statement-breakpoint
ALTER TABLE "ledger"."tag" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."user_type" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"universal" text NOT NULL,
	"pack_type_key" text,
	"custom_name" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	CONSTRAINT "user_type_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "user_type_id_check" CHECK ("ledger"."user_type"."id" ~ '^typ_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "user_type_universal_check" CHECK ("ledger"."user_type"."universal" in ('cash', 'listed', 'retirement', 'property', 'vehicle', 'equity', 'crypto', 'mortgage', 'loan', 'wrapper', 'card', 'other'))
);
--> statement-breakpoint
ALTER TABLE "ledger"."user_type" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ledger"."value" (
	"user_id" text NOT NULL,
	"id" text NOT NULL,
	"holding_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" text NOT NULL,
	"base_minor" bigint NOT NULL,
	"base_currency" text NOT NULL,
	"fx_rate" numeric NOT NULL,
	"fx_rate_date" date,
	"fx_source" text NOT NULL,
	"source" text NOT NULL,
	"client_name" text,
	"connection_id" text,
	"batch_id" text,
	"entered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"row_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "value_user_id_id_pk" PRIMARY KEY("user_id","id"),
	CONSTRAINT "value_id_check" CHECK ("ledger"."value"."id" ~ '^val_[0-7][0-9A-HJKMNP-TV-Z]{25}$'),
	CONSTRAINT "value_currency_check" CHECK ("ledger"."value"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "value_base_currency_check" CHECK ("ledger"."value"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "value_fx_rate_check" CHECK ("ledger"."value"."fx_rate" > 0),
	CONSTRAINT "value_fx_source_check" CHECK ("ledger"."value"."fx_source" in ('ecb', 'fallback', 'same', 'user', 'agent')),
	CONSTRAINT "value_source_check" CHECK ("ledger"."value"."source" in ('web', 'agent', 'system'))
);
--> statement-breakpoint
ALTER TABLE "ledger"."value" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "core"."content_current" ADD CONSTRAINT "content_current_doc_fk" FOREIGN KEY ("kind","key","version") REFERENCES "core"."content_doc"("kind","key","version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_batch_fk" FOREIGN KEY ("user_id","batch_id") REFERENCES "ledger"."batch"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_undoes_fk" FOREIGN KEY ("user_id","undoes") REFERENCES "ledger"."audit"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."audit" ADD CONSTRAINT "audit_undone_by_fk" FOREIGN KEY ("user_id","undone_by") REFERENCES "ledger"."audit"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."batch" ADD CONSTRAINT "batch_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."holding" ADD CONSTRAINT "holding_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."holding" ADD CONSTRAINT "holding_type_fk" FOREIGN KEY ("user_id","type_id") REFERENCES "ledger"."user_type"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."holding_tag" ADD CONSTRAINT "holding_tag_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."holding_tag" ADD CONSTRAINT "holding_tag_holding_fk" FOREIGN KEY ("user_id","holding_id") REFERENCES "ledger"."holding"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."holding_tag" ADD CONSTRAINT "holding_tag_tag_fk" FOREIGN KEY ("user_id","tag_id") REFERENCES "ledger"."tag"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."prefs" ADD CONSTRAINT "prefs_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."tag" ADD CONSTRAINT "tag_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."user_type" ADD CONSTRAINT "user_type_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_state_fk" FOREIGN KEY ("user_id") REFERENCES "ledger"."ledger_state"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_holding_fk" FOREIGN KEY ("user_id","holding_id") REFERENCES "ledger"."holding"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger"."value" ADD CONSTRAINT "value_batch_fk" FOREIGN KEY ("user_id","batch_id") REFERENCES "ledger"."batch"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_connection_user_id_idx" ON "core"."agent_connection" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "connection_attempt_user_id_started_at_idx" ON "core"."connection_attempt" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "content_audit_kind_key_at_idx" ON "core"."content_audit" USING btree ("kind","key","at");--> statement-breakpoint
CREATE INDEX "event_name_at_idx" ON "analytics"."event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "event_user_id_at_idx" ON "analytics"."event" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "fx_rate_currency_date_idx" ON "core"."fx_rate" USING btree ("currency","date");--> statement-breakpoint
CREATE INDEX "audit_user_id_at_idx" ON "ledger"."audit" USING btree ("user_id","at");--> statement-breakpoint
CREATE INDEX "audit_user_id_batch_id_idx" ON "ledger"."audit" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE INDEX "batch_user_id_connection_id_last_write_at_idx" ON "ledger"."batch" USING btree ("user_id","connection_id","last_write_at");--> statement-breakpoint
CREATE INDEX "holding_user_id_type_id_idx" ON "ledger"."holding" USING btree ("user_id","type_id");--> statement-breakpoint
CREATE INDEX "holding_tag_user_id_tag_id_idx" ON "ledger"."holding_tag" USING btree ("user_id","tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tag_user_id_name_key" ON "ledger"."tag" USING btree ("user_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "value_user_id_holding_id_date_key" ON "ledger"."value" USING btree ("user_id","holding_id","date");--> statement-breakpoint
CREATE INDEX "value_user_id_batch_id_idx" ON "ledger"."value" USING btree ("user_id","batch_id");--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."audit" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."batch" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."holding" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."holding_tag" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."ledger_state" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."prefs" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."tag" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."user_type" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));--> statement-breakpoint
CREATE POLICY "user_isolation" ON "ledger"."value" AS PERMISSIVE FOR ALL TO public USING (user_id = current_setting('app.user_id', true)) WITH CHECK (user_id = current_setting('app.user_id', true));