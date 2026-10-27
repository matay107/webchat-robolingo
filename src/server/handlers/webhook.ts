import type { NextRequest } from "next/server";
import type { ChatService } from "@/lib/chat/service";
import { verifySignature } from "@/lib/line/signature";
import { parseWebhookBody, WebhookPayloadError } from "@/lib/line/webhook";
import { errorJson, internalError, json } from "../http";

/** LINE deliveries are small; anything near this is not from LINE. */
export const MAX_WEBHOOK_BODY_BYTES = 1024 * 1024;

export interface WebhookHandlerDeps {
  channelSecret: string;
  service: ChatService;
}

/**
 * `POST /api/line/webhook`. Authenticated by LINE's HMAC signature rather than a session.
 * Order matters: size check, then signature on the raw bytes, and only then JSON parsing.
 */
export function createWebhookHandler({ channelSecret, service }: WebhookHandlerDeps) {
  return async function handleWebhook(request: NextRequest): Promise<Response> {
    const tooLarge = () => errorJson(413, "payload_too_large", "Payload too large");
    if (Number(request.headers.get("content-length") ?? 0) > MAX_WEBHOOK_BODY_BYTES) return tooLarge();

    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody) > MAX_WEBHOOK_BODY_BYTES) return tooLarge();

    if (!verifySignature(rawBody, request.headers.get("x-line-signature"), channelSecret)) {
      return errorJson(401, "unauthorized", "Invalid signature");
    }

    let events;
    try {
      events = parseWebhookBody(JSON.parse(rawBody));
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof WebhookPayloadError) {
        return errorJson(400, "invalid_request", "Invalid webhook payload");
      }
      throw error;
    }

    try {
      await service.ingestWebhookEvents(events);
    } catch (error) {
      // A non-2xx lets LINE redeliver (when redelivery is enabled); storage is idempotent.
      return internalError("webhook.ingest_failed", error);
    }
    return json({});
  };
}
