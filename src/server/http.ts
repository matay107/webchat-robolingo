import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import type { RateLimitResult } from "@/lib/security/rate-limiter";

export type ErrorCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "upstream_error"
  | "internal_error";

/** JSON response that is never cached by browsers or CDNs: every payload here is private. */
export function json(body: unknown, init: { status?: number; headers?: HeadersInit } = {}) {
  const response = NextResponse.json(body, { status: init.status ?? 200, headers: init.headers });
  response.headers.set("cache-control", "no-store");
  return response;
}

/** Uniform error envelope `{ error: { code, message } }`; messages are safe for clients. */
export function errorJson(status: number, code: ErrorCode, message: string, headers?: HeadersInit) {
  return json({ error: { code, message } }, { status, headers });
}

export function noContent() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set("cache-control", "no-store");
  return response;
}

export const unauthorized = () => errorJson(401, "unauthorized", "Sign in required");
export const forbiddenOrigin = () => errorJson(403, "forbidden", "Cross-site request rejected");
export const invalidRequest = (message = "Invalid request") => errorJson(400, "invalid_request", message);

export function tooManyRequests(result: Extract<RateLimitResult, { allowed: false }>) {
  return errorJson(429, "rate_limited", "Too many requests", { "retry-after": String(result.retryAfterSeconds) });
}

/**
 * CSRF defence for state-changing requests (ASVS V4.2.2): browsers always send `Origin`
 * on cross-origin and same-origin POSTs, so it must be present and match this app.
 * Complements the SameSite=Strict session cookie.
 */
export function isSameOrigin(request: NextRequest): boolean {
  return request.headers.get("origin") === request.nextUrl.origin;
}

export function hasValidSession(request: NextRequest, sessionSecret: string): Promise<boolean> {
  return verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, sessionSecret);
}

/** Client IP for rate-limit keys. On Vercel, `x-forwarded-for` is set by the edge and not client-controlled. */
export function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

/** Reads a JSON body of at most `maxBytes`; `undefined` when it is too large or not JSON. */
export async function readJsonBody(request: NextRequest, maxBytes: number): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return undefined;
  const raw = await request.text();
  if (Buffer.byteLength(raw) > maxBytes) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

/** Turns an unexpected exception into a generic 500, logging only the error type. */
export function internalError(event: string, error: unknown) {
  logger.error(event, { error: error instanceof Error ? error.name : typeof error });
  return errorJson(500, "internal_error", "Something went wrong");
}
