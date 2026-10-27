import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { describe, expect, it } from "vitest";
import { config } from "../proxy";
import { makeRequest, SESSION_SECRET, sessionCookie } from "../../test/http";
import { createProxy } from "./proxy";

const proxy = createProxy({ getSessionSecret: () => SESSION_SECRET, isDev: false });
const cspOf = (response: Response) => response.headers.get("content-security-policy") ?? "";
const nonceOf = (csp: string) => /'nonce-([^']+)'/.exec(csp)?.[1];

describe("proxy", () => {
  it("redirects an anonymous visitor to /login", async () => {
    const response = await proxy(makeRequest("/"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://webchat.test/login");
  });

  it("lets a signed-in admin through with a per-request nonce CSP", async () => {
    const cookie = await sessionCookie();
    const [first, second] = await Promise.all([proxy(makeRequest("/", { cookie })), proxy(makeRequest("/", { cookie }))]);

    expect(first.headers.get("location")).toBeNull();
    const csp = cspOf(first);
    expect(csp).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data: https://*.line-scdn.net");
    expect(csp).not.toContain("unsafe-eval");
    expect(nonceOf(csp)).not.toBe(nonceOf(cspOf(second)));
  });

  it("shows /login to anonymous visitors, with the CSP", async () => {
    const response = await proxy(makeRequest("/login"));

    expect(response.headers.get("location")).toBeNull();
    expect(cspOf(response)).toContain("default-src 'self'");
  });

  it("sends a signed-in admin from /login to the inbox", async () => {
    const response = await proxy(makeRequest("/login", { cookie: await sessionCookie() }));

    expect(response.headers.get("location")).toBe("https://webchat.test/");
  });

  it("treats a session signed with another secret as anonymous", async () => {
    const response = await proxy(makeRequest("/", { cookie: await sessionCookie("x".repeat(32)) }));

    expect(response.headers.get("location")).toBe("https://webchat.test/login");
  });

  it.each([
    ["/", true],
    ["/login", true],
    ["/api/line/webhook", false],
    ["/api/contacts", false],
    ["/_next/static/chunk.js", false],
    ["/favicon.ico", false],
  ])("matcher: runs on %s → %s", (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url })).toBe(expected);
  });
});
