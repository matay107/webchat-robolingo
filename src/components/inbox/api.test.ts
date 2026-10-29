import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, inboxApi, UnauthorizedError } from "./api";

const fetchMock = vi.fn<typeof fetch>();
const userId = `U${"a".repeat(32)}`;
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

describe("inboxApi", () => {
  it("lists contacts", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ contacts: [{ userId }] }));

    await expect(inboxApi.listContacts()).resolves.toEqual([{ userId }]);
    expect(fetchMock).toHaveBeenCalledWith("/api/contacts", expect.anything());
  });

  it("polls messages after a cursor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    await inboxApi.listMessages(userId, { after: 42 });

    expect(fetchMock).toHaveBeenCalledWith(`/api/contacts/${userId}/messages?after=42`, expect.anything());
  });

  it("pages back through older messages before a cursor", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ messages: [] }));

    await inboxApi.listMessages(userId, { before: 7 });

    expect(fetchMock).toHaveBeenCalledWith(`/api/contacts/${userId}/messages?before=7`, expect.anything());
  });

  it("posts a reply as JSON with its idempotency key", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: { id: 1 } }, 201));

    await expect(inboxApi.sendMessage(userId, "hi", "key-1")).resolves.toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/contacts/${userId}/messages`,
      expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "hi", idempotencyKey: "key-1" }) }),
    );
  });

  it("signals an expired session with UnauthorizedError", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "unauthorized", message: "Sign in required" } }, 401));

    await expect(inboxApi.listContacts()).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("surfaces the server's safe error message", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "upstream_error", message: "LINE did not accept the message." } }, 502));

    await expect(inboxApi.sendMessage(userId, "hi", "k")).rejects.toEqual(new ApiError(502, "LINE did not accept the message."));
  });
});
