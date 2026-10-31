import { StrictMode, useRef, useState } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PILE_SHIFT_MS, usePileLayoutMotion } from "./usePileLayoutMotion";
import {
  BOOK_CLOSE_MS,
  BOOK_RISE_DELAY_MS,
  BOOK_DESCEND_MS,
} from "./useBookClosing";

type Move = {
  node: Element;
  frames: Keyframe[];
  options: KeyframeAnimationOptions;
  x: number;
  y: number;
  playState: string;
  cancel: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  onfinish: (() => void) | null;
};
let moves: Move[];
let resize: () => void;
let observedElements: Element[];
let pageTop: number;
let tableauLeft: number;
let contentLeft: number;
const originalAnimate = Object.getOwnPropertyDescriptor(
  Element.prototype,
  "animate",
);
beforeEach(() => {
  moves = [];
  observedElements = [];
  pageTop = 0;
  tableauLeft = 0;
  contentLeft = 0;
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query === "(min-width: 769px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe(node: Element) {
        observedElements.push(node);
      }
      disconnect() {
        observedElements = [];
      }
    },
  );
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: vi.fn(function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const move = {
        node: this,
        frames,
        options,
        x: 0,
        y: 0,
        playState: "running",
        onfinish: null,
        cancel: vi.fn(() => {
          move.playState = "idle";
          move.x = 0;
          move.y = 0;
        }),
        pause: vi.fn(() => {
          move.playState = "paused";
        }),
        play: vi.fn(() => {
          move.playState = "running";
        }),
      } as Move;
      moves.push(move);
      return move as unknown as Animation;
    }),
  });
  const nativeStyle = window.getComputedStyle;
  vi.stubGlobal("getComputedStyle", (node: Element) => {
    const move = moves
      .slice()
      .reverse()
      .find((item) => item.node === node && item.playState !== "idle");
    return move
      ? { transform: `matrix(1, 0, 0, 1, ${move.x}, ${move.y})` }
      : nativeStyle(node);
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(76);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const pile = this.closest<HTMLElement>(".meld-pile")!;
      const inheritedLeft =
        (this.closest(".tableau") ? tableauLeft : 0) +
        (this.closest(".tableau-content") ? contentLeft : 0);
      if (!pile) return new DOMRect(inheritedLeft, pageTop, 800, 600);
      const zoom = Number(pile?.dataset.zoom ?? 1);
      const move = moves
        .slice()
        .reverse()
        .find((item) => item.node === pile && item.playState !== "idle");
      return new DOMRect(
        inheritedLeft + Number(pile?.dataset.left ?? 0) + (move?.x ?? 0) * zoom,
        pageTop + Number(pile.dataset.top ?? 300) + (move?.y ?? 0) * zoom,
        76 * zoom,
        106 * zoom,
      );
    },
  );
});
afterEach(() => {
  if (originalAnimate)
    Object.defineProperty(Element.prototype, "animate", originalAnimate);
  else delete (Element.prototype as Partial<Element>).animate;
});

