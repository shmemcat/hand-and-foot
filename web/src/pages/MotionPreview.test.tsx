import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MotionPreview } from "./MotionPreview";
import {
  RED_REPLACEMENT_MS,
  REPLACEMENT_DRAW_MS,
} from "../hooks/useDrawMotion";
import { command, getRoom, socketCredentials } from "../lib/api";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  command: vi.fn(),
  getRoom: vi.fn(),
  socketCredentials: vi.fn(),
}));
let handMoves: { duration: number; cancel: ReturnType<typeof vi.fn> }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  handMoves = [];
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query === "(min-width: 769px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  Object.defineProperty(Element.prototype, "animate", {
    configurable: true,
    value: vi.fn(function (
      this: Element,
      _frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const animation = {
        duration: Number(options.duration),
        cancel: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        playState: "running",
        onfinish: null,
      };
      if (this.matches(".hand-card")) handMoves.push(animation);
      return animation as unknown as Animation;
    }),
  });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      const slot = this.closest<HTMLElement>(".hand-card");
      if (slot) {
        const siblings = [...slot.parentElement!.children];
        return new DOMRect(
          500 - siblings.length * 36 + siblings.indexOf(slot) * 72,
          700,
          62,
          87,
        );
      }
      if (this.matches(".game-header")) return new DOMRect(0, 100, 1000, 140);
      if (this.matches(".board-carousel"))
        return new DOMRect(0, 280, 1000, 480);
      return new DOMRect(
        this.closest(".draw-pile") ? 450 : 250,
        this.closest(".draw-pile") ? 120 : 420,
        76,
        106,
      );
    },
  );
});
afterEach(() => vi.useRealTimers());
function show(scene = "replacement") {
  return render(
    <MemoryRouter initialEntries={[`/preview/motions?scene=${scene}`]}>
      <MotionPreview />
    </MemoryRouter>,
  );
}
function play() {
  fireEvent.click(
    screen.getByRole("button", { name: /^(Play|Replay) animation$/ }),
  );
  act(() => vi.advanceTimersByTime(100));
}

