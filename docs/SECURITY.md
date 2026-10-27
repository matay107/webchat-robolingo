# Security

Self-assessment of the LINE OA Webchat against OWASP ASVS 4.0.3 (Level 2 where applicable) and the OWASP API Security Top 10 (2023). The threat model follows the PTES *Threat Modeling* phase: assets → entry points → threat agents → controls → residual risk.

## 1. Assets
| Asset | Why it matters |
|---|---|
| LINE channel access token | Lets anyone send messages as the OA and read user profiles |
| LINE channel secret | Lets anyone forge webhook deliveries |
| Admin session | Full read/reply access to every conversation |
| Conversation data (user IDs, names, messages) | Personal data of LINE users |
| LINE monthly message quota | Push messages are metered; exhausting it stops replies |

## 2. Entry points and trust boundaries
```
Internet ──▶ Vercel edge ──▶ proxy.ts (pages: session redirect + CSP)
                         └─▶ /api/line/webhook        trust: LINE HMAC signature
                         └─▶ /api/auth/login|logout   trust: none / Origin check
                         └─▶ /api/contacts/**         trust: session cookie + Origin check
Server ──▶ LINE Messaging API (HTTPS, bearer token)
Server ──▶ Postgres (TLS)
```

## 3. Threat agents and threats
| Agent | Threat | Control |
|---|---|---|
| Anonymous attacker | Forge webhook events to inject fake messages | HMAC-SHA256 signature over raw body, constant-time compare, checked before parsing (`lib/line/signature.ts`) |
| Anonymous attacker | Replay a captured webhook | LINE message ID is unique in DB; replays are no-ops |
| Anonymous attacker | Brute-force the admin password | scrypt hash (N=2¹⁴, r=8, p=5), 5 attempts / 15 min / IP, generic error |
| Anonymous attacker | Oversized bodies / resource exhaustion | 1 MiB webhook cap, 4 KiB login cap, 64 KiB send cap, bounded `limit` (≤100) |
| Malicious website | CSRF: make the admin's browser send replies | `SameSite=Strict` cookie **and** strict `Origin` match on every state-changing route |
| LINE user (untrusted content) | Stored XSS through display name or message text | React text rendering only (no `dangerouslySetInnerHTML`), nonce-based CSP with `strict-dynamic`, https-only picture URLs |
| Malicious website | Clickjacking | `frame-ancestors 'none'` + `X-Frame-Options: DENY` |
| Stolen session cookie | Account takeover | `__Host-` prefix, `HttpOnly`, `Secure`, 8 h absolute expiry |
| Compromised/abusive admin client | Burn the LINE quota | 20 sends / min / IP |
| Insider reading logs | Data leakage | Structured logs carry event names, IPs and statuses only — never message text, tokens or passwords |

## 4. OWASP API Security Top 10 (2023)
| Risk | Status | How |
|---|---|---|
| API1 Broken Object Level Authorization | ✅ | Single-tenant admin; every object route requires a session; `userId` path param is format-validated; idempotency lookups are scoped to the same `userId` |
| API2 Broken Authentication | ✅ | scrypt, rate-limited login, signed short-lived session, `__Host-` cookie; webhook authenticated by HMAC |
| API3 Broken Object Property Level Authorization | ✅ | Responses built from explicit DTO allow-lists; request bodies parsed with `z.strictObject` (unknown fields rejected → no mass assignment) |
| API4 Unrestricted Resource Consumption | ✅ | Body-size caps, pagination caps, DB-backed rate limits, polling paused in hidden tabs and never overlapping |
| API5 Broken Function Level Authorization | ✅ | Only one role exists; every non-webhook API handler checks the session itself (proxy is not trusted for authZ) |
| API6 Unrestricted Access to Sensitive Business Flows | ✅ | Send throttle protects the metered push quota |
| API7 SSRF | ✅ | No user-controlled outbound URLs; LINE endpoints fixed by SDK; images only from `*.line-scdn.net` |
| API8 Security Misconfiguration | ✅ | HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, CSP, `poweredByHeader: false`, `Cache-Control: no-store` on API responses, generic 500s |
| API9 Improper Inventory Management | ✅ | Five routes, documented in README; no debug/test endpoints |
| API10 Unsafe Consumption of APIs | ✅ | LINE webhook payloads validated with Zod; LINE errors mapped to generic 502 without upstream body; profile picture URL scheme checked |

## 5. ASVS 4.0.3 highlights
| Chapter | Requirement | Implementation |
|---|---|---|
| V2.1.1 | Passwords ≥ 12 chars | Enforced by `pnpm hash-password` |
| V2.2.1 | Anti-automation | Login rate limit |
| V2.4.1/2.4.4 | Approved password hashing | scrypt per OWASP Password Storage Cheat Sheet, random 16-byte salt, params stored in hash; weaker params rejected |
| V3.2.x / V3.4.x | Session tokens & cookie attributes | HS256 JWT, `__Host-`, HttpOnly, Secure, SameSite=Strict |
| V3.3.1 | Logout invalidates session | Cookie cleared (see residual risk R1) |
| V4.2.2 | CSRF protection | Origin check + SameSite=Strict |
| V5.1.3/5.1.4 | Positive input validation | Zod schemas at every trust boundary |
| V5.3.3 | Output encoding for HTML | React escaping; no raw HTML |
| V7.1.1/7.1.2 | No secrets / sensitive data in logs | `lib/logger.ts` field discipline; env errors name variables, never values |
| V8.1.1 | Sensitive data not cached | `Cache-Control: no-store` |
| V9.1.1 | TLS everywhere | Vercel HTTPS + HSTS; `sslmode=require` to Neon |
| V13.2.1 | HTTP methods restricted | Route handlers export only the methods they implement |
| V14.2.1 | Dependencies scanned | `pnpm audit --prod` in CI |
| V14.4.x | Security headers | `next.config.ts` + `proxy.ts` |

## 6. Residual risks (accepted for this scope)
| ID | Risk | Mitigation / next step |
|---|---|---|
| R1 | Sessions are stateless JWTs: logout clears the cookie but a stolen token stays valid until expiry (≤ 8 h) | Rotate `SESSION_SECRET` to revoke all sessions; a server-side session table would allow per-session revocation |
| R2 | One shared admin password, no MFA (ASVS L2 V2.8) | Put the app behind an identity provider (e.g. Vercel SSO, Auth.js + OIDC) for multi-user / MFA |
| R3 | Rate limits keyed by client IP from `x-forwarded-for`, which is trustworthy only behind Vercel's edge | Keep deployment on Vercel or set the header at a trusted proxy |
| R4 | `rate_limits` rows are never purged | Add a scheduled `DELETE … WHERE window_start < now() - interval '1 day'` |
| R5 | Message content is stored in plaintext (encrypted at rest by the DB provider only) | Application-level encryption if required by data policy |

## 7. Reporting
Please open a private security advisory on the GitHub repository rather than a public issue.
