import { StrictMode } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { PickupPreview } from "./PickupPreview";
import {
  pickupBeats,
  pickupFrame,
  type PickupScenario,
} from "../lib/pickupSequence";
import { command, getRoom, socketCredentials } from "../lib/api";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import { DRAW_FLIGHT_MS } from "../hooks/useDrawMotion";

const sound = vi.hoisted(() => ({ play: vi.fn() }));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  command: vi.fn(),
  getRoom: vi.fn(),
  socketCredentials: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
function show() {
  return render(
    <StrictMode>
      <MemoryRouter>
        <PickupPreview />
      </MemoryRouter>
    </StrictMode>,
  );
}
function seek(title: string) {
  fireEvent.click(
    within(
      screen.getByRole("navigation", { name: "Pickup sequence steps" }),
    ).getByRole("button", { name: new RegExp(title) }),
  );
}
function advance(milliseconds: number) {
  act(() => vi.advanceTimersByTime(milliseconds));
}
function playThrough(scenario: PickupScenario = "new", speed = 1) {
  for (const beat of pickupBeats(scenario)) advance(beat.hold / speed);
}

it("shows staging and the pending reply, then slides the accepted discard and hand cards", () => {
  const view = show();
  const handIds = () =>
    [...view.container.querySelectorAll(".hand-card")].map((card) =>
      card.getAttribute("data-card-id"),
    );
  const initialHand = handIds();
  seek("Click discard");
  expect(view.container.querySelector(".pickup-active")).toBeTruthy();
  expect(
    view.container.querySelector(".discard-face .staged-label"),
  ).toBeNull();
  expect(view.container.querySelector(".pickup-notice")).toBeNull();
  expect(view.container.querySelector(".turn-message")?.textContent).toBe(
    "Play the top discard onto your board.",
  );
  expect(
    view.container.querySelector(".discard-caption button")?.textContent,
  ).toBe("Cancel");
  expect(
    view.container.querySelector(
      '.draw-available-indicator[data-selected="true"][data-active="true"]',
    ),
  ).toBeTruthy();
  seek("First match");
  expect(view.container.querySelectorAll(".hand-card .selected")).toHaveLength(
    1,
  );
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  seek("Second match");
  expect(view.container.querySelectorAll(".hand-card .selected")).toHaveLength(
    2,
  );
  expect(
    (screen.getByRole("button", { name: "Stage meld" }) as HTMLButtonElement)
      .disabled,
  ).toBe(false);
  seek("Click Stage meld");
  expect(view.container.querySelectorAll(".staged-card")).toHaveLength(2);
  expect(
    view.container.querySelector(
      '.discard-pickup[data-staged="true"] .staged-label',
    )?.textContent,
  ).toBe("STAGED");
  expect(view.container.querySelector(".meld-pile")).toBeNull();
  const stagedDraft = screen.getByRole("group", { name: "Staged draft" });
  expect(within(stagedDraft).getByLabelText(/^60 points/)).toBeTruthy();
  expect(
    view.container.querySelector(".hand-heading")?.contains(stagedDraft),
  ).toBe(true);
  expect(handIds()).toEqual(initialHand);
  seek("Play draft");
  expect(view.container.querySelector(".hand-actions")).toBeNull();
  expect(
    (view.container.querySelector(".cancel-pickup") as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(handIds()).toEqual(initialHand);
  seek("Pickup accepted");
  expect(view.container.querySelectorAll(".staged-card")).toHaveLength(0);
  expect(
    view.container.querySelector(".discard-face .staged-label"),
  ).toBeNull();
  expect(view.container.querySelector(".meld-count")?.textContent).toBe(
    "3 / 7",
  );
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  expect(handIds()).toEqual(initialHand);
  expect(sound.play).not.toHaveBeenCalled(); // Seeking is silent.
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  advance(MELD_FLIGHT_MS);
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(handIds()).toEqual(
    initialHand.slice().filter((id) => !id?.startsWith("pickup-hand")),
  );
  expect(
    view.container.querySelectorAll(".draw-pile")[1].textContent,
  ).toContain("Discard 3");
  expect(
    view.container
      .querySelectorAll(".draw-pile")[1]
      .querySelector('[aria-label="K of diamonds"]'),
  ).toBeTruthy();
  expect(view.container.querySelector(".draw-flight-layer")).toBeNull();
  expect(sound.play).toHaveBeenCalledWith("slide");
});

it("replays without accumulating cards, repeating sounds, or touching a real game", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("SAVED-GAME"));
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  for (let replay = 0; replay < 3; replay++) {
    playThrough();
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(10);
    expect(view.container.querySelectorAll(".meld-pile")).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Replay sequence" }),
    ).toBeTruthy();
    if (replay < 2)
      fireEvent.click(screen.getByRole("button", { name: "Replay sequence" }));
  }
  expect(sound.play.mock.calls.map(([cue]) => cue)).toEqual(
    Array.from({ length: 3 }, () => [
      "select",
      "select",
      "slide",
      "deal",
    ]).flat(),
  );
  expect(command).not.toHaveBeenCalled();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "SAVED-GAME",
  );
});

