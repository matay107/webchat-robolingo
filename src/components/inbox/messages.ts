import type { MessageDto } from "@/server/handlers/conversations";

const NON_TEXT_LABELS: Record<string, string> = {
  sticker: "Sticker",
  image: "Photo",
  video: "Video",
  audio: "Voice message",
  file: "File",
  location: "Location",
};

/** Human-readable content of a message: its text, or a label for media this console does not render. */
export function describeMessage(type: string, text: string | null): string {
  if (type === "text") return text ?? "";
  return NON_TEXT_LABELS[type] ?? `Unsupported message (${type})`;
}

/** LINE's public sticker image. Not an official API, so callers must handle a failed load. */
export function stickerImageUrl(stickerId: string): string {
  return `https://stickershop.line-scdn.net/stickershop/v1/sticker/${stickerId}/android/sticker.png`;
}

/**
 * Merges polled or just-sent messages into the thread, ordered by id and without duplicates.
 * Returns `current` itself when nothing is new so React can bail out of re-rendering.
 */
export function mergeMessages(current: MessageDto[], incoming: MessageDto[]): MessageDto[] {
  const known = new Set(current.map((message) => message.id));
  const fresh = new Map(incoming.filter((message) => !known.has(message.id)).map((message) => [message.id, message]));
  if (fresh.size === 0) return current;
  return [...current, ...fresh.values()].sort((a, b) => a.id - b.id);
}

const timeFormat = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
const dateFormat = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

/** Time for messages from today, otherwise the date. */
export function formatTimestamp(iso: string, now = new Date()): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString() ? timeFormat.format(date) : dateFormat.format(date);
}
