import type { ContactDto, MessageDto } from "@/server/handlers/conversations";

/** The session expired or was revoked; the UI should return to /login. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Session expired");
    this.name = "UnauthorizedError";
  }
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(url, { credentials: "same-origin", ...init });
  if (response.status === 401) throw new UnauthorizedError();

  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(response.status, body?.error?.message ?? "Request failed");
  return body as T;
}

const messagesUrl = (userId: string) => `/api/contacts/${encodeURIComponent(userId)}/messages`;

/** Typed client for the admin inbox API. */
export const inboxApi = {
  async listContacts(signal?: AbortSignal): Promise<ContactDto[]> {
    return (await request<{ contacts: ContactDto[] }>("/api/contacts", { signal })).contacts;
  },

  /** Latest messages; only those after `after` when polling; the page before `before` when loading history. */
  async listMessages(userId: string, cursor: { after?: number; before?: number } = {}, signal?: AbortSignal): Promise<MessageDto[]> {
    const query =
      cursor.after !== undefined ? `?after=${cursor.after}` : cursor.before !== undefined ? `?before=${cursor.before}` : "";
    return (await request<{ messages: MessageDto[] }>(`${messagesUrl(userId)}${query}`, { signal })).messages;
  },

  async sendMessage(userId: string, text: string, idempotencyKey: string): Promise<MessageDto> {
    const body = JSON.stringify({ text, idempotencyKey });
    const init = { method: "POST", headers: { "content-type": "application/json" }, body };
    return (await request<{ message: MessageDto }>(messagesUrl(userId), init)).message;
  },

  async markRead(userId: string, upToId: number): Promise<void> {
    const init = { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ upToId }) };
    await request<null>(`/api/contacts/${encodeURIComponent(userId)}/read`, init);
  },

  async logout(): Promise<void> {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  },
};
