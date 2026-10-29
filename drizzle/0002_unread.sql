ALTER TABLE "contacts" ADD COLUMN "last_read_message_id" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing history counts as read, so the inbox does not light up on deploy.
UPDATE "contacts" SET "last_read_message_id" = coalesce((SELECT max("id") FROM "messages" WHERE "messages"."user_id" = "contacts"."user_id"), 0);
