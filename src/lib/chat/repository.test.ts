import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../test/db";
import { createChatRepository, type ChatRepository } from "./repository";

const alice = `U${"a".repeat(32)}`;
const bob = `U${"b".repeat(32)}`;
const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));

let repo: ChatRepository;

beforeEach(async () => {
  repo = createChatRepository(await createTestDatabase());
});

const addContact = (userId: string, displayName = "Alice") =>
  repo.saveContactProfile({ userId, displayName, pictureUrl: null, syncedAt: at(0) });

const inbound = (userId: string, lineMessageId: string, text: string, sentAt: Date) =>
  repo.recordInbound({ userId, lineMessageId, messageType: "text", text, stickerId: null, sentAt });

describe("contacts", () => {
  it("returns null for an unknown user", async () => {
    await expect(repo.findContact(alice)).resolves.toBeNull();
  });

  it("creates a contact and later refreshes its profile in place", async () => {
    await addContact(alice, "Alice");
    await repo.saveContactProfile({ userId: alice, displayName: "Alice B.", pictureUrl: "https://x/p.png", syncedAt: at(5) });

    await expect(repo.findContact(alice)).resolves.toEqual({
      userId: alice,
      displayName: "Alice B.",
      pictureUrl: "https://x/p.png",
      isFollowing: true,
      profileSyncedAt: at(5),
      lastMessage: null,
      unreadCount: 0,
    });
  });

  it("tracks follow state", async () => {
    await addContact(alice);
    await repo.setFollowing(alice, false);

    await expect(repo.findContact(alice)).resolves.toMatchObject({ isFollowing: false });
  });

  it("lists contacts by most recent message, silent contacts last, capped by limit", async () => {
    const carol = `U${"c".repeat(32)}`;
    await addContact(alice, "Alice");
    await addContact(bob, "Bob");
    await addContact(carol, "Carol");
    await inbound(alice, "1", "old", at(1));
    await inbound(bob, "2", "new", at(2));

    const all = await repo.listContacts(10);
    expect(all.map((c) => c.displayName)).toEqual(["Bob", "Alice", "Carol"]);
    expect(all[0].lastMessage).toEqual({ type: "text", text: "new", sentAt: at(2) });

    await expect(repo.listContacts(1)).resolves.toHaveLength(1);
  });
});

describe("recordInbound", () => {
  beforeEach(() => addContact(alice));

  it("stores the message and makes it the contact's latest", async () => {
    const message = await inbound(alice, "100", "hi", at(1));

    expect(message).toEqual({ id: expect.any(Number), userId: alice, direction: "inbound", messageType: "text", text: "hi", stickerId: null, sentAt: at(1) });
    await expect(repo.findContact(alice)).resolves.toMatchObject({ lastMessage: { type: "text", text: "hi", sentAt: at(1) } });
  });

  it("stores the sticker id of a sticker message", async () => {
    await repo.recordInbound({ userId: alice, lineMessageId: "200", messageType: "sticker", text: null, stickerId: "52002734", sentAt: at(1) });

    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toMatchObject([{ messageType: "sticker", stickerId: "52002734" }]);
  });

  it("ignores a redelivered LINE message id", async () => {
    await inbound(alice, "100", "hi", at(1));

    await expect(inbound(alice, "100", "hi", at(1))).resolves.toBeNull();
    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toHaveLength(1);
  });

  it("does not let a late, older delivery replace the latest message preview", async () => {
    await inbound(alice, "101", "newer", at(5));
    await inbound(alice, "100", "older", at(1));

    await expect(repo.findContact(alice)).resolves.toMatchObject({ lastMessage: { text: "newer" } });
  });
});

describe("findLineMessageId", () => {
  beforeEach(async () => {
    await addContact(alice);
    await addContact(bob, "Bob");
  });

  it("returns LINE's id for a message of that user and type", async () => {
    const image = await repo.recordInbound({ userId: alice, lineMessageId: "900", messageType: "image", text: null, stickerId: null, sentAt: at(1) });

    await expect(repo.findLineMessageId(alice, image!.id, "image")).resolves.toBe("900");
  });

  it("returns null for another user's message (BOLA) or another type", async () => {
    const image = await repo.recordInbound({ userId: alice, lineMessageId: "900", messageType: "image", text: null, stickerId: null, sentAt: at(1) });
    const text = await inbound(alice, "901", "hi", at(2));

    await expect(repo.findLineMessageId(bob, image!.id, "image")).resolves.toBeNull();
    await expect(repo.findLineMessageId(alice, text!.id, "image")).resolves.toBeNull();
  });
});

