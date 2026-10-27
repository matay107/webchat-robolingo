import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verifies the `x-line-signature` header: base64(HMAC-SHA256(channelSecret, rawBody)).
 * Must run on the raw body before JSON parsing, and compares in constant time
 * so the signature cannot be recovered through response timing.
 *
 * @see https://developers.line.biz/en/docs/messaging-api/receiving-messages/#verify-signature
 */
export function verifySignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false;

  const expected = createHmac("sha256", channelSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(signature, "base64");

  // timingSafeEqual throws on length mismatch; a wrong length is simply an invalid signature.
  return received.length === expected.length && timingSafeEqual(received, expected);
}
