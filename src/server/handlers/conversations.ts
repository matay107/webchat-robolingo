import type { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_TEXT_LENGTH, MESSAGE_PAGE_SIZE } from "@/lib/chat/limits";
import { IdempotencyKeyConflictError, type ChatRepository } from "@/lib/chat/repository";
import { ContactNotFoundError, type ChatService } from "@/lib/chat/service";
import type { ChatMessage, Contact } from "@/lib/chat/types";
import { LineApiError, type LineGateway } from "@/lib/line/gateway";
import { lineUserIdSchema } from "@/lib/line/ids";
import { logger } from "@/lib/logger";
import type { RateLimiter } from "@/lib/security/rate-limiter";
import {
  clientIp,
  errorJson,
  forbiddenOrigin,
  hasValidSession,
  internalError,
  invalidRequest,
  isSameOrigin,
  json,
  noContent,
  readJsonBody,
  tooManyRequests,
  unauthorized,
} from "../http";

/** Caps outbound pushes, which consume the OA's monthly message quota (OWASP API6:2023). */
export const SEND_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

const limitSchema = z.coerce.number().int().min(1).max(100).default(MESSAGE_PAGE_SIZE);
const cursorSchema = z.coerce.number().int().min(0).optional();
const listMessagesQuerySchema = z
  .object({ after: cursorSchema, before: cursorSchema, limit: limitSchema })
  .refine((query) => query.after === undefined || query.before === undefined, "Use either after or before");
