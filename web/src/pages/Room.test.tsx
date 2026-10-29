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
import {
  DRAW_FLIGHT_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
} from "../hooks/useDrawMotion";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import party from "party-js";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => sound,
}));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("party-js", () => ({
  default: { confetti: vi.fn(), variation: { range: () => 90 } },
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

it.each([0, 1, 3])(
  "uses the correct card count wording for %s cards",
  async (count) => {
    const snapshot = fixture();
    snapshot.hand = snapshot.hand.slice(0, count);
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    openRoom();
    const hand = within(
      await screen.findByRole("region", { name: "Your private hand" }),
    );
    expect(
      hand.getByText(`${count} ${count === 1 ? "card" : "cards"}`, {
        exact: true,
      }),
    ).toBeTruthy();
  },
);

function partnershipFixture(capacity = 6): Snapshot {
  const snapshot = fixture();
  const names =
    capacity === 6
      ? ["You", "Maya", "Riley", "Alex", "Sam", "Jordan"]
      : ["You", "Maya", "Alex", "Sam"];
  const sideCount = capacity / 2;
  snapshot.capacity = capacity;
  snapshot.scoringMode = "partnership";
  snapshot.phase = "play";
  snapshot.dealerId = "sam";
  snapshot.players = names.map((name, index) => ({
    ...snapshot.players[0],
    id: name.toLowerCase(),
    name,
    team: index % sideCount,
    bot: index > 0,
    redThrees: [],
  }));
  snapshot.sides = Array.from({ length: sideCount }, (_, id) => ({
    ...snapshot.sides[0],
    id,
    name: snapshot.players
      .filter((player) => player.team === id)
      .map((player) => player.name)
      .join(" & "),
    score: 1250 - id * 100,
    opened: true,
    melds: [],
  }));
  snapshot.sides[0].melds = [
    { id: "your-kings", creator: "you", rank: "K", count: 3 },
    { id: "partner-aces", creator: "alex", rank: "A", count: 3 },
    { id: "partner-book", creator: "alex", rank: "9", count: 7 },
  ].map(({ id, creator, rank, count }) => ({
    id,
    creator,
    rank,
    kind: "set",
    complete: count >= 7,
    dirty: false,
    bonus: count >= 7 ? 500 : 0,
    cards: Array.from({ length: count }, (_, i) => ({
      ...snapshot.hand[0],
      id: `${id}-${i}`,
      rank,
    })),
  }));
  const red = (id: string) => ({
    ...snapshot.hand[0],
    id,
    rank: "3",
    suit: "hearts",
    redThree: true,
    value: -300,
  });
  snapshot.players[0].redThrees = [red("your-red")];
  snapshot.players[sideCount].redThrees = [
    red("partner-red-1"),
    red("partner-red-2"),
  ];
  return snapshot;
}

it.each([4, 6])(
  "combines both partners' piles and red threes into one board for %i players",
  async (capacity) => {
    const snapshot = partnershipFixture(capacity);
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    openRoom();
    const board = await screen.findByRole("region", { name: "Your board" });
    const nav = within(board).getByRole("navigation", { name: "Team boards" });
    expect(within(nav).getAllByRole("button")).toHaveLength(capacity / 2);
    expect(nav.querySelectorAll(".board-player-score")).toHaveLength(
      capacity / 2,
    );
    expect(nav.querySelector('[aria-current="step"]')?.textContent).toBe("You");
    expect(
      nav.querySelector('[data-player-id="sam"] .dealer-marker'),
    ).not.toBeNull();
    expect(board.querySelectorAll(".player-lane")).toHaveLength(1);
    expect(board.querySelector(".lane-heading")).toBeNull();
    expect(board.querySelectorAll(".meld-pile")).toHaveLength(3);
    expect(
      within(board).getAllByRole("group", { name: "Completed books" }),
    ).toHaveLength(1);
    expect(
      within(board).getAllByRole("group", { name: "Open piles" }),
    ).toHaveLength(1);
    const reds = within(
      within(board).getByRole("group", { name: "Completed books" }),
    ).getByRole("group", { name: "Red threes" });
    expect(reds.querySelectorAll(".card")).toHaveLength(3);
    expect(
      within(board).getAllByRole("group", { name: "Red threes" }),
    ).toHaveLength(1);
    const hand = within(
      screen.getByRole("region", { name: "Your private hand" }),
    );
    fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
    expect(
      board.querySelector('[data-meld-id="partner-aces"].legal-target'),
    ).not.toBeNull();
    fireEvent.click(
      within(board).getByRole("button", {
        name: "Add selected cards to A’s",
      }),
    );
    expect(command).not.toHaveBeenCalled();
    expect(
      screen.getByRole("group", { name: "Staged draft" }).textContent,
    ).toContain("1");
  },
);

it("moves the turn outline between individual partners without rearranging their shared board", async () => {
  vi.useFakeTimers();
  const snapshot = partnershipFixture();
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  const nav = screen.getByRole("navigation", { name: "Team boards" });
  const names = [...nav.querySelectorAll("[data-player-id]")].map((el) =>
    el.getAttribute("data-player-id"),
  );
  const next = {
    ...snapshot,
    revision: 2,
    token: "partner-turn",
    actorId: "alex",
  };
  vi.mocked(getRoom).mockResolvedValue(next);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(
    nav.querySelector('[aria-current="step"]')?.getAttribute("data-player-id"),
  ).toBe("alex");
  expect(
    [...nav.querySelectorAll("[data-player-id]")].map((el) =>
      el.getAttribute("data-player-id"),
    ),
  ).toEqual(names);
  expect(
    screen
      .getByRole("region", { name: "Your board" })
      .querySelectorAll(".player-lane"),
  ).toHaveLength(1);
  const other = within(nav).getByRole("button", {
    name: /^View Maya & Sam’s board/,
  });
  fireEvent.click(other);
  expect(other.getAttribute("aria-pressed")).toBe("true");
  expect(
    nav.querySelector('[aria-current="step"]')?.getAttribute("data-player-id"),
  ).toBe("alex");
  expect(
    screen.getByRole("region", { name: "Maya & Sam’s board" }),
  ).toBeTruthy();
  expect(screen.getByRole("region", { name: "Maya’s hand" })).toBeTruthy();
  const after = { ...next, revision: 3, token: "sam-turn", actorId: "sam" };
  vi.mocked(getRoom).mockResolvedValue(after);
  await act(async () => vi.advanceTimersByTime(3000));
  expect(
    nav.querySelector('[aria-current="step"]')?.getAttribute("data-player-id"),
  ).toBe("sam");
  expect(
    nav.querySelector('[data-player-id="sam"] .dealer-marker'),
  ).not.toBeNull();
  fireEvent.click(
    within(nav).getByRole("button", { name: /^View You & Alex’s board/ }),
  );
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  expect(
    nav.querySelector('[aria-current="step"]')?.getAttribute("data-player-id"),
  ).toBe("sam");
  fireEvent.click(screen.getByRole("checkbox", { name: "Follow turn" }));
  expect(
    screen.getByRole("region", { name: "Maya & Sam’s board" }),
  ).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
});

it("lands a partner's red-three play in the team's combined pile", async () => {
  vi.useFakeTimers();
  const snapshot = partnershipFixture();
  snapshot.actorId = "alex";
  const partner = snapshot.players.find((player) => player.id === "alex")!;
  const incomingRed = partner.redThrees.pop()!;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  const next = {
    ...snapshot,
    revision: 2,
    token: "partner-red",
    players: snapshot.players.map((player) =>
      player.id === "alex"
        ? { ...player, redThrees: [...player.redThrees, incomingRed] }
        : player,
    ),
  };
  vi.mocked(getRoom).mockResolvedValue(next);
  await act(async () => vi.advanceTimersByTime(3000));
  const reds = screen.getByRole("group", { name: "Red threes" });
  expect(reds.querySelectorAll(".card")).toHaveLength(3);
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(1);
  expect(
    reds
      .querySelector('[data-meld-hidden="true"]')
      ?.getAttribute("data-card-id"),
  ).toBe(incomingRed.id);
  await act(async () => vi.advanceTimersByTime(MELD_FLIGHT_MS));
  expect(document.querySelector(".meld-flight-layer")).toBeNull();
  expect(reds.querySelector('[data-meld-hidden="true"]')).toBeNull();
  expect(reds.querySelectorAll(".card")).toHaveLength(3);
});

it.each([false, true])(
  "settles debt and opens round results even while browsing (skip animation: %s)",
  async (skipAnimation) => {
    vi.useFakeTimers();
    const source = fixture();
    source.phase = "scoring";
    source.actorId = "bot";
    source.hand = source.hand.slice(0, 1);
    source.scoringFoot = [];
    source.sides[0].opened = true;
    source.players[0].redThrees = Array.from({ length: 3 }, (_, i) => ({
      ...source.hand[0],
      id: `red-${i}`,
      rank: "3",
      suit: "hearts",
      redThree: true,
      value: -300,
    }));
    source.scoring = {
      team: 0,
      debt: 20,
      remaining: 20,
      canceled: [],
      usedPiles: [],
      broken: [],
      confirmed: false,
      revision: 0,
      reason: "Poppy went out.",
      confirmedSides: [],
      debtBreakdown: [],
      redThreeQualified: true,
      options: [
        {
          id: "reds:0",
          label: "Red threes",
          points: 15,
          bonusAtRisk: 900,
          cardIds: source.players[0].redThrees.map((card) => card.id),
          redThree: true,
        },
      ],
      score: {
        team: 0,
        cards: 15,
        debt: 20,
        redThrees: 900,
        redCredit: 0,
        books: 0,
        goingOut: 0,
        total: 895,
        canceled: [],
        lostBooks: 0,
        broken: [],
        uncovered: 20,
      },
    };
    vi.mocked(getRoom).mockResolvedValue(source);
    const paid = {
      ...source,
      revision: 2,
      token: "paid",
      scoring: {
        ...source.scoring,
        revision: 1,
        remaining: 5,
        usedPiles: ["reds:0"],
        options: [],
        score: {
          ...source.scoring.score,
          total: -5,
          redThrees: 0,
          redCredit: 15,
          cards: 0,
        },
      },
    };
    const result: Snapshot = {
      ...paid,
      revision: 3,
      phase: "round_over",
      scoring: null,
      history: [
        {
          round: source.round,
          reason: source.scoring.reason,
          scores: [paid.scoring.score],
        },
      ],
      sides: paid.sides.map((side) => ({
        ...side,
        score: side.score + (side.id === 0 ? paid.scoring.score.total : 0),
      })),
    };
    vi.mocked(command).mockResolvedValueOnce(paid).mockResolvedValue(result);
    openRoom();
    await act(async () => {});
    expect(
      screen.getByRole("group", { name: "Running round score" }),
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(
      screen.queryByRole("button", {
        name: /Pause count|Confirm score|Cover automatically|cover debt|Use this pile/,
      }),
    ).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Skip animation" })
        .closest(".hand-heading"),
    ).not.toBeNull();
    expect(command).toHaveBeenCalledExactlyOnceWith(source, "score_auto", {});
    await act(async () => vi.advanceTimersByTime(1200));
    expect(
      screen.getByText(
        "Red threes open for reconciliation. Each is worth 5 points.",
      ),
    ).toBeTruthy();
    expect(command).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    if (skipAnimation) {
      fireEvent.click(screen.getByRole("button", { name: "Skip animation" }));
      await act(async () => {});
      expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Skip animation" }),
      ).toBeNull();
      expect(
        screen.queryByRole("group", { name: "Running round score" }),
      ).toBeNull();
    }
    for (
      let step = 0;
      step < 40 && !screen.queryByRole("dialog", { name: "Score sheet" });
      step++
    )
      await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
    expect(command).toHaveBeenLastCalledWith(paid, "score_confirm", {});
    expect(command).toHaveBeenCalledTimes(2);
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
    expect(document.querySelector(".live-scoring")).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Running round score" }),
    ).toBeNull();
    expect(document.querySelector(".turn-message")?.textContent).toBe(
      "End of round board state",
    );
    fireEvent.click(screen.getByRole("button", { name: "View your board" }));
    expect(
      screen
        .getByRole("region", { name: "Your Cards" })
        .querySelectorAll(".hand-card"),
    ).toHaveLength(source.hand.length);
    expect(
      screen
        .getByRole("button", { name: "Red threes, 3 cards" })
        .classList.contains("indexed-stack"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
    await act(async () => vi.advanceTimersByTime(6000));
    expect(command).toHaveBeenCalledTimes(2);
  },
);

it.each(["individual", "partnership"] as const)(
  "automatically retries debt settlement for online %s scoring without showing choices",
  async (scoringMode) => {
    vi.useFakeTimers();
    const source = fixture();
    source.playMode = "online";
    source.scoringMode = scoringMode;
    source.phase = "scoring";
    const score = {
      team: 0,
      cards: 60,
      debt: 20,
      redThrees: 0,
      redCredit: 0,
      books: 0,
      goingOut: 0,
      total: 40,
      canceled: [],
      lostBooks: 0,
      broken: [],
      uncovered: 20,
    };
    source.scoring = {
      team: 0,
      debt: 20,
      remaining: 20,
      canceled: [],
      usedPiles: [],
      broken: [],
      confirmed: false,
      revision: 0,
      reason: "The stack ran out.",
      confirmedSides: [],
      debtBreakdown: [],
      score,
      options: [
        {
          id: "open-aces",
          label: "Aces",
          points: 60,
          bonusAtRisk: 0,
          cardIds: source.hand.map((card) => card.id),
          redThree: false,
        },
      ],
    };
    const paid = {
      ...source,
      revision: 2,
      scoring: {
        ...source.scoring,
        revision: 1,
        remaining: 0,
        options: [],
        usedPiles: ["open-aces"],
      },
    };
    const result: Snapshot = {
      ...paid,
      revision: 3,
      phase: "round_over",
      scoring: null,
      history: [
        { round: source.round, reason: source.scoring.reason, scores: [score] },
      ],
    };
    vi.mocked(getRoom).mockResolvedValue(source);
    vi.mocked(command)
      .mockRejectedValueOnce(new Error("Reconnecting to the table…"))
      .mockResolvedValueOnce(paid)
      .mockResolvedValue(result);
    openRoom();
    await act(async () => {});
    expect(command).toHaveBeenCalledExactlyOnceWith(source, "score_auto", {});
    expect(
      screen.queryByRole("button", {
        name: /Cover automatically|Use this pile|cover debt|confirm.*score/i,
      }),
    ).toBeNull();
    expect(
      within(
        screen.getByRole("dialog", { name: "Settle your side’s score" }),
      ).getByRole("status").textContent,
    ).toContain("Covering leftover cards automatically");
    await act(async () => vi.advanceTimersByTime(1499));
    expect(command).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(command).toHaveBeenCalledTimes(3);
    expect(command).toHaveBeenNthCalledWith(2, source, "score_auto", {});
    expect(command).toHaveBeenLastCalledWith(paid, "score_confirm", {});
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
  },
);

it.each(["round-partners", "game-partners"])(
  "automatically submits a settled %s score and retries a failed request",
  async (id) => {
    vi.useFakeTimers();
    const result = endingSnapshot(
      ENDING_EXAMPLES.find((item) => item.id === id)!,
    );
    result.code = "REVIEW";
    const score = result.history.at(-1)!.scores[0];
    const source: Snapshot = {
      ...result,
      phase: "scoring",
      scoring: {
        team: 0,
        debt: 0,
        remaining: 0,
        canceled: [],
        usedPiles: [],
        broken: [],
        confirmed: false,
        revision: 0,
        reason: result.message,
        confirmedSides: [],
        debtBreakdown: [],
        options: [],
        score,
      },
    };
    vi.mocked(getRoom).mockResolvedValue(source);
    vi.mocked(command)
      .mockRejectedValueOnce(new Error("Reconnecting to the table…"))
      .mockResolvedValue(result);
    openRoom();
    await act(async () => {});
    expect(command).toHaveBeenCalledExactlyOnceWith(
      source,
      "score_confirm",
      {},
    );
    expect(
      screen.queryByRole("button", { name: /confirm.*score/i }),
    ).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
    await act(async () => vi.advanceTimersByTime(1499));
    expect(command).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTime(1));
    expect(command).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
  },
);

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
    within(closed).queryByRole("group", { name: "Red threes" }),
  ).toBeNull();
  expect(within(open).getByRole("group", { name: "Red threes" })).toBeTruthy();
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
it.each([false, true])(
  "only outlines a completed book for a wild when it is already dirty (dirty: %s)",
  async (dirty) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = true;
    const ace = snapshot.hand[0];
    snapshot.hand.push({
      ...ace,
      id: "hand-joker",
      rank: "Joker",
      suit: "joker",
      value: 50,
      wild: true,
    });
    snapshot.sides[0].melds = [
      {
        id: "closed",
        creator: "you",
        kind: "set",
        rank: "A",
        complete: true,
        dirty,
        bonus: dirty ? 300 : 500,
        cards: Array.from({ length: 7 }, (_, i) => ({
          ...ace,
          id: `book-${i}`,
          rank: dirty && i >= 5 ? "2" : "A",
          wild: dirty && i >= 5,
        })),
      },
    ];
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    openRoom();
    fireEvent.click(
      await screen.findByRole("button", { name: "Joker, 50 points" }),
    );
    expect(
      Boolean(document.querySelector('[data-meld-id="closed"].legal-target')),
    ).toBe(dirty);
    expect(
      screen.queryByRole("button", { name: "Add selected cards to A’s" }) !==
        null,
    ).toBe(dirty);
  },
);

