import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRoom } from "../lib/api";
import { DISCARD_FLIGHT_MS } from "../hooks/useTableMotion";
import { MOBILE_PLAY_MS } from "../hooks/useMobilePlayMotion";
import type { Snapshot } from "../types";
import { mobilePreviewSnapshot } from "./MobilePreview";
import { Room } from "./Room";

const socket = vi.hoisted(() => ({ handlers: new Map<string, () => void>() }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("socket.io-client", () => ({
  io: () => ({
    on: (event: string, callback: () => void) =>
      socket.handlers.set(event, callback),
    emit: vi.fn(),
    disconnect: vi.fn(),
  }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

const animate = vi.fn(
  (
    _frames: Keyframe[] | PropertyIndexedKeyframes | null,
    _options?: number | KeyframeAnimationOptions,
  ) => ({ cancel: vi.fn(), id: "" }) as unknown as Animation,
);

beforeEach(() => {
  socket.handlers.clear();
  animate.mockClear();
  HTMLElement.prototype.animate = animate;
  vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue([
    {},
  ] as unknown as DOMRectList);
});

afterEach(() => {
  vi.useRealTimers();
  delete (HTMLElement.prototype as { animate?: unknown }).animate;
});

function fixture(partnership = false) {
  const snapshot = mobilePreviewSnapshot(3, partnership);
  snapshot.phase = "draw";
  snapshot.sides.forEach((side) => {
    side.melds = [];
    side.clean = 0;
    side.dirty = 0;
  });
  return snapshot;
}

async function open(snapshot: Snapshot) {
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[`/room/${snapshot.code}`]}>
        <Routes>
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>,
    );
  });
}

async function refresh(snapshot: Snapshot) {
  vi.mocked(getRoom).mockResolvedValue(snapshot);
  await act(async () => {
    socket.handlers.get("handandfoot:updated")!();
  });
}

describe.each(["desktop", "mobile"])("%s board transitions", (layout) => {
  function sweepTarget() {
    return document.querySelector(
      layout === "mobile" ? ".tableau" : ".tableau-content",
    )!;
  }

  function expectSweep(direction: number) {
    expect(animate.mock.contexts).toContain(
      document.querySelector(".hand-dock"),
    );
    expect(animate.mock.lastCall).toEqual([
      [
        { transform: `translateX(${direction * 28}px)`, opacity: 0.45 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      {
        duration: layout === "desktop" ? 200 : 180,
        easing: "cubic-bezier(.22,.68,.26,1)",
      },
    ]);
    expect(animate.mock.contexts.at(-1)).toBe(sweepTarget());
    expect(
      sweepTarget().contains(document.querySelector(".player-board-nav")),
    ).toBe(layout === "mobile");
  }

  function media(reduced = false) {
    vi.mocked(window.matchMedia).mockImplementation(
      (query) =>
        ({
          matches:
            (query === "(max-width: 768px)" && layout === "mobile") ||
            (query === "(min-width: 769px)" && layout === "desktop") ||
            (query === "(prefers-reduced-motion: reduce)" && reduced),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  }

  function expectTurn(snapshot: Snapshot, seat: number) {
    const player = snapshot.players[seat];
    const name = document.querySelector(
      `.player-board-nav [data-player-id="${player.id}"]`,
    )!;
    expect(
      name.getAttribute("aria-current") ??
        name.closest("button")?.getAttribute("aria-current"),
    ).toBe("step");
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe(String(player.team));
  }

  function measureCards() {
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        return this.matches(".game-header")
          ? new DOMRect(0, 0, 1000, 300)
          : this.matches(".hand-scroll")
            ? new DOMRect(80, 580, 800, 120)
            : this.closest(".hand-card")
              ? new DOMRect(100, 600, 62, 87)
              : new DOMRect(400, 100, 62, 87);
      },
    );
  }

  it.each([
    [0, false],
    [1, false],
    [2, false],
    [3, false],
    [4, false],
    [5, false],
    [0, true],
    [1, true],
    [2, true],
    [3, true],
    [4, true],
    [5, true],
  ] as const)(
    "finishes seat %s's discard before advancing the turn and board (partnership: %s)",
    async (seat, partnership) => {
      vi.useFakeTimers();
      media();
      measureCards();
      const snapshot = fixture(partnership);
      snapshot.phase = "play";
      snapshot.actorId = snapshot.players[seat].id;
      await open(snapshot);
      expectTurn(snapshot, seat);
      animate.mockClear();

      const nextSeat = (seat + 1) % snapshot.players.length;
      const card = {
        ...snapshot.hand[0],
        id: seat ? "bot-discard" : snapshot.hand[0].id,
      };
      const next: Snapshot = {
        ...snapshot,
        revision: 2,
        token: "discarded",
        actorId: snapshot.players[nextSeat].id,
        phase: "draw",
        hand: seat ? snapshot.hand : snapshot.hand.slice(1),
        players: snapshot.players.map((player) =>
          player.id === snapshot.actorId
            ? { ...player, handCount: player.handCount - 1 }
            : player,
        ),
        discard: card,
        discardCount: snapshot.discardCount + 1,
        tableEvents: [
          {
            id: "discard",
            kind: "discard",
            playerId: snapshot.actorId!,
            card,
            count: 1,
            faceDown: false,
          },
        ],
      };
      await refresh(next);
      expectTurn(snapshot, seat);
      expect(
        document.querySelector(
          layout === "mobile" && seat === 0
            ? '.mobile-play-flight-layer[data-kind="discard"]'
            : '.table-card-flight[data-event-kind="discard"]',
        ),
      ).toBeTruthy();
      if (layout === "desktop" && seat > 0) {
        const flight = document.querySelector(".table-card-flight")!;
        expect(flight.getAttribute("data-local")).toBe("true");
        expect(flight.getAttribute("data-concealed")).toBe("true");
      }
      const duration =
        layout === "mobile" && seat === 0 ? MOBILE_PLAY_MS : DISCARD_FLIGHT_MS;
      await act(async () => vi.advanceTimersByTime(duration / 2));
      await refresh({ ...next, revision: 3 });
      await act(async () => vi.advanceTimersByTime(duration / 2 - 1));
      expectTurn(snapshot, seat);
      if (nextSeat === 0) {
        expect(
          (
            screen.getByRole("button", {
              name: "Draw 2 cards from the stack",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(true);
      }

      await act(async () => vi.advanceTimersByTime(1));
      expectTurn(snapshot, nextSeat);
      expect(
        animate.mock.contexts.filter((node) => node === sweepTarget()),
      ).toHaveLength(1);
      expect(
        document.querySelector(
          ".table-flight-layer, .mobile-play-flight-layer",
        ),
      ).toBeNull();
      if (nextSeat === 0) {
        expect(
          (
            screen.getByRole("button", {
              name: "Draw 2 cards from the stack",
            }) as HTMLButtonElement
          ).disabled,
        ).toBe(false);
      }
    },
  );

  it.each([false, true])(
    "finishes each queued bot discard before following the next player (partnership: %s)",
    async (partnership) => {
      vi.useFakeTimers();
      media();
      measureCards();
      const snapshot = fixture(partnership);
      snapshot.phase = "play";
      snapshot.actorId = snapshot.players[1].id;
      await open(snapshot);
      const seats = partnership ? [1, 4] : [1, 2];
      const events = seats.map((seat) => ({
        id: `discard-${seat}`,
        kind: "discard" as const,
        playerId: snapshot.players[seat].id,
        card: { ...snapshot.hand[0], id: `card-${seat}` },
        count: 1,
        faceDown: false,
      }));
      await refresh({
        ...snapshot,
        revision: 2,
        token: "batched-discards",
        actorId: snapshot.viewerId,
        phase: "draw",
        discard: events[1].card,
        discardCount: snapshot.discardCount + 2,
        tableEvents: events,
      });
      expectTurn(snapshot, 1);
      await act(async () => vi.advanceTimersByTime(DISCARD_FLIGHT_MS - 1));
      expectTurn(snapshot, 1);
      await act(async () => vi.advanceTimersByTime(1));
      expectTurn(snapshot, seats[1]);
      if (layout === "desktop") {
        expect(
          document
            .querySelector(".table-card-flight")
            ?.getAttribute("data-local"),
        ).toBe("true");
        expect(
          document
            .querySelector(".table-card-flight")
            ?.getAttribute("data-concealed"),
        ).toBe("true");
      }
      await act(async () => vi.advanceTimersByTime(DISCARD_FLIGHT_MS - 1));
      expectTurn(snapshot, seats[1]);
      await act(async () => vi.advanceTimersByTime(1));
      expectTurn(snapshot, 0);
    },
  );

  it.each([0, 1])(
    "waits for seat %s's browser animation to finish even after its scheduled duration",
    async (seat) => {
      vi.useFakeTimers();
      media();
      measureCards();
      const snapshot = fixture();
      snapshot.phase = "play";
      snapshot.actorId = snapshot.players[seat].id;
      await open(snapshot);
      const card = {
        ...snapshot.hand[0],
        id: seat ? "bot-discard" : snapshot.hand[0].id,
      };
      await refresh({
        ...snapshot,
        revision: 2,
        token: "discarded",
        actorId: snapshot.players[seat + 1].id,
        phase: "draw",
        hand: seat ? snapshot.hand : snapshot.hand.slice(1),
        discard: card,
        discardCount: snapshot.discardCount + 1,
        tableEvents: [
          {
            id: "discard",
            kind: "discard",
            playerId: snapshot.actorId!,
            card,
            count: 1,
            faceDown: false,
          },
        ],
      });
      const localMobile = layout === "mobile" && seat === 0;
      const flying = document.querySelector(
        localMobile ? ".mobile-play-card" : ".table-card-flight",
      )!;
      let finish!: () => void;
      const finished = new Promise<void>((resolve) => {
        finish = resolve;
      });
      flying.getAnimations = () => [{ finished } as unknown as Animation];
      await act(async () =>
        vi.advanceTimersByTime(
          localMobile ? MOBILE_PLAY_MS : DISCARD_FLIGHT_MS,
        ),
      );
      expectTurn(snapshot, seat);
      await act(async () => finish());
      expectTurn(snapshot, seat + 1);
    },
  );

  it.each([false, true])(
    "swipes forward on followed turns and wraps to the first board (partnership: %s)",
    async (partnership) => {
      media();
      const snapshot = fixture(partnership);
      await open(snapshot);
      expect(animate).not.toHaveBeenCalled();

      const next = {
        ...snapshot,
        revision: 2,
        token: "next-turn",
        actorId: snapshot.players[1].id,
      };
      await refresh(next);
      expect(
        document.querySelector(".tableau")?.getAttribute("data-side-id"),
      ).toBe("1");
      expect(animate).toHaveBeenCalledTimes(2);
      expectSweep(1);

      // A repeated snapshot or another action during this turn must not replay it.
      await refresh(next);
      await refresh({
        ...next,
        revision: 3,
        token: "same-turn",
        phase: "play",
      });
      expect(animate).toHaveBeenCalledTimes(2);

      const lastTeam = snapshot.sides.length - 1;
      await refresh({
        ...next,
        revision: 4,
        token: "last-turn",
        actorId: snapshot.players.find((player) => player.team === lastTeam)!
          .id,
      });
      await refresh({
        ...snapshot,
        revision: 5,
        token: "first-turn",
      });
      expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
      expect(animate).toHaveBeenCalledTimes(6);
      expectSweep(1);
    },
  );

  it.each([false, true])(
    "defaults Follow turn on for a new game while preserving the choice between later rounds (partnership: %s)",
    async (partnership) => {
      media();
      const snapshot = fixture(partnership);
      snapshot.round = 2;
      await open(snapshot);
      const follow = screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Follow turn",
      });
      expect(follow.checked).toBe(true);
      fireEvent.click(follow);
      expect(follow.checked).toBe(false);

      await refresh({
        ...snapshot,
        revision: 2,
        token: "next-round",
        round: 3,
        opening: { id: "round-three", ready: [], complete: true },
      });
      expect(follow.checked).toBe(false);
      await refresh({
        ...snapshot,
        revision: 3,
        token: "new-game",
        round: 1,
        opening: { id: "new-game", ready: [], complete: true },
      });
      expect(follow.checked).toBe(true);
      fireEvent.click(follow);
      await refresh({
        ...snapshot,
        revision: 4,
        token: "drawn",
        round: 1,
        phase: "play",
        opening: { id: "new-game", ready: [], complete: true },
      });
      expect(follow.checked).toBe(false);
    },
  );

  it.each([false, true])(
    "keeps Follow turn checked while browsing during your turn and follows the next player (partnership: %s)",
    async (partnership) => {
      media();
      const snapshot = fixture(partnership);
      await open(snapshot);
      const follow = screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Follow turn",
      });
      const lastTeam = snapshot.sides.length - 1;
      const expectBoard = (team: number) => {
        expect(
          document.querySelector(".tableau")?.getAttribute("data-side-id"),
        ).toBe(String(team));
        expect(follow.checked).toBe(true);
      };

      fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
      expectBoard(lastTeam);
      const portraits = within(
        screen.getByRole("navigation", {
          name: partnership ? "Team boards" : "Player boards",
        }),
      );
      fireEvent.click(portraits.getAllByRole("button")[1]);
      expectBoard(1);
      const pages = within(
        screen.getByRole("group", {
          name: partnership ? "Choose a team board" : "Choose a player board",
        }),
      );
      fireEvent.click(pages.getAllByRole("button")[lastTeam]);
      expectBoard(lastTeam);
      fireEvent.keyDown(document.querySelector(".tableau")!, {
        key: "ArrowLeft",
      });
      expectBoard(lastTeam - 1);
      fireEvent.touchStart(document.querySelector(".tableau")!, {
        touches: [{ clientX: 200, clientY: 100 }],
      });
      fireEvent.touchEnd(document.querySelector(".tableau")!, {
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });
      expectBoard(lastTeam);
      fireEvent.click(
        screen.getByRole("button", { name: "Back to your board" }),
      );
      expectBoard(0);
      fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
      await refresh({ ...snapshot, revision: 2 });
      expectBoard(lastTeam);
      await refresh({
        ...snapshot,
        revision: 3,
        token: "drawn",
        phase: "play",
      });
      expectBoard(lastTeam);

      await refresh({
        ...snapshot,
        revision: 4,
        token: "next-turn",
        actorId: snapshot.players[1].id,
      });
      expectBoard(1);
      expectSweep(1);
    },
  );

  it.each([false, true])(
    "disables Follow turn when browsing during another player's turn (partnership: %s)",
    async (partnership) => {
      media();
      const snapshot = fixture(partnership);
      snapshot.actorId = partnership
        ? snapshot.players.find(
            (player) =>
              player.id !== snapshot.viewerId &&
              player.team === snapshot.players[0].team,
          )!.id
        : snapshot.players[1].id;
      await open(snapshot);
      const follow = screen.getByRole<HTMLInputElement>("checkbox", {
        name: "Follow turn",
      });
      expect(follow.checked).toBe(true);
      fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
      expect(follow.checked).toBe(false);
      fireEvent.click(follow);
      expect(follow.checked).toBe(true);
      const portraits = within(
        screen.getByRole("navigation", {
          name: partnership ? "Team boards" : "Player boards",
        }),
      );
      fireEvent.click(portraits.getAllByRole("button").at(-1)!);
      expect(follow.checked).toBe(false);
    },
  );

  it("swipes both side arrows, respects disabled Follow turn while browsing, and restores forward motion", async () => {
    media();
    const snapshot = fixture();
    await open(snapshot);
    const follow = screen.getByRole<HTMLInputElement>("checkbox", {
      name: "Follow turn",
    });
    fireEvent.click(follow);

    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expectSweep(-1);
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("5");
    expect(follow.checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    expectSweep(1);
    expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expectSweep(-1);

    const next = {
      ...snapshot,
      revision: 2,
      token: "next-turn",
      actorId: snapshot.players[1].id,
    };
    await refresh(next);
    expect(animate).toHaveBeenCalledTimes(6);
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("5");

    fireEvent.click(follow);
    expect(follow.checked).toBe(true);
    expectSweep(1);
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("1");
    await refresh({
      ...next,
      revision: 3,
      token: "third-turn",
      actorId: snapshot.players[2].id,
    });
    expectSweep(1);
    expect(animate).toHaveBeenCalledTimes(10);
  });

  it("changes boards immediately with reduced motion for followed turns and side arrows", async () => {
    media(true);
    const snapshot = fixture();
    await open(snapshot);
    await refresh({
      ...snapshot,
      revision: 2,
      token: "next-turn",
      actorId: snapshot.players[1].id,
    });
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("1");
    expect(animate).not.toHaveBeenCalled();
  });

  it("jumps directly to a portrait's board, cancels a running swipe, and lets the arrows swipe again", async () => {
    media();
    const snapshot = fixture();
    await open(snapshot);
    fireEvent.click(screen.getByRole("button", { name: "Next board" }));
    expectSweep(1);
    const running = animate.mock.results[0].value;

    const portraits = within(
      screen.getByRole("navigation", { name: "Player boards" }),
    );
    fireEvent.click(
      portraits.getByRole("button", { name: /^View Ben’s board/ }),
    );
    expect(
      document.querySelector(".tableau")?.getAttribute("data-side-id"),
    ).toBe("2");
    expect(animate).toHaveBeenCalledTimes(2);
    expect(running.cancel).toHaveBeenCalled();
    fireEvent.click(
      portraits.getByRole("button", { name: /^View your board/ }),
    );
    expect(screen.getByRole("region", { name: "Your board" })).toBeTruthy();
    expect(animate).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole("button", { name: "Previous board" }));
    expectSweep(-1);
    expect(animate).toHaveBeenCalledTimes(4);
    expect(
      screen.getByRole<HTMLInputElement>("checkbox", { name: "Follow turn" })
        .checked,
    ).toBe(true);
  });
});
