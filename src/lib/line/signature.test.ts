import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifySignature } from "./signature";

const secret = "0123456789abcdef0123456789abcdef";
const sign = (body: string, key = secret) => createHmac("sha256", key).update(body).digest("base64");

describe("verifySignature", () => {
  const body = JSON.stringify({ destination: "U1", events: [] });

  it("accepts the signature LINE computes for the exact raw body", () => {
    expect(verifySignature(body, sign(body), secret)).toBe(true);
  });

  it("signs the UTF-8 bytes, so multi-byte text verifies", () => {
    const thai = JSON.stringify({ text: "สวัสดีครับ" });
    expect(verifySignature(thai, sign(thai), secret)).toBe(true);
  });

  it("rejects a body that was modified after signing", () => {
    expect(verifySignature(`${body} `, sign(body), secret)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    expect(verifySignature(body, sign(body, "f".repeat(32)), secret)).toBe(false);
  });

  it.each([null, "", "not-base64!!", "c2hvcnQ="])("rejects a missing or malformed signature (%s) without throwing", (signature) => {
    expect(verifySignature(body, signature, secret)).toBe(false);
  });
});
