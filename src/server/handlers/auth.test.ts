import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { createRateLimiter } from "@/lib/security/rate-limiter";
import { createTestDatabase } from "../../../test/db";
import { makeRequest, SESSION_SECRET } from "../../../test/http";
import { createAuthHandlers, LOGIN_RATE_LIMIT } from "./auth";

const password = "correct horse battery staple";
let adminPasswordHash: string;
let handlers: ReturnType<typeof createAuthHandlers>;

beforeAll(async () => {
  adminPasswordHash = await hashPassword(password);
});

beforeEach(async () => {
  const limiter = createRateLimiter(await createTestDatabase());
  handlers = createAuthHandlers({ adminPasswordHash, sessionSecret: SESSION_SECRET, limiter });
});

const login = (body: unknown, options: { origin?: string | null; ip?: string } = {}) =>
  handlers.login(
    makeRequest("/api/auth/login", {
      method: "POST",
      body: body as object,
      origin: options.origin,
      headers: { "x-forwarded-for": options.ip ?? "203.0.113.7" },
    }),
  );

describe("POST /api/auth/login", () => {
  it("sets a hardened session cookie for the correct password", async () => {
    const response = await login({ password });

    expect(response.status).toBe(204);
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=strict/i);
    expect(cookie).toMatch(/Path=\//);

    const token = cookie.split(";")[0].split("=")[1];
    await expect(verifySessionToken(token, SESSION_SECRET)).resolves.toBe(true);
  });

  it("answers a wrong password with a generic 401 and no cookie", async () => {
    const response = await login({ password: "wrong password!" });

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it.each([{}, { password: "" }, { password: 42 }, { password: "x".repeat(1025) }])("rejects an invalid body (%j) with 400", async (body) => {
    expect((await login(body)).status).toBe(400);
  });

  it.each([["a foreign", "https://evil.test"], ["a missing", null]])("rejects %s Origin with 403 (CSRF)", async (_, origin) => {
    expect((await login({ password }, { origin })).status).toBe(403);
  });

  it("locks out an IP after too many attempts, even with the right password", async () => {
    for (let i = 0; i < LOGIN_RATE_LIMIT.limit; i++) await login({ password: "wrong password!" });

    const response = await login({ password });
    expect(response.status).toBe(429);
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThan(0);

    expect((await login({ password }, { ip: "198.51.100.1" })).status).toBe(204);
  });
});

describe("POST /api/auth/logout", () => {
  it("expires the session cookie", async () => {
    const response = await handlers.logout(makeRequest("/api/auth/logout", { method: "POST" }));

    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`^${SESSION_COOKIE}=;.*Max-Age=0`, "i"));
  });

  it("rejects a cross-site logout with 403", async () => {
    const response = await handlers.logout(makeRequest("/api/auth/logout", { method: "POST", origin: "https://evil.test" }));

    expect(response.status).toBe(403);
  });
});
