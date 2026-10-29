import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { request } from "../lib/api";
import { Leaderboard } from "./Leaderboard";
vi.mock("../lib/api", () => ({ request: vi.fn() }));

it("shows monthly and all-time standings and switches to multiplayer", async () => {
  vi.mocked(request).mockImplementation(async (path) => ({
    monthly: [
      {
        rank: 1,
        username: path.includes("online") ? "Online winner" : "Bot winner",
        profile_icon: "user",
        games_won: 2,
      },
    ],
    all_time: [],
  }));
  render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
  await screen.findByText("Bot winner");
  expect(
    screen.getByRole("region", { name: "All-Time leaderboard" }).textContent,
  ).toContain("No winners yet");
  fireEvent.click(screen.getByRole("button", { name: "Multiplayer" }));
  await screen.findByText("Online winner");
  expect(screen.queryByText("Bot winner")).toBeNull();
  expect(request).toHaveBeenLastCalledWith("/leaderboard?mode=online");
});

it("offers a retry when standings cannot be loaded", async () => {
  vi.mocked(request)
    .mockRejectedValueOnce(new Error("Accounts unavailable"))
    .mockResolvedValueOnce({ monthly: [], all_time: [] });
  render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Accounts unavailable",
  );
  fireEvent.click(screen.getByRole("button", { name: "Try Again" }));
  await screen.findAllByText("No winners yet");
  expect(screen.queryByRole("alert")).toBeNull();
});

it("opens the multiplayer category directly from a completed match", async () => {
  vi.mocked(request).mockResolvedValue({ monthly: [], all_time: [] });
  render(
    <MemoryRouter initialEntries={["/leaderboard?mode=online"]}>
      <Leaderboard />
    </MemoryRouter>,
  );
  await screen.findAllByText("No winners yet");
  expect(request).toHaveBeenLastCalledWith("/leaderboard?mode=online");
  expect(
    screen
      .getByRole("button", { name: "Multiplayer" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});
