"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import type { ContactDto } from "@/server/handlers/conversations";
import { inboxApi, UnauthorizedError } from "./api";
import { ContactList } from "./ContactList";
import { Conversation } from "./Conversation";
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

  async function signOut() {
    await inboxApi.logout();
    router.replace("/login");
  }

  const selected = contacts?.find((contact) => contact.userId === selectedUserId) ?? null;

  return (
    <div className="flex h-dvh flex-col bg-white">
      <header className="flex items-center justify-between bg-[#06C755] px-4 py-2.5 text-white">
        <h1 className="font-semibold">LINE OA Webchat</h1>
        <button type="button" onClick={signOut} className="rounded-md px-2 py-1 text-sm hover:bg-white/15">
          Sign out
        </button>
      </header>

      {connectionError && (
        <p role="status" className="bg-amber-50 px-4 py-1.5 text-center text-sm text-amber-800">
          Connection problem. Retrying…
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        <nav
          aria-label="Conversations"
          className={`${selected ? "hidden md:block" : "block"} w-full shrink-0 overflow-y-auto border-r border-zinc-200 md:w-80`}
        >
          {contacts === null ? (
            <p className="p-6 text-center text-sm text-zinc-500">Loading…</p>
          ) : (
            <ContactList contacts={contacts} selectedUserId={selectedUserId} onSelect={setSelectedUserId} />
          )}
        </nav>

        <main className={`${selected ? "flex" : "hidden md:flex"} min-w-0 flex-1 flex-col`}>
          {selected ? (
            <Conversation key={selected.userId} contact={selected} onBack={() => setSelectedUserId(null)} onError={handleError} />
          ) : (
            <p className="m-auto text-sm text-zinc-500">Select a conversation to reply.</p>
          )}
        </main>
      </div>
    </div>
  );
}
