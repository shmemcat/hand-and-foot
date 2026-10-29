import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { DeleteAccountModal } from "./DeleteAccountModal";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
});

it("requires confirmation and a password before deleting the shared account", async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<DeleteAccountModal onClose={onClose} onDelete={onDelete} />);
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "No" }),
  );
  expect(
    screen.getByText(/across Cards, Hearts, Euchre, Golf, and Hand & Foot/),
  ).toBeTruthy();
  expect(screen.queryByLabelText("Password")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  const input = screen.getByLabelText("Password");
  expect(document.activeElement).toBe(input);
  fireEvent.submit(screen.getByRole("form", { name: "Confirm deletion" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Please enter your password.",
  );
  expect(onDelete).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: "correct-password" } });
  fireEvent.submit(screen.getByRole("form", { name: "Confirm deletion" }));
  await waitFor(() =>
    expect(onDelete).toHaveBeenCalledWith("correct-password"),
  );
});

it("keeps deletion errors in the dialog and allows a password retry", async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error("Incorrect password."));
  render(<DeleteAccountModal onClose={vi.fn()} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "wrong" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Incorrect password.",
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("prevents duplicate requests and dismissal while deletion is pending", async () => {
  let finish!: () => void;
  const onDelete = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const onClose = vi.fn();
  render(<DeleteAccountModal onClose={onClose} onDelete={onDelete} />);
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password" },
  });
  const form = screen.getByRole("form", { name: "Confirm deletion" });
  fireEvent.submit(form);
  fireEvent.submit(form);
  fireEvent.click(screen.getByRole("dialog"));
  fireEvent(
    screen.getByRole("dialog"),
    new Event("cancel", { cancelable: true }),
  );
  expect(onDelete).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
  finish();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Delete" }).hasAttribute("disabled"),
    ).toBe(false),
  );
});
