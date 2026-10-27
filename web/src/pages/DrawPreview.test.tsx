import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { DrawPreview } from "./DrawPreview";
import { command, getRoom, socketCredentials } from "../lib/api";
import { DRAW_FLIGHT_MS, DRAW_STAGGER_MS } from "../hooks/useDrawMotion";

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
  sound.play.mockClear();
});
afterEach(() => vi.useRealTimers());
function show() {
  return render(
    <MemoryRouter>
      <DrawPreview />
    </MemoryRouter>,
  );
}
function finish(count = 2, speed = 1) {
  act(() =>
    vi.advanceTimersByTime(
      (DRAW_FLIGHT_MS + (count - 1) * DRAW_STAGGER_MS) / speed,
    ),
  );
}

it("replays the same draw repeatedly without accumulating cards, moving a turn, or contacting a game", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("MY-REAL-GAME"));
  const view = show();
  expect(
    view.container.querySelectorAll(
      '.draw-available-indicator[data-active="true"]',
    ),
  ).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Play draw" }));
  for (let replay = 0; replay < 5; replay++) {
    expect(view.container.querySelectorAll(".draw-card-flight")).toHaveLength(
      2,
    );
    expect(
      view.container.querySelector(".hand-heading")?.textContent,
    ).toContain("11 cards");
    finish();
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(13);
    expect(
      view.container.querySelector(".hand-heading")?.textContent,
    ).toContain("13 cards");
    expect(view.container.querySelector(".draw-flight-layer")).toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    if (replay < 4)
      fireEvent.click(screen.getByRole("button", { name: "Replay draw" }));
  }
  expect(sound.play).toHaveBeenCalledTimes(5);
  expect(command).not.toHaveBeenCalled();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "MY-REAL-GAME",
  );
});

it("restarts cleanly mid-flight and supports the three-card draw in slow motion", () => {
  const view = show();
  fireEvent.click(
    screen.getByRole("button", { name: "Draw 2 cards from the stack" }),
  );
  act(() => vi.advanceTimersByTime(200));
  fireEvent.click(screen.getByRole("button", { name: "Replay draw" }));
  expect(view.container.querySelectorAll(".draw-card-flight")).toHaveLength(2);
  finish();
  fireEvent.change(screen.getByLabelText("Cards per draw"), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByLabelText("Draw playback speed"), {
    target: { value: "0.5" },
  });
  expect(view.container.querySelectorAll(".draw-card-flight")).toHaveLength(3);
  expect(
    (
      view.container.querySelector(".draw-card-flight") as HTMLElement
    ).style.getPropertyValue("--draw-duration"),
  ).toBe("1200ms");
  act(() => vi.advanceTimersByTime(800));
  expect(view.container.querySelector(".draw-flight-layer")).toBeTruthy();
  act(() => vi.advanceTimersByTime(760));
  expect(view.container.querySelector(".draw-flight-layer")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(14);
});
