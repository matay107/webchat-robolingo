import { describe, expect, it } from "vitest";
import { parseWebhookBody, WebhookPayloadError } from "./webhook";

const userId = `U${"a".repeat(32)}`;
const base = {
  timestamp: 1_700_000_000_000,
  source: { type: "user", userId },
  webhookEventId: "01H000000000000000000000",
  deliveryContext: { isRedelivery: false },
  mode: "active",
};

const body = (...events: unknown[]) => ({ destination: `U${"b".repeat(32)}`, events });

describe("parseWebhookBody", () => {
  it("accepts the empty event list LINE sends when verifying the webhook URL", () => {
    expect(parseWebhookBody(body())).toEqual([]);
  });

  it("normalizes a text message from a user", () => {
    const event = { ...base, type: "message", replyToken: "r", message: { id: "4680", type: "text", text: "สวัสดี" } };

    expect(parseWebhookBody(body(event))).toEqual([
      { kind: "message", userId, messageId: "4680", sentAt: new Date(base.timestamp), messageType: "text", text: "สวัสดี" },
    ]);
  });

  it("keeps non-text messages with their type and no text", () => {
    const event = { ...base, type: "message", replyToken: "r", message: { id: "4681", type: "sticker", packageId: "1", stickerId: "2" } };

    expect(parseWebhookBody(body(event))).toEqual([
      { kind: "message", userId, messageId: "4681", sentAt: new Date(base.timestamp), messageType: "sticker", text: null },
    ]);
  });

  it.each(["follow", "unfollow"] as const)("normalizes a %s event", (type) => {
    expect(parseWebhookBody(body({ ...base, type }))).toEqual([{ kind: type, userId, sentAt: new Date(base.timestamp) }]);
  });

  it("skips events this console cannot answer: groups, rooms and unsupported types", () => {
    const groupMessage = {
      ...base,
      type: "message",
      source: { type: "group", groupId: "C1", userId },
      message: { id: "1", type: "text", text: "hi" },
    };
    const postback = { ...base, type: "postback", postback: { data: "x" } };

    expect(parseWebhookBody(body(groupMessage, postback))).toEqual([]);
  });

  it("skips a malformed event but keeps the valid ones in the same delivery", () => {
    const valid = { ...base, type: "follow" };
    const badUser = { ...base, type: "follow", source: { type: "user", userId: "not-a-line-id" } };

    expect(parseWebhookBody(body(badUser, valid))).toHaveLength(1);
  });

  it.each([null, "text", {}, { events: "nope" }])("throws WebhookPayloadError when the envelope is invalid (%j)", (payload) => {
    expect(() => parseWebhookBody(payload)).toThrow(WebhookPayloadError);
  });
});
