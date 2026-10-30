import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { command } from "../lib/api";
import { BOARD_TRANSITION_MS } from "../lib/cardAnimations";
import { footSnapshot } from "../lib/footSequence";
import { useTurnReady } from "./useTurnReady";

vi.mock("../lib/api", () => ({ command: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(command).mockReset();
});
afterEach(() => vi.useRealTimers());

function setup(blocked = false, reduced = false) {
  const snapshot = {
    ...footSnapshot("discard", "ready", 1),
    turnPresentation: {
      id: "last-foot",
      ready: [] as string[],
      complete: false,
    },
  };
  const accept = vi.fn();
  const element = document.createElement("div");
  element.innerHTML = '<div class="hand-dock"></div>';
  const board = { current: element };
  const next = {
    ...snapshot,
    revision: 2,
    turnPresentation: {
      ...snapshot.turnPresentation,
      ready: [snapshot.viewerId],
      complete: true,
    },
  };
  vi.mocked(command).mockResolvedValue(next);
  const view = renderHook(
    ({ source, busy }) => useTurnReady(source, accept, board, busy, reduced),
    { initialProps: { source: snapshot, busy: blocked } },
  );
  return { view, snapshot, next, accept, element };
}

it("waits for the foot sequence, the board's minimum transition, and delayed animation frames", async () => {
  const { view, snapshot, next, accept, element } = setup(true);
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  element.querySelector(".hand-dock")!.getAnimations = () => [
    { finished } as unknown as Animation,
  ];
  await act(async () => vi.advanceTimersByTime(5000));
  expect(command).not.toHaveBeenCalled();
  view.rerender({ source: snapshot, busy: false });
  await act(async () => vi.advanceTimersByTime(BOARD_TRANSITION_MS - 1));
  expect(command).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTime(1));
  expect(command).not.toHaveBeenCalled();
  await act(async () => finish());
  expect(command).toHaveBeenCalledExactlyOnceWith(snapshot, "turn_ready", {
    presentationId: "last-foot",
  });
  expect(accept).toHaveBeenCalledExactlyOnceWith(next);
  view.rerender({ source: next, busy: false });
  expect(view.result.current.blocking).toBe(false);
});

it("retries a failed acknowledgement using the latest snapshot and keeps draws blocked", async () => {
  const { view, snapshot, accept } = setup();
  vi.mocked(command).mockRejectedValueOnce(new Error("offline"));
  await act(async () => vi.advanceTimersByTime(BOARD_TRANSITION_MS));
  expect(view.result.current.blocking).toBe(true);
  expect(view.result.current.error).toContain("Reconnecting");
  const refreshed = { ...snapshot, revision: 3 };
  view.rerender({ source: refreshed, busy: false });
  await act(async () => vi.advanceTimersByTime(1500));
  expect(command).toHaveBeenLastCalledWith(refreshed, "turn_ready", {
    presentationId: "last-foot",
  });
  expect(accept).toHaveBeenCalledOnce();
});

it("does not acknowledge a superseded transition after its animation finally resolves", async () => {
  const { view, snapshot, element } = setup();
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  element.querySelector(".hand-dock")!.getAnimations = () => [
    { finished } as unknown as Animation,
  ];
  await act(async () => vi.advanceTimersByTime(BOARD_TRANSITION_MS));
  view.rerender({
    source: {
      ...snapshot,
      turnPresentation: { id: "next-turn", ready: [], complete: false },
    },
    busy: true,
  });
  await act(async () => finish());
  expect(command).not.toHaveBeenCalled();
});

it("acknowledges reduced motion immediately after the remaining sequence finishes", async () => {
  setup(false, true);
  await act(async () => vi.advanceTimersByTime(0));
  expect(command).toHaveBeenCalledOnce();
});

it("settles a background tab without holding up the table", async () => {
  setup();
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(command).toHaveBeenCalledOnce();
});
