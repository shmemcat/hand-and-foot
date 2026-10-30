import { useRef } from "react";
import { fireEvent, render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { ScoreHalo } from "./ScoreHalo";

let scale: number;
let scroll: number;

beforeEach(() => {
  scale = 0.8;
  scroll = 0;
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains("board-carousel") ? 1000 : 0;
    },
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.classList.contains("closed-card-stack")) {
        const x =
          this.parentElement?.getAttribute("data-meld-id") === "kings"
            ? 100
            : 250;
        return new DOMRect(
          40 + (x - scroll) * scale,
          100 + 50 * scale,
          62 * scale,
          87 * scale,
        );
      }
      return new DOMRect(40, 100, 1000 * scale, 420 * scale);
    },
  );
});

function Fixture({ activePile }: { activePile?: string }) {
  const board = useRef<HTMLDivElement>(null);
  return (
    <div ref={board}>
      <div className="board-carousel">
        <section className="player-lane" style={{ overflow: "hidden" }}>
          <div className="pile-group" style={{ overflow: "auto" }}>
            <div className="pile-row-content" style={{ overflow: "clip" }}>
              {["kings", "queens"].map((id) => (
                <div data-meld-id={id} key={id}>
                  <div className="closed-card-stack" />
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
      <ScoreHalo
        board={board}
        activePile={activePile}
        beatKey={activePile ?? "ready"}
        reduced={false}
      />
    </div>
  );
}

it("draws the halo outside every clipped pile container at the book's scaled position", () => {
  const view = render(<Fixture activePile="kings" />);
  const halo = view.container.querySelector<HTMLElement>(
    '[data-score-halo-id="kings"]',
  )!;
  expect(halo.parentElement?.parentElement?.className).toBe("board-carousel");
  expect(
    halo.closest(".player-lane, .pile-group, .pile-row-content"),
  ).toBeNull();
  expect(parseFloat(halo.style.left)).toBeCloseTo(100);
  expect(parseFloat(halo.style.top)).toBeCloseTo(50);
  expect(parseFloat(halo.style.width)).toBeCloseTo(62);
  expect(parseFloat(halo.style.height)).toBeCloseTo(87);
});

it("keeps the previous halo mounted to fade out when counting moves to the next book", () => {
  const view = render(<Fixture activePile="kings" />);
  const king = view.container.querySelector('[data-score-halo-id="kings"]')!;
  expect(king.getAttribute("data-active")).toBe("true");
  view.rerender(<Fixture activePile="queens" />);
  expect(view.container.querySelector('[data-score-halo-id="kings"]')).toBe(
    king,
  );
  expect(king.getAttribute("data-active")).toBe("false");
  expect(
    view.container
      .querySelector('[data-score-halo-id="queens"]')
      ?.getAttribute("data-active"),
  ).toBe("true");
});

it("tracks scrolling and zoom changes and hides a book's halo once it scrolls out of view", () => {
  const view = render(<Fixture activePile="kings" />);
  const row = view.container.querySelector(".pile-group")!;
  const halo = view.container.querySelector<HTMLElement>(
    '[data-score-halo-id="kings"]',
  )!;
  scroll = 30;
  fireEvent.scroll(row);
  expect(parseFloat(halo.style.left)).toBeCloseTo(70);
  scale = 0.5;
  fireEvent.resize(window);
  expect(parseFloat(halo.style.left)).toBeCloseTo(70);
  expect(parseFloat(halo.style.width)).toBeCloseTo(62);
  scroll = 200;
  fireEvent.scroll(row);
  expect(
    view.container.querySelector('[data-score-halo-id="kings"]'),
  ).toBeNull();
});
