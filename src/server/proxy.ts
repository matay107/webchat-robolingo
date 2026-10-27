import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/session";

export interface ProxyDeps {
  getSessionSecret: () => string;
  isDev: boolean;
}

/**
 * Strict nonce-based CSP (ASVS V14.4.3): scripts run only with this request's nonce.
 * Profile pictures are served from LINE's CDN.
 */
function contentSecurityPolicy(nonce: string, isDev: boolean): string {
  return [
    "default-src 'self'",
    // React needs eval in development only, for debugging stacks.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data: https://*.line-scdn.net",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/**
 * Page-level gate. An optimistic check only: it keeps anonymous visitors on /login,
 * while every API handler still verifies the session itself.
 */
export function createProxy({ getSessionSecret, isDev }: ProxyDeps) {
  return async function proxy(request: NextRequest): Promise<NextResponse> {
    const signedIn = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value, getSessionSecret());
    const onLoginPage = request.nextUrl.pathname === "/login";

    if (!signedIn && !onLoginPage) return NextResponse.redirect(new URL("/login", request.url));
    if (signedIn && onLoginPage) return NextResponse.redirect(new URL("/", request.url));

    const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const csp = contentSecurityPolicy(nonce, isDev);

    // Next.js reads the nonce from the request's CSP header and applies it to its own scripts.
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set("content-security-policy", csp);

    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("content-security-policy", csp);
    return response;
  };
}
