import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Profile } from "./Profile";
const auth = vi.hoisted(() => ({
  user: {
    id: "1",
    name: "Player",
    email: "player@example.test",
    email_verified: true,
    profile_icon: "cat",
  } as {
    id: string;
    name: string;
    email: string;
    email_verified: boolean;
    profile_icon: string;
  } | null,
  loading: false,
  updateProfile: vi.fn(),
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
beforeEach(() => {
  auth.user = {
    id: "1",
    name: "Player",
    email: "player@example.test",
    email_verified: true,
    profile_icon: "cat",
  };
  auth.updateProfile.mockReset().mockResolvedValue("Profile saved.");
});
it("opens the shared icon picker, filters choices, and saves the selected icon", async () => {
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Toggle icon picker" }));
  fireEvent.change(screen.getByLabelText("Find an icon"), {
    target: { value: "Turtle" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Turtle" }));
  await screen.findByText("Profile saved.");
  expect(auth.updateProfile).toHaveBeenCalledWith({ profile_icon: "turtle" });
  expect(screen.queryByRole("button", { name: "Dog" })).toBeNull();
});
it("keeps failed email changes editable and reports the service error", async () => {
  auth.updateProfile.mockRejectedValue(
    new Error("That email is already registered."),
  );
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "other@example.test" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByRole("alert");
  expect(auth.updateProfile).toHaveBeenCalledWith({
    email: "other@example.test",
  });
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Email address") as HTMLInputElement).readOnly,
    ).toBe(false),
  );
});
it("provides a sign-in route for guests without exposing profile controls", () => {
  auth.user = null;
  render(
    <MemoryRouter>
      <Profile />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("link", { name: "Sign In" }).getAttribute("href"),
  ).toBe("/user");
  expect(screen.queryByLabelText("Email address")).toBeNull();
});
