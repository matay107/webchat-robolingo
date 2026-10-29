import { HTTPFetchError } from "@line/bot-sdk";
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { type BlobClient, createLineGateway, LineApiError, MAX_IMAGE_BYTES, type MessagingClient } from "./gateway";

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

const content = (bytes: Uint8Array, contentType: string) => ({
  httpResponse: new Response(null, { headers: { "content-type": contentType } }),
  body: Readable.from([bytes]),
});

function fakeBlob(overrides: Partial<BlobClient> = {}): BlobClient {
  return {
    getMessageContentPreviewWithHttpInfo: vi.fn().mockResolvedValue(content(new Uint8Array([1, 2]), "image/jpeg")),
    getMessageContentWithHttpInfo: vi.fn().mockResolvedValue(content(new Uint8Array([1, 2, 3]), "image/jpeg")),
    ...overrides,
  };
}

const makeGateway = (client: MessagingClient, blob: BlobClient = fakeBlob()) => createLineGateway(client, blob);

describe("LineGateway.getProfile", () => {
  it("maps the LINE profile to display name and picture", async () => {
    const gateway = makeGateway(fakeClient());

    await expect(gateway.getProfile(userId)).resolves.toEqual({
      displayName: "Somchai",
      pictureUrl: "https://profile.line-scdn.net/abc",
    });
  });

  it.each([undefined, "http://insecure.example/a.png", "javascript:alert(1)"])(
    "drops a missing or non-https picture URL (%s)",
    async (pictureUrl) => {
      const gateway = makeGateway(fakeClient({ getProfile: vi.fn().mockResolvedValue({ userId, displayName: "A", pictureUrl }) }));

      await expect(gateway.getProfile(userId)).resolves.toEqual({ displayName: "A", pictureUrl: null });
    },
  );

  it("returns null when LINE no longer exposes the profile (404: blocked or unfollowed)", async () => {
    const gateway = makeGateway(fakeClient({ getProfile: vi.fn().mockRejectedValue(httpError(404)) }));

    await expect(gateway.getProfile(userId)).resolves.toBeNull();
  });

  it("raises LineApiError with the status but not LINE's response body", async () => {
    const gateway = makeGateway(fakeClient({ getProfile: vi.fn().mockRejectedValue(httpError(500)) }));

    const error = await gateway.getProfile(userId).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(LineApiError);
    expect(error).toMatchObject({ status: 500 });
    expect((error as Error).message).not.toContain("secret detail");
  });
});

describe("LineGateway.pushText", () => {
  it("pushes one text message with the retry key so retries are idempotent", async () => {
    const client = fakeClient();
    await makeGateway(client).pushText(userId, "hello", "11111111-1111-4111-8111-111111111111");

    expect(client.pushMessage).toHaveBeenCalledWith(
      { to: userId, messages: [{ type: "text", text: "hello" }] },
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("treats 409 (retry key already accepted) as delivered", async () => {
    const gateway = makeGateway(fakeClient({ pushMessage: vi.fn().mockRejectedValue(httpError(409)) }));

    await expect(gateway.pushText(userId, "hello", "k")).resolves.toBeUndefined();
  });

  it("raises LineApiError for other failures", async () => {
    const gateway = makeGateway(fakeClient({ pushMessage: vi.fn().mockRejectedValue(httpError(429)) }));

    await expect(gateway.pushText(userId, "hello", "k")).rejects.toMatchObject({ name: "LineApiError", status: 429 });
  });
});

describe("LineGateway.getImage", () => {
  it("downloads the preview of an image the user sent", async () => {
    const blob = fakeBlob();

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "preview")).resolves.toEqual({
      data: new Uint8Array([1, 2]),
      contentType: "image/jpeg",
    });
    expect(blob.getMessageContentPreviewWithHttpInfo).toHaveBeenCalledWith("4680");
  });

  it("downloads the original when asked for the full size", async () => {
    const blob = fakeBlob();

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "full")).resolves.toMatchObject({ data: new Uint8Array([1, 2, 3]) });
    expect(blob.getMessageContentWithHttpInfo).toHaveBeenCalledWith("4680");
  });

  it("returns null when LINE no longer has the content (404)", async () => {
    const blob = fakeBlob({ getMessageContentPreviewWithHttpInfo: vi.fn().mockRejectedValue(httpError(404)) });

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "preview")).resolves.toBeNull();
  });

  it.each(["text/html", "image/svg+xml", ""])("refuses content that is not a raster image (%s)", async (contentType) => {
    const blob = fakeBlob({ getMessageContentPreviewWithHttpInfo: vi.fn().mockResolvedValue(content(new Uint8Array([1]), contentType)) });

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "preview")).resolves.toBeNull();
  });

  it("refuses content larger than the size cap", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    const blob = fakeBlob({ getMessageContentWithHttpInfo: vi.fn().mockResolvedValue(content(big, "image/png")) });

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "full")).resolves.toBeNull();
  });

  it("raises LineApiError for other failures", async () => {
    const blob = fakeBlob({ getMessageContentPreviewWithHttpInfo: vi.fn().mockRejectedValue(httpError(500)) });

    await expect(makeGateway(fakeClient(), blob).getImage("4680", "preview")).rejects.toMatchObject({ name: "LineApiError", status: 500 });
  });
});