it("stages only the top discard into an existing pile and preserves the hand", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Pickup scenario"), {
    target: { value: "existing" },
  });
  seek("Click target pile");
  expect(
    view.container.querySelector(
      '.discard-pickup[data-staged="true"] .staged-label',
    )?.textContent,
  ).toBe("STAGED");
  expect(view.container.querySelector(".meld-count")?.textContent).toBe(
    "3 +1 / 7",
  );
  expect(view.container.querySelectorAll(".staged-card")).toHaveLength(0);
  expect(
    within(screen.getByRole("group", { name: "Staged draft" })).getByText(
      "1 card added",
    ),
  ).toBeTruthy();
  seek("Pickup accepted");
  expect(view.container.querySelector(".meld-count")?.textContent).toBe(
    "4 / 7",
  );
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
});

it("restores the exact staged pickup when rewinding a paused flight", () => {
  const view = show();
  seek("Click Stage meld");
  seek("Pickup accepted");
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(3);
  seek("Click Stage meld");
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(view.container.querySelectorAll(".staged-card")).toHaveLength(2);
  expect(view.container.querySelector(".pickup-active")).toBeTruthy();
  seek("Pickup accepted");
  expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(3);
});

it("prompts for just the second card after the pickup lands and shows why discard is locked", () => {
  const view = show();
  seek("Click Stage meld");
  seek("Pickup accepted");
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  advance(MELD_FLIGHT_MS);
  expect(
    (
      screen.getByRole("button", {
        name: "Draw your second card from the deck",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
  expect(view.container.querySelector(".draw-two")).toBeNull();
  expect(
    view.container.querySelectorAll(
      '.draw-available-indicator[data-active="true"]',
    ),
  ).toHaveLength(1);
  seek("Draw from the deck");
  expect(
    (
      screen.getByRole("button", {
        name: "Discard",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.queryByRole("tooltip")).toBeNull();
  const discardControl = screen.getByRole("group", { name: "Discard" });
  fireEvent.mouseEnter(discardControl);
  expect(screen.getByRole("tooltip").textContent).toBe(
    "Draw your second card from the deck first.",
  );
  fireEvent.mouseLeave(discardControl);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.focus(discardControl);
  expect(screen.getByRole("tooltip")).toBeTruthy();
  fireEvent.blur(discardControl);
  expect(screen.queryByRole("tooltip")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Draw your second card from the deck" }),
  );
  expect(
    screen
      .getByRole("button", { name: /Draw from the deck/ })
      .getAttribute("aria-current"),
  ).toBe("step");
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  advance(pickupBeats("new").find((beat) => beat.id === "await-draw")!.hold);
  expect(view.container.querySelectorAll(".draw-card-flight")).toHaveLength(1);
  advance(DRAW_FLIGHT_MS);
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(10);
  expect(view.container.querySelector(".draw-flight-layer")).toBeNull();
  seek("Click Stage meld");
  seek("Draw from the deck");
  expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  expect(
    (
      screen.getByRole("button", {
        name: "Draw your second card from the deck",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(false);
});

it.each([
  ["meld", 3, 8],
  ["meld-existing", 2, 9],
  ["mixed", 5, 6],
] as const)(
  "replays %s with every card landing in its own meld",
  (scenario, count, remaining) => {
    const view = show();
    fireEvent.change(screen.getByLabelText("Pickup scenario"), {
      target: { value: scenario },
    });
    seek("Stage draft");
    const summary = screen.getByRole("group", { name: "Staged draft" });
    expect(
      within(summary).getByText(
        scenario === "mixed"
          ? "1 new meld + 2 cards added"
          : scenario === "meld"
            ? "1 new meld"
            : "2 cards added",
      ),
    ).toBeTruthy();
    seek("Cards slide into place");
    expect(view.container.querySelectorAll(".meld-card-flight")).toHaveLength(
      count,
    );
    fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
    advance(MELD_FLIGHT_MS);
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
      remaining,
    );
    expect(view.container.querySelectorAll(".meld-pile")).toHaveLength(
      scenario === "mixed" ? 2 : 1,
    );
    expect(view.container.querySelector(".meld-flight-layer")).toBeNull();
  },
);

it("preserves the cards on cancellation or a blocked opening and restores earlier steps when seeking", () => {
  const view = show();
  for (const scenario of ["cancel", "rejected"] as const) {
    fireEvent.change(screen.getByLabelText("Pickup scenario"), {
      target: { value: scenario },
    });
    seek(scenario === "cancel" ? "Cancel pickup" : "Opening too small");
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
    expect(view.container.querySelector(".meld-pile")).toBeNull();
    expect(
      view.container
        .querySelector(".discard-count")
        ?.getAttribute("aria-hidden"),
    ).toBe(scenario === "cancel" ? null : "true");
    expect(view.container.querySelectorAll(".staged-card")).toHaveLength(
      scenario === "cancel" ? 0 : 2,
    );
    expect(view.container.querySelector(".inline-error")).toBeNull();
    if (scenario === "rejected") {
      expect(
        (
          screen.getByRole("button", {
            name: "Play draft",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(true);
      fireEvent.mouseEnter(screen.getByRole("group", { name: "Play draft" }));
      expect(screen.getByRole("tooltip").textContent).toBe(
        "Meld must be greater than or equal to 50 points",
      );
      expect(command).not.toHaveBeenCalled();
    }
    seek("Draw phase");
    expect(view.container.querySelector(".pickup-active")).toBeNull();
    expect(view.container.querySelector(".inline-error")).toBeNull();
  }
});

it("supports slow playback, pause, restarting mid-sequence, and unmount cleanup", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Pickup playback pace"), {
    target: { value: "0.25" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  advance(3999);
  expect(
    view.container.querySelector('[aria-current="step"]')?.textContent,
  ).toContain("Draw phase");
  advance(1);
  expect(
    view.container.querySelector('[aria-current="step"]')?.textContent,
  ).toContain("Click discard");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  advance(20000);
  expect(
    view.container.querySelector('[aria-current="step"]')?.textContent,
  ).toContain("Click discard");
  fireEvent.click(screen.getByRole("button", { name: "Restart" }));
  expect(view.container.querySelector(".pickup-active")).toBeNull();
  advance(4000);
  advance(4800);
  expect(sound.play).toHaveBeenCalledWith("select");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  fireEvent.click(screen.getByRole("button", { name: "Play sequence" }));
  expect(sound.play).toHaveBeenCalledTimes(1);
  view.unmount();
  advance(60000);
  expect(sound.play).toHaveBeenCalledTimes(1);
});

it("keeps stock, turn, and untouched cards identical across every recorded step", () => {
  for (const scenario of ["new", "existing", "cancel", "rejected"] as const) {
    const original = pickupFrame(scenario, 0).snapshot;
    for (let step = 0; step < pickupBeats(scenario).length; step++) {
      const frame = pickupFrame(scenario, step).snapshot;
      expect(frame.stockCount).toBe(
        original.stockCount -
          Number(Boolean(pickupBeats(scenario)[step].drawn)),
      );
      expect(frame.actorId).toBe(original.actorId);
      expect(
        original.hand
          .slice(-9)
          .every((card) => frame.hand.some((item) => item.id === card.id)),
      ).toBe(true);
      const visibleIds = [
        ...frame.hand,
        frame.discard!,
        ...frame.sides.flatMap((side) =>
          side.melds.flatMap((meld) => meld.cards),
        ),
      ].map((card) => card.id);
      expect(new Set(visibleIds).size).toBe(visibleIds.length);
    }
  }
});
