import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OpeningPreview } from "./OpeningPreview";
import { command, getRoom, socketCredentials } from "../lib/api";

const sound = vi.hoisted(() => ({
  play: vi.fn(),
  muted: false,
  volume: 0.15,
  music: false,
  musicVolume: 0.15,
  setMuted: vi.fn(),
  setVolume: vi.fn(),
  setMusic: vi.fn(),
  setMusicVolume: vi.fn(),
}));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  command: vi.fn(),
  socketCredentials: vi.fn(),
}));
beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
  const computedStyle = window.getComputedStyle.bind(window);
  // jsdom has no pseudo-element rendering; animation geometry is checked in the browser.
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    computedStyle(element),
  );
});
afterEach(() => vi.useRealTimers());
function show() {
  return render(
    <MemoryRouter>
      <OpeningPreview />
    </MemoryRouter>,
  );
}
function beat(name: string) {
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "Opening beats" })).getByRole(
      "button",
      { name },
    ),
  );
}

it("shows only the outer cards before a choice, and opens the selected 11-card hand", () => {
  show();
  beat("05 Choose");
  expect(screen.queryByLabelText("Your private hand")).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "Follow turn" })).toBeNull();
  expect(
    screen.queryByText(
      "See the top & bottom cards. Choose one pile as your hand.",
    ),
  ).toBeNull();
  const first = screen.getByRole("button", {
    name: "Choose pile 1 as your hand",
  });
  const second = screen.getByRole("button", {
    name: "Choose pile 2 as your hand",
  });
  expect(within(first).getByRole("img", { name: "A of hearts" })).toBeTruthy();
  expect(within(second).getByRole("img", { name: "K of hearts" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: "8 of hearts" })).toBeNull();
  expect(
    screen.getByRole<HTMLButtonElement>("button", { name: "Next →" }).disabled,
  ).toBe(true);
  fireEvent.click(second);
  const hand = screen.getByLabelText("Your private hand");
  expect(within(hand).getAllByRole("button").length).toBe(11);
  expect(
    within(hand).getByRole("button", { name: "8 of hearts" }),
  ).toBeTruthy();
  expect(within(hand).queryByRole("button", { name: "7 of clubs" })).toBeNull();
  const foot = within(hand).getByRole("group", { name: "Your foot, 11 cards" });
  fireEvent.focus(foot);
  expect(within(foot).getByRole("tooltip").textContent).toContain(
    "A of hearts",
  );
  expect(sound.play).toHaveBeenCalledWith("select");
});
it("starts silently, pauses scheduled reveals, and cancels playback on unmount", () => {
  const view = show();
  act(() => vi.advanceTimersByTime(1000));
  expect(sound.play).not.toHaveBeenCalled();
  beat("05 Choose");
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  act(() => vi.advanceTimersByTime(1000));
  expect(sound.play).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Play opening" }));
  act(() => vi.advanceTimersByTime(150));
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("flip");
  view.unmount();
  act(() => vi.advanceTimersByTime(5000));
  expect(sound.play).toHaveBeenCalledTimes(1);
});
it("supports eight-player partnerships and changing the first player through the dealer", () => {
  show();
  fireEvent.change(screen.getByLabelText("Scoring"), {
    target: { value: "partnership" },
  });
  fireEvent.change(screen.getByLabelText("Players"), {
    target: { value: "8" },
  });
  expect(screen.getByLabelText<HTMLSelectElement>("Players").value).toBe("8");
  expect(
    screen.getByLabelText<HTMLSelectElement>("Dealer for this rehearsal")
      .options.length,
  ).toBe(8);
  fireEvent.change(screen.getByLabelText("Dealer for this rehearsal"), {
    target: { value: "0" },
  });
  beat("08 Begin");
  expect(
    screen.getByText(
      "Poppy leads. Draw from the stack or play the top discard.",
    ),
  ).toBeTruthy();
  expect(
    screen.getByRole<HTMLButtonElement>("button", {
      name: "Draw 2 cards from the stack",
    }).disabled,
  ).toBe(true);
});
it("uses the live board navigation and card sizes without opening a room or replacing the saved room", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("EXISTING"));
  const view = show();
  expect(
    view.container.querySelector(".game-page.individual-game .game-header"),
  ).toBeTruthy();
  expect(
    view.container.querySelector(".board-carousel .player-board-nav"),
  ).toBeTruthy();
  expect(view.container.querySelector(".hand-dock")).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(command).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "EXISTING",
  );
});
it("keeps one real board when moving from animated dealing into pile choice and replaying", () => {
  const view = show();
  beat("04 Deal");
  expect(view.container.querySelectorAll(".game-page").length).toBe(1);
  fireEvent.click(screen.getByRole("button", { name: "Next →" }));
  expect(view.container.querySelectorAll(".game-page").length).toBe(1);
  expect(screen.queryByRole("button", { name: "Dealing pile 1" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Replay beat" }));
  expect(view.container.querySelectorAll(".game-header").length).toBe(1);
});
it("deals squared stacks with the selected packet drops in half the time and no setup clutter", () => {
  const view = show();
  beat("04 Deal");
  expect(
    screen.getByLabelText<HTMLInputElement>("Current beat duration").value,
  ).toBe("900");
  expect(view.container.querySelectorAll(".opening-deal-stack").length).toBe(2);
  expect(screen.queryByText("Two piles of eleven cards.")).toBeNull();
  expect(view.container.querySelector(".board-browser")).toBeNull();
  expect(screen.queryByLabelText("Your private hand")).toBeNull();
  expect(view.container.querySelectorAll(".opening-flight").length).toBe(0);
  act(() => vi.advanceTimersByTime(350));
  expect(
    view.container.querySelectorAll('.choose-pile[data-dealt="true"]').length,
  ).toBe(1);
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("select");
  act(() => vi.advanceTimersByTime(400));
  expect(
    view.container.querySelectorAll('.choose-pile[data-dealt="true"]').length,
  ).toBe(2);
  expect(sound.play).toHaveBeenCalledTimes(2);
  expect(view.container.querySelectorAll(".game-page").length).toBe(1);
});
it("plays the shuffle sound once and finishes its single preview", () => {
  show();
  beat("03 Shuffle");
  act(() => vi.advanceTimersByTime(300));
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("deal");
  act(() => vi.advanceTimersByTime(2200));
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Play opening" })).toBeTruthy();
});
it("migrates the requested opening timings while preserving notes", () => {
  const durations = [2500, 2600, 2000, 6200, 0, 2000, 2800, 2200];
  localStorage.setItem(
    "handandfoot.opening-preview.v1",
    JSON.stringify({ players: 4, mode: "individual", speed: 1, durations }),
  );
  localStorage.setItem(
    "handandfoot.opening-preview.v1.notes",
    JSON.stringify("Keep arrival and dealer."),
  );
  show();
  const saved = JSON.parse(
    localStorage.getItem("handandfoot.opening-preview.v1")!,
  );
  expect(saved.durations.slice(0, 4)).toEqual([900, 1700, 2000, 900]);
  expect(saved.revision).toBe(7);
  expect(saved.dealStyle).toBe("drops");
  expect(
    screen.getByLabelText<HTMLTextAreaElement>("What should change?").value,
  ).toBe("Keep arrival and dealer.");
});
it("halves the previous deal once and preserves the already approved dealer timing", () => {
  localStorage.setItem(
    "handandfoot.opening-preview.v1",
    JSON.stringify({
      revision: 3,
      dealStyle: "sweeps",
      players: 4,
      mode: "individual",
      speed: 1,
      durations: [1800, 1500, 2000, 1800, 0, 2000, 2800, 2200],
    }),
  );
  const view = show();
  const saved = JSON.parse(
    localStorage.getItem("handandfoot.opening-preview.v1")!,
  );
  expect(saved.durations.slice(0, 4)).toEqual([900, 1500, 2000, 900]);
  expect(saved.dealStyle).toBe("drops");
  view.unmount();
  show();
  expect(
    JSON.parse(
      localStorage.getItem("handandfoot.opening-preview.v1")!,
    ).durations.slice(0, 4),
  ).toEqual([900, 1500, 2000, 900]);
});
it("reaches the dealer promptly during continuous playback", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Play opening" }));
  act(() => vi.advanceTimersByTime(850));
  expect(screen.queryByRole("img", { name: "Dealer" })).toBeNull();
  act(() => vi.advanceTimersByTime(150));
  expect(screen.getByRole("img", { name: "Dealer" })).toBeTruthy();
  expect(screen.getByText(/02 \/ 08 · Meet your dealer/)).toBeTruthy();
});
it("keeps browsing another board through every setup beat and waits for the private choice", () => {
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Play opening" }));
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  for (const duration of [900, 1500, 2000, 900]) {
    act(() => vi.advanceTimersByTime(duration + 100));
    expect(screen.getByRole("region", { name: "Poppy’s board" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
  }
  expect(screen.getByText(/05 \/ 08 · Choose your hand/)).toBeTruthy();
  const previewCard = view.container.querySelector(
    ".opening-choice-stack > .card",
  );
  expect(previewCard).toBeTruthy();
  expect(
    screen.queryByRole("button", { name: "Choose pile 1 as your hand" }),
  ).toBeNull();
  act(() => vi.advanceTimersByTime(60000));
  expect(screen.getByText(/05 \/ 08 · Choose your hand/)).toBeTruthy();
  expect(sound.play.mock.calls.filter(([cue]) => cue === "flip").length).toBe(
    2,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "View your board, 0 points, dealer" }),
  );
  expect(view.container.querySelector(".opening-choice-stack > .card")).toBe(
    previewCard,
  );
  expect(
    screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
  ).toBeTruthy();
  act(() => vi.advanceTimersByTime(1000));
  expect(sound.play.mock.calls.filter(([cue]) => cue === "flip").length).toBe(
    2,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
  );
  expect(screen.getByText(/06 \/ 08 · Your hand, your foot/)).toBeTruthy();
});
it("keeps the same dealing and gathering elements alive when browsing away and back", () => {
  const view = show();
  beat("04 Deal");
  act(() => vi.advanceTimersByTime(350));
  const stack = view.container.querySelector(".opening-deal-stack");
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  act(() => vi.advanceTimersByTime(400));
  fireEvent.click(
    screen.getByRole("button", { name: "View your board, 0 points, dealer" }),
  );
  expect(view.container.querySelector(".opening-deal-stack")).toBe(stack);
  expect(
    view.container.querySelectorAll('.choose-pile[data-dealt="true"]').length,
  ).toBe(2);
  beat("05 Choose");
  fireEvent.click(
    screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
  );
  const card = view.container.querySelector(".hand-card");
  const source = view.container.querySelector(".opening-gather-source");
  fireEvent.click(
    screen.getByRole("button", { name: "View Poppy’s board, 0 points" }),
  );
  act(() => vi.advanceTimersByTime(500));
  fireEvent.click(
    screen.getByRole("button", { name: "View your board, 0 points, dealer" }),
  );
  expect(view.container.querySelector(".hand-card")).toBe(card);
  expect(view.container.querySelector(".opening-gather-source")).toBe(source);
  expect(screen.getByRole("button", { name: "Pause" })).toBeTruthy();
});
it("adds decorative waiting dots and only plays the discard reveal chime in Begin", () => {
  const view = show();
  beat("07 Ready up");
  const dots = view.container.querySelector(".waiting-ellipsis");
  expect(dots?.textContent).toBe("...");
  expect(dots?.getAttribute("aria-hidden")).toBe("true");
  beat("08 Begin");
  sound.play.mockClear();
  act(() => vi.advanceTimersByTime(400));
  expect(sound.play).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(400));
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("start");
  fireEvent.click(
    screen.getByRole("button", { name: "View Hazel’s board, 0 points" }),
  );
  act(() => vi.advanceTimersByTime(2000));
  expect(screen.getByRole("region", { name: "Hazel’s board" })).toBeTruthy();
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("start");
  expect(view.container.querySelector(".waiting-ellipsis")).toBeNull();
});
it("persists timing and notes and safely rejects malformed saved settings", () => {
  localStorage.setItem(
    "handandfoot.opening-preview.v1",
    JSON.stringify({ players: 99, durations: [] }),
  );
  show();
  expect(screen.getByLabelText<HTMLSelectElement>("Players").value).toBe("4");
  fireEvent.change(screen.getByLabelText("What should change?"), {
    target: { value: "Slower fan, quieter chime." },
  });
  fireEvent.change(screen.getByLabelText("Current beat duration"), {
    target: { value: "3000" },
  });
  expect(
    JSON.parse(localStorage.getItem("handandfoot.opening-preview.v1")!)
      .durations[0],
  ).toBe(3000);
  expect(
    JSON.parse(localStorage.getItem("handandfoot.opening-preview.v1.notes")!),
  ).toBe("Slower fan, quieter chime.");
});
it("keeps one stationary chosen source for the cascade, supports pause, and cleans up the previews", () => {
  const view = show();
  beat("05 Choose");
  fireEvent.click(
    screen.getByRole("button", { name: "Choose pile 2 as your hand" }),
  );
  const outgoing = () => view.container.querySelector(".opening-exit-piles");
  expect(outgoing()).toBeTruthy();
  expect(outgoing()!.querySelectorAll("button:disabled").length).toBe(2);
  expect(outgoing()!.querySelectorAll('[data-chosen="true"]').length).toBe(1);
  expect(outgoing()!.querySelectorAll(".opening-gather-source").length).toBe(1);
  expect(
    outgoing()!.querySelector(".opening-gather-source")!.closest("button")!
      .dataset.chosen,
  ).toBe("true");
  expect(
    screen.queryByRole("button", { name: "Choose pile 1 as your hand" }),
  ).toBeNull();
  expect(
    screen.getByLabelText<HTMLInputElement>("Current beat duration").value,
  ).toBe("2000");
  act(() => vi.advanceTimersByTime(200));
  expect(outgoing()).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Pause" }));
  act(() => vi.advanceTimersByTime(1000));
  expect(outgoing()).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Play opening" }));
  act(() => vi.advanceTimersByTime(1300));
  expect(outgoing()).toBeNull();
  expect(
    within(screen.getByLabelText("Your private hand")).getByRole("button", {
      name: "8 of hearts",
    }),
  ).toBeTruthy();
  expect(view.container.querySelectorAll(".game-page").length).toBe(1);
});
it("skips outgoing motion for reduced motion and keeps the selected hand correct", () => {
  const view = show();
  fireEvent.click(screen.getByLabelText("Reduced motion"));
  beat("05 Choose");
  fireEvent.click(
    screen.getByRole("button", { name: "Choose pile 1 as your hand" }),
  );
  expect(view.container.querySelector(".opening-exit-piles")).toBeNull();
  expect(
    within(screen.getByLabelText("Your private hand")).getByRole("button", {
      name: "Joker, 50 points",
    }),
  ).toBeTruthy();
});
