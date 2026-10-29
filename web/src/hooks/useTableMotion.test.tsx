import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  GOING_OUT_PAUSE_MS,
  DISCARD_FLIGHT_MS,
  useTableMotion,
} from "./useTableMotion";
import { TableCards } from "../components/TableCards";
import { Card } from "../components/Card";
import { footSnapshot } from "../lib/footSequence";
import {
  DRAW_FLIGHT_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
} from "./useDrawMotion";
import type { Snapshot, TableEvent } from "../types";

function Table({
  snapshot,
  reduced = false,
  viewedTeam,
}: {
  snapshot: Snapshot;
  reduced?: boolean;
  viewedTeam?: number;
}) {
  const board = useRef<HTMLDivElement>(null);
  const motion = useTableMotion(
    snapshot,
    snapshot,
    board,
    reduced,
    false,
    viewedTeam,
  );
  const view = motion.snapshot!;
  return (
    <div ref={board} className="game-page" data-blocked={motion.blocking}>
      <header className="game-header">
        <div className="draw-pile">
          <div className="draw-deck-cards">
            <Card small />
          </div>
        </div>
        <div className="discard-pickup">
          <Card
            card={
              view.discardFaceDown ? undefined : (view.discard ?? undefined)
            }
            small
          />
        </div>
      </header>
      <h2>Your board</h2>
      <output
        data-actor={view.actorId}
        data-opponent-hand={view.players[1].handCount}
      >
        {view.phase}
      </output>
      {view.hand.map((card) => (
        <div className="hand-card" data-card-id={card.id} key={card.id}>
          <Card card={card} />
        </div>
      ))}
      {motion.flight && <TableCards flight={motion.flight} />}
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
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return this.matches(".game-header")
        ? new DOMRect(0, 0, 1000, 300)
        : this.closest(".hand-card")
          ? new DOMRect(100, 600, 62, 87)
          : new DOMRect(400, 100, 62, 87);
    },
  );
});
afterEach(() => vi.useRealTimers());
const before = () => ({
  ...footSnapshot("play", "ready", 0),
  tableEvents: [],
  actorId: "opening-seat-1",
});
const draw: TableEvent = {
  id: "draw-1",
  playerId: "opening-seat-1",
  kind: "draw",
  count: 2,
  card: null,
  faceDown: false,
};
const discard: TableEvent = {
  ...draw,
  id: "discard-1",
  kind: "discard",
  count: 1,
  card: { ...footSnapshot("play", "ready", 0).discard!, id: "public-discard" },
};

it("lands batched bot replacement reds on discard in order before drawing replacements", () => {
  const source = before();
  const red = (id: string) => ({
    ...source.hand[0],
    id,
    rank: "3",
    suit: "hearts",
    redThree: true,
    value: -300,
  });
  const first: TableEvent = {
    ...discard,
    id: "replace-first",
    kind: "replace",
    card: red("first-red"),
  };
  const second: TableEvent = {
    ...first,
    id: "replace-second",
    card: red("second-red"),
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        phase: "play",
        discard: second.card,
        discardCount: source.discardCount + 2,
        tableEvents: [first, second, draw],
      }}
    />,
  );
  const top = () =>
    view.container
      .querySelector(".discard-pickup .card")
      ?.getAttribute("aria-label");
  expect(top()).toBe("8 of spades");
  expect(
    view.container.querySelector('.table-card-flight[data-replacement="true"]'),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS));
  expect(top()).toBe("3 of hearts, red three");
  expect(
    view.container.querySelector('.table-card-flight[data-replacement="true"]'),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS));
  expect(top()).toBe("3 of hearts, red three");
  expect(
    view.container.querySelectorAll(
      '.table-card-flight[data-event-kind="draw"]',
    ),
  ).toHaveLength(2);
  expect(
    view.container.querySelector('.table-card-flight[data-replacement="true"]'),
  ).toBeNull();
});

it("shows a private two-card draw only as backs above the divider while watching an off-turn board", () => {
  const source = before();
  const view = render(<Table snapshot={source} />);
  view.rerender(
    <Table snapshot={{ ...source, revision: 1, tableEvents: [draw] }} />,
  );
  expect(view.getByRole("heading").textContent).toBe("Your board");
  expect(
    view.container.querySelectorAll(
      '.table-card-flight[data-event-kind="draw"]',
    ),
  ).toHaveLength(2);
  expect(
    view.container.querySelector(".table-card-flight .card-art"),
  ).toBeNull();
  expect(
    view.container
      .querySelector<HTMLElement>(".table-flight-layer")!
      .style.getPropertyValue("--table-divider"),
  ).toBe("300px");
  expect(
    view.container.querySelector('.table-flight-layer[data-public="true"]'),
  ).toBeTruthy();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
    source.hand.length,
  );
});

