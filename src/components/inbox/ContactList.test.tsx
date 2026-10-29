// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ContactDto } from "@/server/handlers/conversations";
import { ContactList } from "./ContactList";

const contact = (n: string, overrides: Partial<ContactDto> = {}): ContactDto => ({
  userId: `U${n.repeat(32)}`,
  displayName: `User ${n}`,
  pictureUrl: null,
  isFollowing: true,
  lastMessage: { type: "text", text: `hello from ${n}`, sentAt: "2026-01-01T10:00:00.000Z" },
  unreadCount: 0,
  ...overrides,
});

describe("ContactList", () => {
  it("shows who each conversation is with and their latest message", () => {
    render(<ContactList contacts={[contact("a"), contact("b")]} selectedUserId={null} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /User a/ })).toHaveTextContent("hello from a");
    expect(screen.getByRole("button", { name: /User b/ })).toHaveTextContent("hello from b");
  });

  it("shows how many messages are unread, except in the open conversation", () => {
    const contacts = [contact("a", { unreadCount: 3 }), contact("b", { unreadCount: 2 })];
    render(<ContactList contacts={contacts} selectedUserId={contacts[1].userId} onSelect={() => {}} />);

    expect(screen.getByLabelText("3 unread")).toBeInTheDocument();
    expect(screen.queryByLabelText("2 unread")).not.toBeInTheDocument();
  });

  it("selects a user on click and marks the selected one", async () => {
    const onSelect = vi.fn();
    const contacts = [contact("a"), contact("b")];
    const { rerender } = render(<ContactList contacts={contacts} selectedUserId={null} onSelect={onSelect} />);

    await userEvent.click(screen.getByRole("button", { name: /User b/ }));
    expect(onSelect).toHaveBeenCalledWith(contacts[1].userId);

    rerender(<ContactList contacts={contacts} selectedUserId={contacts[1].userId} onSelect={onSelect} />);
    expect(screen.getByRole("button", { name: /User b/ })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("button", { name: /User a/ })).not.toHaveAttribute("aria-current");
  });

  it("renders user-supplied text literally, never as HTML", () => {
    const evil = contact("a", { displayName: "<img src=x onerror=alert(1)>", lastMessage: null });
    const { container } = render(<ContactList contacts={[evil]} selectedUserId={null} onSelect={() => {}} />);

    expect(screen.getByText("<img src=x onerror=alert(1)>")).toBeInTheDocument();
    expect(container.querySelector("img[src='x']")).toBeNull();
  });

  it("labels non-text previews and users who unfollowed", () => {
    const sticker = contact("a", { isFollowing: false, lastMessage: { type: "sticker", text: null, sentAt: "2026-01-01T10:00:00.000Z" } });
    render(<ContactList contacts={[sticker]} selectedUserId={null} onSelect={() => {}} />);

    expect(screen.getByRole("button", { name: /User a/ })).toHaveTextContent("Sticker");
    expect(screen.getByText("Unfollowed")).toBeInTheDocument();
  });

  it("explains how conversations appear when there are none", () => {
    render(<ContactList contacts={[]} selectedUserId={null} onSelect={() => {}} />);

    expect(screen.getByText(/No conversations yet/)).toBeInTheDocument();
  });
});
