import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { BookPreview, bookExample, type BookExample } from "./BookPreview";
import { BOOK_CLOSE_MS } from "../hooks/useBookClosing";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import type { Snapshot } from "../types";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("party-js", () => ({
  default: { confetti: vi.fn(), variation: { range: () => 90 } },
}));
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
      const slot = this.closest<HTMLElement>("[data-card-id]");
      const layer = parseFloat(slot?.style.top ?? "0") || 0;
      const hand = this.closest(".hand-card");
      const closed = this.closest(".closed-books");
      return new DOMRect(
        hand ? 100 : 350,
        hand ? 800 : closed ? 100 : 350 + layer,
        closed ? 62 : 76,
        this.classList.contains("board-carousel") ? 550 : closed ? 87 : 106,
      );
    },
  );
});
afterEach(() => vi.useRealTimers());
const room = (snapshot: Snapshot, paused = false, speed = 1) => (
  <MemoryRouter>
    <Room
      rehearsal={{
        snapshot,
        onChoose: () => {},
        meldSpeed: speed,
        meldPaused: paused,
      }}
    />
  </MemoryRouter>
);
const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

it.each(["clean", "dirty", "reds", "first"] as BookExample[])(
  "lands the last card before gathering and raising the %s book",
  (example) => {
    const before = bookExample(example, false),
      after = bookExample(example, true);
    const view = render(room(before));
    view.rerender(room(after));
    expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(
      1,
    );
    expect(view.container.querySelector(".book-closing-layer")).toBeNull();
    const pileSelector =
      example === "reds" ? ".red-three-pile" : '[data-meld-id="closing-book"]';
    expect(
      view.container.querySelector(`.open-piles ${pileSelector}`),
    ).toBeTruthy();
    advance(MELD_FLIGHT_MS);
    const flights = [
      ...view.container.querySelectorAll<HTMLElement>(".book-closing-card"),
    ];
    expect(flights).toHaveLength(example === "reds" ? 3 : 7);
    expect(
      view.container.querySelector(`.closed-books ${pileSelector}`),
    ).toBeTruthy();
    expect(
      flights.every(
        (card) => parseFloat(card.style.getPropertyValue("--book-y")) < 0,
      ),
    ).toBe(true);
    expect(
      flights.some(
        (card) =>
          parseFloat(card.style.getPropertyValue("--book-gather-y")) < 0,
      ),
    ).toBe(true);
    expect(
      view.container.querySelector<HTMLElement>(".board-carousel")?.style
        .minHeight,
    ).toBe("550px");
    advance(BOOK_CLOSE_MS - 1);
    expect(view.container.querySelector(".book-closing-layer")).toBeTruthy();
    advance(1);
    expect(view.container.querySelector(".book-closing-layer")).toBeNull();
    expect(view.container.querySelector(".meld-card-flight")).toBeNull();
    expect(
      view.container.querySelector(`.closed-books ${pileSelector}`),
    ).toBeTruthy();
    view.rerender(room({ ...after, revision: 3 }));
    expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  },
);

it("pauses slow closing, resumes it, and cancels cleanly when scrolling", () => {
  const before = bookExample("clean", false),
    after = bookExample("clean", true);
  const view = render(room(before, false, 0.5));
  view.rerender(room(after, false, 0.5));
  advance(MELD_FLIGHT_MS / 0.5);
  advance(200);
  view.rerender(room(after, true, 0.5));
  expect(
    view.container.querySelector<HTMLElement>(".book-closing-card")?.style
      .animationPlayState,
  ).toBe("paused");
  advance(5000);
  expect(view.container.querySelectorAll(".book-closing-card")).toHaveLength(7);
  view.rerender(room(after, false, 0.5));
  advance(BOOK_CLOSE_MS / 0.5 - 200);
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  view.rerender(room(before));
  view.rerender(room(after));
  advance(MELD_FLIGHT_MS);
  act(() => window.dispatchEvent(new Event("scroll")));
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  expect(
    view.container.querySelector(".closed-books [data-meld-id=closing-book]"),
  ).toBeTruthy();
});

