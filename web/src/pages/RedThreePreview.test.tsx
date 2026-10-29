import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import party from "party-js";
import { RedThreePreview } from "./RedThreePreview";
import { command, getRoom, socketCredentials } from "../lib/api";

const sound = vi.hoisted(() => ({
  play: vi.fn(),
  muted: false,
  volume: 0.15,
  setMuted: vi.fn(),
  setVolume: vi.fn(),
}));
vi.mock("../context/SoundContext", () => ({ useSound: () => sound }));
vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("party-js", () => ({
  default: { confetti: vi.fn(), variation: { range: () => 90 } },
}));
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
const show = () =>
  render(
    <MemoryRouter>
      <RedThreePreview />
    </MemoryRouter>,
  );
const play = () => {
  fireEvent.click(screen.getByRole("button", { name: /play celebration/i }));
  act(() => vi.advanceTimersByTime(100));
  act(() => vi.advanceTimersByTime(20));
};

it("starts quietly and replays the real third-card celebration without changing a saved game", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("MY-SAVED-GAME"));
  const view = show();
  expect(
    view.container.querySelectorAll(".red-three-stack .card"),
  ).toHaveLength(2);
  expect(sound.play).not.toHaveBeenCalled();
  const originalHand = view.container.querySelectorAll(".hand-card").length;
  for (let replay = 0; replay < 3; replay++) {
    play();
    expect(
      view.container.querySelectorAll(".red-three-stack .card"),
    ).toHaveLength(3);
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(
      originalHand - 1,
    );
    expect(sound.play).toHaveBeenCalledTimes(replay + 1);
    expect(sound.play).toHaveBeenLastCalledWith("redThreeCelebration");
    expect(party.confetti).toHaveBeenCalledTimes(replay + 1);
    expect(party.confetti).toHaveBeenLastCalledWith(
      screen
        .getByRole("region", { name: "Your board" })
        .querySelector(".tableau-heading"),
      { count: 90 },
    );
  }
  expect(command).not.toHaveBeenCalled();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "MY-SAVED-GAME",
  );
});

it("previews all three together and cancels a pending play on reset or mode change", () => {
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Play celebration" }));
  fireEvent.change(screen.getByLabelText("Red 3 play"), {
    target: { value: "three" },
  });
  act(() => vi.advanceTimersByTime(1000));
  expect(sound.play).not.toHaveBeenCalled();
  expect(screen.queryByRole("group", { name: "Red threes" })).toBeNull();
  const hand = within(
    screen.getByRole("region", { name: "Your private hand" }),
  );
  expect(hand.getAllByRole("button", { name: /red three/ })).toHaveLength(3);
  play();
  expect(
    view.container.querySelectorAll(".red-three-stack .card"),
  ).toHaveLength(3);
  expect(sound.play).toHaveBeenCalledExactlyOnceWith("redThreeCelebration");
  fireEvent.click(screen.getByRole("button", { name: "Replay celebration" }));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.queryByRole("group", { name: "Red threes" })).toBeNull();
  expect(sound.play).toHaveBeenCalledTimes(1);
  expect(party.confetti).toHaveBeenCalledTimes(1);
});