it("does not allow a later staged wild after an earlier addition would close a clean book", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  const ace = snapshot.hand[0];
  snapshot.hand.push({
    ...ace,
    id: "hand-joker",
    rank: "Joker",
    suit: "joker",
    value: 50,
    wild: true,
  });
  snapshot.sides[0].melds = [
    {
      id: "six",
      creator: "you",
      kind: "set",
      rank: "A",
      complete: false,
      dirty: false,
      bonus: 0,
      cards: Array.from({ length: 6 }, (_, i) => ({
        ...ace,
        id: `table-${i}`,
      })),
    },
  ];
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  openRoom();
  fireEvent.click(await screen.findByRole("button", { name: "A of clubs" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to A’s" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Joker, 50 points" }));
  expect(
    document.querySelector('[data-meld-id="six"].legal-target'),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Add selected cards to A’s" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Joker, 50 points" }));
  expect(
    document.querySelector('[data-meld-id="six"].legal-target'),
  ).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
});

beforeEach(() => {
  sound.play.mockClear();
  vi.mocked(party.confetti).mockClear();
  vi.mocked(getRoom).mockResolvedValue(fixture());
  vi.mocked(command).mockReset();
});
afterEach(() => vi.useRealTimers());

it.each([
  { before: 2, seat: 1 },
  { before: 0, seat: 0 },
])(
  "celebrates a live board's red threes growing from $before to three (seat $seat)",
  async ({ before, seat }) => {
    vi.useFakeTimers();
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.actorId = snapshot.players[seat].id;
    const reds = Array.from({ length: 3 }, (_, index) => ({
      id: `celebration-red-${index}`,
      rank: "3",
      suit: "hearts",
      value: -300,
      wild: false,
      redThree: true,
    }));
    snapshot.players[seat].redThrees = reds.slice(0, before);
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    await act(async () => openRoom());
    expect(party.confetti).not.toHaveBeenCalled();
    vi.mocked(getRoom).mockResolvedValue({
      ...snapshot,
      revision: 2,
      players: snapshot.players.map((player, index) =>
        index === seat ? { ...player, redThrees: reds } : player,
      ),
    });
    await act(async () => vi.advanceTimersByTime(3000));
    await act(async () => vi.advanceTimersByTime(20));
    const board = screen.getByRole("region", {
      name: seat ? "Poppy’s board" : "Your board",
    });
    expect(
      within(
        within(board).getByRole("group", { name: "Completed books" }),
      ).getByRole("group", { name: "Red threes" }),
    ).toBeTruthy();
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
    expect(party.confetti).toHaveBeenCalledExactlyOnceWith(
      board.querySelector(".tableau-heading"),
      { count: 90 },
    );
    await act(async () => vi.advanceTimersByTime(3000));
    expect(sound.play).toHaveBeenCalledTimes(1);
    expect(party.confetti).toHaveBeenCalledTimes(1);
  },
);

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

