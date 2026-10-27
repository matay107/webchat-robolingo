import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const validSource = {
  LINE_CHANNEL_SECRET: "0123456789abcdef0123456789abcdef",
  LINE_CHANNEL_ACCESS_TOKEN: "a".repeat(64),
  DATABASE_URL: "postgresql://user:pass@localhost:5432/webchat",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdHNhbHRzYWx0c2FsdA$aGFzaGhhc2hoYXNoaGFzaA",
  SESSION_SECRET: "s".repeat(32),
};

describe("parseEnv", () => {
  it("returns a typed config when every variable is valid", () => {
    expect(parseEnv(validSource)).toEqual({
      lineChannelSecret: validSource.LINE_CHANNEL_SECRET,
      lineChannelAccessToken: validSource.LINE_CHANNEL_ACCESS_TOKEN,
      databaseUrl: validSource.DATABASE_URL,
      adminPasswordHash: validSource.ADMIN_PASSWORD_HASH,
      sessionSecret: validSource.SESSION_SECRET,
    });
  });

  it("names every missing variable in a single error", () => {
    expect(() => parseEnv({})).toThrowError(
      /LINE_CHANNEL_SECRET.*LINE_CHANNEL_ACCESS_TOKEN.*DATABASE_URL.*ADMIN_PASSWORD_HASH.*SESSION_SECRET/s,
    );
  });

  it.each([
    ["LINE_CHANNEL_SECRET", "not-hex"],
    ["DATABASE_URL", "mysql://localhost/db"],
    ["ADMIN_PASSWORD_HASH", "plaintext-password"],
    ["SESSION_SECRET", "too-short"],
  ])("rejects a malformed %s", (name, value) => {
    expect(() => parseEnv({ ...validSource, [name]: value })).toThrowError(name);
  });

  it("never echoes secret values in the error message", () => {
    const leaky = { ...validSource, SESSION_SECRET: "leak-me" };
    expect(() => parseEnv(leaky)).toThrowError(/^(?!.*leak-me)/s);
  });
});
