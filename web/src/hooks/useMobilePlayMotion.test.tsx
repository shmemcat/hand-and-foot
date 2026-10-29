import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Card } from "../components/Card";
import { MeldPile } from "../components/MeldPile";
import { mobilePreviewSnapshot } from "../pages/MobilePreview";
import type { Snapshot } from "../types";
import { MOBILE_PLAY_MS, useMobilePlayMotion } from "./useMobilePlayMotion";
import { BOOK_CLOSE_MS } from "./useBookClosing";

function Table({
  snapshot,
  reduced = false,
}: {
  snapshot: Snapshot;
  reduced?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  const motion = useMobilePlayMotion(snapshot, board, true, reduced);
  const view = motion.snapshot!;
  const meld =
    view.sides[0].melds.find((item) => item.id === motion.target?.id) ??
    view.sides[0].melds[0];
  return (
    <main>
      <div ref={board}>
        <button className="hand-drawer-toggle">Your hand</button>
        <div className="discard-pickup">
          <Card card={view.discard ?? undefined} />
        </div>
        <MeldPile
          meld={meld}
          canTarget={false}
          onTarget={() => {}}
          staged={0}
          flyingIds={motion.hiddenIds}
        />
        {view.hand.map((card) => (
          <div className="hand-card" data-card-id={card.id} key={card.id}>
            <Card card={card} />
          </div>
        ))}
        <output
          data-active={motion.active}
          data-blocking={motion.blocking}
          data-kind={motion.flight?.kind}
          data-face-down={motion.flight?.faceDown}
          data-target={motion.target?.id}
          data-count={view.hand.length}
          data-flight-count={motion.flight?.cards.length}
          data-source-top={motion.flight?.cards[0]?.from.top}
          data-book-count={motion.bookFlight?.cards.length}
        />
      </div>
    </main>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const top = this.closest(".hand-card")
        ? 600
        : this.closest(".discard-pickup")
          ? 90
          : 240;
      return {
        left: 20,
        top,
        width: 62,
        height: 87,
        x: 20,
        y: top,
        right: 82,
        bottom: top + 87,
        toJSON: () => ({}),
      } as DOMRect;
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function played(before: Snapshot, targets: number[]): Snapshot {
  const next = structuredClone(before);
  next.token += ":played";
  targets.forEach((target, i) =>
    next.sides[0].melds[target].cards.push(before.hand[i]),
  );
  next.hand = before.hand.slice(targets.length);
  return next;
}

it("waits for confirmed card IDs and visits each destination page in order", () => {
  const before = mobilePreviewSnapshot();
  before.phase = "draw";
  const table = render(<Table snapshot={before} />);
  const output = () => table.container.querySelector("output")!;
  expect(output().getAttribute("data-active")).toBe("false");
  table.rerender(<Table snapshot={{ ...before, token: "unchanged-cards" }} />);
  expect(output().getAttribute("data-active")).toBe("false");
  const next = played(before, [0, 6]);
  table.rerender(<Table snapshot={next} />);
  expect(output().getAttribute("data-target")).toBe("mobile-0-meld-0");
  expect(output().getAttribute("data-count")).toBe("24");
  expect(output().getAttribute("data-source-top")).toBe("600");
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS));
  expect(output().getAttribute("data-target")).toBe("mobile-0-meld-6");
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS));
  expect(output().getAttribute("data-active")).toBe("false");
  expect(output().getAttribute("data-count")).toBe("22");
  table.rerender(<Table snapshot={{ ...next, revision: 20 }} />);
  expect(output().getAttribute("data-active")).toBe("false");
});

it("animates a private final discard even when its public event hides the face", () => {
  const before = mobilePreviewSnapshot(1);
  const table = render(<Table snapshot={before} />);
  const next: Snapshot = {
    ...before,
    token: "out",
    phase: "scoring",
    actorId: null,
    hand: [],
    discard: null,
    discardFaceDown: true,
    tableEvents: [
      {
        id: "out",
        kind: "discard",
        playerId: before.viewerId,
        count: 1,
        card: null,
        faceDown: true,
      },
    ],
  };
  table.rerender(<Table snapshot={next} />);
  const output = table.container.querySelector("output")!;
  expect(output.getAttribute("data-kind")).toBe("discard");
  expect(output.getAttribute("data-face-down")).toBe("true");
  expect(output.getAttribute("data-count")).toBe("1");
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS));
  expect(output.getAttribute("data-count")).toBe("0");
  expect(output.getAttribute("data-active")).toBe("false");
});

