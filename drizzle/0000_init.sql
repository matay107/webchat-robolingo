CREATE TABLE "contacts" (
	"user_id" text PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"picture_url" text,
	"is_following" boolean DEFAULT true NOT NULL,
	"profile_synced_at" timestamp with time zone,
	"last_message_at" timestamp with time zone,
	"last_message_type" text,
	"last_message_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "messages_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" text NOT NULL,
	"direction" text NOT NULL,
	"message_type" text NOT NULL,
	"text" text,
	"line_message_id" text,
	"idempotency_key" uuid,
	"sent_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_line_message_id_unique" UNIQUE("line_message_id"),
	CONSTRAINT "messages_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" in ('inbound', 'outbound'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_contacts_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."contacts"("user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_last_message_at_idx" ON "contacts" USING btree ("last_message_at" DESC NULLS LAST,"user_id");--> statement-breakpoint
CREATE INDEX "messages_user_id_id_idx" ON "messages" USING btree ("user_id","id");