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
import { Room } from "./Room";
import { Shell } from "../components/Shell";
import { mobilePreviewSnapshot, mobileCountingSnapshot } from "./MobilePreview";
import { command, getRoom } from "../lib/api";
import { MOBILE_PLAY_MS } from "../hooks/useMobilePlayMotion";
import { BOOK_CLOSE_MS } from "../hooks/useBookClosing";
import { DRAW_FLIGHT_MS, RED_REPLACEMENT_MS } from "../hooks/useDrawMotion";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({
    play: vi.fn(),
    muted: true,
    music: false,
    volume: 0.15,
    musicVolume: 0.15,
    setMuted: vi.fn(),
    setMusic: vi.fn(),
    setVolume: vi.fn(),
    setMusicVolume: vi.fn(),
  }),
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

beforeEach(() => {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query === "(max-width: 768px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.mocked(command).mockReset();
});
afterEach(() => vi.useRealTimers());
async function open(
  count = 24,
  phase: "draw" | "play" = "play",
  drawCount = 2,
) {
  const snapshot = mobilePreviewSnapshot(count);
  snapshot.phase = phase;
  snapshot.drawCount = drawCount;
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  vi.mocked(command).mockResolvedValue(snapshot);
  render(
    <MemoryRouter initialEntries={["/room/MOBILE-PREVIEW"]}>
      <Shell>
        <Routes>
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </Shell>
    </MemoryRouter>,
  );
  await screen.findByRole("button", { name: /your hand.*open hand/i });
  if (phase === "draw")
    await waitFor(() =>
      expect(
        screen
          .getByRole("button", {
            name: `Draw ${drawCount} cards from the stack`,
          })
          .hasAttribute("disabled"),
      ).toBe(false),
    );
  return snapshot;
}
function expand() {
  fireEvent.click(
    screen.getByRole("button", { name: /your hand.*open hand/i }),
  );
}
function swipe(element: HTMLElement, dx: number, dy = 0) {
  fireEvent.touchStart(element, { touches: [{ clientX: 220, clientY: 200 }] });
  fireEvent.touchEnd(element, {
    changedTouches: [{ clientX: 220 + dx, clientY: 200 + dy }],
    touches: [],
  });
}

it("swipes each card area independently, preserves arrows, and keeps vertical gestures out of paging", async () => {
  await open();
  const openPiles = screen.getByRole("group", { name: "Open piles" });
  swipe(openPiles, -120);
  expect(
    openPiles.querySelector('[data-meld-id="mobile-0-meld-3"]'),
  ).toBeTruthy();
  expect(screen.getByText(/Your board · 1 \/ 6/)).toBeTruthy();
  swipe(openPiles, 10, 120);
  expect(
    openPiles.querySelector('[data-meld-id="mobile-0-meld-3"]'),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous open piles" }));
  const books = screen.getByRole("group", { name: "Completed books" });
  swipe(books, -120);
  expect(books.querySelector('[data-meld-id="mobile-0-meld-14"]')).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Previous completed books" }),
  );
  expand();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  swipe(hand.getByLabelText("Select cards to play"), -120);
  expect(hand.getByText("11–20 of 24 cards")).toBeTruthy();
  fireEvent.click(hand.getByRole("button", { name: "10 of clubs" }));
  expect(
    hand
      .getByRole("button", { name: "10 of clubs" })
      .getAttribute("aria-pressed"),
  ).toBe("false");
  swipe(hand.getByLabelText("Select cards to play"), 120);
  expect(hand.getByText("1–10 of 24 cards")).toBeTruthy();
  swipe(hand.getByLabelText("Select cards to play"), 120);
  expect(hand.getByText("1–10 of 24 cards")).toBeTruthy();
});

it("places the mobile Follow turn control beneath the round badge", async () => {
  await open();
  const control = screen.getByRole<HTMLInputElement>("checkbox", {
    name: "Follow turn",
  });
  expect(control.closest(".round-controls")).toBeTruthy();
  expect(screen.getAllByRole("checkbox", { name: "Follow turn" })).toHaveLength(
    1,
  );
  expect(control.checked).toBe(true);
  fireEvent.click(control);
  expect(control.checked).toBe(false);
});

