"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
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

/** Chat bubbles for one conversation; keeps the newest message in view. */
export function MessageThread({ messages }: { messages: MessageDto[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastId = messages.at(-1)?.id;
  const [failedStickers, setFailedStickers] = useState<ReadonlySet<number>>(() => new Set());

  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [lastId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto bg-canvas px-4 py-6">
      {messages.length === 0 ? (
        <p className="text-center text-sm font-light text-muted">No messages yet.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {messages.map((message) => {
            const outbound = message.direction === "outbound";
            const isText = message.type === "text";
            const stickerId = failedStickers.has(message.id) ? null : message.stickerId;
            return (
              <li key={message.id} data-direction={message.direction} className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
                <div className={`flex max-w-[75%] flex-col ${outbound ? "items-end" : "items-start"}`}>
                  {stickerId ? (
                    <Sticker
                      stickerId={stickerId}
                      onFail={() => setFailedStickers((failed) => new Set(failed).add(message.id))}
                    />
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
