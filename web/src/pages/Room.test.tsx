import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { command, getRoom } from "../lib/api";
import type { Snapshot } from "../types";
import { Room } from "./Room";
import { DRAW_FLIGHT_MS, DRAW_STAGGER_MS } from "../hooks/useDrawMotion";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => sound,
}));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  command: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

function fixture(): Snapshot {
  return {
    code: "REVIEW",
    revision: 1,
    token: "turn-1",
    status: "playing",
    capacity: 2,
    scoringMode: "individual",
    playMode: "practice",
    viewerId: "you",
    hostId: "you",
    actorId: "you",
    dealerId: "bot",
    players: ["You", "Poppy"].map((name, team) => ({
      id: team ? "bot" : "you",
      name,
      team,
      bot: team === 1,
      handCount: 11,
      footCount: 11,
      inFoot: false,
      chosen: true,
      redThrees: [],
      ready: false,
      away: false,
    })),
    sides: ["You", "Poppy"].map((name, id) => ({
      id,
      name,
      score: 0,
      opened: false,
      melds: [],
      clean: 0,
      dirty: 0,
      opening: 50,
    })),
    decks: 3,
    drawCount: 2,
    round: 1,
    targetScore: 10000,
    phase: "draw",
    hand: ["clubs", "hearts", "spades"].map((suit) => ({
      id: `ace-${suit}`,
      rank: "A",
      suit,
      value: 20,
      wild: false,
      redThree: false,
    })),
    footPreview: null,
    footTop: {
      id: "foot-top",
      rank: "10",
      suit: "diamonds",
      value: 10,
      wild: false,
      redThree: false,
    },
    discard: null,
    discardCount: 0,
    stockCount: 100,
    history: [],
    winners: [],
    message: "Your turn",
    ruleset: "family",
    scoring: null,
  };
}
function openRoom() {
  render(
    <MemoryRouter initialEntries={["/room/REVIEW"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
}

it.each([
  [50, 0, "9", 3, "4", 4],
  [90, 3001, "A", 3, "10", 3],
  [120, 6000, "A", 3, "10", 6],
] as const)(
  "requires %s opening points across the whole draft before submitting",
  async (minimum, score, firstRank, firstCount, secondRank, secondCount) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].score = score;
    snapshot.sides[0].opening = minimum;
    const cards = (rank: string, count: number) =>
      Array.from({ length: count }, (_, index) => ({
        ...snapshot.hand[0],
        id: `${rank}-${index}`,
        rank,
        value: rank === "A" ? 20 : rank === "4" ? 5 : 10,
      }));
    const first = cards(firstRank, firstCount);
    const second = cards(secondRank, secondCount);
    snapshot.hand = [...first, ...second, ...cards("K", 1)];
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
    openRoom();
    const hand = within(
      await screen.findByRole("region", { name: "Your private hand" }),
    );
    function stageRank(rank: string) {
      for (const card of hand.getAllByRole("button", {
        name: `${rank} of clubs`,
      }))
        fireEvent.click(card);
      fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    }
    stageRank(firstRank);
    const play = screen.getByRole("button", {
      name: "Play draft",
    }) as HTMLButtonElement;
    expect(play.disabled).toBe(true);
    fireEvent.click(play);
    fireEvent.mouseEnter(screen.getByRole("group", { name: "Play draft" }));
    expect(screen.getByRole("tooltip").textContent).toBe(
      `Meld must be greater than or equal to ${minimum} points`,
    );
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    expect(
      (screen.getByRole("button", { name: "Play draft" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    stageRank(firstRank);
    stageRank(secondRank);
    const complete = screen.getByRole("button", {
      name: "Play draft",
    }) as HTMLButtonElement;
    expect(complete.disabled).toBe(false);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(complete);
    await waitFor(() =>
      expect(command).toHaveBeenCalledWith(snapshot, "meld", {
        groups: [
          { cardIds: first.map((card) => card.id), kind: "set" },
          { cardIds: second.map((card) => card.id), kind: "set" },
        ],
      }),
    );
  },
);

it("groups completed books above open piles and lets a completed book receive more cards", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  const ace = snapshot.hand[1];
  snapshot.sides[0].melds = [
    {
      id: "open",
      creator: "you",
      kind: "set",
      rank: "Q",
      complete: false,
      dirty: false,
      bonus: 0,
      cards: Array.from({ length: 3 }, (_, index) => ({
        ...ace,
        id: `queen-${index}`,
        rank: "Q",
        value: 10,
      })),
    },
    {
      id: "closed",
      creator: "you",
      kind: "set",
      rank: "A",
      complete: true,
      dirty: false,
      bonus: 500,
      cards: Array.from({ length: 7 }, (_, index) => ({
        ...ace,
        id: `book-ace-${index}`,
      })),
    },
  ];
  snapshot.players[0].redThrees = [
    { ...ace, id: "red", rank: "3", value: -300, redThree: true },
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const closed = await screen.findByRole("group", { name: "Completed books" });
  const open = screen.getByRole("group", { name: "Open piles" });
  expect(
    within(closed).getByRole("group", { name: "Red threes" }),
  ).toBeTruthy();
  expect(within(open).queryByRole("group", { name: "Red threes" })).toBeNull();
  expect(
    closed.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(screen.queryByText(/laid down/)).toBeNull();
  fireEvent.click(
    within(screen.getByRole("region", { name: "Your private hand" })).getByRole(
      "button",
      { name: "A of clubs" },
    ),
  );
  fireEvent.click(
    within(closed).getByRole("button", { name: "Add selected cards to A’s" }),
  );
  vi.mocked(command).mockResolvedValue(snapshot);
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ meldId: "closed", cardIds: ["ace-clubs"] }],
    }),
  );
});
beforeEach(() => {
  sound.play.mockClear();
  vi.mocked(getRoom).mockResolvedValue(fixture());
  vi.mocked(command).mockReset();
});
afterEach(() => vi.useRealTimers());

it.each(["choose", "draw", "play"] as const)(
  "never plays an inactivity sound or shakes the phase hint in a bot game's %s phase",
  async (phase) => {
    vi.useFakeTimers();
    const snapshot = fixture();
    snapshot.phase = phase;
    snapshot.players[0].chosen = phase !== "choose";
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    await act(async () => openRoom());
    await act(async () => vi.advanceTimersByTime(60_000));
    expect(sound.play).not.toHaveBeenCalledWith("notification");
    expect(document.querySelector(".turn-message.inactivity-shake")).toBeNull();
  },
);

it("keeps inactivity reminders for online games", async () => {
  vi.useFakeTimers();
  const snapshot = fixture();
  snapshot.playMode = "online";
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("notification");
  expect(
    document.querySelector(".turn-message.inactivity-shake"),
  ).not.toBeNull();
});

it("browses individual boards while keeping the private hand and using a real follow checkbox", async () => {
  openRoom();
  const ownBoard = await screen.findByRole("region", { name: "Your board" });
  expect(within(ownBoard).getByRole("heading", { name: "You" })).toBeTruthy();
  const follow = screen.getByRole("checkbox", {
    name: "Follow turn",
  }) as HTMLInputElement;
  expect(follow.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(follow.checked).toBe(false);
  expect(
    within(
      screen.getByRole("region", { name: "Your private hand" }),
    ).getAllByRole("button"),
  ).toHaveLength(3);
  fireEvent.keyDown(screen.getByRole("region", { name: "Poppy’s board" }), {
    key: "ArrowLeft",
  });
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  fireEvent.click(follow);
  expect(follow.checked).toBe(true);
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
});

it("lists individual players in board order and keeps viewed, turn, and dealer markers independent", async () => {
  vi.useFakeTimers();
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.players.reverse();
  snapshot.sides[0].score = 1250;
  snapshot.sides[1].score = 750;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  const nav = within(screen.getByRole("navigation", { name: "Player boards" }));
  const buttons = nav.getAllByRole("button");
  expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual([
    "View your board, 1,250 points, current turn",
    "View Poppy’s board, 750 points, dealer",
  ]);
  const you = buttons[0];
  const poppy = buttons[1];
  expect(you.getAttribute("aria-current")).toBe("step");
  expect(within(poppy).getByRole("img", { name: "Dealer" })).toBeTruthy();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  fireEvent.click(poppy);
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(poppy.getAttribute("aria-pressed")).toBe("true");
  expect(you.getAttribute("aria-current")).toBe("step");
  expect(
    hand
      .getByRole("button", { name: "A of clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  expect(
    (screen.getByRole("checkbox", { name: "Follow turn" }) as HTMLInputElement)
      .checked,
  ).toBe(false);
  const next = { ...snapshot, revision: 2, token: "turn-2", actorId: "bot" };
  vi.mocked(getRoom).mockResolvedValue(next);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(poppy.getAttribute("aria-current")).toBe("step");
  expect(you.hasAttribute("aria-current")).toBe(false);
  fireEvent.click(you);
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  expect(poppy.getAttribute("aria-current")).toBe("step");
  vi.mocked(getRoom).mockResolvedValue({
    ...next,
    revision: 3,
    token: "round-2",
    round: 2,
    dealerId: "you",
  });
  await act(async () => vi.advanceTimersByTime(3000));
  expect(within(you).getByRole("img", { name: "Dealer" })).toBeTruthy();
  expect(within(poppy).queryByRole("img", { name: "Dealer" })).toBeNull();
  expect(command).not.toHaveBeenCalled();
});

it("silently changes turns, including when play returns to you", async () => {
  vi.useFakeTimers();
  const snapshot = fixture();
  snapshot.actorId = "bot";
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  sound.play.mockClear();
  vi.mocked(getRoom).mockResolvedValue({
    ...snapshot,
    revision: 2,
    token: "your-next-turn",
    actorId: "you",
  });
  await act(async () => vi.advanceTimersByTime(3000));
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Draw 2 cards from the stack",
    }).disabled,
  ).toBe(false);
  expect(sound.play).not.toHaveBeenCalled();
  vi.mocked(getRoom).mockResolvedValue({
    ...snapshot,
    revision: 3,
    token: "poppys-next-turn",
  });
  await act(async () => vi.advanceTimersByTime(3000));
  expect(sound.play).not.toHaveBeenCalled();
});

it("allows player-name navigation before choosing a hand and returns to your private choice", async () => {
  const snapshot = fixture();
  snapshot.phase = "choose";
  snapshot.players[0].chosen = false;
  snapshot.footPreview = [
    [snapshot.hand[0], snapshot.hand[1]],
    [snapshot.hand[1], snapshot.hand[2]],
  ];
  snapshot.hand = [];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const nav = within(
    await screen.findByRole("navigation", { name: "Player boards" }),
  );
  expect(screen.getByRole("button", { name: /Play pile 1/ })).toBeTruthy();
  expect(
    nav
      .getAllByRole("button")
      .every((button) => !button.hasAttribute("aria-current")),
  ).toBe(true);
  fireEvent.click(nav.getByRole("button", { name: /^View Poppy’s board/ }));
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Play pile 1/ })).toBeNull();
  fireEvent.click(nav.getByRole("button", { name: /^View your board/ }));
  expect(screen.getByRole("button", { name: /Play pile 1/ })).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
});

