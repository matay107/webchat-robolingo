import { jwtVerify, SignJWT } from "jose";

/** `__Host-` binds the cookie to this exact origin over HTTPS with Path=/ (no Domain). */
export const SESSION_COOKIE = "__Host-webchat_session";
/** Absolute session lifetime; the admin signs in again after it (ASVS V3.3). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ISSUER = "webchat-robolingo";
const SUBJECT = "admin";
const key = (secret: string) => new TextEncoder().encode(secret);

/** Issues a signed (HS256) session token for the single admin account. */
export function createSessionToken(secret: string, now = new Date()): Promise<string> {
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT()
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setAudience(ISSUER)
    .setSubject(SUBJECT)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + SESSION_TTL_SECONDS)
    .sign(key(secret));
}

/** True only for an unexpired token issued by {@link createSessionToken} with this secret. */
export async function verifySessionToken(token: string | undefined, secret: string, now = new Date()): Promise<boolean> {
  if (!token) return false;
  try {
    await jwtVerify(token, key(secret), {
      algorithms: ["HS256"],
      issuer: ISSUER,
      audience: ISSUER,
      subject: SUBJECT,
      currentDate: now,
    });
    return true;
  } catch {
    return false;
  }
}

/** Cookie attributes for the session: unreadable by scripts and never sent cross-site. */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: SESSION_TTL_SECONDS,
} as const;
