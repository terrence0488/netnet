-- P3-T13 (PRD J10): every core table keyed by a person's id references their user row with
-- ON DELETE CASCADE, so deleting the account deletes them with it and the database refuses a row
-- for an id no account holds. Rows already left for ids no account holds (a profile and reminder
-- state that touchChecked made again after a deletion, connections kept revoked) go first, or the
-- constraints could not be added.
DELETE FROM "core"."agent_connection" t WHERE NOT EXISTS (SELECT 1 FROM "core"."user" u WHERE u."id" = t."user_id");--> statement-breakpoint
DELETE FROM "core"."connection_attempt" t WHERE NOT EXISTS (SELECT 1 FROM "core"."user" u WHERE u."id" = t."user_id");--> statement-breakpoint
DELETE FROM "core"."notification_endpoint" t WHERE NOT EXISTS (SELECT 1 FROM "core"."user" u WHERE u."id" = t."user_id");--> statement-breakpoint
DELETE FROM "core"."profile" t WHERE NOT EXISTS (SELECT 1 FROM "core"."user" u WHERE u."id" = t."user_id");--> statement-breakpoint
DELETE FROM "core"."reminder_state" t WHERE NOT EXISTS (SELECT 1 FROM "core"."user" u WHERE u."id" = t."user_id");--> statement-breakpoint
ALTER TABLE "core"."agent_connection" ADD CONSTRAINT "agent_connection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."connection_attempt" ADD CONSTRAINT "connection_attempt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."notification_endpoint" ADD CONSTRAINT "notification_endpoint_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."reminder_state" ADD CONSTRAINT "reminder_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "core"."user"("id") ON DELETE cascade ON UPDATE no action;
