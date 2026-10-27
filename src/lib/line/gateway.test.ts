import { HTTPFetchError } from "@line/bot-sdk";
import { describe, expect, it, vi } from "vitest";
import { createLineGateway, LineApiError, type MessagingClient } from "./gateway";

const userId = `U${"a".repeat(32)}`;

const httpError = (status: number) =>
  new HTTPFetchError("LINE API error", { status, statusText: "x", headers: new Headers(), body: '{"message":"secret detail"}' });

function fakeClient(overrides: Partial<MessagingClient> = {}): MessagingClient {
  return {
    getProfile: vi.fn().mockResolvedValue({ userId, displayName: "Somchai", pictureUrl: "https://profile.line-scdn.net/abc" }),
    pushMessage: vi.fn().mockResolvedValue({ sentMessages: [] }),
    ...overrides,
  };
}

describe("LineGateway.getProfile", () => {
  it("maps the LINE profile to display name and picture", async () => {
    const gateway = createLineGateway(fakeClient());

    await expect(gateway.getProfile(userId)).resolves.toEqual({
      displayName: "Somchai",
      pictureUrl: "https://profile.line-scdn.net/abc",
    });
  });

  it.each([undefined, "http://insecure.example/a.png", "javascript:alert(1)"])(
    "drops a missing or non-https picture URL (%s)",
    async (pictureUrl) => {
      const gateway = createLineGateway(fakeClient({ getProfile: vi.fn().mockResolvedValue({ userId, displayName: "A", pictureUrl }) }));

      await expect(gateway.getProfile(userId)).resolves.toEqual({ displayName: "A", pictureUrl: null });
    },
  );

  it("returns null when LINE no longer exposes the profile (404: blocked or unfollowed)", async () => {
    const gateway = createLineGateway(fakeClient({ getProfile: vi.fn().mockRejectedValue(httpError(404)) }));

    await expect(gateway.getProfile(userId)).resolves.toBeNull();
  });

  it("raises LineApiError with the status but not LINE's response body", async () => {
    const gateway = createLineGateway(fakeClient({ getProfile: vi.fn().mockRejectedValue(httpError(500)) }));

    const error = await gateway.getProfile(userId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LineApiError);
    expect(error).toMatchObject({ status: 500 });
    expect((error as Error).message).not.toContain("secret detail");
  });
});

describe("LineGateway.pushText", () => {
  it("pushes one text message with the retry key so retries are idempotent", async () => {
    const client = fakeClient();
    await createLineGateway(client).pushText(userId, "hello", "11111111-1111-4111-8111-111111111111");

    expect(client.pushMessage).toHaveBeenCalledWith(
      { to: userId, messages: [{ type: "text", text: "hello" }] },
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("treats 409 (retry key already accepted) as delivered", async () => {
    const gateway = createLineGateway(fakeClient({ pushMessage: vi.fn().mockRejectedValue(httpError(409)) }));

    await expect(gateway.pushText(userId, "hello", "k")).resolves.toBeUndefined();
  });

  it("raises LineApiError for other failures", async () => {
    const gateway = createLineGateway(fakeClient({ pushMessage: vi.fn().mockRejectedValue(httpError(429)) }));

    await expect(gateway.pushText(userId, "hello", "k")).rejects.toMatchObject({ name: "LineApiError", status: 429 });
  });
});
