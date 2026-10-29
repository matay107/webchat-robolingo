# แผนงาน: LINE OA Webchat

## เป้าหมาย
Web console ให้แอดมินเห็นข้อความที่ผู้ใช้ส่งเข้า LINE OA (พร้อมชื่อ/รูปผู้ส่ง) และเลือกผู้ใช้เพื่อตอบกลับในนาม OA

## การตัดสินใจทางเทคนิค
| เรื่อง | เลือก | เหตุผล |
|---|---|---|
| Runtime | Node.js ≥ 24, pnpm | ตามข้อกำหนด |
| Framework | Next.js 16 (App Router) + TypeScript strict | ตามโจทย์ |
| DB | Postgres (Neon ผ่าน Vercel) + Drizzle ORM | serverless ไม่มี state; Drizzle รองรับทั้ง Neon (prod) และ PGlite (test) ด้วย query เดียวกัน |
| Test | Vitest + PGlite (Postgres in-memory) + Testing Library | test DB จริงโดยไม่ต้องใช้ Docker |
| LINE | `@line/bot-sdk` (official) ห่อด้วย interface `LineGateway` | mock ได้ใน test |
| Validation | Zod | ตรวจ input ทุกจุดที่ข้าม trust boundary |
| Auth | รหัสผ่านแอดมิน (เก็บเป็น scrypt hash) → session JWT ใน cookie `__Host-` (HttpOnly, Secure, SameSite=Strict) | ASVS V2/V3 |
| Realtime | Polling (2–3 วินาที) พร้อม cursor `after` | Vercel ไม่รองรับ WebSocket ค้าง |

## Dependency direction
```
app/ (route handlers, pages)  →  server/ (services, factories)  →  lib/ (line, db, auth, validation)
```
Route handler บางเฉียบ: สร้างจาก factory ที่รับ dependency (repo, gateway, clock) เพื่อให้ test ได้โดยไม่ต้องรัน Next

---

## Phase 0: Foundation
- [x] T0.1 Scaffold Next.js 16 + TS strict, `engines.node >=24`, pnpm
- [x] T0.2 Vitest + coverage, ESLint, script `typecheck`
- [x] T0.3 (TDD) `env.ts`: ตรวจ env ด้วย Zod, fail fast ถ้าขาดหรือรูปแบบผิด
- [x] T0.4 GitHub Actions CI: lint → typecheck → test

## Phase 1: LINE integration core
- [x] T1.1 (TDD) `verifySignature(rawBody, signature, secret)`: HMAC-SHA256 + timing-safe compare
- [x] T1.2 (TDD) Webhook payload schema: รับ `message` (text/sticker/image/อื่นๆ), `follow`, `unfollow` และข้าม event ที่ไม่รู้จักอย่างปลอดภัย
- [x] T1.3 `LineGateway` interface + implementation (`getProfile`, `pushText`)

## Phase 2: Persistence
- [x] T2.1 Drizzle schema + migration: `contacts`, `messages` (unique `line_message_id`), `rate_limits`
- [x] T2.2 (TDD) `ChatRepository`: upsert contact, บันทึกข้อความแบบ idempotent, list contacts เรียงตามข้อความล่าสุด, list messages ด้วย cursor + limit
- [x] T2.3 (TDD) `RateLimiter` (fixed window, เก็บใน DB เพราะ serverless)

## Phase 3: Domain services
- [x] T3.1 (TDD) `ingestWebhookEvents`: บันทึกข้อความเข้า, ดึงโปรไฟล์เฉพาะตอนไม่มีหรือเก่ากว่า 24 ชม., ดึงโปรไฟล์ไม่ได้ต้องไม่ทำให้ทั้ง batch ล้ม, event ซ้ำไม่บันทึกซ้ำ
- [x] T3.2 (TDD) `sendReply`: validate ข้อความ (1–5000 ตัวอักษร), contact ต้องมีอยู่, push สำเร็จแล้วค่อยบันทึก, push ล้มเหลวคืน error ที่ไม่รั่วรายละเอียดภายใน

