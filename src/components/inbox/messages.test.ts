import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/server/handlers/conversations";
import { describeMessage, mergeMessages } from "./messages";

const msg = (id: number, text = `m${id}`): MessageDto => ({
  id,
  direction: "inbound",
  type: "text",
  text,
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