it("lands all seven cards in a new open pile before gathering and raising the book", () => {
  const view = render(room(bookExample("whole", false)));
  view.rerender(room(bookExample("whole", true)));
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(7);
  expect(
    view.container.querySelector('.open-piles [data-meld-id="closing-book"]'),
  ).toBeTruthy();
  expect(
    view.container.querySelector('.closed-books [data-meld-id="closing-book"]'),
  ).toBeNull();
  advance(MELD_FLIGHT_MS - 1);
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  advance(1);
  expect(view.container.querySelectorAll(".book-closing-card")).toHaveLength(7);
  expect(
    view.container.querySelector('.closed-books [data-meld-id="closing-book"]'),
  ).toBeTruthy();
  advance(BOOK_CLOSE_MS);
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
});

it.each(["add-clean", "add-dirty"] as BookExample[])(
  "updates the count only after a legal addition lands (%s)",
  (example) => {
    const view = render(room(bookExample(example, false)));
    const book = () =>
      view.container.querySelector('[data-meld-id="closing-book"]')!;
    const cover = () =>
      book()
        .querySelector(".closed-card-stack")
        ?.getAttribute("data-book-cover-id");
    const original = cover();
    const label = example === "add-clean" ? "Clean book" : "Dirty book";
    const bonus = example === "add-clean" ? 500 : 300;
    view.rerender(room(bookExample(example, true)));
    expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(
      1,
    );
    expect(book().querySelector(".meld-kind")?.textContent).toBe(label);
    expect(book().querySelector(".meld-count")?.textContent).toBe("7 cards");
    expect(
      book().querySelector(".closed-card-stack")?.getAttribute("aria-label"),
    ).toContain(`${bonus} bonus points`);
    expect(cover()).toBe(original);
    advance(MELD_FLIGHT_MS - 1);
    expect(cover()).toBe(original);
    advance(1);
    expect(book().querySelector(".meld-kind")?.textContent).toBe(label);
    expect(book().querySelector(".meld-count")?.textContent).toBe("8 cards");
    expect(
      book().querySelector(".closed-card-stack")?.getAttribute("aria-label"),
    ).toContain(`${bonus} bonus points`);
    if (example === "add-clean") expect(cover()).not.toBe(original);
    else expect(cover()).toBe(original);
    expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  },
);

it("does not replay completed books on join and cancels when a round changes", () => {
  const before = bookExample("clean", false),
    after = bookExample("clean", true);
  const view = render(room(after));
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  view.rerender(room(before));
  view.rerender(room(after));
  advance(MELD_FLIGHT_MS);
  expect(view.container.querySelector(".book-closing-layer")).toBeTruthy();
  view.rerender(room({ ...after, round: 5 }));
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
});

it.each(["mobile", "reduced", "online", "partnership"])(
  "updates immediately for %s",
  (mode) => {
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches:
            query ===
            (mode === "reduced"
              ? "(prefers-reduced-motion: reduce)"
              : mode === "mobile"
                ? "mobile"
                : "(min-width: 769px)"),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    const options =
      mode === "online"
        ? { playMode: "online" as const }
        : mode === "partnership"
          ? { scoringMode: "partnership" as const }
          : {};
    const view = render(room({ ...bookExample("clean", false), ...options }));
    view.rerender(room({ ...bookExample("clean", true), ...options }));
    advance(MELD_FLIGHT_MS);
    expect(view.container.querySelector(".book-closing-layer")).toBeNull();
    expect(view.container.querySelector(".closed-card-stack")).toBeTruthy();
  },
);

it("replays the real closing sequence without accumulating cards and resets mid-motion", () => {
  const view = render(
    <MemoryRouter>
      <BookPreview />
    </MemoryRouter>,
  );
  const handCount = view.container.querySelectorAll(".hand-card").length;
  for (let replay = 0; replay < 2; replay++) {
    fireEvent.click(
      screen.getByRole("button", {
        name: replay ? "Replay closing" : "Play closing",
      }),
    );
    advance(100);
    advance(MELD_FLIGHT_MS / 0.5);
    expect(view.container.querySelectorAll(".book-closing-card")).toHaveLength(
      7,
    );
    advance(BOOK_CLOSE_MS / 0.5);
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
      handCount - 1,
    );
  }
  fireEvent.click(screen.getByRole("button", { name: "Replay closing" }));
  advance(100);
  advance(MELD_FLIGHT_MS / 0.5);
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(view.container.querySelector(".book-closing-layer")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(handCount);
});
