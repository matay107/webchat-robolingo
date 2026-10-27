// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "./Composer";

const setup = (onSend = vi.fn().mockResolvedValue(true)) => {
  render(<Composer onSend={onSend} />);
  return { onSend, input: screen.getByRole("textbox", { name: /message/i }), button: screen.getByRole("button", { name: /send/i }) };
};

describe("Composer", () => {
  it("sends the trimmed text with Enter and clears the box on success", async () => {
    const { onSend, input } = setup();

    await userEvent.type(input, "  hello  {Enter}");

    expect(onSend).toHaveBeenCalledWith("hello");
    expect(input).toHaveValue("");
  });

  it("inserts a newline with Shift+Enter instead of sending", async () => {
    const { onSend, input } = setup();

    await userEvent.type(input, "line one{Shift>}{Enter}{/Shift}line two");

    expect(onSend).not.toHaveBeenCalled();
    expect(input).toHaveValue("line one\nline two");
  });

  it("cannot send an empty or whitespace-only message", async () => {
    const { onSend, input, button } = setup();
    expect(button).toBeDisabled();

    await userEvent.type(input, "   {Enter}");

    expect(button).toBeDisabled();
    expect(onSend).not.toHaveBeenCalled();
  });

  it("blocks double sends while a message is in flight", async () => {
    let finish!: (ok: boolean) => void;
    const { onSend, input, button } = setup(vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve))));

    await userEvent.type(input, "hello{Enter}");
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onSend).toHaveBeenCalledTimes(1);

    finish(true);
    await vi.waitFor(() => expect(input).toHaveValue(""));
  });

  it("keeps the text when sending fails so it can be retried", async () => {
    const { input } = setup(vi.fn().mockResolvedValue(false));

    await userEvent.type(input, "hello{Enter}");

    expect(input).toHaveValue("hello");
  });

  it("limits input to LINE's 5000 characters", () => {
    const { input } = setup();

    expect(input).toHaveAttribute("maxLength", "5000");
  });

  it("is disabled, with the reason shown, when the user cannot receive messages", () => {
    render(<Composer onSend={vi.fn()} disabledReason="This user unfollowed the OA" />);

    expect(screen.getByRole("textbox", { name: /message/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /send/i })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /message/i })).toHaveAttribute("placeholder", "This user unfollowed the OA");
  });
});
