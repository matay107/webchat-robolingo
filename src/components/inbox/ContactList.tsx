import type { ContactDto } from "@/server/handlers/conversations";
import { Avatar } from "./Avatar";
import { describeMessage, formatTimestamp } from "./messages";

interface ContactListProps {
  contacts: ContactDto[];
  selectedUserId: string | null;
  onSelect: (userId: string) => void;
}

/** Inbox sidebar: who has written to the OA, most recent conversation first. */
export function ContactList({ contacts, selectedUserId, onSelect }: ContactListProps) {
  if (contacts.length === 0) {
    return (
      <p className="p-6 text-center text-sm font-light text-muted">
        No conversations yet. Messages sent to the LINE OA will appear here.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-1 p-2">
      {contacts.map((contact) => {
        const selected = contact.userId === selectedUserId;
        const unread = selected ? 0 : contact.unreadCount;
        return (
          <li key={contact.userId}>
            <button
              type="button"
              onClick={() => onSelect(contact.userId)}
              aria-current={selected ? "true" : undefined}
              className={`flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors ${selected ? "bg-brand-soft" : "hover:bg-canvas"}`}
            >
              <Avatar name={contact.displayName} pictureUrl={contact.pictureUrl} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className={`truncate font-medium ${selected ? "text-brand-dark" : "text-ink"}`}>{contact.displayName}</span>
                  {contact.lastMessage && (
                    <time dateTime={contact.lastMessage.sentAt} className="shrink-0 text-xs font-light text-muted">
                      {formatTimestamp(contact.lastMessage.sentAt)}
                    </time>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-light text-muted">
                    {contact.lastMessage ? describeMessage(contact.lastMessage.type, contact.lastMessage.text) : " "}
                  </span>
                  {unread > 0 && (
                    <span
                      aria-label={`${unread} unread`}
                      className="ml-auto shrink-0 rounded-full bg-brand-gradient px-2 text-xs font-medium leading-5 text-white"
                    >
                      {unread > 99 ? "99+" : unread}
                    </span>
                  )}
                  {!contact.isFollowing && (
                    <span className="shrink-0 rounded-bubble bg-zinc-100 px-2 text-xs text-muted">Unfollowed</span>
                  )}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