## Phase 4: Security + API
- [x] T4.1 (TDD) Password: scrypt hash/verify + สคริปต์ `pnpm hash-password`
- [x] T4.2 (TDD) Session: sign/verify JWT (HS256, หมดอายุ 8 ชม.)
- [x] T4.3 (TDD) Route handlers (ผ่าน factory):
  - `POST /api/line/webhook`: จำกัดขนาด body, ตรวจ signature ก่อน parse
  - `POST /api/auth/login`: มี rate limit
  - `POST /api/auth/logout`
  - `GET /api/contacts`
  - `GET /api/contacts/[userId]/messages?after=&limit=`
  - `POST /api/contacts/[userId]/messages`: มี rate limit
- [x] T4.4 (TDD) `proxy.ts`: บังคับ session สำหรับหน้าเว็บและ `/api/*` (ยกเว้น webhook/login), ตรวจ Origin สำหรับ state-changing request (CSRF), CSP แบบ nonce + security headers

## Phase 5: UI
- [x] T5.1 หน้า Login
- [x] T5.2 (TDD component) Contact list (รูป, ชื่อ, ข้อความล่าสุด, เวลา) + เลือก user
- [x] T5.3 (TDD component) Message thread + composer (Enter ส่ง, Shift+Enter ขึ้นบรรทัดใหม่, ปิดปุ่มระหว่างส่ง)
- [x] T5.4 Polling hook (contacts ทุก 3 วิ, messages ทุก 2 วิ ด้วย `after`)

## Phase 6: Hardening + delivery
- [x] T6.1 `docs/SECURITY.md`: threat model (PTES), mapping กับ ASVS / API Top 10 2023
- [x] T6.2 README: architecture, setup, env, deploy, วิธีทดสอบ
- [ ] T6.3 Deploy: GitHub public repo → Vercel → ตั้ง webhook → ทดสอบ end-to-end (ต้องใช้บัญชีของผู้ใช้)

## Phase 7: Inbox polish
- [x] T7.0 (TDD) แสดงสติกเกอร์เป็นรูป: เก็บ `sticker_id` (ตัวเลขเท่านั้น) แล้วแสดงจาก CDN ของ LINE ถ้าโหลดไม่ได้ให้กลับไปแสดงข้อความ "Sticker"
- [x] T7.1 (TDD) โหลดข้อความเก่า:
  - API: `GET /api/contacts/[userId]/messages?before=` (ใช้คู่กับ `after` ไม่ได้)
  - UI: ปุ่ม "Load earlier messages" ที่ต้องรักษาตำแหน่ง scroll เดิมไว้
- [x] T7.2 (TDD) ข้อความยังไม่อ่าน:
  - เพิ่มคอลัมน์ `contacts.last_read_message_id` และส่ง `unreadCount` (นับเฉพาะข้อความขาเข้า) ไปกับรายชื่อ
  - `POST /api/contacts/[userId]/read { upToId }`: ตรวจ Origin + session และค่าห้ามถอยหลัง
  - UI: ตัวเลขบนรายชื่อ, title ของแท็บเป็น `(N) ...` และ mark read เมื่อเปิดดูแชท
- [x] T7.3 (TDD) แสดงรูปที่ผู้ใช้ส่งมา:
  - `GET /api/contacts/[userId]/messages/[id]/image[?size=full]`: ดึงผ่าน LINE Content API ฝั่ง server เพื่อไม่ให้ token ไปถึง browser
  - ตรวจว่าข้อความเป็นของ user นั้นจริง (กัน BOLA, API1:2023) และยอมรับเฉพาะ raster image content-type
  - UI: แสดง preview ในแชท กดแล้วเปิดรูปเต็มในแท็บใหม่ ถ้าโหลดไม่ได้ (เช่นไฟล์หมดอายุ) ให้กลับไปแสดงข้อความ "Photo"

## Definition of Done (ทุกเฟส)
- Test ถูกเขียนก่อนและเห็นสถานะแดงก่อน implement
- `pnpm lint && pnpm typecheck && pnpm test` ผ่าน
- Commit แยกตามเฟส ไม่มี co-author trailer
