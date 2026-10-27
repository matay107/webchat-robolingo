import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatService } from "@/lib/chat/service";
import { makeRequest } from "../../../test/http";
import { createWebhookHandler, MAX_WEBHOOK_BODY_BYTES } from "./webhook";

const channelSecret = "0123456789abcdef0123456789abcdef";
const userId = `U${"a".repeat(32)}`;
const sign = (body: string) => createHmac("sha256", channelSecret).update(body).digest("base64");

const textMessageBody = JSON.stringify({
  destination: "Ux",
  events: [
    {
      type: "message",
      timestamp: 1_700_000_000_000,
      source: { type: "user", userId },
      message: { id: "1", type: "text", text: "hi" },
    },
  ],
});

let service: { ingestWebhookEvents: ReturnType<typeof vi.fn>; sendReply: ReturnType<typeof vi.fn> };
let handle: ReturnType<typeof createWebhookHandler>;

beforeEach(() => {
  service = { ingestWebhookEvents: vi.fn().mockResolvedValue(undefined), sendReply: vi.fn() };
  handle = createWebhookHandler({ channelSecret, service: service as unknown as ChatService });
});

const post = (body: string, signature: string | null, headers: Record<string, string> = {}) =>
  handle(
    makeRequest("/api/line/webhook", {
      method: "POST",
      body,
      origin: null,
      headers: signature ? { "x-line-signature": signature, ...headers } : headers,
    }),
  );

describe("POST /api/line/webhook", () => {
  it("ingests the parsed events of a correctly signed delivery and answers 200", async () => {
    const response = await post(textMessageBody, sign(textMessageBody));

    expect(response.status).toBe(200);
    expect(service.ingestWebhookEvents).toHaveBeenCalledWith([expect.objectContaining({ kind: "message", userId, text: "hi" })]);
  });

  it("answers 200 to LINE's verification request (no events)", async () => {
    const body = JSON.stringify({ destination: "Ux", events: [] });

    expect((await post(body, sign(body))).status).toBe(200);
  });

  it.each([
    ["missing", null],
    ["wrong", sign("something else")],
  ])("rejects a %s signature with 401 before touching the payload", async (_, signature) => {
    const response = await post(textMessageBody, signature);

    expect(response.status).toBe(401);
    expect(service.ingestWebhookEvents).not.toHaveBeenCalled();
  });

  it("rejects a signed body that is not a LINE envelope with 400", async () => {
    const body = "{not json";

    expect((await post(body, sign(body))).status).toBe(400);
  });

  it("rejects an oversized body with 413 based on Content-Length", async () => {
    const response = await post(textMessageBody, sign(textMessageBody), { "content-length": String(MAX_WEBHOOK_BODY_BYTES + 1) });

    expect(response.status).toBe(413);
    expect(service.ingestWebhookEvents).not.toHaveBeenCalled();
  });

  it("answers 500 without internal details when storage fails, so LINE can redeliver", async () => {
    service.ingestWebhookEvents.mockRejectedValue(new Error("connection refused at 10.0.0.5"));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(textMessageBody, sign(textMessageBody));

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.5");
  });
});