it("presents each count in a batched draw and discard before settling the final count", () => {
  const source = before();
  const oldCount = source.players[1].handCount;
  const view = render(<Table snapshot={source} />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        players: source.players.map((player, index) =>
          index === 1 ? { ...player, handCount: oldCount + 1 } : player,
        ),
        tableEvents: [draw, discard],
      }}
    />,
  );
  const count = () =>
    Number(
      view.container
        .querySelector("output")
        ?.getAttribute("data-opponent-hand"),
    );
  expect(count()).toBe(oldCount + 2);
  act(() => vi.advanceTimersByTime(DRAW_FLIGHT_MS + DRAW_STAGGER_MS));
  expect(count()).toBe(oldCount + 1);
  act(() => vi.advanceTimersByTime(DISCARD_FLIGHT_MS));
  expect(count()).toBe(oldCount + 1);
});

it("plays batched draw and discard cues in order without replaying polling snapshots or rejoining history", () => {
  const source = before();
  const after: Snapshot = {
    ...source,
    revision: 1,
    actorId: "opening-seat-2",
    discard: discard.card,
    tableEvents: [draw, discard],
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(<Table snapshot={after} />);
  act(() => {
    vi.advanceTimersByTime(DRAW_FLIGHT_MS + DRAW_STAGGER_MS);
  });
  expect(
    view.container.querySelector(
      '.table-card-flight[data-event-kind="discard"][data-local="false"]',
    ),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".table-card-flight .card-art"),
  ).toBeTruthy();
  act(() => {
    vi.advanceTimersByTime(DISCARD_FLIGHT_MS);
  });
  view.rerender(<Table snapshot={{ ...after, revision: 2 }} />);
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  view.unmount();
  const joined = render(<Table snapshot={after} />);
  expect(joined.container.querySelector(".table-flight-layer")).toBeNull();
});

it("does not cut an unfinished discard short when another player goes out", () => {
  const source = before();
  const view = render(<Table snapshot={source} />);
  const after: Snapshot = {
    ...source,
    phase: "draw",
    actorId: "opening-seat-2",
    discard: discard.card,
    discardCount: source.discardCount + 1,
    tableEvents: [discard],
  };
  view.rerender(<Table snapshot={after} />);
  act(() => vi.advanceTimersByTime(200));
  const ending: TableEvent = {
    ...discard,
    id: "next-player-out",
    playerId: "opening-seat-2",
    faceDown: true,
    card: null,
  };
  view.rerender(
    <Table
      snapshot={{
        ...after,
        phase: "scoring",
        actorId: null,
        discard: null,
        discardFaceDown: true,
        tableEvents: [discard, ending],
      }}
    />,
  );
  act(() => vi.advanceTimersByTime(DISCARD_FLIGHT_MS - 201));
  expect(
    view.container.querySelector("output")?.getAttribute("data-actor"),
  ).toBe(discard.playerId);
  expect(
    view.container.querySelector('.table-card-flight[data-face-down="false"]'),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(1));
  expect(
    view.container.querySelector("output")?.getAttribute("data-actor"),
  ).toBe(ending.playerId);
  expect(
    view.container.querySelector('.table-card-flight[data-face-down="true"]'),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(DISCARD_FLIGHT_MS));
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  act(() => vi.advanceTimersByTime(GOING_OUT_PAUSE_MS));
  expect(view.container.querySelector("output")?.textContent).toBe("scoring");
});

it("shows another player's going-out discard as a back and waits for it to land before scoring", () => {
  const source = before();
  const ending: TableEvent = {
    ...discard,
    id: "out",
    faceDown: true,
    card: null,
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        revision: 1,
        phase: "scoring",
        discard: null,
        discardFaceDown: true,
        tableEvents: [draw, ending],
      }}
    />,
  );
  expect(view.container.querySelectorAll(".table-card-flight")).toHaveLength(1);
  expect(
    view.container.querySelector(".table-card-flight .card-art"),
  ).toBeNull();
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  act(() => {
    vi.advanceTimersByTime(DISCARD_FLIGHT_MS);
  });
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  expect(view.container.querySelector(".discard-pickup .card-art")).toBeNull();
  act(() => {
    vi.advanceTimersByTime(GOING_OUT_PAUSE_MS);
  });
  expect(view.container.querySelector("output")?.textContent).toBe("scoring");
  expect(view.container.querySelector(".discard-pickup .card-art")).toBeNull();
});

