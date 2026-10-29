import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CreateGame, JoinGame } from "./Play";
import { request } from "../lib/api";

vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  request: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(request).mockImplementation(async (path) =>
    path === "/active" ? { rooms: [] } : { code: "TABLE1" },
  );
});

function renderCreateGame() {
  render(
    <MemoryRouter initialEntries={["/game/create"]}>
      <Routes>
        <Route path="/game/create" element={<CreateGame />} />
        <Route path="/room/:code" element={<p>Table created</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const rosters = [
  ...[2, 3, 4, 5, 6].map((capacity) => ({ scoring: "individual", capacity })),
  ...[4, 6].map((capacity) => ({ scoring: "partnership", capacity })),
];

it.each(
  rosters.flatMap((roster) =>
    ["practice", "online"].map((mode) => ({ ...roster, mode })),
  ),
)(
  "creates a $capacity-player $scoring $mode game to 10,000",
  async ({ scoring, capacity, mode }) => {
    renderCreateGame();
    expect(
      screen.getByText("6 players · 7 decks · Play to 10,000"),
    ).toBeTruthy();
    expect(screen.queryByRole("group", { name: "Play to" })).toBeNull();
    expect(screen.queryByRole("button", { name: "15,000" })).toBeNull();
    expect(screen.queryByRole("button", { name: "20,000" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", {
        name: scoring === "partnership" ? "Teams of 2" : "Individuals",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Players" })).getByRole(
        "button",
        { name: String(capacity) },
      ),
    );
    expect(
      screen.getByText(
        `${capacity} players${scoring === "partnership" ? ` · ${capacity / 2} teams` : ""} · ${capacity + 1} decks · Play to 10,000`,
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", {
        name: mode === "online" ? "Online" : "Versus Bots",
      }),
    );
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", { name: "Create Game" })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create Game" }));
    await waitFor(() => expect(screen.getByText("Table created")).toBeTruthy());
    expect(request).toHaveBeenLastCalledWith("/rooms", {
      name: "You",
      playMode: mode,
      scoringMode: scoring,
      capacity,
      targetScore: 10000,
    });
  },
);

it("explains single-player bots and the guest leaderboard requirement before starting", () => {
  renderCreateGame();
  expect(screen.getByText("Single player · You and 5 bots")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pssst" })).toBeTruthy();
  expect(screen.getByText("We noticed you're not signed in!")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Online" }));
  expect(
    screen.getByText(/Invite friends with a private lobby code/),
  ).toBeTruthy();
});

it("joins a normalized private code with the guest name and remembers the table", async () => {
  vi.mocked(request).mockImplementation(async (path) =>
    path === "/active" ? { rooms: [] } : { code: "ABC234" },
  );
  render(
    <MemoryRouter initialEntries={["/game/join"]}>
      <Routes>
        <Route path="/game/join" element={<JoinGame />} />
        <Route path="/room/:code" element={<p>Joined table</p>} />
      </Routes>
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: "Join Game" }).hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.change(screen.getByRole("textbox", { name: "Lobby code" }), {
    target: { value: "abc234" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Your name" }), {
    target: { value: " Friend " },
  });
  await waitFor(() =>
    expect(
      screen
        .getByRole("button", { name: "Join Game" })
        .hasAttribute("disabled"),
    ).toBe(false),
  );
  fireEvent.click(screen.getByRole("button", { name: "Join Game" }));
  await screen.findByText("Joined table");
  expect(request).toHaveBeenLastCalledWith("/rooms/ABC234/join", {
    name: "Friend",
    seat: null,
  });
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "ABC234",
  );
});

it.each([2, 3, 5])(
  "adjusts a %s-player individual table to valid teams",
  (capacity) => {
    renderCreateGame();
    fireEvent.click(
      within(screen.getByRole("group", { name: "Players" })).getByRole(
        "button",
        { name: String(capacity) },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Teams of 2" }));
    const choices = within(screen.getByRole("group", { name: "Players" }));
    expect(
      choices.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["4", "6"]);
    const selected = Math.max(4, capacity + (capacity % 2));
    expect(
      choices
        .getByRole("button", { name: String(selected) })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Individuals" }));
    expect(
      choices.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["2", "3", "4", "5", "6"]);
  },
);
