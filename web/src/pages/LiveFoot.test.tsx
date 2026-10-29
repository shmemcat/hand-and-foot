import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { command, getRoom } from "../lib/api";
import { footSnapshot, type FootEntry } from "../lib/footSequence";
import {
  FOOT_GATHER_DELAY_MS,
  FOOT_SETTLE_MS,
  footGatherDuration,
} from "../lib/footMotion";
import { DISCARD_FLIGHT_MS } from "../hooks/useTableMotion";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import { MOBILE_PLAY_MS } from "../hooks/useMobilePlayMotion";
import { BOOK_CLOSE_MS } from "../hooks/useBookClosing";
import type { Snapshot } from "../types";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
const socket = vi.hoisted(() => ({ handlers: new Map<string, () => void>() }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, callback: () => void) =>
      socket.handlers.set(event, callback),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  command: vi.fn(),
  getRoom: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
  socket.handlers.clear();
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
const advance = async (time: number) =>
  act(async () => {
    vi.advanceTimersByTime(time);
  });
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
async function refresh(snapshot: Snapshot) {
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => {
    socket.handlers.get("handandfoot:updated")!();
  });
}
function pair(entry: FootEntry): [Snapshot, Snapshot] {
  return [
    footSnapshot(entry, "before", 0),
    {
      ...footSnapshot(entry, "ready", 1),
      phase: entry === "discard" ? "draw" : "play",
    },
  ];
}
async function enter(entry: FootEntry) {
  fireEvent.click(hand().getByRole("button", { name: "K of clubs" }));
  if (entry === "play")
    fireEvent.click(
      screen.getByRole("button", { name: "Add selected cards to K’s" }),
    );
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", {
        name: entry === "play" ? "Play draft" : "Discard",
      }),
    );
  });
}

