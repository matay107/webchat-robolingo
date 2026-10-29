"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ContactDto } from "@/server/handlers/conversations";
import { inboxApi, UnauthorizedError } from "./api";
import { ContactList } from "./ContactList";
import { Conversation } from "./Conversation";
import { inboxTitle } from "./messages";
import { usePolling } from "./usePolling";

const CONTACT_POLL_MS = 3000;

/** Admin inbox: conversation list on the left, the selected conversation on the right. */
export function Inbox() {
  const [contacts, setContacts] = useState<ContactDto[] | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState(false);
  const router = useRouter();

  const handleError = useCallback(
    (error: unknown) => {
      if (error instanceof UnauthorizedError) router.replace("/login");
      else setConnectionError(true);
    },
    [router],
  );

  usePolling(async (signal) => {
    try {
      setContacts(await inboxApi.listContacts(signal));
      setConnectionError(false);
    } catch (error) {
      if (!signal.aborted) handleError(error);
    }
  }, CONTACT_POLL_MS);

  useEffect(() => {
    document.title = inboxTitle(contacts ?? [], selectedUserId);
  }, [contacts, selectedUserId]);

  async function signOut() {
    await inboxApi.logout();
    router.replace("/login");
  }

  const selected = contacts?.find((contact) => contact.userId === selectedUserId) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-canvas">
      <header className="relative flex items-center justify-between bg-white px-4 py-3 shadow-sm">
        <h1 className="text-lg font-semibold">
          <span className="text-brand-gradient">LINE OA</span> Webchat
        </h1>
        <button
          type="button"
          onClick={signOut}
          className="rounded-bubble border border-brand/30 px-4 py-1.5 text-sm text-brand transition hover:bg-brand-soft"
        >
          Sign out
        </button>
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-gradient" />
      </header>

      {connectionError && (
        <p role="status" className="bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-800">
          Connection problem. Retrying…
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Conversations"
          className={`${selected ? "hidden md:block" : "block"} w-full shrink-0 overflow-y-auto border-r border-zinc-100 bg-white md:w-80`}
        >
          {contacts === null ? (
            <p className="p-6 text-center text-sm text-muted">Loading…</p>
          ) : (
            <ContactList contacts={contacts} selectedUserId={selectedUserId} onSelect={setSelectedUserId} />
          )}
        </nav>

        <main className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selected ? (
            <Conversation key={selected.userId} contact={selected} onBack={() => setSelectedUserId(null)} onError={handleError} />
          ) : (
            <div className="m-auto flex flex-col items-center gap-3 text-center">
              <span aria-hidden className="flex size-16 items-center justify-center rounded-bubble bg-brand-gradient text-2xl text-white shadow-lg shadow-brand/25">
                ✉
              </span>
              <p className="text-sm text-muted">Select a conversation to reply.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
