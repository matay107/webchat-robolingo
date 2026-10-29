import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { contacts, messages } from "@/lib/db/schema";
import type { ChatMessage, Contact } from "./types";

export interface ContactProfileInput {
  userId: string;
  displayName: string;
  pictureUrl: string | null;
  /** `null` when the profile could not be fetched, so the next event retries. */
  syncedAt: Date | null;
}

export interface InboundMessageInput {
  userId: string;
  lineMessageId: string;
  messageType: string;
  text: string | null;
  stickerId: string | null;
  sentAt: Date;
}

export interface OutboundMessageInput {
  userId: string;
  text: string;
  idempotencyKey: string;
  sentAt: Date;
}

/** Persistence for contacts and their conversations. The contact must exist before its messages. */
export interface ChatRepository {
  findContact(userId: string): Promise<Contact | null>;
  /** Creates the contact or refreshes its profile. */
  saveContactProfile(input: ContactProfileInput): Promise<void>;
  setFollowing(userId: string, isFollowing: boolean): Promise<void>;
  /** Resolves `null` when this LINE message was already stored (webhook redelivery). */
  recordInbound(input: InboundMessageInput): Promise<ChatMessage | null>;
  /** Idempotent per `idempotencyKey`: a retry resolves to the originally stored message. */
  recordOutbound(input: OutboundMessageInput): Promise<ChatMessage>;
  /** Contacts ordered by latest message; contacts without messages come last. */
  listContacts(limit: number): Promise<Contact[]>;
  /**
   * Messages in chronological order: those after `afterId` when polling, otherwise the latest
   * `limit`, or the latest `limit` before `beforeId` when paging back through history.
   */
  listMessages(userId: string, options: { afterId?: number; beforeId?: number; limit: number }): Promise<ChatMessage[]>;
}

export class IdempotencyKeyConflictError extends Error {
  constructor() {
    super("Idempotency key was already used for another conversation");
    this.name = "IdempotencyKeyConflictError";
  }
}

type ContactRow = typeof contacts.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

function toContact(row: ContactRow): Contact {
  return {
    userId: row.userId,
    displayName: row.displayName,
    pictureUrl: row.pictureUrl,
    isFollowing: row.isFollowing,
    profileSyncedAt: row.profileSyncedAt,
    lastMessage:
      row.lastMessageAt && row.lastMessageType
        ? { type: row.lastMessageType, text: row.lastMessageText, sentAt: row.lastMessageAt }
        : null,
  };
}

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    userId: row.userId,
    direction: row.direction,
    messageType: row.messageType,
    text: row.text,
    stickerId: row.stickerId,
    sentAt: row.sentAt,
  };
}

export function createChatRepository(db: Database): ChatRepository {
  /**
   * Advances the contact's denormalized preview. The time guard keeps a late,
   * older delivery from overwriting a newer preview. It runs as a separate statement
   * (Neon HTTP has no transactions); a failure here only leaves the preview stale.
   */
  async function touchLastMessage(message: MessageRow) {
    await db
      .update(contacts)
      .set({ lastMessageAt: message.sentAt, lastMessageType: message.messageType, lastMessageText: message.text })
      .where(
        and(
          eq(contacts.userId, message.userId),
          or(isNull(contacts.lastMessageAt), lte(contacts.lastMessageAt, message.sentAt)),
        ),
      );
  }

  return {
    async findContact(userId) {
      const [row] = await db.select().from(contacts).where(eq(contacts.userId, userId)).limit(1);
      return row ? toContact(row) : null;
    },

    async saveContactProfile({ userId, displayName, pictureUrl, syncedAt }) {
      const profile = { displayName, pictureUrl, profileSyncedAt: syncedAt };
      await db
        .insert(contacts)
        .values({ userId, ...profile })
        .onConflictDoUpdate({ target: contacts.userId, set: profile });
    },

    async setFollowing(userId, isFollowing) {
      await db.update(contacts).set({ isFollowing }).where(eq(contacts.userId, userId));
    },

    async recordInbound(input) {
      const [row] = await db
        .insert(messages)
        .values({ ...input, direction: "inbound" })
        .onConflictDoNothing({ target: messages.lineMessageId })
        .returning();
      if (!row) return null;

      await touchLastMessage(row);
      return toMessage(row);
    },

    async recordOutbound({ userId, text, idempotencyKey, sentAt }) {
      const [row] = await db
        .insert(messages)
        .values({ userId, text, idempotencyKey, sentAt, direction: "outbound", messageType: "text" })
        .onConflictDoNothing({ target: messages.idempotencyKey })
        .returning();

      if (row) {
        await touchLastMessage(row);
        return toMessage(row);
      }

      // Retry of an earlier send: return the stored message, scoped to the same conversation.
      const [existing] = await db
        .select()
        .from(messages)
        .where(and(eq(messages.idempotencyKey, idempotencyKey), eq(messages.userId, userId)))
        .limit(1);
      if (!existing) throw new IdempotencyKeyConflictError();
      return toMessage(existing);
    },

    async listContacts(limit) {
      const rows = await db
        .select()
        .from(contacts)
        // Matches contacts_last_message_at_idx; Postgres puts NULLs first on DESC by default.
        .orderBy(sql`${contacts.lastMessageAt} desc nulls last`, asc(contacts.userId))
        .limit(limit);
      return rows.map(toContact);
    },

    async listMessages(userId, { afterId, beforeId, limit }) {
      if (afterId !== undefined) {
        const rows = await db
          .select()
          .from(messages)
          .where(and(eq(messages.userId, userId), gt(messages.id, afterId)))
          .orderBy(asc(messages.id))
          .limit(limit);
        return rows.map(toMessage);
      }

      const rows = await db
        .select()
        .from(messages)
        .where(and(eq(messages.userId, userId), beforeId === undefined ? undefined : lt(messages.id, beforeId)))
        .orderBy(desc(messages.id))
        .limit(limit);
      return rows.reverse().map(toMessage);
    },
  };
}
