import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { command, getRoom } from "../lib/api";
import { footSnapshot, type FootEntry } from "../lib/footSequence";
import { FOOT_SETTLE_MS, footGatherDuration } from "../lib/footMotion";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
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

it.each(["mobile", "online", "reduced"] as const)(
  "keeps the existing immediate foot update for %s",
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
            matches: mode === "reduced",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    vi.mocked(command).mockResolvedValue(after);
    await show(before);
    await enter("discard");
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

it("uses the divider for a last-hand discard from another board before opening the foot", async () => {
  const [before, after] = pair("discard");
  vi.mocked(command).mockResolvedValue(after);
  await show(before);
  fireEvent.click(
    screen.getByRole("button", { name: "View Hazel’s board, 0 points" }),
  );
  await enter("discard");
  expect(
    document.querySelector('.meld-flight-layer[data-to-divider="true"]'),
  ).toBeTruthy();
  await advance(MELD_FLIGHT_MS + FOOT_SETTLE_MS);
  expect(
    document.querySelector('.foot-transition[data-gathering="true"]'),
  ).toBeTruthy();
  expect(document.querySelectorAll(".hand-card")).toHaveLength(11);
});
