import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { MotionPreview } from "./MotionPreview";
import { Room } from "./Room";
import { turnMotionExample } from "../lib/turnMotionExamples";
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
      if (this.matches(".hand-scroll")) return new DOMRect(0, 650, 1000, 200);
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

it("draws only anonymous backs into the left of the opponent hand", () => {
  const view = show("public");
  const slots = () => [
    ...view.container.querySelectorAll<HTMLElement>(
      ".public-hand-cards [data-public-slot]",
    ),
  ];
  const original = slots().map((slot) => slot.dataset.publicSlot);
  play();
  expect(
    document.querySelectorAll('.table-card-flight[data-concealed="true"]'),
  ).toHaveLength(2);
  expect(document.querySelector(".table-card-flight .card-art")).toBeNull();
  expect(
    document.querySelector('.table-flight-layer[data-public="false"]'),
  ).toBeTruthy();
  expect(
    slots()
      .slice(2)
      .map((slot) => slot.dataset.publicSlot),
  ).toEqual(original);
  expect(
    slots()
      .slice(0, 2)
      .every((slot) => slot.dataset.concealedHidden === "true"),
  ).toBe(true);
  expect(slots().every((slot) => !slot.dataset.cardId)).toBe(true);
  act(() => vi.advanceTimersByTime(750));
  expect(slots()).toHaveLength(11);
  expect(
    view.container.querySelector('[data-concealed-hidden="true"]'),
  ).toBeNull();
  expect(
    view.container.querySelector(".public-hand-cards .card-art"),
  ).toBeNull();
});

it("runs the token play, anonymous fade, and hand collapse together", () => {
  const view = show("public");
  fireEvent.change(screen.getByLabelText("Animation example"), {
    target: { value: "meld" },
  });
  play();
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  expect(
    view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
  ).toHaveLength(6);
  expect(
    view.container.querySelector('[data-concealed-leaving="true"]'),
  ).toBeNull();
  expect(
    view.container.querySelectorAll('[data-concealed-ghost="true"]'),
  ).toHaveLength(3);
  expect(handMoves.some((move) => move.duration === 620)).toBe(true);
  act(() => vi.advanceTimersByTime(180));
  expect(
    view.container.querySelectorAll(".public-hand-cards .hand-card"),
  ).toHaveLength(6);
  expect(handMoves.some((move) => move.duration === 620)).toBe(true);
  expect(
    view.container.querySelector(".public-hand-cards .card-art"),
  ).toBeNull();
});

it("discards from the right edge face down, then flips the public discard face up", () => {
  const view = show("public");
  fireEvent.change(screen.getByLabelText("Animation example"), {
    target: { value: "discard" },
  });
  const last = view.container
    .querySelector(".public-hand-cards .hand-card:last-child")!
    .getAttribute("data-public-slot");
  play();
  act(() => vi.advanceTimersByTime(0));
  const flight = document.querySelector(
    '.table-card-flight[data-concealed="true"]',
  )!;
  expect(flight.querySelector(".table-card-front .card-art")).toBeNull();
  expect(flight.querySelector(".table-card-back .card-art")).toBeTruthy();
  expect(flight.querySelector('[data-turn="true"]')).toBeTruthy();
  expect(
    view.container
      .querySelector('[data-concealed-leaving="true"]')
      ?.getAttribute("data-public-slot"),
  ).toBe(last);
  act(() => vi.advanceTimersByTime(600));
  expect(
    view.container.querySelectorAll(".public-hand-cards .hand-card"),
  ).toHaveLength(8);
  expect(document.querySelector(".table-card-flight")).toBeNull();
  expect(
    view.container
      .querySelector(".discard-face .card")
      ?.getAttribute("aria-label"),
  ).toBe("10 of hearts");
});

it.each([false, true])(
  "clips another board's draw at the divider (mobile: %s)",
  (mobile) => {
    if (mobile)
      vi.mocked(window.matchMedia).mockImplementation(
        (query) =>
          ({
            matches: query === "(max-width: 768px)",
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          }) as unknown as MediaQueryList,
      );
    const view = show("public");
    fireEvent.change(screen.getByLabelText("Animation example"), {
      target: { value: "offscreen" },
    });
    const count = view.container.querySelectorAll(
      ".public-hand-cards .hand-card",
    ).length;
    play();
    expect(
      document.querySelector('.table-flight-layer[data-public="true"]'),
    ).toBeTruthy();
    expect(
      document.querySelectorAll('.table-card-flight[data-local="false"]'),
    ).toHaveLength(2);
    expect(
      view.container.querySelectorAll(".public-hand-cards .hand-card"),
    ).toHaveLength(count);
  },
);

function setMobile(mobile: boolean) {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches:
          query === (mobile ? "(max-width: 768px)" : "(min-width: 769px)"),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
}

