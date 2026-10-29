import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { FootPreview } from "./FootPreview";
import { command, getRoom, socketCredentials } from "../lib/api";
import { MELD_FLIGHT_MS } from "../hooks/useMeldMotion";
import { FOOT_CARDS, footGatherDuration } from "../lib/footSequence";

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
const show = () =>
  render(
    <MemoryRouter>
      <FootPreview />
    </MemoryRouter>,
  );
const leaveHand = (speed = 1) =>
  act(() => vi.advanceTimersByTime((MELD_FLIGHT_MS + 100) / speed));
const gatherFoot = (speed = 1) =>
  act(() =>
    vi.advanceTimersByTime(footGatherDuration(FOOT_CARDS.length) / speed),
  );

it("cascades from the real foot location and allows continuing after a final meld", () => {
  localStorage.setItem("handandfoot.room.v1", JSON.stringify("MY-SAVED-GAME"));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
    function (this: Element) {
      return this.matches(".foot-stack")
        ? new DOMRect(900, 500, 22, 31)
        : new DOMRect(100, 550, 62, 87);
    },
  );
  const view = show();
  fireEvent.click(screen.getByRole("button", { name: "Play last card" }));
  expect(view.container.querySelector(".meld-card-flight")).toBeTruthy();
  leaveHand();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
  const card = view.container.querySelector<HTMLElement>(".hand-card")!;
  expect(card.style.getPropertyValue("--foot-x")).toBe("780px");
  expect(card.style.getPropertyValue("--foot-y")).toBe("-78px");
  expect(
    screen.getByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "K of hearts" })
      .getAttribute("disabled"),
  ).not.toBeNull();
  gatherFoot();
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "K of hearts" })
      .getAttribute("disabled"),
  ).toBeNull();
  expect(view.container.querySelector(".turn-message")?.textContent).toContain(
    "Keep playing",
  );
  expect(command).not.toHaveBeenCalled();
  expect(getRoom).not.toHaveBeenCalled();
  expect(socketCredentials).not.toHaveBeenCalled();
  expect(JSON.parse(localStorage.getItem("handandfoot.room.v1")!)).toBe(
    "MY-SAVED-GAME",
  );
});

it("keeps a discarded-into foot unplayable and replays with one click without accumulating cards", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Foot entry method"), {
    target: { value: "discard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard last card" }));
  for (let replay = 0; replay < 3; replay++) {
    leaveHand();
    gatherFoot();
    expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
    expect(
      view.container
        .querySelector(".discard-face .card")
        ?.getAttribute("aria-label"),
    ).toBe("K of clubs");
    expect(
      screen
        .getByRole("button", { name: "K of hearts" })
        .getAttribute("disabled"),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Discard" })).toBeNull();
    expect(
      view.container.querySelector(".turn-message")?.textContent,
    ).toContain("Poppy’s turn");
    if (replay < 2)
      fireEvent.click(screen.getByRole("button", { name: "Replay" }));
  }
});

it("slows the whole sequence and cancels cleanly when reset mid-cascade", () => {
  const view = show();
  fireEvent.change(screen.getByLabelText("Foot playback speed"), {
    target: { value: "0.5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Play last card" }));
  leaveHand(0.5);
  expect(
    view.container
      .querySelector<HTMLElement>(".foot-transition")
      ?.style.getPropertyValue("--foot-flight-duration"),
  ).toBe("1000ms");
  act(() => vi.advanceTimersByTime(500));
  fireEvent.click(screen.getByRole("button", { name: "Reset" }));
  act(() => vi.advanceTimersByTime(10000));
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(1);
  expect(
    screen.getByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeTruthy();
  expect(view.container.querySelector(".meld-card-flight")).toBeNull();
});

it("skips flights for reduced motion while preserving the discard outcome", () => {
  vi.mocked(window.matchMedia).mockImplementation(
    (query) =>
      ({
        matches: query !== "(max-width: 768px)",
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  );
  const view = show();
  fireEvent.change(screen.getByLabelText("Foot entry method"), {
    target: { value: "discard" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Discard last card" }));
  act(() => vi.runAllTimers());
  act(() => vi.runAllTimers());
  expect(view.container.querySelector(".meld-card-flight")).toBeNull();
  expect(view.container.querySelectorAll(".hand-card")).toHaveLength(11);
  expect(
    screen.queryByRole("group", { name: "Your foot, 11 cards" }),
  ).toBeNull();
  expect(
    screen
      .getByRole("button", { name: "K of hearts" })
      .getAttribute("disabled"),
  ).not.toBeNull();
});
