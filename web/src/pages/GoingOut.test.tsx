import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { command, getRoom } from "../lib/api";
import { footSnapshot } from "../lib/footSequence";
import { KEEP_AFTER_DISCARD } from "../lib/goingOut";
import { DRAW_FLIGHT_MS, DRAW_STAGGER_MS } from "../hooks/useDrawMotion";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import { BOOK_CLOSE_MS } from "../hooks/useBookClosing";
import { GOING_OUT_PAUSE_MS, DISCARD_FLIGHT_MS } from "../hooks/useTableMotion";
import type { Card, Meld, Snapshot } from "../types";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  command: vi.fn(),
  getRoom: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));
const card = (id: string, rank = "8"): Card => ({
  id,
  rank,
  suit: "clubs",
  value: 10,
  wild: rank === "2",
  redThree: false,
});
const meld = (
  id: string,
  rank: string,
  count: number,
  dirty = false,
): Meld => ({
  id,
  creator: "opening-seat-0",
  rank,
  kind: "set",
  cards: Array.from({ length: count }, (_, index) =>
    card(`${id}-${index}`, dirty && index < 2 ? "2" : rank),
  ),
  complete: count >= 7,
  dirty,
  bonus: count >= 7 ? (dirty ? 300 : 500) : 0,
});
function fixture(dirtySize = 7): Snapshot {
  const base = footSnapshot("play", "ready", 0);
  return {
    ...base,
    tableEvents: [],
    hand: [card("h1"), card("h2"), card("h3"), card("final", "4")],
    sides: base.sides.map((side, index) =>
      index
        ? side
        : {
            ...side,
            clean: 1,
            dirty: Number(dirtySize >= 7),
            melds: [
              meld("clean", "K", 7),
              meld("dirty", "Q", dirtySize, true),
              meld("open", "8", 3),
            ],
          },
    ),
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(command).mockReset();
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query === "(min-width: 769px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
});
afterEach(() => vi.useRealTimers());
const hand = () =>
  within(screen.getByRole("region", { name: "Your private hand" }));
