# LINE OA Webchat

A web inbox for a LINE Official Account. Messages that users send to the OA appear here with the sender's name and picture; an admin picks a user and replies, and the reply is delivered in LINE as the OA.

| | |
|---|---|
| LINE OA (add friend) | `https://line.me/R/ti/p/@<basic-id>` |
| Webchat | https://webchat-robolingo-sable.vercel.app |
| Repository | https://github.com/matay107/webchat-robolingo |
| Hand-off document (Thai, with flowcharts) | [docs/HAND-OFF.md](docs/HAND-OFF.md) |

## How it works

```
LINE user ──message──▶ LINE Platform ──webhook (signed)──▶ POST /api/line/webhook
                                                             ├─ verify X-Line-Signature
                                                             ├─ fetch profile (≤ once / 24 h)
                                                             └─ store contact + message ──▶ Postgres
Admin browser ◀──poll every 2–3 s── GET /api/contacts, /api/contacts/:id/messages?after= ◀──┘
Admin reply ──▶ POST /api/contacts/:id/messages ──push (retry key)──▶ LINE ──▶ LINE user
```

- **Receiving:** LINE calls the webhook. The signature is verified on the raw body before anything is parsed. Events are idempotent by LINE message ID, so redeliveries are harmless.
- **Who sent it:** the sender's LINE profile (name and picture) is cached on the contact and refreshed at most daily. If LINE can't return it, the message is still stored under a placeholder name and the fetch is retried.
- **Replying:** replies use the Push API (reply tokens expire within seconds) with an idempotency key that doubles as LINE's `X-Line-Retry-Key`. A reply is stored only after LINE accepts it.
- **Realtime:** Vercel functions can't hold WebSockets open, so the UI polls with a cursor (`?after=<lastId>`). Polls never overlap and pause while the tab is hidden.
- **Inbox:** unread counts per contact (also in the tab title), "load earlier messages" paging, stickers shown as images, and photos users send proxied through the server so the channel access token never reaches the browser.

## Stack
Next.js 16 (App Router) · TypeScript (strict) · Node.js ≥ 24 · Postgres (Neon) via Drizzle ORM · Zod · `@line/bot-sdk` · Tailwind CSS · Vitest + Testing Library + PGlite

## Project structure
```
src/
  app/                    Pages and thin route handlers (wiring only)
  proxy.ts                Page auth redirect + per-request CSP nonce
  server/
    container.ts          Composition root (env → db → services → handlers)
    handlers/             HTTP handlers as factories with injected deps (unit-testable)
    http.ts               Response envelope, CSRF origin check, session check, body limits
  lib/
    line/                 Signature check, webhook parsing, Messaging API gateway
    chat/                 Domain: repository (Postgres) + service (ingest, reply)
    auth/                 scrypt password hashing, session tokens
    security/             DB-backed rate limiter
    db/                   Drizzle schema and driver selection
  components/             Client UI: inbox, conversation, composer, login
drizzle/                  SQL migrations
docs/                     PLAN.md (phases), SECURITY.md (threat model, ASVS/API Top 10), HAND-OFF.md (Thai hand-off with flowcharts)
```

## Running locally
Requires Node.js 24+, pnpm, and Docker.

```bash
pnpm install
```
```bash
docker compose up -d
```
```bash
cp .env.example .env.local
```
Fill in `.env.local` (see below), then apply the schema and start the app:
```bash
pnpm db:migrate
```
```bash
pnpm dev
```

To receive real LINE messages locally, expose port 3000 with a tunnel (e.g. `ngrok http 3000`) and set it as the webhook URL.

### Environment variables
| Name | Where to get it |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE Developers Console → channel → *Basic settings* |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers Console → channel → *Messaging API* → issue long-lived token |
| `DATABASE_URL` | Neon connection string (Vercel → Storage), or `postgresql://webchat:webchat@localhost:5432/webchat` locally |
| `ADMIN_PASSWORD_HASH` | `pnpm hash-password` (prompts for a 12+ character password; never stored in plain text) |
| `SESSION_SECRET` | `openssl rand -base64 48` |

Configuration is validated on first use; a missing or malformed variable fails with a message naming it (never its value).

## Deploying
1. **LINE:** create an Official Account at [LINE Official Account Manager](https://manager.line.biz), then enable *Messaging API* under Settings. Under *Response settings*, turn **Webhook on** and **Auto-response off**.
2. **Database:** in Vercel → Storage, create a Neon Postgres database and connect it to the project (this sets `DATABASE_URL`). Apply the schema once from your machine with `DATABASE_URL=<neon url> pnpm db:migrate`.
3. **Vercel:** import the GitHub repository, add the remaining environment variables for *Production*, and deploy.
4. **Webhook:** in LINE Developers Console → *Messaging API*, set the Webhook URL to `https://webchat-robolingo-sable.vercel.app/api/line/webhook`, click **Verify**, and enable *Use webhook* (optionally *Webhook redelivery*). Use the production domain: preview deployments sit behind Vercel's Deployment Protection, and LINE would be served a login page instead of the webhook.
5. Add the OA as a friend, send it a message, and reply from the webchat.

## Testing
```bash
pnpm test
```
```bash
pnpm test:coverage
```
Every behaviour was built test-first (red → green). Database tests run against real Postgres semantics in-process via PGlite with the real migrations. HTTP handlers are tested as plain functions with injected dependencies. CI runs lint, typecheck, tests, and `pnpm audit --prod`.

## API
Responses are JSON with `Cache-Control: no-store`, except the image route, which returns the image itself. Errors use `{ "error": { "code", "message" } }`.

| Method & path | Auth | Purpose |
|---|---|---|
| `POST /api/line/webhook` | LINE signature | Receive LINE events |
| `POST /api/auth/login` | — (rate-limited) | `{ password }` → session cookie |
| `POST /api/auth/logout` | — | Clear session cookie |
| `GET /api/contacts?limit=` | session | Conversations, newest first, with `unreadCount` |
| `GET /api/contacts/:userId/messages?after=\|before=&limit=` | session | Messages, chronological; `after` for polling, `before` for older history |
| `POST /api/contacts/:userId/messages` | session + same origin | `{ text, idempotencyKey }` → push to LINE |
| `POST /api/contacts/:userId/read` | session + same origin | `{ upToId }` → mark messages read (never moves backwards) |
| `GET /api/contacts/:userId/messages/:id/image?size=preview\|full` | session | A photo the user sent, fetched from LINE's Content API |

## Security
See [docs/SECURITY.md](docs/SECURITY.md) for the threat model, the OWASP ASVS and API Security Top 10 (2023) mapping, and accepted residual risks.
