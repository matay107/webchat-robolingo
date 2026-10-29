import { LineApiError, type LineGateway, type LineProfile } from "@/lib/line/gateway";
import type { InboundEvent } from "@/lib/line/webhook";
import { logger } from "@/lib/logger";
import type { ChatRepository } from "./repository";
import type { ChatMessage } from "./types";

/** How long a fetched LINE profile is trusted before it is refreshed on the next event. */
export const PROFILE_TTL_MS = 24 * 60 * 60 * 1000;

export interface ChatServiceDeps {
  repo: ChatRepository;
  line: LineGateway;
  now: () => Date;
}

export interface ReplyInput {
  userId: string;
  text: string;
  /** Client-generated UUID; reused as LINE's retry key so a retried send delivers once. */
  idempotencyKey: string;
}

export interface ChatService {
  /** Applies verified webhook events in order. Throws only on storage failure, so LINE can redeliver. */
  ingestWebhookEvents(events: InboundEvent[]): Promise<void>;
  /** Pushes a reply via LINE, then stores it. Nothing is stored if LINE rejects the push. */
  sendReply(input: ReplyInput): Promise<ChatMessage>;
}

export class ContactNotFoundError extends Error {
  constructor() {
    super("Contact not found");
    this.name = "ContactNotFoundError";
  }
}

const placeholderName = (userId: string) => `LINE user …${userId.slice(-4)}`;

export function createChatService({ repo, line, now }: ChatServiceDeps): ChatService {
  /** `undefined` means the fetch failed; `null` means LINE no longer exposes the profile. */
  async function fetchProfile(userId: string): Promise<LineProfile | null | undefined> {
    try {
      return await line.getProfile(userId);
    } catch (error) {
      logger.warn("line.profile_fetch_failed", { status: error instanceof LineApiError ? error.status : undefined });
      return undefined;
    }
  }

  /** Ensures the contact exists and its profile is at most {@link PROFILE_TTL_MS} old. */
  async function syncContact(userId: string) {
    const existing = await repo.findContact(userId);
    const syncedAt = existing?.profileSyncedAt;
    if (existing && syncedAt && now().getTime() - syncedAt.getTime() < PROFILE_TTL_MS) return;

    const profile = await fetchProfile(userId);
    if (profile) {
      await repo.saveContactProfile({ userId, ...profile, syncedAt: now() });
    } else if (!existing) {
      // Store the message under a placeholder; a failed fetch (`undefined`) leaves syncedAt null to retry.
      await repo.saveContactProfile({
        userId,
        displayName: placeholderName(userId),
        pictureUrl: null,
        syncedAt: profile === null ? now() : null,
      });
    } else if (profile === null) {
      // Profile hidden (blocked/unfollowed): keep the last known identity, but stop re-fetching until the TTL.
      await repo.saveContactProfile({ userId, displayName: existing.displayName, pictureUrl: existing.pictureUrl, syncedAt: now() });
    }
  }

  async function ingest(event: InboundEvent) {
    switch (event.kind) {
      case "message":
        await syncContact(event.userId);
        await repo.recordInbound({
          userId: event.userId,
          lineMessageId: event.messageId,
          messageType: event.messageType,
          text: event.text,
          stickerId: event.stickerId,
          sentAt: event.sentAt,
        });
        return;
      case "follow":
        await syncContact(event.userId);
        await repo.setFollowing(event.userId, true);
        return;
      case "unfollow":
        // No-op for unknown users: their profile is no longer readable anyway.
        await repo.setFollowing(event.userId, false);
        return;
    }
  }

  return {
    async ingestWebhookEvents(events) {
      // Sequential on purpose: preserves LINE's event order within a delivery.
      for (const event of events) await ingest(event);
    },

    async sendReply({ userId, text, idempotencyKey }) {
      if (!(await repo.findContact(userId))) throw new ContactNotFoundError();

      await line.pushText(userId, text, idempotencyKey);
      return repo.recordOutbound({ userId, text, idempotencyKey, sentAt: now() });
    },
  };
}
