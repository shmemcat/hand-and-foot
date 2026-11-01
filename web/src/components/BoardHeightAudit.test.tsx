import { render } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { meldClipping } from "./BoardHeightAudit";

let cardLeft: number;
let cardTop: number;
let cardWidth: number;
let stripTop: number;
beforeEach(() => {
  cardLeft = 150;
  cardTop = 175;
  cardWidth = 76;
  stripTop = 100;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      if (this.classList.contains("card"))
        return new DOMRect(cardLeft, cardTop, cardWidth, 106);
      if (this.classList.contains("pile-row-content"))
        return new DOMRect(100, 150, 600, 253);
      if (this.classList.contains("open-piles"))
        return new DOMRect(0, stripTop, 800, 420 - stripTop);
      if (this.classList.contains("meld-pile"))
        return new DOMRect(640, 150, 176, 253);
      return new DOMRect(0, 0, 800, 420);
    },
  );
});

function pile(hidden = false) {
  const view = render(
    <div className="game-page">
      <div
        className="open-piles"
        style={{ overflowX: "auto", overflowY: "hidden" }}
      >
        <div
          className="pile-row-content"
          style={{ overflowX: "clip", overflowY: "visible" }}
        >
          <div className="meld-pile">
            <div
              className="card"
              style={{ opacity: 1, visibility: hidden ? "hidden" : "visible" }}
            />
          </div>
        </div>
      </div>
    </div>,
  );
  return view.container.querySelector<HTMLElement>(".meld-pile")!;
}

it("checks the painted card instead of the wider, unpainted pile box", () => {
  cardLeft = 610;
  expect(meldClipping(pile()).pixels).toBe(0);
});

it("detects a card cropped by the inner row even while it fits the scroll viewport", () => {
  cardLeft = 660;
  expect(meldClipping(pile()).pixels).toBe(36);
});

it("includes the row's explicit allowance for corners rotating into the strip padding", () => {
  cardLeft = 626;
  const node = pile();
  expect(meldClipping(node).pixels).toBe(2);
  node.parentElement!.style.overflowClipMargin = "6px";
  expect(meldClipping(node).pixels).toBe(0);
});

it("allows a vertical shift past the row edge and detects cropping at the outer viewport", () => {
  cardTop = 130;
  const node = pile();
  expect(meldClipping(node).pixels).toBe(0);
  stripTop = 150;
  expect(meldClipping(node).pixels).toBe(20);
});

it("ignores the hidden landing card while its visible copy is flying", () => {
  cardLeft = 760;
  expect(meldClipping(pile(true)).pixels).toBe(0);
});

it("does not report extra visibility loss when an already offscreen card rotates wider", () => {
  cardLeft = 850;
  const node = pile();
  expect(meldClipping(node)).toEqual({ pixels: 76, fraction: 1 });
  cardWidth = 130;
  expect(meldClipping(node)).toEqual({ pixels: 130, fraction: 1 });
});
