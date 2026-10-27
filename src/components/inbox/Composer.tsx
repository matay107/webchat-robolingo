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
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-zinc-200 bg-white p-3">
      <textarea
        aria-label="Message"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={handleKeyDown}
        maxLength={MAX_TEXT_LENGTH}
        rows={1}
        disabled={disabled}
        placeholder={disabledReason ?? "Type a reply… (Shift+Enter for a new line)"}
        className="max-h-40 min-h-10 flex-1 resize-none rounded-xl border border-zinc-200 px-3 py-2 text-[15px] outline-none field-sizing-content focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 disabled:bg-zinc-50"
      />
      <button
        type="submit"
        disabled={!canSend}
        className="h-10 rounded-xl bg-[#06C755] px-4 font-medium text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
      >
        {sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
