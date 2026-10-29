import type { Readable } from "node:stream";
import { HTTPFetchError, messagingApi } from "@line/bot-sdk";

export interface LineProfile {
  displayName: string;
  /** Only https URLs are kept, since the value ends up in an `<img src>`. */
  pictureUrl: string | null;
}

export type ImageSize = "preview" | "full";

export interface LineImage {
  data: Uint8Array;
  contentType: string;
}

/** Keeps a proxied image under Vercel's 4.5 MB function response limit. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Raster formats only: SVG can carry script, so it is never served from the app's origin. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/** The outbound LINE operations the app depends on; mocked in tests. */
export interface LineGateway {
  /** Resolves `null` when LINE no longer exposes the profile (user blocked or unfollowed). */
  getProfile(userId: string): Promise<LineProfile | null>;
  /** `retryKey` (a UUID) makes retries idempotent on LINE's side. */
  pushText(userId: string, text: string, retryKey: string): Promise<void>;
  /**
   * Downloads an image a user sent. Resolves `null` when LINE no longer has it, or when it is
   * not a raster image or exceeds {@link MAX_IMAGE_BYTES}.
   */
  getImage(lineMessageId: string, size: ImageSize): Promise<LineImage | null>;
}

/** A LINE API failure, keeping the HTTP status but not LINE's response body. */
export class LineApiError extends Error {
  constructor(
    readonly operation: string,
    readonly status: number | undefined,
    options?: ErrorOptions,
  ) {
    super(`LINE ${operation} failed${status ? ` with HTTP ${status}` : ""}`, options);
    this.name = "LineApiError";
  }
}

export type MessagingClient = Pick<messagingApi.MessagingApiClient, "getProfile" | "pushMessage">;
export type BlobClient = Pick<messagingApi.MessagingApiBlobClient, "getMessageContentWithHttpInfo" | "getMessageContentPreviewWithHttpInfo">;

const statusOf = (error: unknown) => (error instanceof HTTPFetchError ? error.status : undefined);

/** Buffers a stream, giving up (and closing it) once it grows past `maxBytes`. */
async function readCapped(stream: Readable, maxBytes: number): Promise<Uint8Array | null> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      stream.destroy();
      return null;
    }
    chunks.push(chunk);
  }
  return new Uint8Array(Buffer.concat(chunks));
}

export function createLineGateway(client: MessagingClient, blob: BlobClient): LineGateway {
  return {
    async getProfile(userId) {
      try {
        const profile = await client.getProfile(userId);
        const pictureUrl = profile.pictureUrl?.startsWith("https://") ? profile.pictureUrl : null;
        return { displayName: profile.displayName, pictureUrl };
      } catch (error) {
        if (statusOf(error) === 404) return null;
        throw new LineApiError("getProfile", statusOf(error), { cause: error });
      }
    },

    async pushText(userId, text, retryKey) {
      try {
        await client.pushMessage({ to: userId, messages: [{ type: "text", text }] }, retryKey);
      } catch (error) {
        // 409: a request with this retry key was already accepted, so the message is delivered.
        if (statusOf(error) === 409) return;
        throw new LineApiError("pushMessage", statusOf(error), { cause: error });
      }
    },

    async getImage(lineMessageId, size) {
      let content;
      try {
        content =
          size === "full"
            ? await blob.getMessageContentWithHttpInfo(lineMessageId)
            : await blob.getMessageContentPreviewWithHttpInfo(lineMessageId);
      } catch (error) {
        // 404: the content expired or was never stored by LINE.
        if (statusOf(error) === 404) return null;
        throw new LineApiError("getMessageContent", statusOf(error), { cause: error });
      }

      const contentType = content.httpResponse.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
      if (!IMAGE_TYPES.has(contentType)) {
        content.body.destroy();
        return null;
      }
      const data = await readCapped(content.body, MAX_IMAGE_BYTES);
      return data && { data, contentType };
    },
  };
}

/** Production gateway backed by the official SDK client. */
export function createDefaultLineGateway(channelAccessToken: string): LineGateway {
  return createLineGateway(
    new messagingApi.MessagingApiClient({ channelAccessToken }),
    new messagingApi.MessagingApiBlobClient({ channelAccessToken }),
  );
}