it("keeps visual inactivity nudges for online games without repeating the turn sound", async () => {
  vi.useFakeTimers();
  const snapshot = fixture();
  snapshot.playMode = "online";
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => openRoom());
  await act(async () => vi.advanceTimersByTime(15_000));
  expect(sound.play).not.toHaveBeenCalledWith("notification");
  expect(
    document.querySelector(".turn-message.inactivity-shake"),
  ).not.toBeNull();
});

it("browses individual boards with their concealed hands and a real follow checkbox", async () => {
  openRoom();
  const ownBoard = await screen.findByRole("region", { name: "Your board" });
  expect(within(ownBoard).getByRole("heading", { name: "You" })).toBeTruthy();
  const follow = screen.getByRole("checkbox", {
    name: "Follow turn",
  }) as HTMLInputElement;
  expect(follow.checked).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(follow.checked).toBe(true);
  expect(
    screen
      .getByRole("region", { name: "Poppy’s hand" })
      .querySelectorAll(".public-hand-cards .card"),
  ).toHaveLength(11);
  fireEvent.keyDown(screen.getByRole("region", { name: "Poppy’s board" }), {
    key: "ArrowLeft",
  });
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  fireEvent.click(follow);
  expect(follow.checked).toBe(false);
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
  expect(screen.getByRole("region", { name: "Poppy’s hand" })).toBeTruthy();
  fireEvent.click(you);
  expect(
    within(screen.getByRole("region", { name: "Your private hand" }))
      .getByRole("button", { name: "A of clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.click(poppy);
  expect(
    (screen.getByRole("checkbox", { name: "Follow turn" }) as HTMLInputElement)
      .checked,
  ).toBe(true);
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

it("disables other player tokens before choosing a hand and keeps your private choice visible", async () => {
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
  const other = nav.getByRole<HTMLButtonElement>("button", {
    name: /^View Poppy’s board/,
  });
  expect(other.disabled).toBe(true);
  fireEvent.click(other);
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /Play pile 1/ })).toBeTruthy();
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
  fireEvent.click(within(menu).getByRole("button", { name: "Concede" }));
  expect(menu.open).toBe(false);
  const dialog = screen.getByRole("dialog", { name: "Concede" });
  expect(
    within(dialog).getByText("Are you sure you want to concede?"),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Stay" }));
  expect(screen.queryByRole("dialog", { name: "Concede" })).toBeNull();
});

it("keeps a live round's waiting button visible when hiding and restoring results", async () => {
  const source = {
    ...endingSnapshot(
      ENDING_EXAMPLES.find((example) => example.id === "round-partners")!,
    ),
    code: "REVIEW",
  };
  vi.mocked(getRoom).mockResolvedValue(source);
  const ready = {
    ...source,
    revision: source.revision + 1,
    players: source.players.map((player) =>
      player.id === source.viewerId ? { ...player, ready: true } : player,
    ),
  };
  vi.mocked(command).mockResolvedValue(ready);
  openRoom();
  const next = await screen.findByRole("button", { name: "Next Round" });
  await waitFor(() => expect(next.hasAttribute("disabled")).toBe(false));
  fireEvent.click(next);
  await screen.findByRole("button", { name: "Waiting for players..." });
  expect(command).toHaveBeenCalledWith(source, "next_round", {});
  expect(document.querySelector(".score-sheet-leaving")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  expect(document.querySelector(".turn-message")?.textContent).toBe(
    "End of round board state",
  );
  fireEvent.click(screen.getByRole("button", { name: "Show results" }));
  expect(
    screen.getByRole("button", { name: "Waiting for players..." }),
  ).toBeTruthy();
  expect(command).toHaveBeenCalledTimes(1);
});

it.each(["game-win", "game-loss", "game-partners"])(
  "plays the ending sound once for %s and leaves for the correct destination",
  async (id) => {
    vi.useFakeTimers();
    const result = {
      ...endingSnapshot(ENDING_EXAMPLES.find((example) => example.id === id)!),
      code: "REVIEW",
    };
    vi.mocked(getRoom).mockResolvedValue(result);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={["/room/REVIEW"]}>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
            <Route path="/" element={<p>Home destination</p>} />
            <Route path="/play" element={<p>Play destination</p>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    const endingCues = () =>
      sound.play.mock.calls.filter(([cue]) => cue === "win");
    expect(screen.getByRole("heading", { name: "FINAL SCORES" })).toBeTruthy();
    expect(endingCues()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(document.querySelector(".turn-message")?.textContent).toBe(
      "End of round board state",
    );
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    vi.mocked(getRoom).mockResolvedValue({ ...result, revision: 2 });
    await act(async () => vi.advanceTimersByTime(3000));
    expect(endingCues()).toHaveLength(1);

    const nextGame = { ...fixture(), revision: 3 };
    vi.mocked(getRoom).mockResolvedValue(nextGame);
    vi.mocked(command).mockResolvedValue(nextGame);
    fireEvent.click(screen.getByRole("button", { name: "Play Again" }));
    await act(async () => vi.advanceTimersByTime(240));
    expect(endingCues()).toHaveLength(1);
    const nextResult = { ...result, revision: 4 };
    vi.mocked(getRoom).mockResolvedValue(nextResult);
    await act(async () => vi.advanceTimersByTime(3000));
    expect(screen.getByRole("heading", { name: "FINAL SCORES" })).toBeTruthy();
    expect(endingCues()).toHaveLength(2);

    vi.mocked(command).mockResolvedValue(nextResult);
    await act(async () =>
      fireEvent.click(
        screen.getByRole("button", {
          name: result.playMode === "practice" ? "Home" : "Leave Lobby",
        }),
      ),
    );
    expect(command).toHaveBeenLastCalledWith(nextResult, "leave", {});
    expect(
      screen.getByText(
        result.playMode === "practice"
          ? "Home destination"
          : "Play destination",
      ),
    ).toBeTruthy();
  },
);

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
    fireEvent.click(screen.getByRole("button", { name: /^View your board,/ }));
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
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
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
    sound.play.mockClear();
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
    expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
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
  expect(screen.queryByRole("button", { name: "Stage meld" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
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

it.each(
  ["Joker", "2"].flatMap((wild) =>
    [false, true].map((wildFirst) => ({ wild, wildFirst })),
  ),
)(
  "stages and submits the discarded king with one king and $wild (wild first: $wildFirst)",
  async ({ wild, wildFirst }) => {
    const snapshot = fixture();
    snapshot.sides[0].opened = true;
    const king = { ...snapshot.hand[0], id: "hand-king", rank: "K", value: 10 };
    const wildCard = {
      ...king,
      id: "hand-wild",
      rank: wild,
      suit: wild === "Joker" ? "joker" : "clubs",
      value: wild === "Joker" ? 50 : 20,
      wild: true,
    };
    snapshot.hand = [king, wildCard, { ...king, id: "ten", rank: "10" }];
    snapshot.discard = { ...king, id: "discard-king", suit: "hearts" };
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
    openRoom();
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Pick up and immediately play the top discard",
      }),
    );
    const hand = within(
      screen.getByRole("region", { name: "Your private hand" }),
    );
    const kingButton = hand.getByRole<HTMLButtonElement>("button", {
      name: "K of clubs",
    });
    const wildButton = hand.getByRole<HTMLButtonElement>("button", {
      name: wild === "Joker" ? "Joker, 50 points" : "2 of clubs",
    });
    expect(kingButton.disabled).toBe(false);
    expect(wildButton.disabled).toBe(false);
    expect(
      hand.getByRole<HTMLButtonElement>("button", { name: "10 of clubs" })
        .disabled,
    ).toBe(true);
    const stage = screen.getByRole<HTMLButtonElement>("button", {
      name: "Stage meld",
    });
    const buttons = wildFirst
      ? [wildButton, kingButton]
      : [kingButton, wildButton];
    fireEvent.click(buttons[0]);
    expect(stage.disabled).toBe(true);
    fireEvent.click(buttons[1]);
    expect(stage.disabled).toBe(false);
    fireEvent.click(stage);
    fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
    await waitFor(() =>
      expect(command).toHaveBeenCalledWith(snapshot, "pickup", {
        groups: [
          {
            cardIds: [
              ...(wildFirst ? [wildCard.id, king.id] : [king.id, wildCard.id]),
              "discard-king",
            ],
            kind: "set",
          },
        ],
      }),
    );
  },
);

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
  ).toBe(false);
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
  const stack = screen.getByRole("group", { name: "A’s, 6 cards" });
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
    [1, 2, 3, 6].flatMap((count) =>
      (opened
        ? ["Stage meld", "Add selected cards to red threes", "Replace"]
        : ["Replace"]
      ).map((control) => ({ opened, count, control })),
    ),
  ),
)(
  "handles $count selected red threes using $control (opened: $opened)",
  async ({ opened, count, control }) => {
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
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Replace from stack" }),
    ).toBeNull();
    expect(screen.queryByText("Red threes:")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Lay down for your side" }),
    ).toBeNull();
    const replace = screen.getByRole("button", {
      name: "Replace",
    }) as HTMLButtonElement;
    expect(replace.disabled).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Stage meld" })
        .disabled,
    ).toBe(!opened);
    if (opened && control !== "Replace") {
      const target = screen.getByRole("button", {
        name: "Add selected cards to red threes",
      });
      expect(target.closest(".legal-target")).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: control }));
      expect(command).not.toHaveBeenCalled();
      expect(hand.getAllByRole("button", { name: /red three/ })).toHaveLength(
        count,
      );
      expect(
        screen.getByRole("group", { name: "Staged draft" }).textContent,
      ).not.toContain("-300");
      fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "meld", {
          groups: [
            {
              cardIds: expect.arrayContaining(reds.map((card) => card.id)),
              redThree: true,
            },
          ],
        }),
      );
    } else {
      if (!opened) {
        expect(
          screen.queryByRole("button", {
            name: "Add selected cards to red threes",
          }),
        ).toBeNull();
        expect(
          screen.getByText(
            "Complete your side’s opening meld to lay down red threes.",
          ),
        ).toBeTruthy();
      }
      fireEvent.click(replace);
      await waitFor(() =>
        expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
          cardIds: expect.arrayContaining(reds.map((card) => card.id)),
          expose: false,
        }),
      );
    }
    if (control === "Replace")
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
    screen.getByRole("button", { name: "Add selected cards to red threes" }),
  ).toBeTruthy();
  fireEvent.click(hand.getByRole("button", { name: "A of clubs" }));
  expect(
    screen.queryByRole("button", { name: "Add selected cards to red threes" }),
  ).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Replace from stack" }),
  ).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Stage meld" })
      .disabled,
  ).toBe(true);
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

