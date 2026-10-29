import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "../../../test/db";
import { LineApiError, type LineGateway } from "../line/gateway";
import type { InboundEvent } from "../line/webhook";
import { createChatRepository, type ChatRepository } from "./repository";
import { ContactNotFoundError, createChatService, PROFILE_TTL_MS, type ChatService } from "./service";

const alice = `U${"a".repeat(32)}`;
const now = new Date("2026-01-01T12:00:00Z");
const key = "11111111-1111-4111-8111-111111111111";

let repo: ChatRepository;
let line: { getProfile: ReturnType<typeof vi.fn<LineGateway["getProfile"]>>; pushText: ReturnType<typeof vi.fn<LineGateway["pushText"]>> };
let service: ChatService;

beforeEach(async () => {
  repo = createChatRepository(await createTestDatabase());
  line = {
    getProfile: vi.fn<LineGateway["getProfile"]>().mockResolvedValue({ displayName: "Alice", pictureUrl: "https://p/a.png" }),
    pushText: vi.fn<LineGateway["pushText"]>().mockResolvedValue(undefined),
  };
  service = createChatService({ repo, line, now: () => now });
});

const textEvent = (messageId: string, text: string, userId = alice): InboundEvent => ({
  kind: "message",
  userId,
  messageId,
  sentAt: new Date(now.getTime() - 1000),
  messageType: "text",
  text,
  stickerId: null,
});

describe("ingestWebhookEvents", () => {
  it("creates the contact from the LINE profile and stores the message", async () => {
    await service.ingestWebhookEvents([textEvent("m1", "hi")]);

    await expect(repo.findContact(alice)).resolves.toMatchObject({
      displayName: "Alice",
      pictureUrl: "https://p/a.png",
      lastMessage: { text: "hi" },
    });
    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toMatchObject([{ direction: "inbound", text: "hi" }]);
  });

  it("stores the sticker id of a sticker message", async () => {
    const sticker: InboundEvent = { kind: "message", userId: alice, messageId: "m1", sentAt: now, messageType: "sticker", text: null, stickerId: "52002734" };
    await service.ingestWebhookEvents([sticker]);

    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toMatchObject([{ messageType: "sticker", stickerId: "52002734" }]);
  });

  it("fetches the profile once per TTL, not once per message", async () => {
    await service.ingestWebhookEvents([textEvent("m1", "a"), textEvent("m2", "b")]);
    expect(line.getProfile).toHaveBeenCalledTimes(1);

    const later = createChatService({ repo, line, now: () => new Date(now.getTime() + PROFILE_TTL_MS + 1) });
    await later.ingestWebhookEvents([textEvent("m3", "c")]);
    expect(line.getProfile).toHaveBeenCalledTimes(2);
  });

  it("still stores the message when the profile cannot be fetched, using a placeholder name", async () => {
    line.getProfile.mockRejectedValue(new LineApiError("getProfile", 500));

    await service.ingestWebhookEvents([textEvent("m1", "hi")]);

    const contact = await repo.findContact(alice);
    expect(contact?.displayName).toMatch(/^LINE user/);
    expect(contact?.lastMessage?.text).toBe("hi");
  });

  it("retries a failed profile fetch on the next event", async () => {
    line.getProfile.mockRejectedValueOnce(new LineApiError("getProfile", 500));

    await service.ingestWebhookEvents([textEvent("m1", "a"), textEvent("m2", "b")]);

    expect(line.getProfile).toHaveBeenCalledTimes(2);
    await expect(repo.findContact(alice)).resolves.toMatchObject({ displayName: "Alice" });
  });

  it("keeps the known name when a refresh says the profile is gone", async () => {
    await service.ingestWebhookEvents([textEvent("m1", "a")]);
    line.getProfile.mockResolvedValue(null);

    const later = createChatService({ repo, line, now: () => new Date(now.getTime() + PROFILE_TTL_MS + 1) });
    await later.ingestWebhookEvents([textEvent("m2", "b")]);

    await expect(repo.findContact(alice)).resolves.toMatchObject({ displayName: "Alice" });
  });

  it("stores a redelivered event only once", async () => {
    await service.ingestWebhookEvents([textEvent("m1", "hi")]);
    await service.ingestWebhookEvents([textEvent("m1", "hi")]);

    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toHaveLength(1);
  });

  it("records follow and unfollow", async () => {
    await service.ingestWebhookEvents([{ kind: "follow", userId: alice, sentAt: now }]);
    await expect(repo.findContact(alice)).resolves.toMatchObject({ displayName: "Alice", isFollowing: true });

    await service.ingestWebhookEvents([{ kind: "unfollow", userId: alice, sentAt: now }]);
    await expect(repo.findContact(alice)).resolves.toMatchObject({ isFollowing: false });
  });

  it("ignores an unfollow from a user it has never seen", async () => {
    await service.ingestWebhookEvents([{ kind: "unfollow", userId: alice, sentAt: now }]);

    await expect(repo.findContact(alice)).resolves.toBeNull();
    expect(line.getProfile).not.toHaveBeenCalled();
  });
});

describe("sendReply", () => {
  beforeEach(() => service.ingestWebhookEvents([textEvent("m1", "hi")]));

  it("pushes the text to LINE with the idempotency key, then stores it", async () => {
    const message = await service.sendReply({ userId: alice, text: "hello", idempotencyKey: key });

    expect(line.pushText).toHaveBeenCalledWith(alice, "hello", key);
    expect(message).toMatchObject({ direction: "outbound", text: "hello", sentAt: now });
    await expect(repo.findContact(alice)).resolves.toMatchObject({ lastMessage: { text: "hello" } });
  });

  it("rejects a user who is not a contact without calling LINE", async () => {
    const stranger = `U${"f".repeat(32)}`;

    await expect(service.sendReply({ userId: stranger, text: "x", idempotencyKey: key })).rejects.toBeInstanceOf(ContactNotFoundError);
    expect(line.pushText).not.toHaveBeenCalled();
  });

  it("stores nothing when LINE rejects the push", async () => {
    line.pushText.mockRejectedValue(new LineApiError("pushMessage", 400));

    await expect(service.sendReply({ userId: alice, text: "hello", idempotencyKey: key })).rejects.toBeInstanceOf(LineApiError);
    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toHaveLength(1);
  });
});