it("starts the local final discard at the real hand position and settles safely on resize", () => {
  const source = before();
  source.actorId = source.viewerId;
  source.hand = [source.hand[0]];
  const ending: TableEvent = {
    ...discard,
    id: "local-out",
    playerId: source.viewerId,
    faceDown: true,
    card: null,
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        phase: "scoring",
        hand: [],
        discard: null,
        discardFaceDown: true,
        tableEvents: [ending],
      }}
    />,
  );
  expect(
    view.container.querySelector<HTMLElement>(
      '.table-card-flight[data-local="true"]',
    )!.style.top,
  ).toBe("600px");
  expect(
    view.container.querySelector('.table-card-turn[data-turn="true"]'),
  ).toBeTruthy();
  act(() => {
    window.dispatchEvent(new Event("resize"));
  });
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  act(() => {
    vi.advanceTimersByTime(GOING_OUT_PAUSE_MS);
  });
  expect(view.container.querySelector("output")?.textContent).toBe("scoring");
});

it("skips old cues for reduced motion and a new round", () => {
  const source = before();
  const after = { ...source, tableEvents: [draw] };
  const view = render(<Table snapshot={source} reduced />);
  view.rerender(<Table snapshot={after} reduced />);
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  view.rerender(<Table snapshot={after} />);
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  view.rerender(<Table snapshot={{ ...after, round: 2 }} />);
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
});

it("keeps the local final discard face down when the viewer is browsing another board", () => {
  const source = before();
  source.actorId = source.viewerId;
  source.hand = [source.hand[0]];
  const ending: TableEvent = {
    ...discard,
    id: "off-board-out",
    playerId: source.viewerId,
    faceDown: true,
    card: null,
  };
  const view = render(<Table snapshot={source} viewedTeam={2} />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        phase: "scoring",
        hand: [],
        discard: null,
        discardFaceDown: true,
        tableEvents: [ending],
      }}
      viewedTeam={2}
    />,
  );
  expect(
    view.container.querySelector('.table-card-flight[data-local="false"]'),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".table-card-flight .card-art"),
  ).toBeNull();
  expect(
    view.container.querySelector('.game-page[data-blocked="true"]'),
  ).toBeTruthy();
});

it("keeps the landed discard visible through scrolling and repeated updates without restarting the pause", () => {
  const source = before();
  const ending: TableEvent = {
    ...discard,
    id: "pause",
    faceDown: true,
    card: null,
  };
  const after: Snapshot = {
    ...source,
    phase: "scoring",
    discard: null,
    discardFaceDown: true,
    tableEvents: [ending],
  };
  const view = render(<Table snapshot={source} />);
  view.rerender(<Table snapshot={after} />);
  act(() => {
    vi.advanceTimersByTime(DISCARD_FLIGHT_MS);
  });
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  expect(view.container.querySelector(".discard-pickup .card-art")).toBeNull();
  act(() => {
    vi.advanceTimersByTime(500);
    window.dispatchEvent(new Event("scroll"));
  });
  view.rerender(<Table snapshot={{ ...after, revision: 2 }} />);
  act(() => {
    vi.advanceTimersByTime(GOING_OUT_PAUSE_MS - 501);
  });
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  act(() => {
    vi.advanceTimersByTime(1);
  });
  expect(view.container.querySelector("output")?.textContent).toBe("scoring");
});

it("preserves the reading pause with reduced motion while showing the discard immediately", () => {
  const source = before();
  const ending: TableEvent = {
    ...discard,
    id: "reduced-pause",
    faceDown: true,
    card: null,
  };
  const view = render(<Table snapshot={source} reduced />);
  view.rerender(
    <Table
      snapshot={{
        ...source,
        phase: "scoring",
        discard: null,
        discardFaceDown: true,
        tableEvents: [ending],
      }}
      reduced
    />,
  );
  expect(view.container.querySelector(".table-flight-layer")).toBeNull();
  expect(view.container.querySelector(".discard-pickup .card-art")).toBeNull();
  expect(view.container.querySelector("output")?.textContent).toBe("play");
  act(() => {
    vi.advanceTimersByTime(GOING_OUT_PAUSE_MS);
  });
  expect(view.container.querySelector("output")?.textContent).toBe("scoring");
});
