import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountSummary } from "./AccountSummary";
import type { AccountSummary as Summary } from "../lib/achievements";
const request = vi.hoisted(() => vi.fn());
vi.mock("../lib/api", () => ({ request }));
const empty = {
  games: 0,
  wins: 0,
  rounds: 0,
  best: null,
  total: 0,
  cleanBooks: 0,
  dirtyBooks: 0,
  goingOut: 0,
};
const data: Summary = {
  stats: {
    all: { ...empty, games: 4, wins: 3 },
    practice: { ...empty, games: 3, wins: 3 },
    online: { ...empty, games: 1 },
  },
  counters: { games: 4 },
  unlocks: ["first_chapter"],
};
beforeEach(() => {
  request.mockReset().mockResolvedValue(data);
});
it("loads personal statistics, separates modes, and conceals secret names and descriptions", async () => {
  render(<AccountSummary />);
  await screen.findByText("75%");
  expect(screen.queryByText("Plot Twist")).toBeNull();
  expect(
    screen.getAllByRole("button", { name: "Secret achievement: Locked" }),
  ).toHaveLength(26);
  fireEvent.focus(
    screen.getAllByRole("button", { name: "Secret achievement: Locked" })[0],
  );
  expect(screen.getByRole("tooltip").textContent).toContain(
    "????This is a secret achievement",
  );
  fireEvent.click(screen.getByRole("button", { name: "Separate" }));
  expect(screen.getByText("100%")).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Medium" }).getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Easy" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("Win Rate")
      .nextElementSibling?.textContent,
  ).toBe("—");
  fireEvent.click(screen.getByRole("button", { name: "Hard" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("Games Won")
      .nextElementSibling?.textContent,
  ).toBe("0");
  fireEvent.click(screen.getByRole("button", { name: "Multiplayer" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("0%"),
  ).toBeTruthy();
});

it("uses difficulty-specific records without mixing them with the legacy bot total", () => {
  render(
    <AccountSummary
      preview={{
        ...data,
        stats: {
          ...data.stats,
          easy: { ...empty, games: 2, wins: 1 },
          medium: { ...empty, games: 4, wins: 3 },
          hard: { ...empty, games: 3, wins: 1 },
          multiplayer: { ...empty, games: 1 },
        },
      }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Separate" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("75%"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Easy" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("50%"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Hard" }));
  expect(
    within(screen.getByLabelText("Your statistics")).getByText("33%"),
  ).toBeTruthy();
});
it("offers a retry instead of displaying a false empty account on failure", async () => {
  request.mockRejectedValueOnce(new Error("Unable to connect."));
  render(<AccountSummary />);
  await screen.findByRole("alert");
  expect(screen.queryByLabelText("Your statistics")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await screen.findByText("75%");
});