async function show(snapshot: Snapshot) {
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/room/${snapshot.code}`]}>
        <Routes>
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

it("replaces a final red three instead of offering to discard and go out", async () => {
  const snapshot = fixture();
  snapshot.hand = [
    { ...card("last-red", "3"), suit: "hearts", value: -300, redThree: true },
  ];
  vi.mocked(command).mockResolvedValue({ ...snapshot, revision: 1 });
  await show(snapshot);
  fireEvent.click(
    hand().getByRole("button", { name: "3 of hearts, red three" }),
  );
  expect(screen.queryByRole("button", { name: "Discard & go out" })).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
  });
  expect(command).toHaveBeenCalledWith(snapshot, "red_three", {
    cardIds: ["last-red"],
    expose: false,
  });
});

it("blocks an all-but-one draft without both books and lets the player correct it", async () => {
  const before = fixture(6);
  await show(before);
  for (const button of hand().getAllByRole("button", { name: "8 of clubs" }))
    fireEvent.click(button);
  fireEvent.click(screen.getByRole("button", { name: "Stage meld" }));
  const play = screen.getByRole("button", {
    name: "Play draft",
  }) as HTMLButtonElement;
  expect(play.disabled).toBe(true);
  fireEvent.mouseEnter(screen.getByRole("group", { name: "Play draft" }));
  expect(screen.getByRole("tooltip").textContent).toBe(KEEP_AFTER_DISCARD);
  fireEvent.click(play);
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Clear draft" }));
  for (const button of hand()
    .getAllByRole("button", { name: "8 of clubs" })
    .slice(0, 2))
    fireEvent.click(button);
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to 8’s" }),
  );
  expect(play.disabled).toBe(false);
});

it("fades the viewer's own draw at the divider when browsing someone else's board", async () => {
  const before = { ...fixture(), phase: "draw" as const };
  const after: Snapshot = {
    ...before,
    phase: "play",
    revision: 1,
    token: "drawn",
    hand: [...before.hand, card("draw-1", "A"), card("draw-2", "J")],
  };
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: "View Hazel’s board, 0 points" }),
  );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Draw 2 cards from the stack" }),
    );
  });
  expect(
    document.querySelectorAll('.draw-card-flight[data-to-divider="true"]'),
  ).toHaveLength(2);
  expect(document.querySelector(".draw-card-flight .card-art")).toBeNull();
  expect(screen.getByRole("region", { name: "Hazel’s board" })).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(DRAW_FLIGHT_MS + DRAW_STAGGER_MS);
  });
  expect(screen.getByRole("region", { name: "Hazel’s hand" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^View your board,/ }));
  expect(document.querySelectorAll(".hand-card")).toHaveLength(6);
  expect(
    hand()
      .getAllByRole("button", { name: / of / })
      .every((button) => !(button as HTMLButtonElement).disabled),
  ).toBe(true);
});

it("brings the viewer's discard in from the divider while browsing a different board", async () => {
  const before = fixture();
  const after: Snapshot = {
    ...before,
    phase: "draw",
    revision: 1,
    token: "discarded",
    actorId: before.players[1].id,
    hand: before.hand.slice(0, 3),
    discard: before.hand[3],
    tableEvents: [
      {
        id: "discard",
        playerId: before.viewerId,
        kind: "discard",
        count: 1,
        card: before.hand[3],
        faceDown: false,
      },
    ],
  };
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: "View Hazel’s board, 0 points" }),
  );
  vi.mocked(getRoom).mockResolvedValue(after);
  await act(async () => {
    vi.advanceTimersByTime(3000);
  });
  expect(
    document.querySelector('.table-flight-layer[data-public="true"]'),
  ).toBeTruthy();
  expect(
    document.querySelector('.table-card-flight[data-local="false"]'),
  ).toBeTruthy();
  expect(screen.getByRole("region", { name: "Hazel’s board" })).toBeTruthy();
});

it("permits a draft that completes the missing book and flips the final discard before scoring", async () => {
  const before = fixture(6);
  before.hand = [card("last-queen", "Q"), card("final", "4")];
  const after: Snapshot = {
    ...before,
    revision: 1,
    token: "melded",
    hand: before.hand.slice(1),
    sides: before.sides.map((side, index) =>
      index
        ? side
        : {
            ...side,
            dirty: 1,
            melds: side.melds.map((pile) =>
              pile.id === "dirty"
                ? {
                    ...pile,
                    complete: true,
                    cards: [...pile.cards, before.hand[0]],
                  }
                : pile,
            ),
          },
    ),
  };
  const ended: Snapshot = {
    ...after,
    revision: 2,
    token: "out",
    message: "You went out first.",
    phase: "round_over",
    hand: [],
    discard: null,
    discardFaceDown: true,
    tableEvents: [
      {
        id: "out-event",
        playerId: before.viewerId,
        kind: "discard",
        count: 1,
        card: null,
        faceDown: true,
      },
    ],
  };
  vi.mocked(command).mockResolvedValueOnce(after).mockResolvedValueOnce(ended);
  await show(before);
  fireEvent.click(hand().getByRole("button", { name: "Q of clubs" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Add selected cards to Q’s" }),
  );
  expect(
    (screen.getByRole("button", { name: "Play draft" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Play draft" }));
  });
  await act(async () => {
    vi.advanceTimersByTime(MELD_FLIGHT_MS);
  });
  expect(screen.queryByRole("button", { name: "Discard & go out" })).toBeNull();
  expect(document.querySelector(".book-closing-layer")).toBeTruthy();
  await act(async () => {
    vi.advanceTimersByTime(BOOK_CLOSE_MS);
  });
  expect(screen.getByRole("button", { name: "Discard & go out" })).toBeTruthy();
  fireEvent.click(hand().getByRole("button", { name: "4 of clubs" }));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Discard & go out" }));
  });
  expect(command).toHaveBeenLastCalledWith(after, "discard", {
    cardId: "final",
  });
  expect(
    document.querySelector(
      '.table-card-flight[data-local="true"][data-face-down="true"]',
    ),
  ).toBeTruthy();
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(DISCARD_FLIGHT_MS);
  });
  expect(document.querySelector(".table-card-flight")).toBeNull();
  expect(
    screen.getByRole("img", { name: "Final discard, face down" }),
  ).toBeTruthy();
  expect(document.querySelector(".discard-face .card-art")).toBeNull();
  expect(document.querySelector(".turn-message")?.textContent).toBe(
    "You went out first.",
  );
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(GOING_OUT_PAUSE_MS - 1);
  });
  expect(screen.queryByRole("dialog", { name: "Score sheet" })).toBeNull();
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  expect(screen.getByRole("dialog", { name: "Score sheet" })).toBeTruthy();
});