it.each([1, 2, 3, 4])(
  "stages a single red three onto an existing pile of %i without changing it before Play draft",
  async (count) => {
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = true;
    const red = {
      id: "selected-red",
      rank: "3",
      suit: "hearts",
      value: -300,
      wild: false,
      redThree: true,
    };
    snapshot.hand.push(red);
    snapshot.players[0].redThrees = Array.from(
      { length: count },
      (_, index) => ({ ...red, id: `old-red-${index}` }),
    );
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    openRoom();
    const hand = within(
      await screen.findByRole("region", { name: "Your private hand" }),
    );
    fireEvent.click(
      hand.getByRole("button", { name: "3 of hearts, red three" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Add selected cards to red threes" }),
    );
    const reds = screen.getByRole("group", { name: "Red threes" });
    expect(reds.querySelectorAll(".card")).toHaveLength(count);
    expect(reds.textContent).toContain(`${count} +1`);
    expect(command).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
    expect(reds.textContent).not.toContain("+1");
    expect(
      hand
        .getByRole("button", { name: "3 of hearts, red three" })
        .hasAttribute("disabled"),
    ).toBe(false);
  },
);

it("plays red threes and normal melds together without counting reds toward the meld total", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
  snapshot.hand.push({
    id: "red-three",
    rank: "3",
    suit: "hearts",
    value: -300,
    wild: false,
    redThree: true,
  });
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 2 });
  openRoom();
  const hand = within(
    await screen.findByRole("region", { name: "Your private hand" }),
  );
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to red threes" }),
  );
  for (const ace of hand.getAllByRole("button", { name: /^A of/ }))
    fireEvent.click(ace);
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  expect(
    screen.getByRole("group", { name: "Staged draft" }).textContent,
  ).toContain("1 new meld + 1 card added");
  expect(screen.getByLabelText("60 points")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [
        { cardIds: ["red-three"], redThree: true },
        { cardIds: ["ace-clubs", "ace-hearts", "ace-spades"], kind: "set" },
      ],
    }),
  );
});

