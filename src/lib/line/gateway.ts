import { HTTPFetchError, messagingApi } from "@line/bot-sdk";

export interface LineProfile {
  displayName: string;
  /** Only https URLs are kept, since the value ends up in an `<img src>`. */
  pictureUrl: string | null;
}

/** The outbound LINE operations the app depends on; mocked in tests. */
export interface LineGateway {
  /** Resolves `null` when LINE no longer exposes the profile (user blocked or unfollowed). */
  getProfile(userId: string): Promise<LineProfile | null>;
  /** `retryKey` (a UUID) makes retries idempotent on LINE's side. */
  pushText(userId: string, text: string, retryKey: string): Promise<void>;
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

const statusOf = (error: unknown) => (error instanceof HTTPFetchError ? error.status : undefined);

export function createLineGateway(client: MessagingClient): LineGateway {
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
  };
}

/** Production gateway backed by the official SDK client. */
export function createDefaultLineGateway(channelAccessToken: string): LineGateway {
  return createLineGateway(new messagingApi.MessagingApiClient({ channelAccessToken }));
}
