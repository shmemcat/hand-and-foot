import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { GearOverlay } from "./SettingsGear";

const account = vi.hoisted(() => ({
  user: { id: "player" } as { id: string } | null,
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => account }));
beforeEach(() => {
  account.user = { id: "player" };
});
const page = (path = "/user") => (
  <MemoryRouter initialEntries={[path]}>
    <GearOverlay />
  </MemoryRouter>
);

it("keeps Profile and Options behind the account gear and restores focus on Escape", () => {
  render(page());
  const gear = screen.getByRole("button", { name: "Settings menu" });
  expect(gear.getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByRole("link", { name: "Options" })).toBeNull();
  fireEvent.click(gear);
  expect(
    screen.getByRole("link", { name: "Profile" }).getAttribute("href"),
  ).toBe("/profile");
  expect(
    screen.getByRole("link", { name: "Options" }).getAttribute("href"),
  ).toBe("/options");
  fireEvent.keyDown(document, { key: "Escape" });
  expect(gear.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(gear);
});

it.each([
  ["/profile", "Profile", "Options"],
  ["/options", "Options", "Profile"],
])(
  "excludes the current %s page and closes on an outside click",
  (path, current, other) => {
    render(page(path));
    const gear = screen.getByRole("button", { name: "Settings menu" });
    fireEvent.click(gear);
    expect(screen.queryByRole("link", { name: current })).toBeNull();
    expect(screen.getByRole("link", { name: other })).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(gear.getAttribute("aria-expanded")).toBe("false");
  },
);

it.each(["/", "/play", "/room/ABC234"])(
  "does not add an account gear on %s",
  (path) => {
    render(page(path));
    expect(screen.queryByRole("button", { name: "Settings menu" })).toBeNull();
  },
);

it("keeps the gear hidden for signed-out accounts and visible in the development user preview", () => {
  account.user = null;
  const view = render(page());
  expect(screen.queryByRole("button", { name: "Settings menu" })).toBeNull();
  view.unmount();
  render(page("/preview/user"));
  expect(screen.getByRole("button", { name: "Settings menu" })).toBeTruthy();
});
