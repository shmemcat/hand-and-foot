import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ScoringPreview } from "./ScoringPreview";
import { BOOK_CLOSE_MS } from "../hooks/useBookClosing";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  scoringHeldCards,
} from "../lib/scoringSequence";
const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
});
afterEach(() => vi.useRealTimers());
const show = () =>
  render(
    <MemoryRouter>
      <ScoringPreview />
    </MemoryRouter>,
  );
it("keeps the settlement piles mounted in the footer opposite Follow turn while hidden", () => {
  const view = show();
  const footer = view.container.querySelector(".board-footer-summary")!;
  const piles = footer.querySelector(".score-settlement-piles");
  expect(footer.getAttribute("aria-hidden")).toBe("true");
  expect(footer.parentElement?.classList.contains("board-browser")).toBe(true);
  expect(footer.parentElement?.querySelector(".follow-control")).toBeTruthy();
  expect(
    view.container.querySelector(".hand-heading .score-settlement-piles"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(view.container.querySelector(".board-footer-summary")).toBe(footer);
  expect(footer.querySelector(".score-settlement-piles")).toBe(piles);
  expect(footer.getAttribute("aria-hidden")).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(footer.querySelector(".score-settlement-piles")).toBe(piles);
  expect(footer.getAttribute("aria-hidden")).toBe("true");
});
it("keeps a partial card stationary above the footer while incoming cards reconcile against it", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(300, 500, 62, 87),
  );
  const view = show();
  const beats = scoringSequence(SCORING_SCENARIOS[0]);
  const index = beats.findIndex(
    (beat, index) =>
      beat.kind === "pair" &&
      scoringHeldCards(beat).some(
        (face) =>
          beats[index + 1]?.kind === "pair" &&
          scoringHeldCards(beats[index + 1]).some(
            (next) => next.id === face.id,
          ),
      ),
  );
  fireEvent.change(screen.getByLabelText("Scoring step"), {
    target: { value: index },
  });
  const held = scoringHeldCards(beats[index])[0];
  const parked = view.container.querySelector(
    `[data-score-holding-id="${held.id}"]`,
  )!;
  expect(parked.closest(".board-footer-summary")).toBeTruthy();
  expect(
    view.container.querySelector(`.hand-card[data-card-id="${held.id}"]`),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(
    view.container.querySelector(`[data-score-holding-id="${held.id}"]`),
  ).toBe(parked);
  expect(parked.textContent).toContain(
    `${beats[index + 1].pointsLeft[held.id]} pts left`,
  );
  expect(
    view.container.querySelector(`[data-score-flight-id="${held.id}"]`),
  ).toBeNull();
  expect(
    view.container.querySelectorAll(".score-card-flight.is-paired"),
  ).toHaveLength(1);
});
it("starts on the actual Room board and gathers the real foot before settling", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("SAVED-ROOM"));
  const view = show();
  expect(
    view.container.querySelector(".game-page.individual-game"),
  ).toBeTruthy();
  expect(view.container.querySelectorAll(".closed-card-stack")).toHaveLength(4);
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(4);
  expect(
    screen.getByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Play count" }));
  act(() => vi.advanceTimersByTime(1200));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(15);
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  act(() => vi.advanceTimersByTime(10000));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(15);
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(14);
  expect(
    view.container.querySelector('.game-page [data-card-id="hand-K"]'),
  ).toBeNull();
  expect(view.container.querySelectorAll(".card.spent")).toHaveLength(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(localStorage.getItem("handandfoot.room.v1")).toBe(
    JSON.stringify("SAVED-ROOM"),
  );
});
it("moves broken books down into the normal open section with their label", () => {
  const view = show(),
    beats = scoringSequence(SCORING_SCENARIOS[0]);
  const broken = beats.findIndex((beat) => beat.kind === "break");
  fireEvent.change(screen.getByLabelText("Scoring step"), {
    target: { value: broken },
  });
  expect(
    view.container.querySelector('.closed-books [data-meld-id="queens"]'),
  ).toBeNull();
  expect(
    view.container.querySelector('.open-piles [data-meld-id="queens"]'),
  ).toBeTruthy();
  expect(screen.getByText("Broken book")).toBeTruthy();
  expect(screen.queryByText(/−300|bonus lost/)).toBeNull();
  expect(view.container.querySelectorAll(".card.spent")).toHaveLength(0);
});
it("moves a broken book down compactly before expanding into its open stack", () => {
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
      const closed = this.closest(".closed-books");
      const layer = this.closest<HTMLElement>(".meld-card-layer");
      return new DOMRect(
        closed ? 400 : 200,
        closed ? 200 : 450 + (parseFloat(layer?.style.top ?? "0") || 0),
        closed ? 62 : 76,
        closed ? 87 : 106,
      );
    },
  );
  const view = show();
  const beats = scoringSequence(SCORING_SCENARIOS[0]);
  const broken = beats.findIndex((beat) => beat.kind === "break");
  fireEvent.change(screen.getByLabelText("Scoring step"), {
    target: { value: broken - 1 },
  });
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  const cards = [
    ...view.container.querySelectorAll<HTMLElement>(".book-opening-card"),
  ];
  expect(cards).toHaveLength(7);
  expect(view.container.querySelector(".score-card-flight")).toBeNull();
  expect(cards.every((card) => card.style.top === "200px")).toBe(true);
  expect(
    cards.every(
      (card) => card.style.getPropertyValue("--book-gather-y") === "250px",
    ),
  ).toBe(true);
  expect(
    new Set(cards.map((card) => card.style.getPropertyValue("--book-y"))).size,
  ).toBe(7);
  expect(cards[0].style.getPropertyValue("--book-duration")).toBe(
    `${BOOK_CLOSE_MS}ms`,
  );
  const cover = cards.find(
    (card) => card.style.getPropertyValue("--book-cover-layer") === "1",
  )!;
  expect(cover.querySelector(".card")?.getAttribute("aria-label")).toBe(
    "Q of spades",
  );
  act(() => vi.advanceTimersByTime(BOOK_CLOSE_MS + 40));
  expect(view.container.querySelector(".book-opening-layer")).toBeNull();
  expect(
    view.container.querySelectorAll(
      '.open-piles [data-meld-id="queens"] .card',
    ),
  ).toHaveLength(7);
  expect(view.container.querySelectorAll(".card.spent")).toHaveLength(0);
});
it("counts red face values, keeps the breakdown until the end, and replays cleanly", () => {
  const view = show();
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Skip to total" }));
  expect(
    view.container.querySelector(".score-running-count")?.textContent,
  ).toContain("2,985");
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(0);
  expect(view.container.querySelectorAll(".meld-pile")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Round scorecard" }));
  expect(
    screen.getByRole("dialog", { name: "End-of-round scorecard" }),
  ).toBeTruthy();
  expect(screen.getByText(/includes 4 red 3s/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close scorecard" }));
  fireEvent.click(screen.getByRole("button", { name: "Replay count" }));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(4);
  expect(view.container.querySelectorAll(".closed-card-stack")).toHaveLength(4);
  expect(
    view.container.querySelector(".score-running-count strong span")
      ?.textContent,
  ).toBe("0");
  expect(sound.play).not.toHaveBeenCalledWith("redThreeCelebration");
});
it("changes scenarios and reduced motion without playing old flights", () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(view.container.querySelectorAll(".score-card-flight")).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Scoring scenario"), {
    target: { value: "uncovered" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Skip to total" }));
  expect(
    screen.getByRole("group", { name: "Uncovered debt: 155 points" }),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".score-running-count")?.textContent,
  ).toContain("-155");
});
it("shows a red pile that was short at round end as a pure penalty", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Scoring scenario"), {
    target: { value: "short-reds" },
  });
  expect(
    view.container.querySelector(".open-piles .red-three-pile"),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".closed-books .red-three-pile"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Skip to total" }));
  expect(
    view.container.querySelector(".score-running-count")?.textContent,
  ).toContain("-600");
  expect(view.container.querySelector(".red-three-stack")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Round scorecard" }));
  const scorecard = screen.getByRole("dialog", {
    name: "End-of-round scorecard",
  });
  expect(scorecard.textContent).toContain("2 red 3s");
  expect(scorecard.textContent).toContain("−600");
  expect(scorecard.textContent).not.toContain("× 5");
});
it("shows the ace-versus-three-reds example as minus five without a red-three penalty", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Scoring scenario"), {
    target: { value: "ace-vs-reds" },
  });
  expect(
    view.container.querySelector(".closed-books .red-three-pile"),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".open-piles .red-three-pile"),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(screen.getByText("Broken reds")).toBeTruthy();
  expect(screen.getByText("3 · 5 pts each")).toBeTruthy();
  expect(
    view.container.querySelector(".closed-books .red-three-pile"),
  ).toBeNull();
  expect(
    view.container.querySelector(".open-piles .red-three-pile"),
  ).toBeTruthy();
  expect(view.container.querySelectorAll(".book-opening-card")).toHaveLength(3);
  fireEvent.click(screen.getByRole("button", { name: "Skip to total" }));
  expect(
    screen.getByRole("group", { name: "Uncovered debt: 5 points" }),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".score-running-count")?.textContent,
  ).toContain("-5");
  fireEvent.click(screen.getByRole("button", { name: "Round scorecard" }));
  const scorecard = screen.getByRole("dialog", {
    name: "End-of-round scorecard",
  });
  expect(scorecard.textContent).toContain("bonus was forfeited");
  expect(scorecard.textContent).toContain("with no penalty");
  expect(scorecard.textContent).not.toContain("−300");
});
it("pairs solid card flights from the actual hand and table, then clears them on scroll", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return this.closest(".hand-card")
        ? new DOMRect(200, 700, 62, 87)
        : new DOMRect(400, 300, 62, 87);
    },
  );
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(view.container.querySelectorAll(".score-card-flight")).toHaveLength(
    11,
  );
  act(() => vi.advanceTimersByTime(1800));
  fireEvent.click(screen.getByRole("button", { name: "Next scoring step" }));
  expect(
    view.container.querySelectorAll(".score-card-flight.is-paired"),
  ).toHaveLength(2);
  fireEvent.scroll(window);
  expect(view.container.querySelectorAll(".score-card-flight")).toHaveLength(0);
});
