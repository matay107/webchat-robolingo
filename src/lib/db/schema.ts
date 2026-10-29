import { sql } from "drizzle-orm";
import { bigint, boolean, check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** One row per LINE user who has interacted with the OA. */
export const contacts = pgTable("contacts", {
  userId: text("user_id").primaryKey(),
  displayName: text("display_name").notNull(),
  pictureUrl: text("picture_url"),
  isFollowing: boolean("is_following").notNull().default(true),
  /** When the LINE profile was last fetched; drives the profile refresh interval. */
  profileSyncedAt: timestamptz("profile_synced_at"),
  // Denormalized latest message so the inbox list is a single indexed query.
  lastMessageAt: timestamptz("last_message_at"),
  lastMessageType: text("last_message_type"),
  lastMessageText: text("last_message_text"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [index("contacts_last_message_at_idx").on(t.lastMessageAt.desc().nullsLast(), t.userId)]);

export const messages = pgTable("messages", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: text("user_id").notNull().references(() => contacts.userId, { onDelete: "cascade" }),
  direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
  messageType: text("message_type").notNull(),
  text: text("text"),
  /** LINE sticker id, for `sticker` messages. */
  stickerId: text("sticker_id"),
  /** LINE's message id; unique so webhook redeliveries are stored once. */
  lineMessageId: text("line_message_id").unique(),
  /** Client-generated key; unique so a retried send is stored once. */
  idempotencyKey: uuid("idempotency_key").unique(),
  sentAt: timestamptz("sent_at").notNull(),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
}, (t) => [
  index("messages_user_id_id_idx").on(t.userId, t.id),
  check("messages_direction_check", sql`${t.direction} in ('inbound', 'outbound')`),
]);

/** Fixed-window counters; stored in Postgres because serverless instances share no memory. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  windowStart: timestamptz("window_start").notNull(),
  count: integer("count").notNull(),
});
