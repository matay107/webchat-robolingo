"use client";

import Image from "next/image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MessageDto } from "@/server/handlers/conversations";
import { describeMessage, formatTimestamp, stickerImageUrl } from "./messages";

const STICKER_SIZE = 120;

/** Sticker image, shown without a bubble. `onFail` lets the thread fall back to the text label. */
function Sticker({ stickerId, onFail }: { stickerId: string; onFail: () => void }) {
  return (
    <Image
      src={stickerImageUrl(stickerId)}
      alt="Sticker"
      width={STICKER_SIZE}
      height={STICKER_SIZE}
      onError={onFail}
      className="object-contain"
    />
  );
}

/** Photo preview; opens the original in a new tab. */
function Photo({ url, onFail }: { url: string; onFail: () => void }) {
  return (
    <a href={`${url}?size=full`} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-2xl shadow-sm">
      {/* Unoptimized: the image route needs the session cookie, which the optimizer does not forward. */}
      <Image src={url} alt="Photo" width={240} height={240} unoptimized onError={onFail} className="h-auto max-h-60 w-auto max-w-60 object-cover" />
    </a>
  );
}

interface MessageThreadProps {
  messages: MessageDto[];
  /** Set while older history exists; shows a "load earlier" button at the top. */
  onLoadOlder?: () => void;
  loadingOlder?: boolean;
}

/** Chat bubbles for one conversation; keeps the newest message in view. */
export function MessageThread({ messages, onLoadOlder, loadingOlder = false }: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const firstId = messages[0]?.id;
  const lastId = messages.at(-1)?.id;
  const previous = useRef<{ firstId?: number; scrollHeight: number }>({ scrollHeight: 0 });
  /** Messages whose sticker or photo failed to load; they fall back to their text label. */
  const [failedMedia, setFailedMedia] = useState<ReadonlySet<number>>(() => new Set());

  // Prepending older history must not move what the admin is reading: shift by the added height.
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const before = previous.current;
    if (before.firstId !== undefined && firstId !== undefined && firstId < before.firstId) {
      element.scrollTop += element.scrollHeight - before.scrollHeight;
    }
    previous.current = { firstId, scrollHeight: element.scrollHeight };
  });

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-canvas px-4 py-6">
      {onLoadOlder && (
        <div className="mb-4 flex justify-center">
          <button
            type="button"
            onClick={onLoadOlder}
            disabled={loadingOlder}
            className="rounded-bubble border border-brand/30 bg-white px-4 py-1.5 text-sm text-brand transition hover:bg-brand-soft disabled:opacity-60"
          >
            {loadingOlder ? "Loading…" : "Load earlier messages"}
          </button>
        </div>
      )}
      {messages.length === 0 ? (
        <p className="text-center text-sm font-light text-muted">No messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((message) => {
            const outbound = message.direction === "outbound";
            const isText = message.type === "text";
            const failed = failedMedia.has(message.id);
            const stickerId = failed ? null : message.stickerId;
            const imageUrl = failed ? null : message.imageUrl;
            const markFailed = () => setFailedMedia((current) => new Set(current).add(message.id));
            return (
              <li key={message.id} data-direction={message.direction} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[75%] flex-col ${outbound ? "items-end" : "items-start"}`}>
                  {stickerId ? (
                    <Sticker stickerId={stickerId} onFail={markFailed} />
                  ) : imageUrl ? (
                    <Photo url={imageUrl} onFail={markFailed} />
                  ) : (
                    <p
                      className={`whitespace-pre-wrap break-words px-4 py-2 text-[15px] leading-snug ${
                        outbound
                          ? "rounded-[20px_20px_4px_20px] bg-brand-gradient text-white shadow-md shadow-brand/20"
                          : "rounded-[20px_20px_20px_4px] bg-white text-ink shadow-sm"
                      } ${isText ? "" : "italic opacity-80"}`}
                    >
                      {describeMessage(message.type, message.text)}
                    </p>
                  )}
                  <time dateTime={message.sentAt} className="mt-1 px-1 text-[11px] font-light text-muted">
                    {formatTimestamp(message.sentAt)}
                  </time>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