describe("unread messages", () => {
  beforeEach(() => addContact(alice));
  const key = "11111111-1111-4111-8111-111111111111";

  it("counts inbound messages the admin has not read; replies do not count", async () => {
    await inbound(alice, "1", "a", at(1));
    await inbound(alice, "2", "b", at(2));
    await repo.recordOutbound({ userId: alice, text: "reply", idempotencyKey: key, sentAt: at(3) });

    await expect(repo.listContacts(10)).resolves.toMatchObject([{ unreadCount: 2 }]);
  });

  it("counts each contact's unread messages separately", async () => {
    await addContact(bob, "Bob");
    await inbound(alice, "1", "a", at(1));
    await inbound(bob, "2", "b", at(2));
    await inbound(bob, "3", "c", at(3));

    const counts = Object.fromEntries((await repo.listContacts(10)).map((c) => [c.displayName, c.unreadCount]));
    expect(counts).toEqual({ Alice: 1, Bob: 2 });
    await expect(repo.findContact(alice)).resolves.toMatchObject({ unreadCount: 1 });
  });

  it("marks messages up to an id as read", async () => {
    const first = await inbound(alice, "1", "a", at(1));
    await inbound(alice, "2", "b", at(2));

    await repo.markRead(alice, first!.id);

    await expect(repo.findContact(alice)).resolves.toMatchObject({ unreadCount: 1 });
  });

  it("never moves the read marker backwards, e.g. a late request from another tab", async () => {
    const first = await inbound(alice, "1", "a", at(1));
    const second = await inbound(alice, "2", "b", at(2));

    await repo.markRead(alice, second!.id);
    await repo.markRead(alice, first!.id);

    await expect(repo.findContact(alice)).resolves.toMatchObject({ unreadCount: 0 });
  });
});

describe("recordOutbound", () => {
  beforeEach(() => addContact(alice));
  const key = "11111111-1111-4111-8111-111111111111";

  it("stores the reply and makes it the contact's latest", async () => {
    const message = await repo.recordOutbound({ userId: alice, text: "hello", idempotencyKey: key, sentAt: at(2) });

    expect(message).toMatchObject({ userId: alice, direction: "outbound", messageType: "text", text: "hello", stickerId: null });
    await expect(repo.findContact(alice)).resolves.toMatchObject({ lastMessage: { text: "hello" } });
  });

  it("returns the original message when the same idempotency key is retried", async () => {
    const first = await repo.recordOutbound({ userId: alice, text: "hello", idempotencyKey: key, sentAt: at(2) });
    const retry = await repo.recordOutbound({ userId: alice, text: "hello", idempotencyKey: key, sentAt: at(3) });

    expect(retry).toEqual(first);
    await expect(repo.listMessages(alice, { limit: 10 })).resolves.toHaveLength(1);
  });
});

describe("listMessages", () => {
  beforeEach(async () => {
    await addContact(alice);
    await addContact(bob, "Bob");
    for (let i = 1; i <= 5; i++) await inbound(alice, `a${i}`, `m${i}`, at(i));
    await inbound(bob, "b1", "other user", at(9));
  });

  it("returns the latest messages of one user in chronological order", async () => {
    const page = await repo.listMessages(alice, { limit: 3 });

    expect(page.map((m) => m.text)).toEqual(["m3", "m4", "m5"]);
  });

  it("returns only messages newer than the cursor when polling", async () => {
    const [, second] = await repo.listMessages(alice, { limit: 10 });
    const newer = await repo.listMessages(alice, { afterId: second.id, limit: 10 });

    expect(newer.map((m) => m.text)).toEqual(["m3", "m4", "m5"]);
  });

  it("returns the page just before a cursor when loading older history", async () => {
    const [, , , fourth] = await repo.listMessages(alice, { limit: 10 });
    const older = await repo.listMessages(alice, { beforeId: fourth.id, limit: 2 });

    expect(older.map((m) => m.text)).toEqual(["m2", "m3"]);
  });
});