it("keeps scores in the dismissible menu and can open and close the score sheet", async () => {
  openRoom();
  await screen.findByRole("region", { name: "Your board" });
  const summary = screen.getByLabelText("Game information and scores");
  const menu = summary.closest("details")!;
  expect(menu.open).toBe(false);
  fireEvent.click(summary);
  expect(menu.open).toBe(true);
  expect(
    within(menu).getByRole("heading", { name: "Your progress" }),
  ).toBeTruthy();
  expect(within(menu).queryByText("Players / decks")).toBeNull();
  expect(within(menu).queryByText("Connection")).toBeNull();
  expect(within(menu).queryByText("Table", { exact: true })).toBeNull();
  expect(within(menu).queryByText("Game", { exact: true })).toBeNull();
  expect(within(menu).queryByRole("link", { name: "Rules" })).toBeNull();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(menu.open).toBe(false);
  expect(document.activeElement).toBe(summary);
  fireEvent.click(summary);
  fireEvent.pointerDown(screen.getByRole("region", { name: "Your board" }));
  expect(menu.open).toBe(false);
  fireEvent.click(summary);
  fireEvent.click(
    within(menu).getByRole("button", { name: "View score sheet" }),
  );
  expect(menu.open).toBe(false);
  expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  fireEvent.click(summary);
  fireEvent.click(within(menu).getByRole("button", { name: "Leave table" }));
  expect(menu.open).toBe(false);
  expect(screen.getByRole("dialog", { name: "Leave table" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.queryByRole("dialog", { name: "Leave table" })).toBeNull();
});

it("removes the separate foot indicator once those cards become the active hand", async () => {
  const snapshot = fixture();
  snapshot.players[0].inFoot = true;
  snapshot.players[0].footCount = 0;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = await screen.findByRole("region", { name: "Your private hand" });
  expect(within(hand).getByText("YOUR FOOT")).toBeTruthy();
  expect(
    within(hand).queryByRole("img", { name: "Face-down card" }),
  ).toBeNull();
  expect(within(hand).queryByText(/Foot ·/)).toBeNull();
  expect(within(hand).queryByRole("group", { name: /Your foot/ })).toBeNull();
});

it("draws from the header and submits the selected opening cards", async () => {
  const snapshot = fixture();
  const drawn = {
    ...snapshot,
    phase: "play" as const,
    revision: 2,
    token: "turn-2",
  };
  vi.mocked(command)
    .mockResolvedValueOnce(drawn)
    .mockResolvedValueOnce({ ...drawn, revision: 3 });
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", { name: "Draw 2 cards from the stack" }),
  );
  await waitFor(() =>
    expect(vi.mocked(command)).toHaveBeenCalledWith(snapshot, "draw", {}),
  );
  await screen.findByText(
    "Your turn. Build your melds, then discard to finish.",
  );
  for (const card of within(
    screen.getByRole("region", { name: "Your private hand" }),
  ).getAllByRole("button", { name: /^A of/ })) {
    fireEvent.click(card);
  }
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(vi.mocked(command)).toHaveBeenLastCalledWith(drawn, "meld", {
      groups: [
        { cardIds: ["ace-clubs", "ace-hearts", "ace-spades"], kind: "set" },
      ],
    }),
  );
});