it("waits for the live final meld to land, cascades the confirmed foot, and enables continued play once", async () => {
  const [before, after] = pair("play");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  await enter("play");
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(1);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  expect(hand().getAllByRole("button", { name: / of / })).toHaveLength(1);
  await advance(MELD_FLIGHT_MS);
  await advance(FOOT_SETTLE_MS);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeTruthy();
  expect(hand().getAllByRole("button", { name: / of / })).toHaveLength(11);
  expect(
    hand()
      .getAllByRole("button", { name: / of / })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  expect(
    screen.getByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeTruthy();
  expect(
    document
      .querySelector<HTMLElement>(".foot-transition")!
      .style.getPropertyValue("--foot-source-fade-duration"),
  ).toBe("500ms");
  await advance(footGatherDuration(11));
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
  expect(
    hand()
      .getAllByRole("button", { name: / of / })
      .every((button) => !(button as HTMLButtonElement).disabled),
  ).toBe(true);
  await refresh({ ...after, revision: 2 });
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  expect(
    sound.play.mock.calls.filter(([name]) => name === "deal"),
  ).toHaveLength(1);
  expect(command).toHaveBeenCalledExactlyOnceWith(before, "meld", {
    groups: [{ meldId: "foot-meld-K", cardIds: [before.hand[0].id] }],
  });
});

it("animates a live final discard, holds Follow turn through the cascade, and waits for the next turn", async () => {
  const [before, after] = pair("discard");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  await enter("discard");
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(1);
  expect(
    document.querySelector('.discard-pickup[data-foot-discard-hidden="true"]'),
  ).toBeTruthy();
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  await advance(MELD_FLIGHT_MS + FOOT_SETTLE_MS);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeTruthy();
  await refresh({ ...after, revision: 2, token: "bot-drew", phase: "play" });
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
  await advance(footGatherDuration(11));
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Poppy’s hand" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /^View your board,/ }));
  expect(
    hand()
      .getAllByRole("button", { name: / of / })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
  expect(command).toHaveBeenCalledExactlyOnceWith(before, "discard", {
    cardId: before.hand[0].id,
  });
  await refresh({
    ...after,
    revision: 3,
    token: "next-human-turn",
    actorId: before.viewerId,
    phase: "draw",
  });
  expect(
    (
      screen.getByRole("button", {
        name: "Draw 2 cards from the stack",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
});

it("retains newer bot updates when the human's next turn arrives during the cascade", async () => {
  const [before, after] = pair("discard");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  await enter("discard");
  await advance(MELD_FLIGHT_MS + FOOT_SETTLE_MS);
  await refresh({
    ...after,
    revision: 2,
    token: "next-turn",
    actorId: before.viewerId,
  });
  const deck = screen.getByRole("button", {
    name: "Draw 2 cards from the stack",
  }) as HTMLButtonElement;
  expect(deck.disabled).toBe(true);
  fireEvent.click(deck);
  expect(command).toHaveBeenCalledTimes(1);
  await advance(footGatherDuration(11));
  expect(deck.disabled).toBe(false);
  expect(
    hand()
      .getAllByRole("button", { name: / of / })
      .every((button) => (button as HTMLButtonElement).disabled),
  ).toBe(true);
});

it.each(["online", "reduced"] as const)(
  "finishes the foot pickup correctly for %s",
  async (mode) => {
    const [before, after] = pair("discard");
    if (mode === "online") {
      before.playMode = "online";
      after.playMode = "online";
    }
    if (mode !== "online")
      vi.mocked(window.matchMedia).mockImplementation(
        (query) =>
          ({
            matches: mode === "reduced" && query !== "(max-width: 768px)",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    vi.mocked(command).mockResolvedValue(after);
    await show(before);
    await enter("discard");
    if (mode === "online") {
      expect(document.querySelector(".meld-card-flight")).toBeTruthy();
      await advance(MELD_FLIGHT_MS + FOOT_SETTLE_MS);
      expect(
        document.querySelector('.foot-transition[data-gathering="true"]'),
      ).toBeTruthy();
      await advance(footGatherDuration(11));
    }
    fireEvent.click(screen.getByRole("button", { name: /^View your board,/ }));
    expect(hand().getAllByRole("button", { name: / of / })).toHaveLength(11);
    expect(
      screen.queryByRole("group", { name: "Your foot, 11 cards" }),
    ).toBeNull();
    expect(document.querySelector(".meld-card-flight")).toBeNull();
    expect(
      document.querySelector('.foot-transition[data-gathering="true"]'),
    ).toBeNull();
  },
);

function mobile(reduced = false) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches:
          query === "(max-width: 768px)" ||
          (reduced && query === "(prefers-reduced-motion: reduce)"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}
it.each(["play", "discard"] as const)(
  "cascades every mobile foot card after the final %s lands",
  async (entry) => {
    mobile();
    const [before, after] = pair(entry);
    before.playMode = after.playMode = "online";
    vi.mocked(command).mockResolvedValue(after);
    await show(before);
    fireEvent.click(
      screen.getByRole("button", { name: /your hand.*open hand/i }),
    );
    await enter(entry);
    expect(document.querySelectorAll(".mobile-play-card")).toHaveLength(1);
    expect(document.querySelector(".mobile-foot-card")).toBeNull();
    expect(document.querySelector(".meld-card-flight")).toBeNull();
    await advance(MOBILE_PLAY_MS);
    expect(document.querySelector(".mobile-foot-card")).toBeNull();
    await advance(FOOT_SETTLE_MS);
    expect(document.querySelectorAll(".mobile-foot-card")).toHaveLength(11);
    expect(
      document.querySelectorAll('.hand-card[data-foot-hidden="true"]'),
    ).toHaveLength(10);
    expect(
      screen
        .getByRole("button", { name: /your foot.*11 cards/i })
        .hasAttribute("disabled"),
    ).toBe(true);
    expect(
      screen.getByRole("group", { name: "Your foot, 11 cards" }),
    ).toBeTruthy();
    await advance(footGatherDuration(11));
    expect(document.querySelector(".mobile-foot-card")).toBeNull();
    expect(
      document.querySelector('.hand-card[data-foot-hidden="true"]'),
    ).toBeNull();
    expect(
      screen.queryByRole("group", { name: "Your foot, 11 cards" }),
    ).toBeNull();
    if (entry === "discard") {
      fireEvent.click(
        screen.getByRole("button", { name: /^View your board,/ }),
      );
      fireEvent.click(
        screen.getByRole("button", { name: /your foot.*open hand/i }),
      );
    }
    expect(
      screen
        .getByRole("button", { name: /your foot.*11 cards/i })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      hand().getByRole("button", { name: "Next hand cards" }),
    ).toBeTruthy();
    expect(
      document.querySelector(".hand-scroll .card")?.hasAttribute("disabled"),
    ).toBe(entry === "discard");
    await refresh({ ...after, revision: 2 });
    expect(document.querySelector(".mobile-foot-card")).toBeNull();
    expect(
      sound.play.mock.calls.filter(([name]) => name === "deal"),
    ).toHaveLength(1);
  },
);

it("settles a mobile foot pickup immediately with reduced motion", async () => {
  mobile(true);
  const [before, after] = pair("play");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: /your hand.*open hand/i }),
  );
  await enter("play");
  expect(document.querySelector(".mobile-foot-card")).toBeNull();
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
});

it("finishes a mobile book before cascading the foot picked up by that same meld", async () => {
  mobile();
  const [before, after] = pair("play");
  const extras = Array.from({ length: 3 }, (_, i) => ({
    ...before.sides[0].melds[0].cards[0],
    id: `book-extra-${i}`,
  }));
  before.sides[0].melds[0].cards.push(...extras);
  after.sides[0].melds[0].cards.push(...extras);
  after.sides[0].melds[0].complete = true;
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: /your hand.*open hand/i }),
  );
  await enter("play");
  await advance(MOBILE_PLAY_MS);
  expect(document.querySelectorAll(".book-closing-card")).toHaveLength(7);
  expect(document.querySelector(".mobile-foot-card")).toBeNull();
  await advance(BOOK_CLOSE_MS);
  await advance(FOOT_SETTLE_MS);
  expect(document.querySelectorAll(".mobile-foot-card")).toHaveLength(11);
  await advance(footGatherDuration(11));
  expect(document.querySelector(".mobile-foot-card")).toBeNull();
});

it("settles a mobile foot pickup to the current hand when interrupted", async () => {
  mobile();
  const [before, after] = pair("play");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: /your hand.*open hand/i }),
  );
  await enter("play");
  await advance(MOBILE_PLAY_MS);
  await advance(FOOT_SETTLE_MS);
  expect(document.querySelectorAll(".mobile-foot-card")).toHaveLength(11);
  await act(async () => window.dispatchEvent(new Event("resize")));
  expect(document.querySelector(".mobile-foot-card")).toBeNull();
  expect(
    document.querySelector('.hand-card[data-foot-hidden="true"]'),
  ).toBeNull();
  expect(document.querySelectorAll(".hand-scroll .hand-card")).toHaveLength(10);
});

it("does not replay foot entry on rejoining and cancels to the current state when resized", async () => {
  const [before, after] = pair("play");
  await show(after);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  // A later round has its own fresh hand and foot.
  const next = { ...before, round: 2, revision: 2 };
  await refresh(next);
  vi.mocked(command).mockResolvedValue({ ...after, round: 2, revision: 3 });
  await enter("play");
  await advance(MELD_FLIGHT_MS);
  await advance(FOOT_SETTLE_MS);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeTruthy();
  await act(async () => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
  expect(hand().getAllByRole("button", { name: / of / })).toHaveLength(11);
});

it("keeps the original hand and foot after a rejected last-card action", async () => {
  const [before] = pair("discard");
  vi.mocked(command).mockRejectedValue(new Error("Please try again."));
  await show(before);
  await enter("discard");
  expect(hand().getByRole("button", { name: "K of clubs" })).toBeTruthy();
  expect(
    screen.getByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeTruthy();
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  expect(document.querySelector(".meld-card-flight")).toBeNull();
});

it("keeps another player's footer concealed during a remotely confirmed local foot pickup", async () => {
  const [before, after] = pair("discard");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: "View Hazel’s board, 0 points" }),
  );
  await refresh(after);
  await advance(MELD_FLIGHT_MS + FOOT_SETTLE_MS);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeNull();
  expect(screen.getByRole("region", { name: "Hazel’s hand" })).toBeTruthy();
  expect(document.querySelector(".public-hand-cards .card-art")).toBeNull();
});

