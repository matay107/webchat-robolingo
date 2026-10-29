// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/server/handlers/conversations";
import { MessageThread } from "./MessageThread";

const message = (id: number, overrides: Partial<MessageDto> = {}): MessageDto => ({
  id,
  direction: "inbound",
  type: "text",
  text: `message ${id}`,
  stickerId: null,
  sentAt: "2026-01-01T10:00:00.000Z",
  ...overrides,
});

describe("MessageThread", () => {
  it("separates what the user sent from what the OA replied", () => {
    render(<MessageThread messages={[message(1), message(2, { direction: "outbound", text: "reply" })]} />);

    expect(screen.getByText("message 1").closest("[data-direction]")).toHaveAttribute("data-direction", "inbound");
    expect(screen.getByText("reply").closest("[data-direction]")).toHaveAttribute("data-direction", "outbound");
  });

  it("keeps line breaks and shows HTML-like text literally", () => {
    render(<MessageThread messages={[message(1, { text: "<script>x</script>\nline two" })]} />);

    expect(screen.getByText(/<script>x<\/script>/)).toHaveClass("whitespace-pre-wrap");
  });

  it("shows a label for messages that are not text", () => {
    render(<MessageThread messages={[message(1, { type: "image", text: null })]} />);

    expect(screen.getByText("Photo")).toBeInTheDocument();
  });

  it("shows a sticker as its image", () => {
    render(<MessageThread messages={[message(1, { type: "sticker", text: null, stickerId: "52002734" })]} />);

    expect(screen.getByRole("img", { name: "Sticker" }).getAttribute("src")).toContain(encodeURIComponent("/sticker/52002734/"));
  });

  it("falls back to the sticker label when the image cannot be loaded", () => {
    render(<MessageThread messages={[message(1, { type: "sticker", text: null, stickerId: "52002734" })]} />);

    fireEvent.error(screen.getByRole("img", { name: "Sticker" }));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("Sticker")).toBeInTheDocument();
  });

  it("shows an empty state for a conversation without messages", () => {
    render(<MessageThread messages={[]} />);

    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });
});