it.each([2, 3])(
  "flies %s actual drawn cards into the hand once and keeps controls locked until they land",
  async (count) => {
    vi.useFakeTimers();
    const snapshot = fixture();
    snapshot.drawCount = count;
    snapshot.discard = { ...snapshot.hand[0], id: "top-discard", rank: "9" };
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    const added = Array.from({ length: count }, (_, i) => ({
      ...snapshot.hand[0],
      id: `drawn-${i}`,
      rank: String(9 + i),
    }));
    const drawn: Snapshot = {
      ...snapshot,
      phase: "play",
      revision: 2,
      token: "draw-complete",
      hand: [...snapshot.hand, ...added],
      stockCount: snapshot.stockCount - count,
    };
    vi.mocked(command).mockResolvedValue(drawn);
    await act(async () => openRoom());
    const deck = screen.getByRole<HTMLButtonElement>("button", {
      name: `Draw ${count} cards from the stack`,
    });
    expect(
      document.querySelectorAll(
        '.draw-available-indicator[data-active="true"]',
      ),
    ).toHaveLength(2);
    await act(async () => {
      fireEvent.click(deck);
      fireEvent.click(deck);
    });
    expect(command).toHaveBeenCalledExactlyOnceWith(snapshot, "draw", {});
    expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(count);
    expect(
      document.querySelectorAll('.hand-card[data-draw-hidden="true"]'),
    ).toHaveLength(count);
    expect(screen.getByText(`Drawing ${count} cards…`)).toBeTruthy();
    expect(deck.disabled).toBe(true);
    expect(
      document.querySelectorAll(
        '.draw-available-indicator[data-active="true"]',
      ),
    ).toHaveLength(0);
    fireEvent.click(
      screen.getByRole("button", {
        name: "View Poppy’s board, 0 points, dealer",
      }),
    );
    expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(count);
    await act(async () =>
      vi.advanceTimersByTime(
        DRAW_FLIGHT_MS + (count - 1) * DRAW_STAGGER_MS - 1,
      ),
    );
    expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(count);
    await act(async () => vi.advanceTimersByTime(1));
    expect(document.querySelector(".draw-flight-layer")).toBeNull();
    expect(
      document.querySelectorAll('.hand-card[data-draw-hidden="true"]'),
    ).toHaveLength(0);
    const hand = within(
      screen.getByRole("region", { name: "Your private hand" }),
    );
    expect(document.querySelectorAll(".hand-card")).toHaveLength(3 + count);
    expect(
      hand.getByRole<HTMLButtonElement>("button", { name: "9 of clubs" })
        .disabled,
    ).toBe(false);
    vi.mocked(getRoom).mockResolvedValue(drawn);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(document.querySelector(".draw-flight-layer")).toBeNull();
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("deal");
  },
);

