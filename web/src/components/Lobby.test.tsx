import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it, vi } from "vitest";
import { Lobby } from "./Lobby";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";
import type { Snapshot } from "../types";
vi.mock("../context/AuthContext", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
function fixture(capacity = 6): Snapshot {
  const view = endingSnapshot(ENDING_EXAMPLES[1]);
  return {
    ...view,
    code: "ABC234",
    phase: "lobby",
    status: "lobby",
    playMode: "online",
    scoringMode: "partnership",
    capacity,
    decks: capacity + 1,
    players: [view.players[0]],
  };
}
const page = (view: Snapshot, command = vi.fn(), error = "") => (
  <MemoryRouter>
    <Lobby snapshot={view} busy={false} error={error} act={command} />
  </MemoryRouter>
);

it.each([2, 3, 4, 5, 6])(
  "renders Golf's copy fields and outlined %s-seat lobby",
  (capacity) => {
    render(page(fixture(capacity)));
    expect(screen.getByRole("heading", { name: "GAME LOBBY" })).toBeTruthy();
    expect(
      screen.getByRole("textbox", { name: "Code" }).getAttribute("value"),
    ).toBe("ABC234");
    expect(
      screen.getByRole("textbox", { name: "URL" }).getAttribute("value"),
    ).toContain("/room/ABC234");
    expect(
      within(
        screen.getByRole("list", { name: "Players in lobby" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(capacity);
  },
);

it("copies the code and URL independently and announces success", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  render(page(fixture()));
  fireEvent.click(screen.getByRole("button", { name: "Copy Code" }));
  await screen.findByText("Code copied.");
  expect(copy).toHaveBeenLastCalledWith("ABC234");
  fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
  await screen.findByText("URL copied.");
  expect(copy).toHaveBeenLastCalledWith(
    expect.stringContaining("/room/ABC234"),
  );
});

it("keeps manual-copy fields available if clipboard access fails", async () => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error("No clipboard")) },
  });
  render(page(fixture()));
  fireEvent.click(screen.getByRole("button", { name: "Copy Code" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Select and copy the field",
  );
  expect(
    screen.getByRole("textbox", { name: "Code" }).hasAttribute("readonly"),
  ).toBe(true);
});

it("lets the host choose only seated players or fill bots and shares the saved selection", () => {
  const command = vi.fn();
  const view = fixture();
  view.scoringMode = "individual";
  view.players.push({ ...view.players[0], id: "friend", name: "Friend" });
  const { rerender } = render(page(view, command));
  fireEvent.click(screen.getByRole("radio", { name: "Start with 2 players" }));
  expect(command).toHaveBeenCalledWith("lobby_options", { fillBots: false });
  rerender(page({ ...view, lobbyFillBots: false }, command));
  fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
  expect(command).toHaveBeenCalledWith("start", { fillBots: false });
  fireEvent.click(screen.getByRole("radio", { name: "Fill with bots" }));
  expect(command).toHaveBeenCalledWith("lobby_options", { fillBots: true });
  rerender(page({ ...view, lobbyFillBots: true }, command));
  fireEvent.click(screen.getByRole("button", { name: "Start Game" }));
  expect(command).toHaveBeenCalledWith("start", { fillBots: true });
});

it("lets members choose their own seats and confirms host closure", () => {
  const view = fixture(4);
  view.players = [
    ...view.players,
    { ...view.players[0], id: "friend", name: "Friend" },
  ];
  const command = vi.fn();
  render(page(view, command));
  fireEvent.click(screen.getByRole("button", { name: "Select seat 4" }));
  expect(command).toHaveBeenCalledWith("seat", { seat: 3 });
  fireEvent.click(screen.getByRole("button", { name: "Leave Seat" }));
  expect(command).toHaveBeenCalledWith("unseat", undefined);
  fireEvent.click(screen.getByRole("button", { name: "Close Lobby" }));
  const dialog = screen.getByRole("dialog", { name: "Close this lobby?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Keep Lobby" }));
  expect(command).not.toHaveBeenCalledWith("close", undefined);
  fireEvent.click(screen.getByRole("button", { name: "Close Lobby" }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "Close Lobby",
    }),
  );
  expect(command).toHaveBeenCalledWith("close", undefined);
});