it.each(["play", "discard"] as const)(
  "announces your %s pickup for the entire deal with one card fan sound",
  async (entry) => {
    const [before, after] = pair(entry);
    before.playMode = after.playMode = "online";
    vi.mocked(command).mockResolvedValue(after);
    await show(before);
    await enter(entry);
    await advance(MELD_FLIGHT_MS);
    await advance(FOOT_SETTLE_MS);
    const notice = () => document.querySelector(".foot-pickup-notice");
    expect(notice()?.textContent).toBe("You picked up their foot!");
    await advance(FOOT_GATHER_DELAY_MS);
    expect(
      sound.play.mock.calls.filter(([name]) => name === "deal"),
    ).toHaveLength(1);
    await refresh({ ...after, revision: 2, token: "newer-update" });
    await advance(footGatherDuration(11) - FOOT_GATHER_DELAY_MS - 1);
    expect(notice()).toBeTruthy();
    expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
    await advance(1);
    expect(notice()).toBeNull();
    expect(
      screen.getByRole("region", {
        name: entry === "discard" ? "Poppy’s board" : "Your board",
      }),
    ).toBeTruthy();
    expect(
      sound.play.mock.calls.filter(([name]) => name === "deal"),
    ).toHaveLength(1);
  },
);

it.each(["desktop", "mobile", "reduced"] as const)(
  "announces another player's pickup on %s and follows the next board after the popup",
  async (layout) => {
    if (layout === "mobile") mobile();
    if (layout === "reduced")
      vi.mocked(window.matchMedia).mockImplementation(
        (query) =>
          ({
            matches: query !== "(max-width: 768px)",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    const [before] = pair("play");
    before.playMode = "online";
    before.actorId = before.players[1].id;
    const after: Snapshot = {
      ...before,
      revision: 2,
      token: "other-foot",
      phase: "draw",
      actorId: before.players[2].id,
      players: before.players.map((player, index) =>
        index === 1
          ? { ...player, inFoot: true, footCount: 0, handCount: 11 }
          : player,
      ),
      discard: { ...before.hand[0], id: "other-discard" },
      discardCount: before.discardCount + 1,
      tableEvents: [
        {
          id: "other-discard",
          kind: "discard",
          playerId: before.players[1].id,
          count: 1,
          card: { ...before.hand[0], id: "other-discard" },
          faceDown: false,
        },
        {
          id: "other-foot",
          kind: "foot",
          playerId: before.players[1].id,
          count: 11,
          card: null,
          faceDown: false,
        },
      ],
    };
    await show(before);
    expect(screen.getByRole("region", { name: "Poppy’s hand" })).toBeTruthy();
    await refresh(after);
    if (layout !== "reduced") {
      expect(document.querySelector(".foot-pickup-notice")).toBeNull();
      expect(screen.getByRole("region", { name: "Poppy’s hand" })).toBeTruthy();
      await advance(DISCARD_FLIGHT_MS);
    }
    const notice = () => document.querySelector(".foot-pickup-notice");
    expect(notice()?.textContent).toBe("Poppy picked up their foot!");
    expect(screen.getByRole("region", { name: "Poppy’s foot" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
    expect(document.querySelector(".mobile-foot-card")).toBeNull();
    await advance(FOOT_GATHER_DELAY_MS);
    expect(
      sound.play.mock.calls.filter(([name]) => name === "deal"),
    ).toHaveLength(1);
    await refresh({ ...after, revision: 3 });
    await advance(footGatherDuration(11) - FOOT_GATHER_DELAY_MS - 1);
    expect(notice()).toBeTruthy();
    expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
    await advance(1);
    expect(notice()).toBeNull();
    expect(screen.getByRole("region", { name: "Hazel’s board" })).toBeTruthy();
    await refresh({ ...after, revision: 4 });
    expect(notice()).toBeNull();
    expect(
      sound.play.mock.calls.filter(([name]) => name === "deal"),
    ).toHaveLength(1);
  },
);

it("does not replay an old pickup announcement or sound on rejoining", async () => {
  const [, after] = pair("discard");
  after.tableEvents = [
    {
      id: "old-foot",
      kind: "foot",
      playerId: after.players[1].id,
      count: 11,
      card: null,
      faceDown: false,
    },
  ];
  await show(after);
  await advance(footGatherDuration(11));
  expect(document.querySelector(".foot-pickup-notice")).toBeNull();
  expect(sound.play).not.toHaveBeenCalledWith("deal");
});
