import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { OpeningPreview } from "./OpeningPreview";

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
beforeEach(() => {
  vi.useFakeTimers();
  sound.play.mockClear();
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
  expect(within(hand).getAllByRole("img").length).toBe(12);
  expect(within(hand).getByRole("img", { name: "8 of hearts" })).toBeTruthy();
  expect(within(hand).queryByRole("img", { name: "A of hearts" })).toBeNull();
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
  expect(screen.getByText("9 decks")).toBeTruthy();
  expect(
    within(screen.getByLabelText("Players at the table")).getByText("Kit"),
  ).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Dealer for this rehearsal"), {
    target: { value: "0" },
  });
  beat("08 Begin");
  expect(
    screen.getByRole("heading", { name: "Poppy is up first." }),
  ).toBeTruthy();
  expect(
    screen.getByText("We stop here, just before the first draw."),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Draw two/ })).toBeNull();
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
