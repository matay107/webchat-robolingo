import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("produces a self-describing scrypt hash that verifies the original password", async () => {
    const stored = await hashPassword("correct horse battery");

    expect(stored).toMatch(/^scrypt:N=\d+,r=\d+,p=\d+:[\w-]+:[\w-]+$/);
    await expect(verifyPassword("correct horse battery", stored)).resolves.toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery");

    await expect(verifyPassword("correct horse batterY", stored)).resolves.toBe(false);
  });

  it("contains no '$', which Next.js would expand as a variable inside .env files", async () => {
    expect(await hashPassword("correct horse battery")).not.toContain("$");
  });

  it("salts every hash, so equal passwords produce different hashes", async () => {
    const [a, b] = await Promise.all([hashPassword("same password!"), hashPassword("same password!")]);

    expect(a).not.toBe(b);
  });

  it.each(["", "plaintext", "scrypt:N=16384,r=8,p=5:onlysalt", "scrypt:N=1,r=1,p=1:c2FsdA:aGFzaA", "bcrypt$x$y$z"])(
    "treats a malformed or weak stored hash (%s) as a failed login instead of throwing",
    async (stored) => {
      await expect(verifyPassword("anything", stored)).resolves.toBe(false);
    },
  );
});