it("does not offer a red-three target while browsing another board", async () => {
  const snapshot = fixture();
  snapshot.phase = "play";
  snapshot.sides[0].opened = true;
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
  fireEvent.click(hand.getByRole("button", { name: "3 of hearts, red three" }));
  expect(
    screen.getByRole("button", { name: "Add selected cards to red threes" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: /^View Poppy’s board, 0 points/ }),
  );
  expect(
    screen.queryByRole("button", { name: "Add selected cards to red threes" }),
  ).toBeNull();
  expect(command).not.toHaveBeenCalled();
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
  expect(replace.disabled).toBe(false);
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "clear selection" }));
  expect(hand.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  expect(screen.queryByRole("button", { name: "clear selection" })).toBeNull();
  expect(screen.getByText("Select cards to play")).toBeTruthy();
  expect(command).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Play draft" })).toBeTruthy();
});

it.each(
  [false, true].flatMap((opened) =>
    [1, 2].flatMap((count) =>
      [false, true].map((reduced) => ({ opened, count, reduced })),
    ),
  ),
)(
  "preserves and plays a staged draft after replacing $count red threes (opened: $opened, reduced motion: $reduced)",
  async ({ opened, count, reduced }) => {
    vi.useFakeTimers();
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches: reduced && query === "(prefers-reduced-motion: reduce)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const snapshot = fixture();
    snapshot.phase = "play";
    snapshot.sides[0].opened = opened;
    const reds = Array.from({ length: count }, (_, i) => ({
      id: `red-${i}`,
      rank: "3",
      suit: i ? "diamonds" : "hearts",
      value: -300,
      wild: false,
      redThree: true,
    }));
    const aces = [...snapshot.hand];
    snapshot.hand.push(...reds);
    const replacements = reds.map((card, i) => ({
      ...card,
      id: `replacement-${i}`,
      rank: "K",
      value: 10,
      redThree: false,
    }));
    const replaced: Snapshot = {
      ...snapshot,
      revision: 2,
      token: "reds-replaced",
      hand: [...aces, ...replacements],
      discard: reds[count - 1],
      discardCount: count,
      stockCount: snapshot.stockCount - count,
    };
    vi.mocked(getRoom).mockResolvedValue(snapshot);
    vi.mocked(command)
      .mockResolvedValueOnce(replaced)
      .mockResolvedValueOnce({ ...replaced, revision: 3 });
    await act(async () => openRoom());
    const hand = screen.getByRole("region", { name: "Your private hand" });
    for (const ace of within(hand).getAllByRole("button", { name: /^A of/ }))
      fireEvent.click(ace);
    fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
    for (const red of within(hand).getAllByRole("button", {
      name: /red three/,
    }))
      fireEvent.click(red);
    const replace = screen.getByRole<HTMLButtonElement>("button", {
      name: "Replace",
    });
    expect(replace.disabled).toBe(false);
    await act(async () => fireEvent.click(replace));
    expect(command).toHaveBeenCalledExactlyOnceWith(snapshot, "red_three", {
      cardIds: expect.arrayContaining(reds.map((card) => card.id)),
      expose: false,
    });
    expect(hand.querySelectorAll(".staged-card")).toHaveLength(3);
    expect(
      within(hand).queryAllByRole("button", { pressed: true }),
    ).toHaveLength(0);
    await act(async () =>
      vi.advanceTimersByTime(
        RED_REPLACEMENT_MS + DRAW_FLIGHT_MS + (count - 1) * DRAW_STAGGER_MS,
      ),
    );
    expect(
      screen.getByRole("group", { name: "Staged draft" }).textContent,
    ).toContain("1 new meld");
    const play = screen.getByRole<HTMLButtonElement>("button", {
      name: "Play draft",
    });
    expect(play.disabled).toBe(false);
    expect(
      screen.getByLabelText(
        opened ? "60 points" : "60 points, 50 points to open",
      ),
    ).toBeTruthy();
    expect(
      within(hand).queryByRole("button", { name: /red three/ }),
    ).toBeNull();
    expect(within(hand).getAllByRole("button", { name: /^K of/ })).toHaveLength(
      count,
    );
    fireEvent.click(within(hand).getAllByRole("button", { name: /^K of/ })[0]);
    expect(
      screen.getByRole<HTMLButtonElement>("button", { name: "Discard" })
        .disabled,
    ).toBe(true);
    await act(async () => fireEvent.click(play));
    expect(command).toHaveBeenLastCalledWith(replaced, "meld", {
      groups: [{ cardIds: aces.map((card) => card.id), kind: "set" }],
    });
  },
);