it.each([false, true])(
  "slides an accepted live draft into the server-created meld (pickup: %s)",
  async (pickup) => {
    vi.useFakeTimers();
    const before = fixture();
    before.phase = pickup ? "draw" : "play";
    before.hand.push({ ...before.hand[0], id: "spare-king", rank: "K" });
    if (pickup)
      before.discard = { ...before.hand[0], id: "top-ace", suit: "diamonds" };
    const played = [
      ...before.hand.slice(0, 3),
      ...(pickup ? [before.discard!] : []),
    ];
    const after: Snapshot = {
      ...before,
      revision: 2,
      token: "accepted-draft",
      phase: pickup ? "draw" : "play",
      pickupDrawPending: pickup,
      drawCount: pickup ? 1 : before.drawCount,
      hand: before.hand.slice(3),
      discard: pickup ? null : before.discard,
      sides: before.sides.map((side) =>
        side.id
          ? side
          : {
              ...side,
              opened: true,
              melds: [
                {
                  id: "server-new-meld",
                  creator: "you",
                  rank: "A",
                  kind: "set",
                  complete: false,
                  dirty: false,
                  bonus: 0,
                  cards: played,
                },
              ],
            },
      ),
    };
    vi.mocked(getRoom).mockResolvedValue(before);
    vi.mocked(command).mockResolvedValue(after);
    await act(async () => openRoom());
    if (pickup)
      fireEvent.click(
        screen.getByRole("button", {
          name: "Pick up and immediately play the top discard",
        }),
      );
    const hand = within(
      screen.getByRole("region", { name: "Your private hand" }),
    );
    for (const card of hand.getAllByRole("button", { name: /^A of/ }))
      fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: "Play draft",
        }),
      ),
    );
    expect(command).toHaveBeenCalledExactlyOnceWith(
      before,
      pickup ? "pickup" : "meld",
      { groups: [{ cardIds: played.map((card) => card.id), kind: "set" }] },
    );
    expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(
      played.length,
    );
    expect(
      [...document.querySelectorAll<HTMLElement>(".meld-card-flight")].every(
        (card) => card.dataset.meldId === "server-new-meld",
      ),
    ).toBe(true);
    expect(screen.getByText("Playing your draft…")).toBeTruthy();
    expect(document.querySelector(".hand-actions")).toBeNull();
    await act(async () => vi.advanceTimersByTime(MELD_FLIGHT_MS));
    expect(document.querySelector(".meld-flight-layer")).toBeNull();
    expect(document.querySelectorAll(".hand-card")).toHaveLength(1);
    expect(document.querySelector('[data-meld-hidden="true"]')).toBeNull();
  },
);

