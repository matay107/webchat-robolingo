import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/server/handlers/conversations";
import type { ContactDto } from "@/server/handlers/conversations";
import { describeMessage, inboxTitle, mergeMessages, stickerImageUrl } from "./messages";

const msg = (id: number, text = `m${id}`): MessageDto => ({
  id,
  direction: "inbound",
  type: "text",
  text,
  stickerId: null,
  sentAt: new Date(Date.UTC(2026, 0, 1, 0, id)).toISOString(),
});

describe("describeMessage", () => {
  it("shows the text of a text message", () => {
    expect(describeMessage("text", "hello")).toBe("hello");
  });

  it.each([
    ["sticker", "Sticker"],
    ["image", "Photo"],
    ["video", "Video"],
    ["audio", "Voice message"],
    ["file", "File"],
    ["location", "Location"],
    ["somethingNew", "Unsupported message (somethingNew)"],
  ])("labels a %s message", (type, label) => {
    expect(describeMessage(type, null)).toBe(label);
  });
});

describe("stickerImageUrl", () => {
  it("points at LINE's sticker CDN", () => {
    expect(stickerImageUrl("52002734")).toBe("https://stickershop.line-scdn.net/stickershop/v1/sticker/52002734/android/sticker.png");
  });
});

describe("inboxTitle", () => {
  const contact = (userId: string, unreadCount: number) => ({ userId, unreadCount }) as ContactDto;

  it("shows the unread total in the tab title, leaving out the open conversation", () => {
    expect(inboxTitle([contact("a", 2), contact("b", 3), contact("c", 5)], "c")).toBe("(5) LINE OA Webchat");
  });

  it("shows the plain title when everything is read", () => {
    expect(inboxTitle([contact("a", 0)], null)).toBe("LINE OA Webchat");
  });
});

describe("mergeMessages", () => {
  it("appends new messages in id order", () => {
    expect(mergeMessages([msg(1)], [msg(3), msg(2)]).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("drops duplicates, e.g. a sent message that is also returned by the next poll", () => {
    expect(mergeMessages([msg(1), msg(2)], [msg(2), msg(3)]).map((m) => m.id)).toEqual([1, 2, 3]);
  });

  it("returns the same array when nothing is new, so React can skip re-rendering", () => {
    const current = [msg(1)];
    expect(mergeMessages(current, [])).toBe(current);
    expect(mergeMessages(current, [msg(1)])).toBe(current);
  });
});
