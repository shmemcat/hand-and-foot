import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { footSnapshot } from "../lib/footSequence";
import {
  useDrawMotion,
  REPLACEMENT_DRAW_MS,
  RED_REPLACEMENT_MS,
  DRAW_FLIGHT_MS,
} from "./useDrawMotion";

afterEach(() => vi.useRealTimers());
it("waits for replacement cards before starting the outgoing red and incoming draw", () => {
  vi.useFakeTimers();
  const source = footSnapshot("play", "ready", 0);
  source.phase = "play";
  source.hand = [
    {
      ...source.hand[0],
      id: "red",
      rank: "3",
      redThree: true,
      value: -300,
      suit: "hearts",
    },
  ];
  const node = document.createElement("div");
  node.className = "game-page";
  node.innerHTML =
    '<div class="hand-card" data-card-id="red"><div class="card"></div></div><div class="draw-pile"><div class="card"></div></div><div class="discard-pickup"><div class="card"></div></div>';
  document.body.append(node);
  const deck = node.querySelector(".draw-pile .card")!;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return new DOMRect(
        this.closest(".discard-pickup")
          ? 500
          : this.closest(".hand-card")
            ? 80
            : 200,
        100,
        62,
        87,
      );
    },
  );
  const view = renderHook(({ snapshot }) => useDrawMotion(snapshot, false), {
    initialProps: { snapshot: source },
  });
  act(() => {
    expect(
      view.result.current.begin(source, deck, { replaceIds: ["red"] }),
    ).toBe(true);
  });
  expect(view.result.current.active).toBe(true);
  expect(view.result.current.request?.replaced?.[0].card.id).toBe("red");
  expect(view.result.current.request?.replaced?.[0].to.left).toBe(500);
  act(() => vi.advanceTimersByTime(3000));
  expect(view.result.current.active).toBe(true);
  const incoming = {
    ...source,
    token: "replacement",
    discard: source.hand[0],
    discardCount: source.discardCount + 1,
    hand: [
      {
        ...source.hand[0],
        id: "new-card",
        rank: "A",
        redThree: false,
        value: 20,
      },
    ],
  };
  view.rerender({ snapshot: incoming });
  expect(view.result.current.cards.map((card) => card.id)).toEqual([
    "new-card",
  ]);
  expect(view.result.current.discardBefore?.card?.id).toBe(source.discard?.id);
  act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS));
  expect(view.result.current.discardBefore).toBeUndefined();
  act(() => vi.advanceTimersByTime(REPLACEMENT_DRAW_MS - 1));
  expect(view.result.current.active).toBe(true);
  act(() => vi.advanceTimersByTime(1));
  expect(view.result.current.active).toBe(false);
  node.remove();
});

it.each([false, true])(
  "waits for the browser to finish a delayed draw (replacement: %s)",
  async (replacing) => {
    vi.useFakeTimers();
    const source = footSnapshot("play", "ready", 0);
    source.phase = replacing ? "play" : "draw";
    source.drawCount = 1;
    source.hand = [
      {
        ...source.hand[0],
        id: "before",
        ...(replacing ? { rank: "3", redThree: true, suit: "hearts" } : {}),
      },
    ];
    const root = document.createElement("div");
    root.className = "game-page";
    root.innerHTML =
      '<div class="hand-card" data-card-id="before"><div class="card"></div></div><div class="draw-pile"><div class="card"></div></div><div class="discard-pickup"><div class="card"></div></div>';
    document.body.append(root);
    const view = renderHook(({ snapshot }) => useDrawMotion(snapshot, false), {
      initialProps: { snapshot: source },
    });
    act(() => {
      view.result.current.begin(
        source,
        root.querySelector(".draw-pile .card"),
        replacing ? { replaceIds: ["before"] } : undefined,
      );
    });
    const newCard = {
      ...source.hand[0],
      id: "drawn",
      rank: "K",
      redThree: false,
    };
    view.rerender({
      snapshot: {
        ...source,
        token: "drawn",
        phase: "play",
        hand: replacing ? [newCard] : [...source.hand, newCard],
      },
    });
    const flight = document.createElement("div");
    flight.className = "draw-card-flight";
    let land!: () => void;
    const landed = new Promise<void>((resolve) => {
      land = resolve;
    });
    flight.getAnimations = () => [{ finished: landed } as unknown as Animation];
    root.append(flight);
    if (replacing) {
      const red = document.createElement("div");
      red.className = "red-replacement-flight";
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      red.getAnimations = () => [{ finished } as unknown as Animation];
      root.append(red);
      act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS + 150));
      expect(view.result.current.discardBefore).toBeDefined();
      await act(async () => finish());
      expect(view.result.current.discardBefore).toBeUndefined();
    }
    act(() => vi.advanceTimersByTime(DRAW_FLIGHT_MS + 200));
    expect(view.result.current.active).toBe(true);
    await act(async () => land());
    expect(view.result.current.active).toBe(false);
    view.unmount();
    root.remove();
  },
);