it.each([50, 90, 120])(
  "requires the %s-point opening including the discard before enabling Play draft",
  async (minimum) => {
    const before = fixture();
    before.sides[0].opening = minimum;
    const kings = Array.from({ length: minimum / 10 - 1 }, (_, index) => ({
      ...before.hand[0],
      id: `king-${String(index).padStart(2, "0")}`,
      rank: "K",
      value: 10,
    }));
    before.hand = [
      ...kings,
      { ...before.hand[0], id: "spare-four", rank: "4", value: 5 },
    ];
    before.discard = { ...kings[0], id: "top-king", suit: "diamonds" };
    vi.mocked(getRoom).mockResolvedValue(before);
    vi.mocked(command).mockResolvedValue({
      ...before,
      revision: 2,
      phase: "draw",
      pickupDrawPending: true,
      drawCount: 1,
      hand: before.hand.slice(-1),
      sides: before.sides.map((side) =>
        side.id ? side : { ...side, opened: true },
      ),
    });
    openRoom();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Pick up and immediately play the top discard",
      }),
    );
    const hand = within(
      screen.getByRole("region", { name: "Your private hand" }),
    );
    for (const card of hand
      .getAllByRole("button", { name: "K of clubs" })
      .slice(0, -1))
      fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    expect(
      (
        screen.getByRole("button", {
          name: "Play draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", {
          name: "Draw 2 cards from the stack",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    for (const card of hand.getAllByRole("button", { name: "K of clubs" }))
      fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    const play = screen.getByRole("button", {
      name: "Play draft",
    }) as HTMLButtonElement;
    expect(play.disabled).toBe(false);
    fireEvent.click(play);
    await waitFor(() =>
      expect(command).toHaveBeenCalledWith(before, "pickup", {
        groups: [
          {
            cardIds: [...kings.map((card) => card.id), "top-king"],
            kind: "set",
          },
        ],
      }),
    );
  },
);

it("restores the one-card deck prompt after reconnecting and locks both discard controls until it lands", async () => {
  vi.useFakeTimers();
  const before = fixture();
  before.pickupDrawPending = true;
  before.drawCount = 1;
  before.sides[0].opened = true;
  before.discard = { ...before.hand[0], id: "lower-discard", rank: "K" };
  const extra = { ...before.hand[0], id: "second-draw", rank: "Q" };
  const after: Snapshot = {
    ...before,
    revision: 2,
    token: "second-draw-done",
    phase: "play",
    pickupDrawPending: false,
    drawCount: 2,
    hand: [...before.hand, extra],
  };
  vi.mocked(getRoom).mockResolvedValue(before);
  vi.mocked(command).mockResolvedValue(after);
  await act(async () => openRoom());
  const deck = screen.getByRole("button", {
    name: "Draw your second card from the deck",
  }) as HTMLButtonElement;
  expect(deck.disabled).toBe(false);
  expect(deck.getAttribute("data-draw-available")).toBe("true");
  expect(document.querySelector(".draw-two")).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Pick up and immediately play the top discard",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(
    (
      screen.getByRole("button", {
        name: "Discard",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByRole("tooltip")).toBeNull();
  const discardControl = screen.getByRole("group", { name: "Discard" });
  fireEvent.mouseEnter(discardControl);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Draw your second card from the deck first.",
  );
  fireEvent.mouseLeave(discardControl);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(discardControl);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Draw your second card from the deck first.",
  );
  fireEvent.blur(discardControl);
  expect(screen.queryByRole("tooltip")).toBeNull();
  await act(async () => fireEvent.click(deck));
  expect(command).toHaveBeenCalledExactlyOnceWith(before, "draw", {});
  expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(1);
  expect(screen.getByText("Drawing 1 card…")).toBeTruthy();
  expect(document.querySelector(".draw-two")).toBeNull();
  await act(async () => vi.advanceTimersByTime(DRAW_FLIGHT_MS));
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "Q of clubs" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Discard",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(screen.queryByRole("tooltip")).toBeNull();
});

it("restores draw availability after a failed request without inventing new cards", async () => {
  vi.useFakeTimers();
  vi.mocked(command).mockRejectedValue(
    new Error("The draw could not be completed."),
  );
  await act(async () => openRoom());
  const deck = screen.getByRole<HTMLButtonElement>("button", {
    name: "Draw 2 cards from the stack",
  });
  await act(async () => fireEvent.click(deck));
  expect(screen.getByText("The draw could not be completed.")).toBeTruthy();
  expect(deck.disabled).toBe(false);
  expect(document.querySelector(".draw-flight-layer")).toBeNull();
  expect(
    document.querySelectorAll('.hand-card[data-draw-hidden="true"]'),
  ).toHaveLength(0);
  expect(document.querySelectorAll(".hand-card")).toHaveLength(3);
});

it("shows drawn cards immediately when reduced motion is preferred", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  const snapshot = fixture();
  vi.mocked(command).mockResolvedValue({
    ...snapshot,
    phase: "play",
    revision: 2,
    hand: [
      ...snapshot.hand,
      { ...snapshot.hand[0], id: "drawn-card", rank: "9" },
    ],
  });
  await act(async () => openRoom());
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Draw 2 cards from the stack" }),
    ),
  );
  expect(document.querySelector(".draw-flight-layer")).toBeNull();
  expect(
    document.querySelectorAll('.hand-card[data-draw-hidden="true"]'),
  ).toHaveLength(0);
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "9 of clubs" })
      .disabled,
  ).toBe(false);
});