it("limits guest actions to leaving and home and shows a closed lobby clearly", () => {
  const view = fixture();
  view.hostId = "friend";
  const { rerender } = render(page(view));
  expect(screen.queryByRole("button", { name: "Start Game" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Close Lobby" })).toBeNull();
  expect(screen.getByText("Waiting for the host to start…")).toBeTruthy();
  expect(
    screen
      .getByRole("radio", { name: "Start with 1 player" })
      .hasAttribute("disabled"),
  ).toBe(true);
  expect(
    screen
      .getByRole("radio", { name: "Fill with bots" })
      .hasAttribute("disabled"),
  ).toBe(true);
  rerender(page({ ...view, status: "closed" }));
  expect(screen.getByRole("heading", { name: "LOBBY CLOSED" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Back to Play" })).toBeTruthy();
});

it("does not reserve the first seat after the host chooses another position", () => {
  const view = fixture();
  view.lobbySeats = [null, view.players[0], null, null, null, null];
  render(page(view));
  expect(screen.getByRole("button", { name: "Select seat 1" })).toBeTruthy();
  expect(
    screen.getByRole("listitem", { name: "Seat 2: You (you)" }).textContent,
  ).toContain("Host");
});

it("shows unseated members below the table, keeps them out of the seat grid, and waits to start", () => {
  const view = fixture(4);
  const member = { ...view.players[0], id: "waiting", name: "Waiting friend" };
  view.players.push(member);
  view.lobbySeats = [view.players[0], null, null, null];
  view.waitingPlayers = [member];
  const { rerender } = render(page(view));
  const area = screen.getByRole("region", { name: "Players choosing seats" });
  expect(within(area).getByText("Waiting friend")).toBeTruthy();
  expect(
    within(screen.getByRole("list", { name: "Players in lobby" })).queryByText(
      "Waiting friend",
    ),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Start Game" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByText(/Play to 10,000/)).toBeNull();
  expect(screen.getByRole("heading", { name: "Pssst" })).toBeTruthy();
  rerender(
    page({
      ...view,
      lobbySeats: [view.players[0], null, null, member],
      waitingPlayers: [],
    }),
  );
  expect(
    screen.queryByRole("region", { name: "Players choosing seats" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Start Game" }).hasAttribute("disabled"),
  ).toBe(false);
});

it("lets the host remove a stranded waiting player, then start the same lobby", () => {
  const view = fixture(4);
  const member = { ...view.players[0], id: "waiting", name: "Waiting friend" };
  view.players.push(member);
  view.lobbySeats = [view.players[0], null, null, null];
  view.waitingPlayers = [member];
  const command = vi.fn();
  const { rerender } = render(page(view, command));
  fireEvent.click(
    screen.getByRole("button", { name: "Remove Waiting friend from lobby" }),
  );
  expect(command).toHaveBeenCalledWith("remove_player", {
    playerId: "waiting",
  });
  rerender(
    page({ ...view, players: [view.players[0]], waitingPlayers: [] }, command),
  );
  expect(
    screen.getByRole("button", { name: "Start Game" }).hasAttribute("disabled"),
  ).toBe(false);
});

it("does not say Starting while a seat change is pending", async () => {
  let finish!: () => void;
  const command = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const view = fixture(4);
  const { rerender } = render(page(view, command));
  fireEvent.click(screen.getByRole("button", { name: "Select seat 4" }));
  rerender(
    <MemoryRouter>
      <Lobby snapshot={view} busy error="" act={command} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole("button", { name: "Start Game" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(screen.queryByText("Starting…")).toBeNull();
  await act(async () => finish());
});
