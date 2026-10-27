import { describe, expect, it } from "vitest";
import { isNeonUrl } from "./client";

describe("isNeonUrl", () => {
  it.each([
    ["postgresql://u:p@ep-cool-name-123456-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require", true],
    ["postgresql://u:p@localhost:5432/webchat", false],
    ["postgresql://u:p@db.example.com/neon.tech", false],
    ["postgresql://u:p@evilneon.tech/db", false],
  ])("%s → %s", (url, expected) => {
    expect(isNeonUrl(url)).toBe(expected);
  });
});