it("only enables Stage meld for a valid selected group", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.hand.push({
    id: "king",
    rank: "K",
    suit: "clubs",
    value: 10,
    wild: false,
    redThree: false,
  });
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const stage = (await screen.findByRole("button", {
    name: "Stage meld",
  })) as HTMLButtonElement;
  expect(stage.disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Stage flush" })).toBeNull();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  const aces = hand.getAllByRole("button", { name: /^A of/ });
  fireEvent.click(aces[0]);
  expect(stage.disabled).toBe(true);
  fireEvent.click(aces[1]);
  expect(stage.disabled).toBe(true);
  fireEvent.click(aces[2]);
  expect(stage.disabled).toBe(false);
  fireEvent.click(hand.getByRole("button", { name: "K of clubs" }));
  expect(stage.disabled).toBe(true);
  fireEvent.click(hand.getByRole("button", { name: "K of clubs" }));
  expect(stage.disabled).toBe(false);
  fireEvent.click(stage);
  expect(stage.disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Play draft" })).toBeTruthy();
});

it.each([false, true])(
  "keeps the staged draft in the hand header and clears all staged and selected cards (opened: %s)",
  async (opened) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = opened;
    snapshot.hand.push(
      ...snapshot.hand.map((card) => ({
        ...card,
        id: `king-${card.suit}`,
        rank: "K",
        value: 10,
      })),
      {
        ...snapshot.hand[0],
        id: "tail",
        rank: "4",
        value: 5,
      },
    );
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    openRoom();
    const hand = await screen.findByRole("region", {
      name: "Your private hand",
    });
    const header = hand.querySelector(".hand-heading")!;
    const status = within(header as HTMLElement).getByRole("status");
    expect(status.textContent).toBe("");

    for (const card of within(hand).getAllByRole("button", { name: /^A of/ }))
      fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    const capsule = within(status).getByRole("group", { name: "Staged draft" });
    expect(within(capsule).getByText("1 new meld")).toBeTruthy();
    expect(capsule.querySelector("strong")?.getAttribute("aria-label")).toBe(
      opened ? "60 points" : "60 points, 50 points to open",
    );
    expect(hand.querySelectorAll(".draft-summary")).toHaveLength(1);
    expect(header.contains(capsule)).toBe(true);

    for (const card of within(hand).getAllByRole("button", { name: /^K of/ }))
      fireEvent.click(card);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    expect(within(capsule).getByText("2 new melds")).toBeTruthy();
    expect(capsule.querySelector("strong")?.getAttribute("aria-label")).toBe(
      opened ? "90 points" : "90 points, 50 points to open",
    );
    fireEvent.click(within(hand).getByRole("button", { name: "4 of clubs" }));
    fireEvent.click(
      within(capsule).getByRole("button", { name: "Clear draft" }),
    );
    expect(status.textContent).toBe("");
    expect(hand.querySelectorAll(".staged-card")).toHaveLength(0);
    expect(
      within(hand).queryByRole("button", { name: "clear selection" }),
    ).toBeNull();
    expect(
      (
        within(hand).getByRole("button", {
          name: "Play draft",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(command).not.toHaveBeenCalled();
  },
);

it("counts added physical cards across repeated stages separately from new melds", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.sides[0].melds = [
    {
      id: "existing-aces",
      creator: "you",
      kind: "set",
      rank: "A",
      cards: snapshot.hand.map((card) => ({ ...card, id: `table-${card.id}` })),
      complete: false,
      dirty: false,
      bonus: 0,
    },
  ];
  snapshot.hand.push(
    ...snapshot.hand.map((card) => ({
      ...card,
      id: `king-${card.suit}`,
      rank: "K",
      value: 10,
    })),
  );
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  const addAce = (suit: string) => {
    fireEvent.click(hand.getByRole("button", { name: `A of ${suit}` }));
    fireEvent.click(
      screen.getByRole("button", { name: "Add selected cards to A’s" }),
    );
  };
  addAce("clubs");
  const capsule = screen.getByRole("group", { name: "Staged draft" });
  expect(within(capsule).getByText("1 card added")).toBeTruthy();
  addAce("hearts");
  expect(within(capsule).getByText("2 cards added")).toBeTruthy();
  expect(within(capsule).getByLabelText("40 points")).toBeTruthy();

  for (const card of hand.getAllByRole("button", { name: /^K of/ }))
    fireEvent.click(card);
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  expect(within(capsule).getByText("1 new meld + 2 cards added")).toBeTruthy();
  expect(within(capsule).getByLabelText("70 points")).toBeTruthy();
  addAce("spades");
  expect(within(capsule).getByText("1 new meld + 3 cards added")).toBeTruthy();
  expect(within(capsule).getByLabelText("90 points")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Play draft" }).textContent).toBe(
    "Play draft",
  );
  expect(command).not.toHaveBeenCalled();
});

it("keeps the Stage meld label when existing piles match and stages a separate meld", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.sides[0].melds = [
    {
      id: "existing-aces",
      creator: "you",
      kind: "set",
      rank: "A",
      cards: snapshot.hand.map((card) => ({ ...card, id: `table-${card.id}` })),
      complete: false,
      dirty: false,
      bonus: 0,
    },
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  const aces = hand.getAllByRole("button", { name: /^A of/ });
  fireEvent.click(aces[0]);
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    screen.getByRole("button", { name: "Add selected cards to A’s" }),
  ).toBeTruthy();
  fireEvent.click(aces[1]);
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(aces[2]);
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "clear selection" }));
  expect(screen.getByRole("button", { name: "Stage meld" })).toBeTruthy();
  for (const ace of aces) fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ cardIds: snapshot.hand.map((card) => card.id), kind: "set" }],
    }),
  );
});

it("automatically stages a straight flush with the correct move type", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.hand = ["5", "6", "7"].map((rank) => ({
    id: `heart-${rank}`,
    rank,
    suit: "hearts",
    value: 5,
    wild: false,
    redThree: false,
  }));
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  for (const rank of ["7", "5", "6"])
    fireEvent.click(hand.getByRole("button", { name: `${rank} of hearts` }));
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ cardIds: ["heart-7", "heart-5", "heart-6"], kind: "run" }],
    }),
  );
});

