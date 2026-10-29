import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { User } from "./User";
const login = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false, error: "", login }),
}));

it("returns a guest to the same lobby after successful sign-in", async () => {
  render(
    <MemoryRouter initialEntries={["/user?returnTo=%2Froom%2FABC234"]}>
      <Routes>
        <Route path="/user" element={<User />} />
        <Route path="/room/:code" element={<p>Original lobby</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "Username or Email" }), {
    target: { value: "Player" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Sign In" }));
  await screen.findByText("Original lobby");
});

it("shows the shared inline validation and focuses the missing field", () => {
  render(
    <MemoryRouter>
      <User />
    </MemoryRouter>,
  );
  login.mockClear();
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Please enter your username or email.",
  );
  expect(document.activeElement).toBe(
    screen.getByLabelText("Username or Email"),
  );
  fireEvent.change(screen.getByLabelText("Username or Email"), {
    target: { value: " Player " },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  expect(screen.getByRole("alert").textContent).toBe(
    "Please enter your password.",
  );
  expect(document.activeElement).toBe(screen.getByLabelText("Password"));
  expect(login).not.toHaveBeenCalled();
});

it("returns to practice setup and rejects an external return destination", async () => {
  const { unmount } = render(
    <MemoryRouter initialEntries={["/user?returnTo=%2Fplay"]}>
      <Routes>
        <Route path="/user" element={<User />} />
        <Route path="/play" element={<p>Practice setup</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Username or Email"), {
    target: { value: "Player" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  await screen.findByText("Practice setup");
  unmount();
  render(
    <MemoryRouter initialEntries={["/user?returnTo=https%3A%2F%2Fexample.com"]}>
      <User />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Username or Email"), {
    target: { value: "Player" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: "password" },
  });
  fireEvent.submit(screen.getByRole("form", { name: "Sign in" }));
  expect(await screen.findByRole("form", { name: "Sign in" })).toBeTruthy();
});
