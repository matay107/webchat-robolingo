"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { MAX_TEXT_LENGTH } from "@/lib/chat/limits";

interface ComposerProps {
  /** Resolves `true` when the message was delivered; on `false` the draft is kept for a retry. */
  onSend: (text: string) => Promise<boolean>;
  /** When set, input is disabled and this explains why. */
  disabledReason?: string;
}

/** Reply box: Enter sends, Shift+Enter adds a line. One message in flight at a time. */
export function Composer({ onSend, disabledReason }: ComposerProps) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const disabled = Boolean(disabledReason);
  const canSend = !disabled && !sending && text.trim().length > 0;

  async function submit() {
    if (!canSend) return;
    setSending(true);
    const delivered = await onSend(text.trim());
    setSending(false);
    if (delivered) setText("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an IME candidate must not send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void submit();
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void submit();
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-zinc-100 bg-white p-3">
      <textarea
        aria-label="Message"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_TEXT_LENGTH}
        rows={1}
        disabled={disabled}
        placeholder={disabledReason ?? "Type a reply… (Shift+Enter for a new line)"}
        className="max-h-40 min-h-11 flex-1 resize-none rounded-3xl border border-zinc-200 bg-canvas px-4 py-2.5 text-[15px] outline-none transition field-sizing-content focus:border-brand focus:bg-white focus:ring-4 focus:ring-brand-soft disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={!canSend}
        className="h-11 rounded-bubble bg-brand-gradient px-6 font-medium text-white shadow-md shadow-brand/25 transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
