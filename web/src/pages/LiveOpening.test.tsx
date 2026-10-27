import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Room } from "./Room";
import { command, getRoom } from "../lib/api";
import {
  INITIAL_OPENING,
  openingSnapshot,
  samplePiles,
} from "../lib/openingSequence";
import type { Snapshot } from "../types";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("socket.io-client", () => ({
  io: () => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  command: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));
let source: Snapshot;
let selectedPile = 0;
beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
  const computedStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((el) =>
    computedStyle(el),
  );
  source = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 4 },
    names: ["You", "Poppy", "Hazel", "Jasper"],
    mode: "individual",
    dealer: 3,
    duration: 0,
  });
  source.code = "LIVE";
  source.stockCount = 181;
  source.actorId = source.viewerId;
  source.discard = { ...samplePiles()[1][1], id: "real-start-discard" };
  source.discardCount = 1;
  source.opening = { id: "deal-one", ready: [], complete: false };
  vi.mocked(getRoom).mockImplementation(async () => structuredClone(source));
  vi.mocked(command)
    .mockReset()
    .mockImplementation(async (_snapshot, type, payload) => {
      if (type === "choose") {
        selectedPile = Number(payload?.pile);
        source.hand = samplePiles()[selectedPile];
        source.footTop = samplePiles()[1 - selectedPile][0];
        source.footPreview = null;
        source.players[0].chosen = true;
        if (source.players.every((p) => p.chosen)) source.phase = "draw";
      } else if (type === "opening_ready") {
        source.opening = {
          ...source.opening!,
          ready: [source.viewerId],
          complete: true,
        };
      }
      source.revision++;
      return structuredClone(source);
    });
});
afterEach(() => vi.useRealTimers());
async function open() {
  const view = render(
    <MemoryRouter initialEntries={["/room/LIVE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => {});
  return view;
}
async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}
const currentStep = (container: HTMLElement) =>
  container.querySelector(".opening-board")?.getAttribute("data-opening-step");
async function reachChoice() {
  for (const duration of [900, 1500, 2000, 900]) await advance(duration + 100);
}
function chooseOthers() {
  source.players.forEach((p, i) => {
    if (i) p.chosen = true;
  });
  if (source.players.every((p) => p.chosen)) source.phase = "draw";
}

it("runs the actual opening, preserves board browsing, uses the chosen cards, and hands off once before enabling play", async () => {
  const view = await open();
  expect(currentStep(view.container)).toBe("0");
  expect(screen.queryByRole("img", { name: "Dealer" })).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Choose pile 1 as your hand" }),
  ).toBeNull();
  expect(screen.queryByLabelText("Your private hand")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  chooseOthers();
  await reachChoice();
  expect(currentStep(view.container)).toBe("4");
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  const face = view.container.querySelector(".opening-choice-stack > .card");
  await advance(60000);
  expect(currentStep(view.container)).toBe("4");
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "View your board, 0 points" }),
  );
  expect(view.container.querySelector(".opening-choice-stack > .card")).toBe(
    face,
  );
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Choose pile 2 as your hand" }),
    ),
  );
  expect(currentStep(view.container)).toBe("5");
  expect(selectedPile).toBe(1);
  const hand = screen.getByLabelText("Your private hand");
  expect(within(hand).getAllByRole("button")).toHaveLength(11);
  expect(
    within(hand).getByRole("button", { name: "8 of hearts" }),
  ).toBeTruthy();
  expect(screen.queryByRole("img", { name: "8 of hearts" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  await advance(2100);
  expect(currentStep(view.container)).toBe("7");
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Draw 2 cards from the stack",
    }).disabled,
  ).toBe(true);
  sound.play.mockClear();
  await advance(800);
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("start");
  await advance(1500);
  expect(currentStep(view.container)).toBeUndefined();
  expect(vi.mocked(command).mock.calls.map((call) => call[1])).toEqual([
    "choose",
    "opening_ready",
  ]);
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Draw 2 cards from the stack",
    }).disabled,
  ).toBe(false);
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("start");
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
});

it("starts later rounds at Dealer with the previous badge position, while a rematch starts with Arrive", async () => {
  const view = await open();
  chooseOthers();
  await reachChoice();
  await act(async () =>
    fireEvent.click(
      screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
    ),
  );
  await advance(2100);
  await advance(2300);
  expect(currentStep(view.container)).toBeUndefined();
  const preview = samplePiles().map((p) => [p[0], p[10]]);
  source = {
    ...source,
    phase: "choose",
    round: 2,
    dealerId: source.players[0].id,
    actorId: source.players[1].id,
    hand: [],
    footTop: null,
    footPreview: preview,
    opening: { id: "deal-two", ready: [], complete: false },
    players: source.players.map((p) => ({ ...p, chosen: false })),
  };
  sound.play.mockClear();
  await advance(3000);
  expect(currentStep(view.container)).toBe("1");
  expect(
    view.container.querySelectorAll(".opening-dealer-origin"),
  ).toHaveLength(1);
  expect(
    view.container.querySelectorAll(".opening-dealer-flight"),
  ).toHaveLength(1);
  expect(
    view.container
      .querySelector(".opening-board")
      ?.getAttribute("data-dealer-moving"),
  ).toBe("true");
  await advance(1600);
  expect(currentStep(view.container)).toBe("2");
  expect(sound.play).not.toHaveBeenCalledWith("playerJoin");
  source = {
    ...source,
    round: 1,
    opening: { id: "rematch", ready: [], complete: false },
  };
  await advance(3000);
  expect(currentStep(view.container)).toBe("0");
  expect(view.container.querySelector(".opening-dealer-flight")).toBeNull();
});

it("rejoins at waiting or Begin, waits for real players, and retries a failed opening handoff", async () => {
  source.players[0].chosen = true;
  source.hand = samplePiles()[0];
  source.footTop = samplePiles()[1][0];
  source.footPreview = null;
  const view = await open();
  expect(currentStep(view.container)).toBe("6");
  expect(view.container.querySelector(".waiting-ellipsis")).toBeTruthy();
  await advance(60000);
  expect(currentStep(view.container)).toBe("6");
  expect(sound.play).not.toHaveBeenCalled();
  chooseOthers();
  await advance(3000);
  expect(currentStep(view.container)).toBe("7");
  vi.mocked(command).mockRejectedValueOnce(new Error("Temporary disconnect"));
  await advance(2300);
  expect(
    screen.getByText("Reconnecting to the table before the first turn…"),
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Draw 2 cards from the stack",
    }).disabled,
  ).toBe(true);
  await advance(1600);
  expect(currentStep(view.container)).toBeUndefined();
  expect(vi.mocked(command).mock.calls.map((call) => call[1])).toEqual([
    "opening_ready",
    "opening_ready",
  ]);
  expect(sound.play.mock.calls.filter(([cue]) => cue === "start")).toHaveLength(
    1,
  );
});

it("does not hold the table for a hidden tab after its player has chosen a hand", async () => {
  source.players.forEach((p) => {
    p.chosen = true;
  });
  source.phase = "draw";
  source.hand = samplePiles()[0];
  source.footPreview = null;
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  const view = await open();
  expect(currentStep(view.container)).toBeUndefined();
  expect(vi.mocked(command).mock.calls.map((call) => call[1])).toEqual([
    "opening_ready",
  ]);
  expect(sound.play).not.toHaveBeenCalled();
});
