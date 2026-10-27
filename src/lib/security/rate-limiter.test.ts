import { beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../../../test/db";
import { createRateLimiter, type RateLimiter } from "./rate-limiter";

const policy = { limit: 3, windowMs: 60_000 };
const t0 = new Date("2026-01-01T00:00:00Z");
const later = (ms: number) => new Date(t0.getTime() + ms);

let limiter: RateLimiter;

beforeEach(async () => {
  limiter = createRateLimiter(await createTestDatabase());
});

describe("RateLimiter.consume", () => {
  it("allows requests up to the limit, then blocks with the seconds left in the window", async () => {
    for (let i = 0; i < 3; i++) {
      await expect(limiter.consume("login:1.2.3.4", policy, later(i * 1000))).resolves.toEqual({ allowed: true });
    }

    await expect(limiter.consume("login:1.2.3.4", policy, later(20_000))).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 40,
    });
  });

  it("starts a fresh window once the previous one has elapsed", async () => {
    for (let i = 0; i < 4; i++) await limiter.consume("k", policy, t0);

    await expect(limiter.consume("k", policy, later(60_000))).resolves.toEqual({ allowed: true });
  });

  it("counts each key independently", async () => {
    for (let i = 0; i < 3; i++) await limiter.consume("a", policy, t0);

    await expect(limiter.consume("b", policy, t0)).resolves.toEqual({ allowed: true });
  });
});