it("replays red replacement using actual outgoing and incoming flights without touching a real game", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("REAL-GAME"));
  const view = show();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
  expect(document.querySelector(".draw-flight-layer")).toBeNull();
  for (let repeat = 0; repeat < 3; repeat++) {
    play();
    expect(document.querySelectorAll(".red-replacement-flight")).toHaveLength(
      1,
    );
    expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(1);
    expect(
      view.container.querySelector('[data-card-id="replace-red-0"]'),
    ).toBeNull();
    act(() =>
      vi.advanceTimersByTime(RED_REPLACEMENT_MS + REPLACEMENT_DRAW_MS + 60),
    );
    expect(document.querySelector(".draw-flight-layer")).toBeNull();
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
    expect(
      view.container.querySelector('[data-card-id="replacement-0"]'),
    ).toBeTruthy();
  }
  expect(command).not.toHaveBeenCalled();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "REAL-GAME",
  );
});
it("supports two replacement reds in slow motion and resets mid-flight", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Animation example"), {
    target: { value: "two" },
  });
  fireEvent.change(screen.getByLabelText("Animation playback speed"), {
    target: { value: "0.5" },
  });
  play();
  expect(document.querySelectorAll(".red-replacement-flight")).toHaveLength(2);
  expect(document.querySelectorAll(".draw-card-flight")).toHaveLength(2);
  expect(
    (
      document.querySelector(".draw-card-flight") as HTMLElement
    ).style.getPropertyValue("--draw-duration"),
  ).toBe("1320ms");
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  act(() => vi.advanceTimersByTime(10000));
  expect(document.querySelector(".draw-flight-layer")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(12);
  expect(handMoves.every((move) => move.cancel.mock.calls.length > 0)).toBe(
    true,
  );
  expect(
    view.container.querySelector('[data-card-id="replace-red-1"]'),
  ).toBeTruthy();
});
it("lands a replacement red on discard, then covers it with the turn-ending discard", () => {
  const view = show();
  const discard = () =>
    view.container
      .querySelector<HTMLElement>(".discard-face .card")
      ?.getAttribute("aria-label");
  expect(discard()).toBe("8 of spades");
  play();
  expect(discard()).toBe("8 of spades");
  expect(
    document.querySelector('.table-card-flight[data-replacement="true"]'),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS - 1));
  expect(discard()).toBe("8 of spades");
  act(() => vi.advanceTimersByTime(1));
  expect(discard()).toBe("3 of hearts, red three");
  act(() => vi.advanceTimersByTime(REPLACEMENT_DRAW_MS + 60));
  fireEvent.click(screen.getByRole("button", { name: "Discard to end turn" }));
  expect(discard()).toBe("3 of hearts, red three");
  expect(
    document.querySelector('.table-card-flight[data-event-kind="discard"]'),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(600));
  expect(discard()).toBe("10 of spades");
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(10);
  expect(
    screen.getByText("Turn ended. The red three is covered."),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(discard()).toBe("8 of spades");
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
});
it("settles the surviving hand after the three aces land", () => {
  const view = show("hand");
  play();
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(12);
  expect(handMoves.every((move) => move.cancel.mock.calls.length > 0)).toBe(
    true,
  );
  act(() => vi.advanceTimersByTime(440));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(9);
  expect(handMoves.length).toBeGreaterThan(0);
  expect(handMoves.some((move) => move.cancel.mock.calls.length === 0)).toBe(
    true,
  );
  expect(handMoves.every((move) => move.duration === 360)).toBe(true);
  expect(document.querySelector(".card.spent")).toBeNull();
});
it("shows a real discard flight and slides the hand without browsing away", () => {
  const view = show("hand");
  fireEvent.change(screen.getByLabelText("Animation example"), {
    target: { value: "discard" },
  });
  fireEvent.change(screen.getByLabelText("Animation playback speed"), {
    target: { value: "0.5" },
  });
  play();
  const flight = document.querySelector<HTMLElement>(
    '.table-card-flight[data-event-kind="discard"]',
  );
  expect(flight?.dataset.local).toBe("true");
  expect(flight?.style.getPropertyValue("--table-duration")).toBe("1200ms");
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
  expect(handMoves.some((move) => move.duration === 720)).toBe(true);
  act(() => vi.advanceTimersByTime(1200));
  expect(document.querySelector(".table-flight-layer")).toBeNull();
  expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
});
it.each([
  ["new", 3],
  ["add", 1],
  ["close", 1],
] as const)(
  "replays the bot’s %s play before any book closing",
  (example, count) => {
    const view = show("bot");
    fireEvent.change(screen.getByLabelText("Animation example"), {
      target: { value: example },
    });
    const handIds = [
      ...view.container.querySelectorAll<HTMLElement>(".hand-card"),
    ].map((node) => node.dataset.cardId);
    play();
    expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
    expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(count);
    expect(document.querySelector(".book-closing-layer")).toBeNull();
    act(() => vi.advanceTimersByTime(440));
    if (example === "close") {
      expect(document.querySelector(".book-closing-layer")).toBeTruthy();
      act(() => vi.advanceTimersByTime(900));
      expect(
        view.container.querySelector(
          '.closed-books [data-meld-id="bot-kings"]',
        ),
      ).toBeTruthy();
    }
    expect(
      view.container.querySelectorAll(".public-hand-cards .card"),
    ).toHaveLength(handIds.length - count);
    expect(
      view.container.querySelector(".public-hand-cards .card-art"),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(
      document.querySelector(".meld-flight-layer,.book-closing-layer"),
    ).toBeNull();
  },
);
it("switches previews cleanly while cards are in flight", () => {
  const view = show();
  play();
  fireEvent.click(screen.getByRole("button", { name: "Bot melds" }));
  expect(document.querySelector(".draw-flight-layer")).toBeNull();
  expect(screen.getByText("Ready when you are.")).toBeTruthy();
  expect(
    view.container.querySelectorAll(".public-hand-cards .card"),
  ).toHaveLength(9);
  play();
  view.unmount();
  expect(
    document.querySelector(
      ".meld-flight-layer,.draw-flight-layer,.book-closing-layer",
    ),
  ).toBeNull();
});
