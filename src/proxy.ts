import { createProxy } from "@/server/proxy";

export const proxy = createProxy({
  // Read directly (not via getEnv) so the proxy depends only on what it uses.
  // A missing secret fails closed: no session verifies, so every page redirects to /login.
  getSessionSecret: () => process.env.SESSION_SECRET ?? "",
  isDev: process.env.NODE_ENV === "development",
});

export const config = {
  matcher: [
    {
      // Pages only. API routes authenticate themselves; static assets need no CSP.
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