it("includes the top discard when detecting a staged matching pile", async () => {
  const snapshot = fixture();
  snapshot.hand = snapshot.hand.slice(0, 2);
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({
    ...snapshot,
    revision: 2,
    phase: "play",
  });
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const stage = screen.getByRole("button", {
    name: "Stage meld",
  }) as HTMLButtonElement;
  expect(stage.disabled).toBe(true);
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }))
    fireEvent.click(ace);
  expect(stage.disabled).toBe(false);
  fireEvent.click(stage);
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "pickup", {
      groups: [
        { cardIds: ["ace-clubs", "ace-hearts", "discard-ace"], kind: "set" },
      ],
    }),
  );
});

it("cancels a staged pickup from the discard label and restores drawing without changing cards", async () => {
  const snapshot = fixture();
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const pickup = await screen.findByRole("button", {
    name: "Pick up and immediately play the top discard",
  });
  const draw = screen.getByRole("button", {
    name: "Draw 2 cards from the stack",
  }) as HTMLButtonElement;
  fireEvent.click(pickup);
  expect(pickup.getAttribute("aria-pressed")).toBe("true");
  expect(draw.disabled).toBe(true);
  expect(document.querySelector(".turn-message")?.textContent).toBe(
    "Play the top discard onto your board.",
  );
  expect(document.querySelector(".pickup-notice")).toBeNull();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }).slice(0, 2))
    fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  expect(document.querySelectorAll(".staged-card")).toHaveLength(2);
  expect(pickup.getAttribute("data-staged")).toBe("true");
  expect(
    document.getElementById(pickup.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toBe("STAGED");
  const cancel = screen.getByRole("button", { name: "Cancel pickup" });
  expect(cancel.closest(".draw-pile")?.contains(pickup)).toBe(true);
  fireEvent.click(cancel);
  expect(pickup.getAttribute("aria-pressed")).toBe("false");
  expect(pickup.getAttribute("data-staged")).toBe("false");
  expect(document.querySelector(".discard-face .staged-label")).toBeNull();
  expect(draw.disabled).toBe(false);
  expect(
    document.querySelectorAll(".staged-card, .hand-card .selected"),
  ).toHaveLength(0);
  expect(document.querySelectorAll(".hand-card")).toHaveLength(
    snapshot.hand.length,
  );
  expect(document.querySelector(".discard-caption")?.textContent).toContain(
    "Discard",
  );
  expect(document.querySelector(".turn-message")?.textContent).toBe(
    "Your turn. Draw 2 cards, or play the top discard.",
  );
  expect(command).not.toHaveBeenCalled();
});

it("disables incompatible hand cards during pickup and unlocks the rest after the discard is staged", async () => {
  const snapshot = fixture();
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  snapshot.hand.push(
    { ...snapshot.hand[0], id: "king", rank: "K" },
    {
      ...snapshot.hand[0],
      id: "joker",
      rank: "Joker",
      suit: "joker",
      wild: true,
    },
  );
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  const king = hand.getByRole("button", {
    name: "K of clubs",
  }) as HTMLButtonElement;
  const joker = hand.getByRole("button", {
    name: "Joker, 50 points",
  }) as HTMLButtonElement;
  expect(king.disabled).toBe(true);
  expect(king.closest(".hand-card")?.getAttribute("data-pickup-blocked")).toBe(
    "true",
  );
  expect(joker.disabled).toBe(false);
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  fireEvent.click(joker);
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(hand.getByRole("button", { name: "A of hearts" }));
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  expect(king.disabled).toBe(false);
  expect(king.closest(".hand-card")?.getAttribute("data-pickup-blocked")).toBe(
    "false",
  );
  expect(command).not.toHaveBeenCalled();
});

it("outlines legal existing melds as soon as the discard is selected and stages it without hand selection", async () => {
  const snapshot = fixture();
  snapshot.sides[0].opened = true;
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  snapshot.sides[0].melds = [3, 6].map((count) => ({
    id: `aces-${count}`,
    creator: "you",
    kind: "set",
    rank: "A",
    complete: false,
    dirty: false,
    bonus: 0,
    cards: Array.from({ length: count }, (_, index) => ({
      ...snapshot.hand[0],
      id: `table-${count}-${index}`,
    })),
  }));
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const target = screen.getByRole("button", {
    name: "Add selected cards to A’s",
  });
  expect(target.closest(".meld-pile")?.classList.contains("legal-target")).toBe(
    true,
  );
  expect(document.querySelectorAll(".meld-pile.legal-target")).toHaveLength(1);
  fireEvent.click(target);
  expect(document.querySelector(".meld-staged-count")?.textContent).toBe(" +1");
  expect(screen.getByRole("button", { name: "Play draft" })).toBeTruthy();
});

it("never offers the discard as an addition to a six-card pile", async () => {
  const snapshot = fixture();
  snapshot.sides[0].opened = true;
  snapshot.sides[0].melds = [
    {
      id: "six-aces",
      creator: "you",
      kind: "set",
      rank: "A",
      complete: false,
      dirty: false,
      bonus: 0,
      cards: Array.from({ length: 6 }, (_, index) => ({
        ...snapshot.hand[0],
        id: `table-ace-${index}`,
      })),
    },
  ];
  snapshot.discard = {
    ...snapshot.hand[0],
    id: "discard-ace",
    suit: "diamonds",
  };
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  fireEvent.click(
    await screen.findByRole("button", {
      name: "Pick up and immediately play the top discard",
    }),
  );
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }).slice(0, 2))
    fireEvent.click(ace);
  expect(
    screen.queryByRole("button", { name: "Add selected cards to A’s" }),
  ).toBeNull();
  const stack = screen.getByRole("button", { name: "Inspect A’s, 6 cards" });
  expect(
    document.getElementById(stack.getAttribute("aria-describedby")!)
      ?.textContent,
  ).toContain("cannot take the discard");
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
});

