import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { footSnapshot } from "../lib/footSequence";
import {
  useDrawMotion,
  REPLACEMENT_DRAW_MS,
  RED_REPLACEMENT_MS,
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
