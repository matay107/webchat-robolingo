import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatRepository, type ChatRepository } from "@/lib/chat/repository";
import { createChatService } from "@/lib/chat/service";
import { LineApiError, type LineGateway } from "@/lib/line/gateway";
import { createRateLimiter } from "@/lib/security/rate-limiter";
import { createTestDatabase } from "../../../test/db";
import { makeRequest, sessionCookie } from "../../../test/http";
import { createConversationHandlers, SEND_RATE_LIMIT } from "./conversations";

const alice = `U${"a".repeat(32)}`;
const at = new Date("2026-01-01T00:00:00Z");
const uuid = () => crypto.randomUUID();

let repo: ChatRepository;
let line: { getProfile: ReturnType<typeof vi.fn>; pushText: ReturnType<typeof vi.fn> };
let handlers: ReturnType<typeof createConversationHandlers>;
let cookie: string;

beforeEach(async () => {
  const db = await createTestDatabase();
  repo = createChatRepository(db);
  line = { getProfile: vi.fn(), pushText: vi.fn().mockResolvedValue(undefined) };
  const service = createChatService({ repo, line: line as LineGateway, now: () => new Date() });
  handlers = createConversationHandlers({ repo, service, limiter: createRateLimiter(db), sessionSecret: "s".repeat(32) });
  cookie = await sessionCookie();

  await repo.saveContactProfile({ userId: alice, displayName: "Alice", pictureUrl: "https://p/a.png", syncedAt: at });
  await repo.recordInbound({ userId: alice, lineMessageId: "1", messageType: "text", text: "<b>hi</b>", sentAt: at });
});

const get = (path: string, withSession = true) => makeRequest(path, { cookie: withSession ? cookie : undefined });
const send = (userId: string, body: unknown, options: { origin?: string | null; withSession?: boolean } = {}) =>
  handlers.sendMessage(
    makeRequest(`/api/contacts/${userId}/messages`, {
      method: "POST",
      body: body as object,
      origin: options.origin,
      cookie: options.withSession === false ? undefined : cookie,
    }),
    userId,
  );

describe("authentication", () => {
  it("rejects every endpoint without a valid session with 401", async () => {
    const responses = await Promise.all([
      handlers.listContacts(get("/api/contacts", false)),
      handlers.listMessages(get(`/api/contacts/${alice}/messages`, false), alice),
      send(alice, { text: "x", idempotencyKey: uuid() }, { withSession: false }),
      handlers.listContacts(makeRequest("/api/contacts", { cookie: "__Host-webchat_session=forged" })),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(line.pushText).not.toHaveBeenCalled();
  });
});

describe("GET /api/contacts", () => {
  it("lists contacts with their latest message, uncached", async () => {
    const response = await handlers.listContacts(get("/api/contacts"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      contacts: [
        {
          userId: alice,
          displayName: "Alice",
          pictureUrl: "https://p/a.png",
          isFollowing: true,
          lastMessage: { type: "text", text: "<b>hi</b>", sentAt: at.toISOString() },
        },
      ],
    });
  });

  it.each(["0", "101", "abc"])("rejects limit=%s with 400", async (limit) => {
    expect((await handlers.listContacts(get(`/api/contacts?limit=${limit}`))).status).toBe(400);
  });
});

describe("GET /api/contacts/:userId/messages", () => {
  it("returns the conversation as plain data", async () => {
    const response = await handlers.listMessages(get(`/api/contacts/${alice}/messages`), alice);

    await expect(response.json()).resolves.toEqual({
      messages: [{ id: expect.any(Number), direction: "inbound", type: "text", text: "<b>hi</b>", sentAt: at.toISOString() }],
    });
  });

  it("returns only newer messages when polling with ?after=", async () => {
    const { messages } = await (await handlers.listMessages(get(`/api/contacts/${alice}/messages`), alice)).json();
    const response = await handlers.listMessages(get(`/api/contacts/${alice}/messages?after=${messages[0].id}`), alice);

    await expect(response.json()).resolves.toEqual({ messages: [] });
  });

  it.each([["an invalid user id", "U123", ""], ["a negative cursor", alice, "?after=-1"]])("rejects %s with 400", async (_, userId, query) => {
    expect((await handlers.listMessages(get(`/api/contacts/${userId}/messages${query}`), userId)).status).toBe(400);
  });
});

describe("POST /api/contacts/:userId/messages", () => {
  it("delivers the reply through LINE and returns it with 201", async () => {
    const idempotencyKey = uuid();
    const response = await send(alice, { text: "hello", idempotencyKey });

    expect(response.status).toBe(201);
    expect(line.pushText).toHaveBeenCalledWith(alice, "hello", idempotencyKey);
    await expect(response.json()).resolves.toMatchObject({ message: { direction: "outbound", type: "text", text: "hello" } });
  });

  it.each([
    ["empty text", { text: "", idempotencyKey: uuid() }],
    ["whitespace-only text", { text: " \n\t ", idempotencyKey: uuid() }],
    ["text over LINE's 5000-character limit", { text: "x".repeat(5001), idempotencyKey: uuid() }],
    ["a non-UUID idempotency key", { text: "hi", idempotencyKey: "abc" }],
    ["unexpected fields (mass assignment)", { text: "hi", idempotencyKey: uuid(), direction: "inbound" }],
  ])("rejects %s with 400", async (_, body) => {
    expect((await send(alice, body)).status).toBe(400);
    expect(line.pushText).not.toHaveBeenCalled();
  });

  it("rejects a cross-site request with 403 (CSRF)", async () => {
    expect((await send(alice, { text: "hi", idempotencyKey: uuid() }, { origin: "https://evil.test" })).status).toBe(403);
  });

  it("answers 404 for a user who never contacted the OA", async () => {
    expect((await send(`U${"f".repeat(32)}`, { text: "hi", idempotencyKey: uuid() })).status).toBe(404);
  });

  it("answers 502 when LINE refuses the message, without LINE's details", async () => {
    line.pushText.mockRejectedValue(new LineApiError("pushMessage", 400));
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await send(alice, { text: "hi", idempotencyKey: uuid() });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: { code: "upstream_error", message: expect.any(String) } });
  });

  it("throttles sending to protect the LINE message quota", async () => {
    for (let i = 0; i < SEND_RATE_LIMIT.limit; i++) await send(alice, { text: `m${i}`, idempotencyKey: uuid() });

    const response = await send(alice, { text: "one too many", idempotencyKey: uuid() });
    expect(response.status).toBe(429);
  });
});