it("starts the public hand collapse even when a play arrives before the draw flight ends", () => {
  const before = turnMotionExample("public", "two", false);
  const drawn = turnMotionExample("public", "two", true);
  const melds = turnMotionExample("public", "meld", true).sides[1].melds;
  const after = {
    ...drawn,
    sides: drawn.sides.map((side) =>
      side.id === 1 ? { ...side, melds } : side,
    ),
    players: drawn.players.map((player, index) =>
      index === 1 ? { ...player, handCount: 8 } : player,
    ),
  };
  const content = (snapshot: typeof before) => (
    <MemoryRouter>
      <Room
        rehearsal={{
          snapshot,
          onChoose: () => {},
          viewedTeam: 1,
          followTurn: false,
          tableAnimate: true,
          handAnimate: true,
        }}
      />
    </MemoryRouter>
  );
  const view = render(content(before));
  view.rerender(content(drawn));
  expect(
    document.querySelectorAll('.table-card-flight[data-event-kind="draw"]'),
  ).toHaveLength(2);
  view.rerender(content(after));
  expect(document.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  expect(
    view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
  ).toHaveLength(8);
  expect(
    view.container.querySelectorAll(
      '.public-hand-cards [data-concealed-hidden="true"]',
    ),
  ).toHaveLength(2);
  expect(
    view.container.querySelectorAll('[data-concealed-ghost="true"]'),
  ).toHaveLength(3);
});

it.each([false, true])(
  "replaces red threes from the right and draws anonymous replacements on the left (mobile: %s)",
  (mobile) => {
    setMobile(mobile);
    const view = show("public");
    fireEvent.change(screen.getByLabelText("Animation example"), {
      target: { value: "replace-two" },
    });
    play();
    const replacement = () =>
      document.querySelector('.table-card-flight[data-replacement="true"]');
    expect(
      replacement()?.querySelector(".table-card-front .card-art"),
    ).toBeNull();
    expect(
      replacement()
        ?.querySelector(".table-card-back .card")
        ?.getAttribute("aria-label"),
    ).toBe("3 of hearts, red three");
    expect(replacement()?.querySelector('[data-turn="true"]')).toBeTruthy();
    act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS));
    expect(
      replacement()
        ?.querySelector(".table-card-back .card")
        ?.getAttribute("aria-label"),
    ).toBe("3 of diamonds, red three");
    act(() => vi.advanceTimersByTime(RED_REPLACEMENT_MS));
    expect(replacement()).toBeNull();
    expect(
      document.querySelectorAll('.table-card-flight[data-event-kind="draw"]'),
    ).toHaveLength(2);
    expect(document.querySelector(".table-card-flight .card-art")).toBeNull();
    expect(
      view.container.querySelectorAll(
        '.public-hand-cards [data-concealed-hidden="true"]',
      ),
    ).toHaveLength(2);
    act(() => vi.advanceTimersByTime(750));
    expect(
      view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
    ).toHaveLength(9);
    expect(
      view.container.querySelector('[data-concealed-hidden="true"]'),
    ).toBeNull();
  },
);

it.each([false, true])(
  "plays the public discard straight to the meld and only removes cards spent from the hand (mobile: %s)",
  (mobile) => {
    setMobile(mobile);
    const view = show("public");
    fireEvent.change(screen.getByLabelText("Animation example"), {
      target: { value: "pickup" },
    });
    const from = view.container
      .querySelector(".discard-face .card")!
      .getBoundingClientRect();
    play();
    const pickup = document.querySelector<HTMLElement>(
      '.meld-card-flight[data-card-id="public-pickup"]',
    )!;
    expect(pickup).toBeTruthy();
    expect(pickup.style.left).toBe(`${from.left}px`);
    expect(pickup.style.top).toBe(`${from.top}px`);
    expect(pickup.querySelector(".card")?.getAttribute("aria-label")).toBe(
      "J of hearts",
    );
    expect(
      document.querySelector('.table-card-flight[data-event-kind="pickup"]'),
    ).toBeNull();
    expect(
      view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
    ).toHaveLength(7);
    act(() => vi.advanceTimersByTime(800));
    expect(
      document.querySelectorAll('.table-card-flight[data-event-kind="draw"]'),
    ).toHaveLength(1);
    expect(document.querySelector(".table-card-flight .card-art")).toBeNull();
    act(() => vi.advanceTimersByTime(660));
    expect(
      view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
    ).toHaveLength(8);
  },
);

it.each(
  [false, true].flatMap((mobile) =>
    ["two", "meld", "discard", "replace-two", "pickup"].map(
      (example) => [example, mobile] as const,
    ),
  ),
)(
  "settles %s when changing boards and does not replay when returning (mobile: %s)",
  (example, mobile) => {
    setMobile(mobile);
    const view = show("public");
    fireEvent.change(screen.getByLabelText("Animation example"), {
      target: { value: example },
    });
    play();
    act(() => vi.advanceTimersByTime(120));
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    expect(
      document.querySelector(
        '.table-card-flight,.meld-card-flight,[data-concealed-ghost="true"]',
      ),
    ).toBeNull();
    expect(screen.getByRole("region", { name: "Hazel’s hand" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expect(screen.getByRole("region", { name: "Poppy’s hand" })).toBeTruthy();
    expect(
      document.querySelector(
        '.table-card-flight,.meld-card-flight,[data-concealed-hidden="true"],[data-concealed-ghost="true"]',
      ),
    ).toBeNull();
    const count =
      example === "two"
        ? 11
        : example === "meld"
          ? 6
          : example === "pickup"
            ? 7
            : example === "discard"
              ? 8
              : 9;
    expect(
      view.container.querySelectorAll(".public-hand-cards [data-public-slot]"),
    ).toHaveLength(mobile ? Math.min(10, count) : count);
  },
);