it("only highlights piles with a natural majority and includes earlier draft additions in validation", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  const eights = ["clubs", "hearts", "spades"].map((suit) => ({
    id: `table-8-${suit}`,
    rank: "8",
    suit,
    value: 5,
    wild: false,
    redThree: false,
  }));
  snapshot.sides[0].melds = [
    {
      id: "eights",
      creator: "you",
      kind: "set",
      rank: "8",
      cards: [
        ...eights,
        ...["table-two-1", "table-two-2"].map((id) => ({
          id,
          rank: "2",
          suit: "clubs",
          value: 20,
          wild: true,
          redThree: false,
        })),
      ],
      complete: false,
      dirty: true,
      bonus: 0,
    },
  ];
  snapshot.hand = [
    { ...eights[0], id: "extra-eight" },
    {
      id: "wild-two",
      rank: "2",
      suit: "hearts",
      value: 20,
      wild: true,
      redThree: false,
    },
    ...snapshot.hand,
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "Stage meld" })).toBeTruthy();
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  fireEvent.click(hand.getByRole("button", { name: "8 of clubs" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to 8’s" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "2 of hearts" }));
  expect(
    screen.getByRole("button", { name: "Add selected cards to 8’s" }),
  ).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  expect(
    screen.queryByRole("button", { name: /^Add selected cards to/ }),
  ).toBeNull();
});

it.each(
  [false, true].flatMap((opened) =>
    [1, 2, 3, 6].map((count) => ({ opened, count })),
  ),
)(
  "handles $count selected red threes with the appropriate controls (opened: $opened)",
  async ({ opened, count }) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = opened;
    const reds = Array.from({ length: count }, (_, index) => ({
      id: `red-three-${index}`,
      rank: "3",
      suit: index % 2 ? "hearts" : "diamonds",
      value: -300,
      wild: false,
      redThree: true,
    }));
    snapshot.hand.push(...reds);
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
    openRoom();
    const hand = within(
      await screen.findByRole("region", { name: "Your private hand" }),
    );
    for (const card of hand.getAllByRole("button", {
      name: /3 of (hearts|diamonds), red three/,
    }))
      fireEvent.click(card);
    if (count === 1) {
      expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Replace from stack" }),
      ).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Lay down for your side" }),
      ).toBeNull();
      const replace = screen.getByRole("button", {
        name: "Replace",
      }) as HTMLButtonElement;
      expect(replace.disabled).toBe(false);
      fireEvent.click(replace);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: [reds[0].id],
          expose: false,
        }),
      );
      return;
    }
    const expose = screen.getByRole("button", {
      name: "Lay down for your side",
    }) as HTMLButtonElement;
    const replace = screen.getByRole("button", {
      name: "Replace from stack",
    }) as HTMLButtonElement;
    expect(expose.disabled).toBe(!opened);
    expect(replace.disabled).toBe(false);
    if (opened) {
      fireEvent.click(expose);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: expect.arrayContaining(reds.map((card) => card.id)),
          expose: true,
        }),
      );
    } else {
      expect(
        screen.getByText(
          "Complete your side’s opening meld to lay down red threes.",
        ),
      ).toBeTruthy();
      fireEvent.click(expose);
      expect(command).not.toHaveBeenCalled();
      fireEvent.click(replace);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: expect.arrayContaining(reds.map((card) => card.id)),
          expose: false,
        }),
      );
    }
    expect(vi.mocked(command).mock.calls[0][2]?.cardIds).toHaveLength(count);
  },
);

it("only offers red-three actions when every selected card is a red three", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.hand.push(
    ...["diamonds", "hearts"].map((suit) => ({
      id: `red-${suit}`,
      rank: "3",
      suit,
      value: -300,
      wild: false,
      redThree: true,
    })),
  );
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(
    hand.getByRole("button", { name: "3 of diamonds, red three" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Lay down for your side",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  expect(
    screen.queryByRole("button", { name: "Lay down for your side" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Replace from stack" }),
  ).toBeNull();
  expect(
    (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(
    hand.getByRole("button", { name: "3 of diamonds, red three" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  expect(
    (screen.getByRole("button", { name: "Discard" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
});

it("keeps a staged opening intact when selecting and clearing a red three", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.hand.push({
    id: "red-three",
    rank: "3",
    suit: "hearts",
    value: -300,
    wild: false,
    redThree: true,
  });
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }))
    fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  const replace = screen.getByRole("button", {
    name: "Replace",
  }) as HTMLButtonElement;
  expect(replace.disabled).toBe(true);
  fireEvent.click(replace);
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "clear selection" }));
  expect(hand.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "clear selection" })).toBeNull();
  expect(screen.getByText("Select cards to play")).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Play draft" })).toBeTruthy();
});
