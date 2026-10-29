"use client";

import { useRef, useState } from "react";
import { MESSAGE_PAGE_SIZE } from "@/lib/chat/limits";
import type { ContactDto, MessageDto } from "@/server/handlers/conversations";
import { ApiError, inboxApi, UnauthorizedError } from "./api";
import { Avatar } from "./Avatar";
import { Composer } from "./Composer";
import { MessageThread } from "./MessageThread";
import { mergeMessages } from "./messages";
import { usePolling } from "./usePolling";

const MESSAGE_POLL_MS = 2000;

interface ConversationProps {
  contact: ContactDto;
  onBack: () => void;
  /** Called for failures the inbox handles globally (expired session, lost connection). */
  onError: (error: unknown) => void;
}

/** One conversation: polls for new messages and sends replies. Mount with `key={userId}`. */
export function Conversation({ contact, onBack, onError }: ConversationProps) {
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  /** Highest message id seen by polling; sent messages do not move it, so nothing in between is skipped. */
  const cursor = useRef<number | undefined>(undefined);
  /** Retrying the same text reuses its idempotency key, so a send that timed out is not delivered twice. */
  const pendingSend = useRef<{ text: string; key: string } | null>(null);

  usePolling(async (signal) => {
    try {
      const firstLoad = cursor.current === undefined;
      const incoming = await inboxApi.listMessages(contact.userId, { after: cursor.current }, signal);
      // A full first page means there may be more history before it.
      if (firstLoad) setHasOlder(incoming.length === MESSAGE_PAGE_SIZE);
      if (incoming.length > 0) cursor.current = incoming[incoming.length - 1].id;
      setMessages((current) => mergeMessages(current, incoming));
      setLoaded(true);
    } catch (error) {
      if (!signal.aborted) onError(error);
    }
  }, MESSAGE_POLL_MS);

  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const older = await inboxApi.listMessages(contact.userId, { before: oldest.id });
      setHasOlder(older.length === MESSAGE_PAGE_SIZE);
      setMessages((current) => mergeMessages(current, older));
    } catch (error) {
      onError(error);
    } finally {
      setLoadingOlder(false);
    }
  }

  async function send(text: string): Promise<boolean> {
    if (pendingSend.current?.text !== text) pendingSend.current = { text, key: crypto.randomUUID() };
    try {
      const message = await inboxApi.sendMessage(contact.userId, text, pendingSend.current.key);
      pendingSend.current = null;
      setSendError(null);
      setMessages((current) => mergeMessages(current, [message]));
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedError) onError(error);
      else setSendError(error instanceof ApiError ? error.message : "Could not send. Check your connection and try again.");
      return false;
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-zinc-100 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="-ml-1 rounded-full p-1.5 text-brand hover:bg-brand-soft md:hidden" aria-label="Back to conversations">
          ←
        </button>
        <Avatar name={contact.displayName} pictureUrl={contact.pictureUrl} size={36} />
        <div className="min-w-0">
          <h2 className="truncate font-medium text-ink">{contact.displayName}</h2>
          {!contact.isFollowing && <p className="text-xs font-light text-muted">Unfollowed or blocked the OA</p>}
        </div>
      </header>

      {loaded ? (
        <MessageThread messages={messages} onLoadOlder={hasOlder ? loadOlder : undefined} loadingOlder={loadingOlder} />
      ) : (
        <p className="flex-1 bg-canvas p-6 text-center text-sm text-muted">Loading…</p>
      )}

      {sendError && (
        <p role="alert" className="border-t border-brand/10 bg-brand-soft px-4 py-2 text-sm text-brand-dark">
          {sendError}
        </p>
      )}
      <Composer
        onSend={send}
        disabledReason={contact.isFollowing ? undefined : "This user unfollowed the OA, so replies cannot be delivered."}
      />
    </>
  );
}
