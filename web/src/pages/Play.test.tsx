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
      screen
        .getByRole("button", { name: "6 Players" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.queryByRole("group", { name: "Play to" })).toBeNull();
    expect(screen.queryByRole("button", { name: "15,000" })).toBeNull();
    expect(screen.queryByRole("button", { name: "20,000" })).toBeNull();
    fireEvent.click(
      screen.getByRole("radio", {
        name: scoring === "partnership" ? "Teams of 2" : "Individuals",
      }),
    );
    fireEvent.click(
      within(screen.getByRole("group", { name: "Players" })).getByRole(
        "button",
        { name: `${capacity} Players` },
      ),
    );
    fireEvent.click(
      screen.getByRole("radio", {
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

it("keeps the setup concise and shows the shared guest sign-in notice", () => {
  renderCreateGame();
  expect(screen.queryByText(/players · .*decks/)).toBeNull();
  expect(screen.queryByText(/Single player ·/)).toBeNull();
  expect(screen.getByRole("heading", { name: "Pssst" })).toBeTruthy();
  expect(screen.getByText("We noticed you're not signed in!")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: "Online" }));
  expect(
    screen.queryByText(/Invite friends with a private lobby code/),
  ).toBeNull();
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
        { name: `${capacity} Players` },
      ),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Teams of 2" }));
    const choices = within(screen.getByRole("group", { name: "Players" }));
    expect(
      choices.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["4 Players", "6 Players"]);
    const selected = Math.max(4, capacity + (capacity % 2));
    expect(
      choices
        .getByRole("button", { name: `${selected} Players` })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Individuals" }));
    expect(
      choices.getAllByRole("button").map((button) => button.textContent),
    ).toEqual([
      "2 Players",
      "3 Players",
      "4 Players",
      "5 Players",
      "6 Players",
    ]);
  },
);
