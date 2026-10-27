// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { MessageDto } from "@/server/handlers/conversations";
import { MessageThread } from "./MessageThread";

const message = (id: number, overrides: Partial<MessageDto> = {}): MessageDto => ({
  id,
  direction: "inbound",
  type: "text",
  text: `message ${id}`,
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

  it("shows an empty state for a conversation without messages", () => {
    render(<MessageThread messages={[]} />);

    expect(screen.getByText(/No messages yet/)).toBeInTheDocument();
  });
});
