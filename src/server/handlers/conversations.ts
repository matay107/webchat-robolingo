import type { NextRequest } from "next/server";
import { z } from "zod";
import { MAX_TEXT_LENGTH } from "@/lib/chat/limits";
import { IdempotencyKeyConflictError, type ChatRepository } from "@/lib/chat/repository";
import { ContactNotFoundError, type ChatService } from "@/lib/chat/service";
import type { ChatMessage, Contact } from "@/lib/chat/types";
import { LineApiError } from "@/lib/line/gateway";
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
  readJsonBody,
  tooManyRequests,
  unauthorized,
} from "../http";

/** Caps outbound pushes, which consume the OA's monthly message quota (OWASP API6:2023). */
export const SEND_RATE_LIMIT = { limit: 20, windowMs: 60 * 1000 };

const limitSchema = z.coerce.number().int().min(1).max(100).default(50);
const listMessagesQuerySchema = z.object({ after: z.coerce.number().int().min(0).optional(), limit: limitSchema });
const sendBodySchema = z.strictObject({
  text: z
    .string()
    .max(MAX_TEXT_LENGTH)
    .refine((text) => text.trim().length > 0, "Message is empty"),
  idempotencyKey: z.uuid(),
});

/** Public contact shape: an explicit allow-list so internal columns never leak (OWASP API3:2023). */
function toContactDto(contact: Contact) {
  return {
    userId: contact.userId,
    displayName: contact.displayName,
    pictureUrl: contact.pictureUrl,
    isFollowing: contact.isFollowing,
    lastMessage: contact.lastMessage && { ...contact.lastMessage, sentAt: contact.lastMessage.sentAt.toISOString() },
  };
}

function toMessageDto(message: ChatMessage) {
  return {
    id: message.id,
    direction: message.direction,
    type: message.messageType,
    text: message.text,
    stickerId: message.stickerId,
    sentAt: message.sentAt.toISOString(),
  };
}

export type ContactDto = ReturnType<typeof toContactDto>;
export type MessageDto = ReturnType<typeof toMessageDto>;

const queryParam = (request: NextRequest, name: string) => request.nextUrl.searchParams.get(name) ?? undefined;

export interface ConversationHandlerDeps {
  repo: ChatRepository;
  service: ChatService;
  limiter: RateLimiter;
  sessionSecret: string;
}

/** Admin inbox API. Every handler verifies the session itself; the proxy check is only optimistic. */
export function createConversationHandlers({ repo, service, limiter, sessionSecret }: ConversationHandlerDeps) {
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

    /** `GET /api/contacts/:userId/messages?after=&limit=` */
    async listMessages(request: NextRequest, userId: string): Promise<Response> {
      if (!(await hasValidSession(request, sessionSecret))) return unauthorized();
      if (!lineUserIdSchema.safeParse(userId).success) return invalidRequest("Invalid user id");
      const query = listMessagesQuerySchema.safeParse({ after: queryParam(request, "after"), limit: queryParam(request, "limit") });
      if (!query.success) return invalidRequest("Invalid query parameters");

      try {
        const messages = await repo.listMessages(userId, { afterId: query.data.after, limit: query.data.limit });
        return json({ messages: messages.map(toMessageDto) });
      } catch (error) {
        return internalError("messages.list_failed", error);
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
