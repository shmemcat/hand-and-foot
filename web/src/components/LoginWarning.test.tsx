import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { LoginWarning } from "./LoginWarning";
const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));

it("uses the shared Pssst message and remembers the originating lobby for sign-in", () => {
  render(
    <MemoryRouter initialEntries={["/room/ABC234"]}>
      <LoginWarning />
    </MemoryRouter>,
  );
  expect(screen.getByRole("heading", { name: "Pssst" })).toBeTruthy();
  expect(screen.getByText("We noticed you're not signed in!")).toBeTruthy();
  expect(
    screen.getByRole("link", { name: "sign in." }).getAttribute("href"),
  ).toBe("/user?returnTo=%2Froom%2FABC234");
});

it("hides the prompt for signed-in accounts and while checking identity", () => {
  auth.loading = true;
  const view = render(
    <MemoryRouter>
      <LoginWarning />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Pssst")).toBeNull();
  auth.loading = false;
  auth.user = { id: "1" };
  view.rerender(
    <MemoryRouter>
      <LoginWarning />
    </MemoryRouter>,
  );
  expect(screen.queryByText("Pssst")).toBeNull();
  auth.user = null;
});
