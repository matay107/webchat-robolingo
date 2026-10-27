// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "./LoginForm";

const fetchMock = vi.fn<typeof fetch>();
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  replace.mockReset();
});

const submit = async (password = "a long password") => {
  render(<LoginForm />);
  await userEvent.type(screen.getByLabelText(/password/i), password);
  await userEvent.click(screen.getByRole("button", { name: /sign in/i }));
};

describe("LoginForm", () => {
  it("posts the password as JSON and opens the inbox on success", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await submit("my secret password");

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify({ password: "my secret password" }) }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it.each([
    [401, /incorrect password/i],
    [429, /too many attempts/i],
    [500, /something went wrong/i],
  ])("explains a %s response and clears the field", async (status, message) => {
    fetchMock.mockResolvedValue(new Response("{}", { status }));

    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(screen.getByLabelText(/password/i)).toHaveValue("");
    expect(replace).not.toHaveBeenCalled();
  });
});