it.each([2, 3])(
  "animates a %s-card draw into the mobile drawer and then opens the new hand",
  async (count) => {
    const snapshot = await open(24, "draw", count);
    const incoming = Array.from({ length: count }, (_, i) => ({
      id: `new-mobile-${i}`,
      rank: i ? "K" : "9",
      suit: "clubs",
      value: 10,
      wild: false,
      redThree: false,
    }));
    vi.mocked(command).mockResolvedValue({
      ...snapshot,
      revision: 2,
      token: "draw-complete",
      phase: "play",
      hand: [...snapshot.hand, ...incoming],
    });
    fireEvent.click(
      screen.getByRole("button", {
        name: `Draw ${count} cards from the stack`,
      }),
    );
    await waitFor(() => expect(command).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        document.querySelectorAll(
          '.draw-card-flight[data-to-hand-drawer="true"]',
        ),
      ).toHaveLength(count),
    );
    await waitFor(
      () =>
        expect(
          screen
            .getByRole("button", { name: /your hand.*table/i })
            .getAttribute("aria-expanded"),
        ).toBe("true"),
      { timeout: 2000 },
    );
    expect(
      screen.getByRole("button", {
        name: new RegExp(`your hand.*${24 + count} cards.*table`, "i"),
      }),
    ).toBeTruthy();
  },
);

it("keeps the real navigation available when the hand opens and closes", async () => {
  await open();
  const nav = screen.getByRole("navigation", { name: "Main navigation" });
  expect(
    within(nav).getByRole("link", { name: "Hand and Foot home" }),
  ).toBeTruthy();
  expect(
    within(nav).getByRole("button", { name: "Sound and music settings" }),
  ).toBeTruthy();
  expect(within(nav).getByRole("link", { name: "Cards account" })).toBeTruthy();
  const hand = screen.getByRole("region", { name: "Your private hand" });
  expect(
    within(hand).queryByRole("button", { name: "A of hearts" }),
  ).toBeNull();
  expand();
  expect(
    within(hand).getByRole("button", { name: "A of hearts" }),
  ).toBeTruthy();
  fireEvent.keyDown(hand, { key: "Escape" });
  expect(
    within(hand).queryByRole("button", { name: "A of hearts" }),
  ).toBeNull();
  expect(nav.isConnected).toBe(true);
});

