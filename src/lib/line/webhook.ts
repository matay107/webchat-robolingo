import { z } from "zod";
import { lineUserIdSchema } from "./ids";

/**
 * Inbound LINE events reduced to what the console needs. Only one-to-one chats
 * are kept: group and room messages cannot be answered from a per-user inbox.
 */
export type InboundEvent =
  | {
      kind: "message";
      userId: string;
      messageId: string;
      sentAt: Date;
      messageType: string;
      /** Present only for `text` messages. */
      text: string | null;
      /** Present only for `sticker` messages. */
      stickerId: string | null;
    }
  | { kind: "follow" | "unfollow"; userId: string; sentAt: Date };

export class WebhookPayloadError extends Error {
  constructor() {
    super("Webhook body is not a LINE webhook envelope");
    this.name = "WebhookPayloadError";
  }
}

const envelopeSchema = z.object({ events: z.array(z.unknown()) });

const userSourceSchema = z.object({ type: z.literal("user"), userId: lineUserIdSchema });
const eventBase = { timestamp: z.number().int().nonnegative(), source: userSourceSchema };

const eventSchema = z.discriminatedUnion("type", [
  z.object({
    ...eventBase,
    type: z.literal("message"),
    message: z.object({
      id: z.string().min(1).max(64),
      type: z.string().min(1).max(32),
      text: z.string().optional(),
      // Numeric only because it is placed in an image URL; anything else is dropped, not the message.
      stickerId: z.string().regex(/^\d{1,20}$/).optional().catch(undefined),
    }),
  }),
  z.object({ ...eventBase, type: z.literal("follow") }),
  z.object({ ...eventBase, type: z.literal("unfollow") }),
]);

/**
 * Parses a signature-verified webhook body. Throws {@link WebhookPayloadError} only when
 * the envelope itself is invalid; individual events that are unsupported or malformed are
 * skipped so one odd event never blocks the rest of a delivery.
 */
export function parseWebhookBody(payload: unknown): InboundEvent[] {
  const envelope = envelopeSchema.safeParse(payload);
  if (!envelope.success) throw new WebhookPayloadError();

  return envelope.data.events.flatMap((raw): InboundEvent[] => {
    const parsed = eventSchema.safeParse(raw);
    if (!parsed.success) return [];

    const event = parsed.data;
    const common = { userId: event.source.userId, sentAt: new Date(event.timestamp) };
    if (event.type !== "message") return [{ kind: event.type, ...common }];

    const { id, type, text, stickerId } = event.message;
    return [
      {
        kind: "message",
        ...common,
        messageId: id,
        messageType: type,
        text: type === "text" ? (text ?? "") : null,
        stickerId: type === "sticker" ? (stickerId ?? null) : null,
      },
    ];
  });
}