it("lands the hand cards in an open pile before gathering all seven into a completed book", () => {
  const before = mobilePreviewSnapshot();
  const table = render(<Table snapshot={before} />);
  const next = played(before, [0, 0]);
  next.sides[0].melds[0].complete = true;
  const output = () => table.container.querySelector("output")!;
  table.rerender(<Table snapshot={next} />);
  expect(table.container.querySelector(".completed-book")).toBeNull();
  expect(output().getAttribute("data-flight-count")).toBe("2");
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS + 55));
  expect(output().getAttribute("data-book-count")).toBe("7");
  expect(table.container.querySelector(".completed-book")).toBeTruthy();
  expect(
    table.container
      .querySelector(".closed-card-stack")
      ?.getAttribute("data-meld-hidden"),
  ).toBe("true");
  act(() => vi.advanceTimersByTime(BOOK_CLOSE_MS));
  expect(output().getAttribute("data-active")).toBe("false");
  expect(output().getAttribute("data-count")).toBe("22");
  expect(
    table.container
      .querySelector(".closed-card-stack")
      ?.getAttribute("data-meld-hidden"),
  ).toBe("false");
});

it("finishes multiple newly completed books in order and settles interrupted movement", () => {
  const before = mobilePreviewSnapshot();
  const table = render(<Table snapshot={before} />);
  const next = played(before, [0, 0, 2, 2, 2]);
  next.sides[0].melds[0].complete = next.sides[0].melds[2].complete = true;
  const output = () => table.container.querySelector("output")!;
  table.rerender(<Table snapshot={next} />);
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS + 55));
  expect(output().getAttribute("data-book-count")).toBe("7");
  act(() => vi.advanceTimersByTime(BOOK_CLOSE_MS));
  expect(output().getAttribute("data-target")).toBe("mobile-0-meld-2");
  expect(output().getAttribute("data-flight-count")).toBe("3");
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS + 110));
  expect(output().getAttribute("data-book-count")).toBe("7");
  act(() => window.dispatchEvent(new Event("resize")));
  expect(output().getAttribute("data-active")).toBe("false");
  expect(output().getAttribute("data-count")).toBe("19");
  table.rerender(<Table snapshot={{ ...next, revision: 3 }} />);
  expect(output().getAttribute("data-active")).toBe("false");
});

it("first presents a whole new seven-card draft as an open pile before closing its new server ID", () => {
  const before = mobilePreviewSnapshot(10);
  before.hand = before.hand.map((card, index) =>
    index < 7 ? { ...card, rank: "A", wild: false, value: 20 } : card,
  );
  const table = render(<Table snapshot={before} />);
  const next = structuredClone(before);
  next.hand = before.hand.slice(7);
  next.token = "new-whole-book";
  next.sides[0].melds.push({
    ...before.sides[0].melds[0],
    id: "new-server-book",
    cards: before.hand.slice(0, 7),
    complete: true,
    bonus: 500,
  });
  table.rerender(<Table snapshot={next} />);
  const output = table.container.querySelector("output")!;
  expect(output.getAttribute("data-target")).toBe("new-server-book");
  expect(output.getAttribute("data-flight-count")).toBe("7");
  expect(
    table.container
      .querySelector('.meld-pile[data-meld-id="new-server-book"]')
      ?.classList.contains("completed-book"),
  ).toBe(false);
  act(() => vi.advanceTimersByTime(MOBILE_PLAY_MS + 6 * 55));
  expect(output.getAttribute("data-book-count")).toBe("7");
  act(() => vi.advanceTimersByTime(BOOK_CLOSE_MS));
  expect(output.getAttribute("data-count")).toBe("3");
  expect(output.getAttribute("data-active")).toBe("false");
});

it("settles immediately for reduced motion, interruption, and a new round", () => {
  const before = mobilePreviewSnapshot();
  const table = render(<Table snapshot={before} />);
  const next = played(before, [0]);
  table.rerender(<Table snapshot={next} reduced />);
  const output = () => table.container.querySelector("output")!;
  expect(output().getAttribute("data-active")).toBe("false");
  table.rerender(<Table snapshot={before} />);
  table.rerender(<Table snapshot={next} />);
  expect(output().getAttribute("data-active")).toBe("true");
  act(() => window.dispatchEvent(new Event("resize")));
  expect(output().getAttribute("data-active")).toBe("false");
  table.rerender(<Table snapshot={before} />);
  table.rerender(<Table snapshot={next} />);
  table.rerender(<Table snapshot={{ ...next, round: 4 }} />);
  expect(output().getAttribute("data-active")).toBe("false");
});

it("leaves red-three replacement to the draw animation instead of starting a discard", () => {
  const before = mobilePreviewSnapshot(2);
  before.hand[0] = {
    ...before.hand[0],
    rank: "3",
    suit: "hearts",
    redThree: true,
    value: -300,
  };
  const table = render(<Table snapshot={before} />);
  const next = {
    ...before,
    token: "replacement",
    hand: [before.hand[1], { ...before.hand[1], id: "replacement-card" }],
    discard: before.hand[0],
    tableEvents: [
      {
        id: "replace-event",
        kind: "replace" as const,
        playerId: before.viewerId,
        count: 1,
        card: before.hand[0],
        faceDown: false,
      },
    ],
  };
  table.rerender(<Table snapshot={next} />);
  const output = table.container.querySelector("output")!;
  expect(output.getAttribute("data-active")).toBe("false");
  expect(output.getAttribute("data-blocking")).toBe("false");
  expect(output.getAttribute("data-count")).toBe("2");
});
