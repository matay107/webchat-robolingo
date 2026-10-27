import { sql } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { rateLimits } from "@/lib/db/schema";

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfterSeconds: number };

export interface RateLimiter {
  /** Counts one request against `key` and reports whether it is within the policy. */
  consume(key: string, policy: RateLimitPolicy, now?: Date): Promise<RateLimitResult>;
}

/**
 * Fixed-window limiter (OWASP API4:2023). One atomic upsert per request, so concurrent
 * serverless instances cannot race past the limit.
 */
export function createRateLimiter(db: Database): RateLimiter {
  return {
    async consume(key, { limit, windowMs }, now = new Date()) {
      const nowTs = sql`${now.toISOString()}::timestamptz`;
      const windowExpired = sql`${rateLimits.windowStart} <= ${new Date(now.getTime() - windowMs).toISOString()}::timestamptz`;

      const [row] = await db
        .insert(rateLimits)
        .values({ key, windowStart: now, count: 1 })
        .onConflictDoUpdate({
          target: rateLimits.key,
          set: {
            windowStart: sql`case when ${windowExpired} then ${nowTs} else ${rateLimits.windowStart} end`,
            count: sql`case when ${windowExpired} then 1 else ${rateLimits.count} + 1 end`,
          },
        })
        .returning({ windowStart: rateLimits.windowStart, count: rateLimits.count });

      if (row.count <= limit) return { allowed: true };

      const windowEndsAt = row.windowStart.getTime() + windowMs;
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - now.getTime()) / 1000)) };
    },
  };
}
