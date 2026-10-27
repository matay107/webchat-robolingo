import { NextRequest } from "next/server";
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth/session";

export const ORIGIN = "https://webchat.test";
export const SESSION_SECRET = "s".repeat(32);

interface RequestOptions {
  method?: string;
  body?: string | object;
  headers?: Record<string, string>;
  /** Defaults to the app's own origin for non-GET requests, as a browser would send. */
  origin?: string | null;
  cookie?: string;
}

export function makeRequest(path: string, { method = "GET", body, headers = {}, origin, cookie }: RequestOptions = {}) {
  const allHeaders = new Headers(headers);
  const effectiveOrigin = origin === undefined ? (method === "GET" ? null : ORIGIN) : origin;
  if (effectiveOrigin) allHeaders.set("origin", effectiveOrigin);
  if (cookie) allHeaders.set("cookie", cookie);
  if (body !== undefined && !allHeaders.has("content-type")) allHeaders.set("content-type", "application/json");

  return new NextRequest(new URL(path, ORIGIN), {
    method,
    headers: allHeaders,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

export async function sessionCookie(secret = SESSION_SECRET) {
  return `${SESSION_COOKIE}=${await createSessionToken(secret)}`;
}
