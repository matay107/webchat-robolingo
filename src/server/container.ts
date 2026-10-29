import "server-only";
import { createChatRepository } from "@/lib/chat/repository";
import { createChatService } from "@/lib/chat/service";
import { createDatabase } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { createDefaultLineGateway } from "@/lib/line/gateway";
import { createRateLimiter } from "@/lib/security/rate-limiter";
import { createAuthHandlers } from "./handlers/auth";
import { createConversationHandlers } from "./handlers/conversations";
import { createWebhookHandler } from "./handlers/webhook";

/**
 * Composition root: wires production dependencies once per server instance.
 * Built lazily on the first request so `next build` needs no runtime secrets.
 */
function build() {
  const env = getEnv();
  const db = createDatabase(env.databaseUrl);
  const repo = createChatRepository(db);
  const limiter = createRateLimiter(db);
  const line = createDefaultLineGateway(env.lineChannelAccessToken);
  const service = createChatService({ repo, line, now: () => new Date() });

  return {
    webhook: createWebhookHandler({ channelSecret: env.lineChannelSecret, service }),
    auth: createAuthHandlers({ adminPasswordHash: env.adminPasswordHash, sessionSecret: env.sessionSecret, limiter }),
    conversations: createConversationHandlers({ repo, service, line, limiter, sessionSecret: env.sessionSecret }),
  };
}

let handlers: ReturnType<typeof build> | undefined;

export function getHandlers() {
  handlers ??= build();
  return handlers;
}
