import type { NextRequest } from "next/server";
import { z } from "zod";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { RateLimiter } from "@/lib/security/rate-limiter";
import {
  clientIp,
  errorJson,
  forbiddenOrigin,
  internalError,
  invalidRequest,
  isSameOrigin,
  noContent,
  readJsonBody,
  tooManyRequests,
} from "../http";

/** Brute-force protection per client IP (ASVS V2.2.1). */
export const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };

const loginBodySchema = z.strictObject({ password: z.string().min(1).max(1024) });

export interface AuthHandlerDeps {
  adminPasswordHash: string;
  sessionSecret: string;
  limiter: RateLimiter;
}

export function createAuthHandlers({ adminPasswordHash, sessionSecret, limiter }: AuthHandlerDeps) {
  return {
    /** `POST /api/auth/login`: exchanges the admin password for a session cookie. */
    async login(request: NextRequest): Promise<Response> {
      if (!isSameOrigin(request)) return forbiddenOrigin();
      try {
        const ip = clientIp(request);
        const rate = await limiter.consume(`login:${ip}`, LOGIN_RATE_LIMIT);
        if (!rate.allowed) {
          logger.warn("auth.login_rate_limited", { ip });
          return tooManyRequests(rate);
        }

        const body = loginBodySchema.safeParse(await readJsonBody(request, 4096));
        if (!body.success) return invalidRequest();

        if (!(await verifyPassword(body.data.password, adminPasswordHash))) {
          logger.warn("auth.login_failed", { ip });
          return errorJson(401, "unauthorized", "Incorrect password");
        }

        logger.info("auth.login_succeeded", { ip });
        const response = noContent();
        response.cookies.set(SESSION_COOKIE, await createSessionToken(sessionSecret), sessionCookieOptions);
        return response;
      } catch (error) {
        return internalError("auth.login_error", error);
      }
    },

    /** `POST /api/auth/logout`: clears the session cookie. */
    async logout(request: NextRequest): Promise<Response> {
      if (!isSameOrigin(request)) return forbiddenOrigin();
      const response = noContent();
      response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
      return response;
    },
  };
}
