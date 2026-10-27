import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MeldPile } from "../components/MeldPile";
import { MeldCards } from "../components/MeldCards";
import { Card } from "../components/Card";
import {
  pickupBeats,
  pickupFrame,
  type PickupScenario,
} from "../lib/pickupSequence";
import type { Snapshot } from "../types";
import { MELD_FLIGHT_MS, useMeldMotion } from "./useMeldMotion";

function Table({
  snapshot,
  reduced = false,
  paused = false,
  speed = 1,
}: {
  snapshot: Snapshot;
  reduced?: boolean;
  paused?: boolean;
  speed?: number;
}) {
  const board = useRef<HTMLDivElement>(null);
  const motion = useMeldMotion(snapshot, board, reduced, speed, paused);
  const view = motion.snapshot!;
  return (
    <div ref={board}>
      <div className="discard-pickup">
        <Card card={view.discard ?? undefined} />
      </div>
      <div className="board-carousel">
        {view.sides[0].melds.map((meld) => (
          <MeldPile
            key={meld.id}
            meld={meld}
            canTarget={false}
            onTarget={() => {}}
            staged={0}
            flyingIds={motion.hiddenIds}
          />
        ))}
      </div>
      {view.hand.map((card) => (
        <div
          className="hand-card"
          data-card-id={card.id}
          data-meld-hidden={motion.hiddenIds.has(card.id)}
          key={card.id}
        >
          <Card card={card} />
        </div>
      ))}
      {motion.flight && <MeldCards flight={motion.flight} paused={paused} />}
    </div>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const hand = this.closest(".hand-card");
      const discard = this.closest(".discard-pickup");
      return {
        x: hand ? 20 : discard ? 300 : 150,
        y: hand ? 600 : discard ? 20 : 200,
        left: hand ? 20 : discard ? 300 : 150,
        top: hand ? 600 : discard ? 20 : 200,
        width: hand || discard ? 62 : 76,
        height: this.classList.contains("board-carousel")
          ? 390
          : hand || discard
            ? 87
            : 106,
        right: 0,
        bottom: 0,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
});
afterEach(() => vi.useRealTimers());
function pair(scenario: PickupScenario) {
  const beats = pickupBeats(scenario);
  return [
    pickupFrame(
      scenario,
      beats.findIndex((beat) => beat.id === "stage"),
    ).snapshot,
    pickupFrame(
      scenario,
      beats.findIndex((beat) => beat.id === "complete"),
    ).snapshot,
  ];
}

it.each([
  ["new", 3],
  ["existing", 1],
  ["meld", 3],
  ["meld-existing", 2],
  ["mixed", 5],
] as const)(
  "slides every accepted card into its actual server meld for %s",
  (scenario, count) => {
    const [before, after] = pair(scenario);
    const view = render(<Table snapshot={before} />);
    view.rerender(<Table snapshot={after} />);
    const flights = [
      ...view.container.querySelectorAll<HTMLElement>(".meld-card-flight"),
    ];
    expect(flights).toHaveLength(count);
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
      before.hand.length,
    );
    for (const flight of flights) {
      const target = after.sides[0].melds.find(
        (meld) => meld.id === flight.dataset.meldId,
      )!;
      expect(
        target.cards.some((card) => card.id === flight.dataset.cardId),
      ).toBe(true);
      expect(flight.style.getPropertyValue("--meld-duration")).toBe("440ms");
      expect(flight.style.getPropertyValue("--meld-y")).not.toBe("0px");
    }
    expect(new Set(flights.map((flight) => flight.dataset.meldId)).size).toBe(
      scenario === "mixed" ? 2 : 1,
    );
    view.rerender(
      <Table snapshot={{ ...after, revision: after.revision + 1 }} />,
    );
    expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(
      count,
    );
    act(() => vi.advanceTimersByTime(MELD_FLIGHT_MS - 1));
    expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(
      count,
    );
    act(() => vi.advanceTimersByTime(1));
    expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
      after.hand.length,
    );
    expect(
      view.container.querySelector('[data-meld-hidden="true"]'),
    ).toBeNull();
    view.rerender(
      <Table snapshot={{ ...after, revision: after.revision + 2 }} />,
    );
    expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  },
);

it("preserves a paused slow-motion flight, resumes it, and clears it when the page hides", () => {
  const [before, after] = pair("new");
  const view = render(<Table snapshot={before} speed={0.5} />);
  view.rerender(<Table snapshot={after} speed={0.5} />);
  act(() => vi.advanceTimersByTime(300));
  view.rerender(<Table snapshot={after} speed={0.5} paused />);
  expect(
    (view.container.querySelector(".meld-card-flight") as HTMLElement).style
      .animationPlayState,
  ).toBe("paused");
  act(() => vi.advanceTimersByTime(5000));
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  view.rerender(<Table snapshot={after} speed={0.5} />);
  act(() => vi.advanceTimersByTime(MELD_FLIGHT_MS / 0.5 - 300 - 1));
  expect(view.container.querySelector(".meld-flight-layer")).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  view.rerender(<Table snapshot={before} />);
  view.rerender(<Table snapshot={after} />);
  vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
});

it("skips failed moves, reduced motion, joining an existing table, and other rounds", () => {
  const [before, after] = pair("new");
  const view = render(<Table snapshot={before} />);
  view.rerender(<Table snapshot={{ ...before, revision: 2 }} />);
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  view.rerender(<Table snapshot={after} reduced />);
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
    after.hand.length,
  );
  view.rerender(<Table snapshot={{ ...before, round: 2 }} />);
  view.rerender(<Table snapshot={{ ...after, round: 3 }} />);
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  view.unmount();
  const joined = render(<Table snapshot={after} />);
  expect(joined.container.querySelector(".meld-flight-layer")).toBeNull();
});

it("rewinds a paused hand-only draft without leaving old flights or hidden cards behind", () => {
  const [before, after] = pair("mixed");
  const view = render(<Table snapshot={before} paused />);
  view.rerender(<Table snapshot={after} paused />);
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(5);
  view.rerender(<Table snapshot={before} paused />);
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(view.container.querySelector('[data-meld-hidden="true"]')).toBeNull();
  view.rerender(<Table snapshot={after} paused />);
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(5);
});

it("lands a seventh hand card on a completed book and cancels on scrolling", () => {
  const [source] = pair("meld-existing");
  const target = source.sides[0].melds[0];
  target.cards = Array.from({ length: 6 }, (_, index) => ({
    ...target.cards[0],
    id: `book-${index}`,
  }));
  const played = source.hand[0];
  const after: Snapshot = {
    ...source,
    hand: source.hand.slice(1),
    sides: source.sides.map((side) =>
      side.id
        ? side
        : {
            ...side,
            melds: [
              { ...target, cards: [...target.cards, played], complete: true },
            ],
          },
    ),
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(<Table snapshot={after} />);
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(1);
  expect(view.container.querySelector(".closed-card-stack")).toBeTruthy();
  act(() => window.dispatchEvent(new Event("scroll")));
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
    after.hand.length,
  );
});
