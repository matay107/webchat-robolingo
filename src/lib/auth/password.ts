import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * scrypt parameters from the OWASP Password Storage Cheat Sheet (N=2^14, r=8, p=5):
 * ~16 MiB per hash, which fits serverless memory limits.
 */
const PARAMS = { N: 2 ** 14, r: 8, p: 5 } as const;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

/**
 * Returns `scrypt:N=…,r=…,p=…:<salt>:<hash>` (base64url), storing the parameters for future upgrades.
 * `:` rather than the PHC `$` separator, because Next.js expands `$NAME` inside .env files.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, PARAMS);
  return `scrypt:N=${PARAMS.N},r=${PARAMS.r},p=${PARAMS.p}:${salt.toString("base64url")}:${hash.toString("base64url")}`;
}

const STORED_FORMAT = /^scrypt:N=(\d+),r=(\d+),p=(\d+):([\w-]+):([\w-]+)$/;

/**
 * Constant-time check of `password` against a {@link hashPassword} result.
 * A malformed hash, or one weaker than the current parameters, never verifies.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = STORED_FORMAT.exec(stored);
  if (!match) return false;

  const [N, r, p] = match.slice(1, 4).map(Number);
  if (N < PARAMS.N || r < PARAMS.r || p < PARAMS.p || N > 2 ** 20) return false;

  const salt = Buffer.from(match[4], "base64url");
  const expected = Buffer.from(match[5], "base64url");
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await derive(password, salt, { N, r, p, maxmem: 256 * N * r });
  return timingSafeEqual(actual, expected);
}
