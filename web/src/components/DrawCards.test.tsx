import { useRef } from "react";
import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { DrawCards } from "./DrawCards";
import type { DrawRequest } from "../hooks/useDrawMotion";
import type { Card } from "../types";

const cards: Card[] = [0, 1].map((i) => ({
  id: `draw-${i}`,
  rank: i === 0 ? "A" : "4",
  suit: "hearts",
  value: i === 0 ? 20 : 5,
  wild: false,
  redThree: false,
}));
const request: DrawRequest = {
  key: 1,
  code: "DRAW",
  round: 1,
  viewer: "you",
  handIds: new Set(),
  handPositions: new Map(),
  speed: 1,
  count: 2,
  afterPickup: false,
  from: { left: 300, top: 100, width: 62, height: 87 },
};
function Hand({
  divider = false,
  drawing = true,
}: {
  divider?: boolean;
  drawing?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  return (
    <div ref={board}>
      <div className="hand-scroll">
        {cards.map((card) => (
          <div className="hand-card" data-card-id={card.id} key={card.id} />
        ))}
      </div>
      {drawing && (
        <DrawCards
          board={board}
          request={request}
          cards={[...cards].reverse()}
          toDivider={divider}
        />
      )}
    </div>
  );
}
function draw(divider = false) {
  const view = render(<Hand drawing={false} />);
  view.rerender(<Hand divider={divider} />);
  return view;
}
function geometry(positions: number[], scale = 1) {
  const scroll = vi.fn();
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.matches(".hand-scroll"))
        return new DOMRect(100, 600, 400 * scale, 100 * scale);
      const i = cards.findIndex(
        (card) => card.id === (this as HTMLElement).dataset.cardId,
      );
      return new DOMRect(positions[i] ?? 0, 600, 62 * scale, 87 * scale);
    },
  );
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(400);
  vi.spyOn(Element.prototype, "clientWidth", "get").mockReturnValue(400);
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value: scroll,
  });
  return scroll;
}

it.each([
  ["right", [600, 680], 258],
  ["left", [-100, 20], -216],
  ["opposite edges", [-100, 600], -216],
] as const)(
  "reveals both draws with an inset when they fit, otherwise favors the higher card (%s)",
  (_, positions, expected) => {
    const scroll = geometry([...positions]);
    const view = draw();
    expect(scroll).toHaveBeenCalledExactlyOnceWith({
      left: expected,
      behavior: "smooth",
    });
    view.rerender(<Hand />);
    expect(scroll).toHaveBeenCalledOnce();
  },
);

it.each([
  [200, 600],
  [600, 200],
  [490, 600],
  [40, 600],
  [200, 300],
])(
  "keeps the hand still when at least one draw is visible (%s, %s)",
  (a, b) => {
    const scroll = geometry([a, b]);
    draw();
    expect(scroll).not.toHaveBeenCalled();
  },
);

it("accounts for CSS zoom when revealing off-screen cards", () => {
  const scroll = geometry([500, 580], 0.8);
  draw();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({
    left: expect.closeTo(278),
    behavior: "smooth",
  });
});

it("does not move the private hand for another player's draw", () => {
  const scroll = geometry([600, 680]);
  draw(true);
  expect(scroll).not.toHaveBeenCalled();
});