function Board({
  left = 100,
  scope = "round-1",
  reduced = false,
  paused = false,
  speed = 1,
  row = "open",
  zoom = 1,
  delay = 0,
  duration,
}: {
  left?: number;
  scope?: string;
  reduced?: boolean;
  paused?: boolean;
  speed?: number;
  row?: string;
  zoom?: number;
  delay?: number;
  duration?: number;
}) {
  const board = useRef<HTMLDivElement>(null);
  usePileLayoutMotion(board, {
    scope,
    enabled: true,
    reduced,
    paused,
    speed,
    delay,
    duration,
  });
  return (
    <div ref={board}>
      <div className="board-carousel">
        <section className="tableau">
          <div className="tableau-content">
            <div className={row === "closed" ? "closed-books" : "open-piles"}>
              <div
                className="meld-pile"
                data-meld-id="tens"
                data-left={left}
                data-zoom={zoom}
              >
                <div className="meld-card-layers">Actual pile</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

it("slides an existing pile between grid columns without scaling its cards", () => {
  const view = render(<Board />);
  expect(moves).toHaveLength(0);
  view.rerender(<Board left={250} />);
  expect(moves).toHaveLength(1);
  expect(moves[0].frames).toEqual([
    { transform: "translate(-150px, 0px)" },
    { transform: "translate(0, 0)" },
  ]);
  expect(moves[0].options.duration).toBe(PILE_SHIFT_MS);
  view.rerender(<Board left={250} />);
  expect(moves).toHaveLength(1);
});

it("retargets a second column change from the currently visible position", () => {
  const view = render(<Board />);
  view.rerender(<Board left={200} />);
  moves[0].x = -50;
  view.rerender(<Board left={300} />);
  expect(moves[0].cancel).toHaveBeenCalledOnce();
  expect(moves[1].frames[0].transform).toBe("translate(-150px, 0px)");
});

function ClosingRow({
  closed = false,
  closingIndex = 1,
  reduced = false,
  scope = "round-1",
  paused = false,
}: {
  closed?: boolean;
  closingIndex?: number;
  reduced?: boolean;
  scope?: string;
  paused?: boolean;
}) {
  const board = useRef<HTMLDivElement>(null);
  usePileLayoutMotion(board, { scope, enabled: true, reduced, paused });
  return (
    <div ref={board}>
      <div className="board-carousel">
        <div className="open-piles">
          <div className="pile-row-content">
            {[0, 1, 2]
              .filter((index) => !closed || index !== closingIndex)
              .map((index, column) => (
                <div
                  key={index}
                  className="meld-pile"
                  data-meld-id={`pile-${index}`}
                  data-left={closed ? 98 + column * 196 : index * 196}
                >
                  <div className="meld-card-layers" />
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

it.each([0, 1, 2])(
  "keeps survivors visible when closing pile %s of three, then restores the row clip",
  (closingIndex) => {
    const view = render(<ClosingRow closingIndex={closingIndex} />);
    const row = view.container.querySelector<HTMLElement>(".pile-row-content")!;
    view.rerender(<ClosingRow closed closingIndex={closingIndex} />);
    expect(moves).toHaveLength(2);
    expect(moves.map((move) => move.frames[0].transform)).toEqual([
      `translate(${closingIndex === 0 ? 98 : -98}px, 0px)`,
      `translate(${closingIndex === 2 ? -98 : 98}px, 0px)`,
    ]);
    expect(row.style.getPropertyValue("overflow-clip-margin")).toBe("98px");
    act(() => moves[0].onfinish!());
    expect(row.style.getPropertyValue("overflow-clip-margin")).toBe("98px");
    act(() => moves[1].onfinish!());
    expect(row.style.getPropertyValue("overflow-clip-margin")).toBe("");
  },
);

it.each(["reduced", "board"])(
  "clears the expanded row clip when a pile slide is canceled by %s",
  (reason) => {
    const view = render(<ClosingRow />);
    const row = view.container.querySelector<HTMLElement>(".pile-row-content")!;
    view.rerender(<ClosingRow closed paused />);
    expect(row.style.getPropertyValue("overflow-clip-margin")).toBe("98px");
    expect(moves.every((move) => move.playState === "paused")).toBe(true);
    view.rerender(
      <ClosingRow
        closed
        reduced={reason === "reduced"}
        scope={reason === "board" ? "other-board" : "round-1"}
      />,
    );
    expect(row.style.getPropertyValue("overflow-clip-margin")).toBe("");
    expect(moves.every((move) => move.cancel.mock.calls.length === 1)).toBe(
      true,
    );
  },
);

it("responds to board resizing without requiring another game update", () => {
  const view = render(<Board />);
  view.container.querySelector<HTMLElement>(".meld-pile")!.dataset.left = "400";
  act(() => resize());
  expect(moves[0].frames[0].transform).toBe("translate(-300px, 0px)");
  act(() => resize());
  expect(moves).toHaveLength(1);
});

function InspectionPiles() {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="melds">
      <button onClick={() => setExpanded(!expanded)}>Inspect book</button>
      {expanded && <div>Cards in the completed book</div>}
      <div className="open-piles">
        <div
          className="meld-pile"
          data-meld-id="tens"
          data-top={expanded ? 420 : 300}
        >
          <div className="meld-card-layers">Open pile below the book</div>
        </div>
      </div>
    </div>
  );
}
function InspectionBoard() {
  const board = useRef<HTMLDivElement>(null);
  usePileLayoutMotion(board, {
    scope: "round-1",
    enabled: true,
    reduced: false,
  });
  return (
    <div ref={board}>
      <div className="board-carousel">
        <InspectionPiles />
      </div>
    </div>
  );
}
it("keeps observing inspection after React replays the preview effects", () => {
  render(
    <StrictMode>
      <InspectionBoard />
    </StrictMode>,
  );
  expect(
    observedElements.some((node) => node.classList.contains("melds")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Inspect book" }));
  act(() => resize());
  expect(moves).toHaveLength(1);
});
it("moves the open row once for a local inspection resize even if the board height stays fixed", () => {
  render(<InspectionBoard />);
  expect(
    observedElements.some((node) => node.classList.contains("melds")),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Inspect book" }));
  act(() => resize());
  expect(moves).toHaveLength(1);
  expect(moves[0].frames[0].transform).toBe("translate(0px, -120px)");
  moves[0].y = -60;
  act(() => resize());
  expect(moves).toHaveLength(1);
  expect(moves[0].cancel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Inspect book" }));
  act(() => resize());
  expect(moves).toHaveLength(2);
  expect(moves[1].frames[0].transform).toBe("translate(0px, 60px)");
});

it("does not restart or cancel a pile slide when the page adjusts its scroll position", () => {
  const view = render(<Board />);
  view.rerender(<Board left={200} />);
  moves[0].x = -50;
  pageTop = -24;
  act(() => {
    window.dispatchEvent(new Event("scroll"));
    resize();
  });
  expect(moves).toHaveLength(1);
  expect(moves[0].cancel).not.toHaveBeenCalled();
});

it.each(["tableau", "tableau-content"])(
  "does not add a second pile animation while %s swipes or settles",
  (target) => {
    const shift = (left: number) => {
      if (target === "tableau") tableauLeft = left;
      else contentLeft = left;
    };
    const view = render(<Board />);
    shift(28);
    act(() => resize());
    expect(moves).toHaveLength(0);
    shift(12);
    view.rerender(<Board />);
    expect(moves).toHaveLength(0);
    shift(0);
    act(() => resize());
    expect(moves).toHaveLength(0);

    // An actual grid change during a swipe still moves only the changed distance.
    shift(20);
    view.rerender(<Board left={200} />);
    expect(moves).toHaveLength(1);
    expect(moves[0].frames[0].transform).toBe("translate(-100px, 0px)");
    moves[0].x = -50;
    shift(0);
    act(() => resize());
    expect(moves).toHaveLength(1);
    expect(moves[0].cancel).not.toHaveBeenCalled();
  },
);

it("uses the preview speed, pauses with the book, and resumes its slide", () => {
  const view = render(<Board speed={0.5} />);
  view.rerender(<Board left={200} speed={0.5} paused />);
  expect(moves[0].options.duration).toBe(PILE_SHIFT_MS / 0.5);
  expect(moves[0].playState).toBe("paused");
  view.rerender(<Board left={200} speed={0.5} />);
  expect(moves[0].playState).toBe("running");
});

it("holds neighboring piles through gathering, then moves them during the book's rise", () => {
  const view = render(<Board speed={0.5} />);
  view.rerender(
    <Board
      left={200}
      speed={0.5}
      delay={BOOK_RISE_DELAY_MS}
      duration={BOOK_CLOSE_MS - BOOK_RISE_DELAY_MS}
    />,
  );
  expect(moves[0].options.fill).toBe("backwards");
  expect(moves[0].options.delay).toBe(990);
  expect(moves[0].options.duration).toBe(810);
  expect(
    Number(moves[0].options.delay) + Number(moves[0].options.duration),
  ).toBe(BOOK_CLOSE_MS / 0.5);
});
it("shifts neighboring piles immediately during a broken book's descent", () => {
  const view = render(<Board speed={0.5} />);
  view.rerender(<Board left={200} speed={0.5} duration={BOOK_DESCEND_MS} />);
  expect(moves[0].options.delay).toBe(0);
  expect(moves[0].options.duration).toBe(810);
});

it("preserves travel distance when the preview scales the board", () => {
  const view = render(<Board zoom={0.85} />);
  view.rerender(<Board left={185} zoom={0.85} />);
  expect(moves[0].frames[0].transform).toBe("translate(-100px, 0px)");
});

it("leaves row changes to the book-closing animation and resets when browsing boards", () => {
  const view = render(<Board />);
  view.rerender(<Board left={200} row="closed" />);
  expect(moves).toHaveLength(0);
  view.rerender(<Board left={300} row="closed" />);
  expect(moves).toHaveLength(1);
  view.rerender(<Board left={100} row="closed" scope="another-board" />);
  expect(moves).toHaveLength(1);
  expect(moves[0].cancel).toHaveBeenCalledOnce();
});

it("respects reduced motion and clears slides on unmount", () => {
  const view = render(<Board />);
  view.rerender(<Board left={200} reduced />);
  expect(moves).toHaveLength(0);
  view.rerender(<Board left={300} />);
  expect(moves).toHaveLength(1);
  view.rerender(<Board left={400} />);
  view.unmount();
  expect(moves[1].cancel).toHaveBeenCalledOnce();
});
