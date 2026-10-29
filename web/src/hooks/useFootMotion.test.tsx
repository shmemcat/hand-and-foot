import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Card } from "../components/Card";
import { footSnapshot } from "../lib/footSequence";
import { FOOT_SETTLE_MS, footGatherDuration } from "../lib/footMotion";
import type { Snapshot } from "../types";
import { MELD_FLIGHT_MS } from "./useMeldMotion";
import { useFootMotion } from "./useFootMotion";

function Table({
  snapshot,
  playing = false,
}: {
  snapshot: Snapshot;
  playing?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  const motion = useFootMotion(
    snapshot,
    snapshot,
    board,
    false,
    playing,
    false,
  );
  return (
    <div ref={board}>
      <header className="game-header">
        <div className="discard-pickup">
          <Card />
        </div>
      </header>
      <div className="foot-status">
        <div className="foot-stack">
          <Card />
        </div>
      </div>
      <div className="meld-card-flight" />
      {motion.snapshot!.hand.map((card) => (
        <div className="hand-card" data-card-id={card.id} key={card.id}>
          <Card card={card} />
        </div>
      ))}
      <output
        data-active={motion.active}
        data-gathering={motion.gathering}
        data-actor={motion.snapshot!.actorId}
      />
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
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

it("finishes the pickup on its original clock despite subsequent play animations and updates", () => {
  const before = footSnapshot("discard", "before", 0);
  const after: Snapshot = {
    ...footSnapshot("discard", "ready", 1),
    phase: "draw",
  };
  const view = render(<Table snapshot={before} />);
  const state = () => view.container.querySelector("output")!;
  view.rerender(<Table snapshot={after} />);
  act(() => vi.advanceTimersByTime(MELD_FLIGHT_MS + FOOT_SETTLE_MS));
  expect(state().dataset.gathering).toBe("true");
  const unrelated = view.container.querySelector(".meld-card-flight")!;
  unrelated.getAnimations = () => [
    { finished: new Promise(() => {}) } as Animation,
  ];
  act(() => vi.advanceTimersByTime(500));
  view.rerender(
    <Table
      snapshot={{ ...after, token: "bot-meld", revision: 2, phase: "play" }}
      playing
    />,
  );
  act(() => vi.advanceTimersByTime(footGatherDuration(11) - 501));
  expect(state().dataset.active).toBe("true");
  act(() => vi.advanceTimersByTime(1));
  expect(state().dataset.active).toBe("false");
  expect(state().dataset.actor).toBe(after.actorId);
});

it("waits for the actual foot cards to land before releasing the turn", async () => {
  const before = footSnapshot("discard", "before", 0);
  const after: Snapshot = {
    ...footSnapshot("discard", "ready", 1),
    phase: "draw",
  };
  const view = render(<Table snapshot={before} />);
  view.rerender(<Table snapshot={after} />);
  act(() => vi.advanceTimersByTime(MELD_FLIGHT_MS + FOOT_SETTLE_MS));
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  view.container.querySelector(".hand-card")!.getAnimations = () => [
    { finished } as unknown as Animation,
  ];
  act(() => vi.advanceTimersByTime(footGatherDuration(11)));
  expect(view.container.querySelector("output")!.dataset.active).toBe("true");
  await act(async () => finish());
  expect(view.container.querySelector("output")!.dataset.active).toBe("false");
});