const sendBodySchema = z.strictObject({
  text: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .refine((text) => text.trim().length > 0, "Message is empty"),
  idempotencyKey: z.uuid(),
});
const imageParamsSchema = z.object({
  id: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  size: z.enum(["preview", "full"]).default("preview"),
});
const markReadBodySchema = z.strictObject({ upToId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

/** Public contact shape: an explicit allow-list so internal columns never leak (OWASP API3:2023). */
function toContactDto(contact: Contact) {
  return {
    userId: contact.userId,
    displayName: contact.displayName,
    pictureUrl: contact.pictureUrl,
    isFollowing: contact.isFollowing,
    lastMessage: contact.lastMessage && { ...contact.lastMessage, sentAt: contact.lastMessage.sentAt.toISOString() },
    unreadCount: contact.unreadCount,
  };
}

function toMessageDto(message: ChatMessage) {
  return {
    id: message.id,
    direction: message.direction,
    type: message.messageType,
    text: message.text,
    stickerId: message.stickerId,
    /** Served through this app so the channel access token never reaches the browser. */
    imageUrl:
      message.messageType === "image" && message.direction === "inbound"
        ? `/api/contacts/${message.userId}/messages/${message.id}/image`
        : null,
    sentAt: message.sentAt.toISOString(),
  };
}

export type ContactDto = ReturnType<typeof toContactDto>;
export type MessageDto = ReturnType<typeof toMessageDto>;

const queryParam = (request: NextRequest, name: string) => request.nextUrl.searchParams.get(name) ?? undefined;

export interface ConversationHandlerDeps {
  repo: ChatRepository;
  service: ChatService;
  line: LineGateway;
  limiter: RateLimiter;
  sessionSecret: string;
}

/** Admin inbox API. Every handler verifies the session itself; the proxy check is only optimistic. */
export function createConversationHandlers({ repo, service, line, limiter, sessionSecret }: ConversationHandlerDeps) {
  return {
    /** `GET /api/contacts?limit=` */
    async listContacts(request: NextRequest): Promise<Response> {
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      const limit = limitSchema.safeParse(queryParam(request, "limit"));
      if (!limit.success) return invalidRequest("limit must be an integer from 1 to 100");

      try {
        const contacts = await repo.listContacts(limit.data);
        return json({ contacts: contacts.map(toContactDto) });
      } catch (error) {
        return internalError("contacts.list_failed", error);
      }
    },

    /** `GET /api/contacts/:userId/messages?after=|before=&limit=` */
    async listMessages(request: NextRequest, userId: string): Promise<Response> {
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      if (!lineUserIdSchema.safeParse(userId).success) return invalidRequest("Invalid user id");
      const query = listMessagesQuerySchema.safeParse({
        after: queryParam(request, "after"),
        before: queryParam(request, "before"),
        limit: queryParam(request, "limit"),
      });
      if (!query.success) return invalidRequest("Invalid query parameters");

      try {
        const { after, before, limit } = query.data;
        const messages = await repo.listMessages(userId, { afterId: after, beforeId: before, limit });
        return json({ messages: messages.map(toMessageDto) });
      } catch (error) {
        return internalError("messages.list_failed", error);
      }
    },

    /** `GET /api/contacts/:userId/messages/:id/image?size=preview|full` */
    async getImage(request: NextRequest, userId: string, messageId: string): Promise<Response> {
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      if (!lineUserIdSchema.safeParse(userId).success) return invalidRequest("Invalid user id");
      const params = imageParamsSchema.safeParse({ id: messageId, size: queryParam(request, "size") });
      if (!params.success) return invalidRequest("Invalid message id or size");

      try {
        // Scoped to the user in the path, so one conversation's URL cannot read another's image (API1:2023).
        const lineMessageId = await repo.findLineMessageId(userId, params.data.id, "image");
        if (!lineMessageId) return errorJson(404, "not_found", "Image not found");

        const image = await line.getImage(lineMessageId, params.data.size);
        if (!image) return errorJson(404, "not_found", "Image is no longer available");
        return new Response(Buffer.from(image.data), {
          headers: { "content-type": image.contentType, "content-length": String(image.data.byteLength) },
        });
      } catch (error) {
        if (error instanceof LineApiError) {
          logger.warn("messages.image_failed", { status: error.status });
          return errorJson(502, "upstream_error", "Could not load the image from LINE.");
        }
        return internalError("messages.image_failed", error);
      }
    },

    /** `POST /api/contacts/:userId/read` with `{ upToId }` */
    async markRead(request: NextRequest, userId: string): Promise<Response> {
      if (!isSameOrigin(request)) return forbiddenOrigin();
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      if (!lineUserIdSchema.safeParse(userId).success) return invalidRequest("Invalid user id");

      try {
        const body = markReadBodySchema.safeParse(await readJsonBody(request, 1024));
        if (!body.success) return invalidRequest("upToId must be a positive integer");

        await repo.markRead(userId, body.data.upToId);
        return noContent();
      } catch (error) {
        return internalError("contacts.mark_read_failed", error);
      }
    },

    /** `POST /api/contacts/:userId/messages` with `{ text, idempotencyKey }` */
    async sendMessage(request: NextRequest, userId: string): Promise<Response> {
      if (!isSameOrigin(request)) return forbiddenOrigin();
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      if (!lineUserIdSchema.safeParse(userId).success) return invalidRequest("Invalid user id");

      try {
        const rate = await limiter.consume(`send:${clientIp(request)}`, SEND_RATE_LIMIT);
        if (!rate.allowed) return tooManyRequests(rate);

        const body = sendBodySchema.safeParse(await readJsonBody(request, 64 * 1024));
        if (!body.success) return invalidRequest(`text must be 1-${MAX_TEXT_LENGTH} characters; idempotencyKey must be a UUID`);

        const message = await service.sendReply({ userId, ...body.data });
        return json({ message: toMessageDto(message) }, { status: 201 });
      } catch (error) {
        if (error instanceof ContactNotFoundError) return errorJson(404, "not_found", "Contact not found");
        if (error instanceof IdempotencyKeyConflictError) return errorJson(409, "conflict", "Idempotency key already used");
        if (error instanceof LineApiError) {
          logger.warn("messages.push_failed", { status: error.status });
          return errorJson(502, "upstream_error", "LINE did not accept the message. Try again.");
        }
        return internalError("messages.send_failed", error);
      }
    },
  };
}
