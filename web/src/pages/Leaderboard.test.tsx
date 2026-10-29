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
        username: path.includes("multiplayer") ? "Online winner" : "Bot winner",
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
  expect(request).toHaveBeenLastCalledWith("/leaderboard?category=multiplayer");
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

it("uses the sister games' difficulty tabs and loads each category separately", async () => {
  vi.mocked(request).mockImplementation(async (path) => ({
    monthly: [
      {
        rank: 1,
        username: path.split("=")[1] + " winner",
        profile_icon: "user",
        games_won: 1,
      },
    ],
    all_time: [],
  }));
  render(
    <MemoryRouter>
      <Leaderboard />
    </MemoryRouter>,
  );
  await screen.findByText("medium winner");
  expect(
    screen.getByRole("button", { name: "Medium" }).getAttribute("aria-pressed"),
  ).toBe("true");
  expect(screen.queryByRole("button", { name: "Against Bots" })).toBeNull();
  for (const label of ["Easy", "Hard", "Medium", "Multiplayer"]) {
    fireEvent.click(screen.getByRole("button", { name: label }));
    await screen.findByText(label.toLowerCase() + " winner");
    expect(request).toHaveBeenLastCalledWith(
      `/leaderboard?category=${label.toLowerCase()}`,
    );
    expect(
      screen.getByRole("table", { name: `Monthly ${label} winners` }),
    ).toBeTruthy();
  }
});

it("opens a specific difficulty directly from a completed game", async () => {
  vi.mocked(request).mockResolvedValue({ monthly: [], all_time: [] });
  render(
    <MemoryRouter initialEntries={["/leaderboard?category=hard"]}>
      <Leaderboard />
    </MemoryRouter>,
  );
  await screen.findAllByText("No winners yet");
  expect(request).toHaveBeenLastCalledWith("/leaderboard?category=hard");
  expect(
    screen.getByRole("button", { name: "Hard" }).getAttribute("aria-pressed"),
  ).toBe("true");
});

it("opens the multiplayer category directly from a completed match", async () => {
  vi.mocked(request).mockResolvedValue({ monthly: [], all_time: [] });
  render(
    <MemoryRouter initialEntries={["/leaderboard?mode=online"]}>
      <Leaderboard />
    </MemoryRouter>,
  );
  await screen.findAllByText("No winners yet");
  expect(request).toHaveBeenLastCalledWith("/leaderboard?category=multiplayer");
  expect(
    screen
      .getByRole("button", { name: "Multiplayer" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("opens achievement rankings directly and returns to win standings", async () => {
  vi.mocked(request).mockResolvedValue({
    monthly: [],
    all_time: [
      {
        rank: 1,
        username: "Collector",
        profile_icon: "cat",
        achievement_count: 24,
      },
      {
        rank: 2,
        username: "Starter",
        profile_icon: "cat",
        achievement_count: 1,
      },
    ],
  });
  render(
    <MemoryRouter initialEntries={["/leaderboard?mode=achievements"]}>
      <Leaderboard />
    </MemoryRouter>,
  );
  expect((await screen.findByText("24 achievements")).textContent).toBe(
    "24 achievements",
  );
  expect(screen.getByText("1 achievement")).toBeTruthy();
  expect(screen.getAllByRole("table")).toHaveLength(1);
  expect(screen.queryByText("Monthly")).toBeNull();
  expect(request).toHaveBeenLastCalledWith(
    "/leaderboard?category=achievements",
  );
  vi.mocked(request).mockResolvedValue({ monthly: [], all_time: [] });
  fireEvent.click(screen.getByRole("button", { name: "Easy" }));
  await screen.findAllByText("No winners yet");
  expect(screen.getAllByRole("table")).toHaveLength(2);
});