it("preserves selected cards across hand pages and board browsing", async () => {
  await open(45);
  expand();
  const hand = screen.getByRole("region", { name: "Your private hand" });
  fireEvent.click(
    within(hand).getAllByRole("button", { name: "A of hearts" })[0],
  );
  fireEvent.click(
    within(hand).getByRole("button", { name: "Next hand cards" }),
  );
  expect(within(hand).getByText("11–20 of 45 cards")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(screen.getByRole("region", { name: "Maya’s hand" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
  expand();
  expect(
    within(screen.getByRole("region", { name: "Your private hand" }))
      .getAllByRole("button", { name: "A of hearts" })[0]
      .getAttribute("aria-pressed"),
  ).toBe("true");
});

it("stages a legal existing pile through the drawer and sends the normal game command", async () => {
  const snapshot = await open();
  expand();
  const hand = screen.getByRole("region", { name: "Your private hand" });
  fireEvent.click(within(hand).getByRole("button", { name: "A of hearts" }));
  fireEvent.click(screen.getByRole("button", { name: "Next board" }));
  expect(
    screen.queryByRole("group", { name: "Add selected cards to a pile" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
  expand();
  const ownHand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  const targets = ownHand.getByRole("group", {
    name: "Add selected cards to a pile",
  });
  expect(targets.closest(".draft-summary-slot")).toBeTruthy();
  fireEvent.click(within(targets).getAllByRole("button", { name: /^A / })[0]);
  fireEvent.click(ownHand.getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(snapshot, "meld", {
      groups: [{ cardIds: ["mobile-hand-0"], meldId: "mobile-0-meld-0" }],
    }),
  );
});

it("pages all ten open piles and eight completed books without changing boards", async () => {
  await open();
  expect(
    within(screen.getByRole("group", { name: "Open piles" })).getAllByRole(
      "group",
      { name: /^(Clean|Dirty|Straight) / },
    ),
  ).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Next open piles" }));
  expect(
    within(screen.getByRole("group", { name: "Open piles" })).getByRole(
      "group",
      { name: "Clean Q’s" },
    ),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next completed books" }));
  expect(
    within(screen.getByRole("group", { name: "Completed books" })).getAllByRole(
      "group",
      { name: /^(Clean|Dirty|Straight) / },
    ),
  ).toHaveLength(4);
});

it("reveals an off-page accepted meld destination and flies the hand card there", async () => {
  const snapshot = await open();
  expand();
  fireEvent.click(screen.getByRole("button", { name: "Next hand cards" }));
  const hand = screen.getByRole("region", { name: "Your private hand" });
  fireEvent.click(within(hand).getByRole("button", { name: "9 of hearts" }));
  const targets = within(hand).getByRole("group", {
    name: "Add selected cards to a pile",
  });
  fireEvent.click(within(targets).getByRole("button", { name: "9 pile, 4/7" }));
  const next = structuredClone(snapshot);
  const card = next.hand.find((item) => item.id === "mobile-hand-12")!;
  next.hand = next.hand.filter((item) => item.id !== card.id);
  next.sides[0].melds[6].cards.push(card);
  next.token = "mobile-meld-accepted";
  vi.mocked(command).mockResolvedValue(next);
  fireEvent.click(within(hand).getByRole("button", { name: "Play draft" }));
  await waitFor(() =>
    expect(
      document.querySelector('.mobile-play-flight-layer[data-kind="meld"]'),
    ).toBeTruthy(),
  );
  expect(
    document.querySelector('.open-piles [data-meld-id="mobile-0-meld-6"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('.mobile-play-card[data-card-id="mobile-hand-12"]'),
  ).toBeTruthy();
  expect(
    within(hand)
      .getByRole("button", { name: "Stage meld" })
      .hasAttribute("disabled"),
  ).toBe(true);
  await waitFor(() =>
    expect(document.querySelector(".mobile-play-card")).toBeNull(),
  );
  expect(
    document
      .querySelector('.open-piles [data-card-id="mobile-hand-12"]')
      ?.getAttribute("data-meld-hidden"),
  ).toBe("false");
});

it("gathers newly qualified mobile red threes into the completed row after the hand card lands", async () => {
  vi.useFakeTimers();
  const before = mobilePreviewSnapshot(2);
  const reds = Array.from({ length: 3 }, (_, index) => ({
    id: `mobile-red-${index}`,
    rank: "3",
    suit: index % 2 ? "diamonds" : "hearts",
    value: -300,
    wild: false,
    redThree: true,
  }));
  before.hand = [reds[2], { ...before.hand[1], rank: "K", suit: "clubs" }];
  before.players[0].redThrees = reds.slice(0, 2);
  const after = structuredClone(before);
  after.hand = before.hand.slice(1);
  after.players[0].redThrees = reds;
  after.token = "red-book-accepted";
  vi.mocked(getRoom).mockResolvedValue(before);
  vi.mocked(command).mockResolvedValue(after);
  await act(async () =>
    render(
      <MemoryRouter initialEntries={["/room/MOBILE-PREVIEW"]}>
        <Shell>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
          </Routes>
        </Shell>
      </MemoryRouter>,
    ),
  );
  expand();
  fireEvent.click(
    screen.getByRole("button", { name: "3 of hearts, red three" }),
  );
  const targets = screen.getByRole("group", {
    name: "Add selected cards to a pile",
  });
  fireEvent.click(within(targets).getByRole("button", { name: /Red threes/ }));
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Play draft" })),
  );
  expect(
    document.querySelector('.mobile-play-flight-layer[data-kind="red"]'),
  ).toBeTruthy();
  expect(document.querySelector(".open-piles .red-three-pile")).toBeTruthy();
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS));
  expect(document.querySelectorAll(".book-closing-card")).toHaveLength(3);
  expect(document.querySelector(".closed-books .red-three-pile")).toBeTruthy();
  act(() => vi.advanceTimersByTime(BOOK_CLOSE_MS));
  expect(document.querySelector(".book-closing-card")).toBeNull();
  expect(
    document.querySelector('.red-three-stack [data-meld-hidden="true"]'),
  ).toBeNull();
});

it("keeps red-three replacement on its own draw flight without an overlapping mobile discard", async () => {
  vi.useFakeTimers();
  const before = mobilePreviewSnapshot(2);
  const red = {
    ...before.hand[0],
    rank: "3",
    suit: "hearts",
    redThree: true,
    value: -300,
  };
  before.hand = [red, before.hand[1]];
  const replacement = {
    ...before.hand[1],
    id: "mobile-replacement-king",
    rank: "K",
    suit: "diamonds",
  };
  const after = {
    ...before,
    token: "replacement-accepted",
    hand: [before.hand[1], replacement],
    discard: red,
    stockCount: before.stockCount - 1,
    tableEvents: [
      {
        id: "red-replacement-event",
        kind: "replace" as const,
        playerId: before.viewerId,
        count: 1,
        card: red,
        faceDown: false,
      },
    ],
  };
  vi.mocked(getRoom).mockResolvedValue(before);
  vi.mocked(command).mockResolvedValue(after);
  await act(async () =>
    render(
      <MemoryRouter initialEntries={["/room/MOBILE-PREVIEW"]}>
        <Shell>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
          </Routes>
        </Shell>
      </MemoryRouter>,
    ),
  );
  expand();
  fireEvent.click(
    screen.getByRole("button", { name: "3 of hearts, red three" }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "Replace" })),
  );
  expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(1);
  expect(document.querySelectorAll(".red-replacement-flight")).toHaveLength(1);
  expect(document.querySelector(".mobile-play-card")).toBeNull();
  await act(async () =>
    vi.advanceTimersByTime(RED_REPLACEMENT_MS + DRAW_FLIGHT_MS),
  );
  expect(document.querySelector(".draw-card-flight")).toBeNull();
  expect(screen.getByRole("button", { name: "K of diamonds" })).toBeTruthy();
});

it.each(
  (["individual", "partnership"] as const).flatMap((scoringMode) =>
    (["round_over", "finished"] as const).flatMap((phase) =>
      [false, true].map((skipAnimation) => ({
        scoringMode,
        phase,
        skipAnimation,
      })),
    ),
  ),
)(
  "restores the mobile drawer after $scoringMode $phase results are hidden (skip animation: $skipAnimation)",
  async ({ scoringMode, phase, skipAnimation }) => {
    vi.useFakeTimers();
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches:
            query === "(max-width: 768px)" ||
            query === "(prefers-reduced-motion: reduce)",
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const source = mobileCountingSnapshot();
    source.scoringMode = scoringMode;
    if (scoringMode === "partnership") {
      source.players = source.players.map((player, index) => ({
        ...player,
        team: index % 3,
      }));
      source.sides = source.sides.slice(0, 3);
      source.players[3].redThrees = source.players[0].redThrees.splice(1);
    }
    const remainingCards = [...source.hand, ...(source.scoringFoot ?? [])];
    vi.mocked(getRoom).mockResolvedValue(source);
    vi.mocked(command).mockResolvedValue({
      ...source,
      revision: source.revision + 1,
      phase,
      scoring: null,
      hand: remainingCards,
      footTop: null,
      scoringFoot: null,
      players: source.players.map((player) =>
        player.id === source.viewerId
          ? {
              ...player,
              roundCards: remainingCards,
              handCount: remainingCards.length,
              footCount: 0,
              footTop: null,
            }
          : player,
      ),
      history: [
        {
          round: source.round,
          reason: source.scoring!.reason,
          scores: [source.scoring!.score],
        },
      ],
    });
    render(
      <MemoryRouter initialEntries={["/room/SCORE-REHEARSAL"]}>
        <Shell>
          <Routes>
            <Route path="/room/:code" element={<Room />} />
          </Routes>
        </Shell>
      </MemoryRouter>,
    );
    await act(async () => {});
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Your debt is covered.")).toBeNull();
    const counter = screen.getByRole("group", {
      name: "Running round score",
    });
    expect(counter.closest(".mobile-hand-drawer")).toBeTruthy();
    expect(
      screen.getAllByRole("group", { name: "Running round score" }),
    ).toHaveLength(1);
    expect(
      screen
        .getByRole("group", { name: "Reconciled: 0 points" })
        .closest(".mobile-hand-drawer"),
    ).toBeTruthy();
    expect(
      document.querySelector<HTMLButtonElement>(".hand-drawer-toggle")
        ?.disabled,
    ).toBe(true);
    expect(command).toHaveBeenCalledExactlyOnceWith(
      source,
      "score_confirm",
      {},
    );
    expect(
      screen.queryByRole("button", {
        name: /Pause count|Confirm score/,
      }),
    ).toBeNull();
    const skip = screen.getByRole("button", { name: "Skip animation" });
    expect(skip.closest(".hand-heading")).toBeTruthy();
    if (skipAnimation) {
      fireEvent.click(skip);
      await act(async () => {});
      expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
      expect(
        screen.queryByRole("button", { name: "Skip animation" }),
      ).toBeNull();
    }
    for (
      let step = 0;
      step < 100 && !document.querySelector(".round-score-sheet");
      step++
    )
      await act(async () => vi.advanceTimersByTime(100));
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
    expect(command).toHaveBeenCalledExactlyOnceWith(
      source,
      "score_confirm",
      {},
    );
    if (!skipAnimation) expect(counter.textContent).toContain("2,485");
    expect(
      screen.getByRole("navigation", { name: "Main navigation" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
    expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
    expect(document.querySelector(".live-scoring")).toBeNull();
    expect(document.querySelector(".turn-message")?.textContent).toBe(
      "End of round board state",
    );
    const toggle = screen.getByRole("button", {
      name: /your cards.*(?:table|open hand)/i,
    });
    expect(toggle.hasAttribute("disabled")).toBe(false);
    expect(
      screen.queryByRole("group", { name: "Running round score" }),
    ).toBeNull();
    if (toggle.getAttribute("aria-expanded") === "false")
      fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const hand = screen.getByRole("region", { name: "Your Cards" });
    expect(hand.querySelector(".hand-info")?.textContent).toContain(
      `${remainingCards.length} cards`,
    );
    expect(
      within(hand).queryByRole("group", {
        name: `Your foot, ${source.players[0].footCount} cards`,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Running round score" }),
    ).toBeNull();
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(
      screen.getByRole("button", { name: /your cards.*open hand/i }),
    );
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Show results" }));
    expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
    expect(command).toHaveBeenCalledExactlyOnceWith(
      source,
      "score_confirm",
      {},
    );
  },
  60000,
);
