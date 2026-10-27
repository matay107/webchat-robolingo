import { describe, expect, it } from "vitest";
import { createSessionToken, SESSION_TTL_SECONDS, verifySessionToken } from "./session";

const secret = "s".repeat(32);
const now = new Date("2026-01-01T00:00:00Z");
const after = (seconds: number) => new Date(now.getTime() + seconds * 1000);

describe("session tokens", () => {
  it("verifies a token it issued while it is unexpired", async () => {
    const token = await createSessionToken(secret, now);

    await expect(verifySessionToken(token, secret, after(SESSION_TTL_SECONDS - 1))).resolves.toBe(true);
  });

  it("rejects the token once it has expired", async () => {
    const token = await createSessionToken(secret, now);

    await expect(verifySessionToken(token, secret, after(SESSION_TTL_SECONDS + 1))).resolves.toBe(false);
  });

  it("rejects a token signed with another secret", async () => {
    const token = await createSessionToken("x".repeat(32), now);

    await expect(verifySessionToken(token, secret, now)).resolves.toBe(false);
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken(secret, now);
    const [header, , signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "admin", exp: 9_999_999_999 })).toString("base64url");

    await expect(verifySessionToken(`${header}.${forgedPayload}.${signature}`, secret, now)).resolves.toBe(false);
  });

  it.each([undefined, "", "not.a.jwt"])("rejects a missing or garbage token (%s)", async (token) => {
    await expect(verifySessionToken(token, secret, now)).resolves.toBe(false);
  });
});
