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
      <p className="p-6 text-center text-sm text-zinc-500">
        No conversations yet. Messages sent to the LINE OA will appear here.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100">
      {contacts.map((contact) => {
        const selected = contact.userId === selectedUserId;
        return (
          <li key={contact.userId}>
            <button
              type="button"
              onClick={() => onSelect(contact.userId)}
              aria-current={selected ? "true" : undefined}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-50 ${selected ? "bg-emerald-50 hover:bg-emerald-50" : ""}`}
            >
              <Avatar name={contact.displayName} pictureUrl={contact.pictureUrl} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-zinc-900">{contact.displayName}</span>
                  {contact.lastMessage && (
                    <time dateTime={contact.lastMessage.sentAt} className="shrink-0 text-xs text-zinc-400">
                      {formatTimestamp(contact.lastMessage.sentAt)}
                    </time>
                  )}
                </span>
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm text-zinc-500">
                    {contact.lastMessage ? describeMessage(contact.lastMessage.type, contact.lastMessage.text) : " "}
                  </span>
                  {!contact.isFollowing && (
                    <span className="shrink-0 rounded bg-zinc-100 px-1.5 text-xs text-zinc-500">Unfollowed</span>
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
