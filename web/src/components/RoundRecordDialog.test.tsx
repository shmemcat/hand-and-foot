import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { RoundRecordDialog } from "./RoundRecordDialog";
import { Room } from "../pages/Room";
import { roundRecordExample } from "../lib/roundRecordExamples";
import { completedRoundRecords, recordGameTotal } from "../lib/roundRecords";
import type { Snapshot } from "../types";

vi.mock("../context/AuthContext", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("party-js", () => ({
  default: { confetti: vi.fn(), variation: { range: () => 90 } },
}));
beforeEach(() => {
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
});
function Example({ snapshot = roundRecordExample() }: { snapshot?: Snapshot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open record</button>
      {open && (
        <RoundRecordDialog snapshot={snapshot} onClose={() => setOpen(false)} />
      )}
    </>
  );
}
function open(snapshot?: Snapshot) {
  const view = render(<Example snapshot={snapshot} />);
  const trigger = screen.getByRole("button", { name: "Open record" });
  trigger.focus();
  fireEvent.click(trigger);
  return { view, trigger };
}

it("opens the latest completed round and browses earlier rounds with arrows, dots and keys", () => {
  open();
  const dialog = () => screen.getByRole("dialog");
  expect(
    within(dialog()).getByRole("heading", { name: "Round 3" }),
  ).toBeTruthy();
  expect(dialog().querySelectorAll(".round-record-player")).toHaveLength(6);
  expect(
    (screen.getByRole("button", { name: "Next round" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(screen.queryByRole("button", { name: "View round 4" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Previous round" }));
  expect(
    within(dialog()).getByRole("heading", { name: "Round 2" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "View round 1" }));
  expect(
    (
      screen.getByRole("button", {
        name: "Previous round",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  fireEvent.keyDown(dialog(), { key: "End" });
  expect(
    screen
      .getByRole("button", { name: "View round 3" })
      .getAttribute("aria-pressed"),
  ).toBe("true");
  fireEvent.keyDown(dialog(), { key: "ArrowLeft" });
  expect(
    within(dialog()).getByRole("heading", { name: "Round 2" }),
  ).toBeTruthy();
  fireEvent.keyDown(dialog(), { key: "Home" });
  expect(
    within(dialog()).getByRole("heading", { name: "Round 1" }),
  ).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.click(screen.getByRole("button", { name: "Open record" }));
  expect(
    within(dialog()).getByRole("heading", { name: "Round 3" }),
  ).toBeTruthy();
});

it("shows exact round arithmetic, historical game totals and the same category order as results", () => {
  const snapshot = roundRecordExample();
  open(snapshot);
  const score = snapshot.history[2].scores[0];
  const player = screen.getByRole("region", { name: "You’s round 3 score" });
  expect(
    within(player).getByLabelText(
      `${score.total.toLocaleString()} points this round`,
    ).textContent,
  ).toBe(`+${score.total.toLocaleString()}`);
  expect(score.total).toBe(
    score.cards +
      score.redCredit -
      score.debt +
      score.books +
      score.redThrees +
      score.goingOut,
  );
  const historical = recordGameTotal(snapshot, 1, 0);
  fireEvent.click(screen.getByRole("button", { name: "View round 1" }));
  const first = screen.getByRole("region", { name: "You’s round 1 score" });
  expect(first.querySelector(".round-record-total dd")?.textContent).toBe(
    historical.toLocaleString(),
  );
  expect(
    [...first.querySelectorAll("dt")].map((row) => row.textContent),
  ).toEqual([
    "Books & straights",
    "Going out first",
    "Leftover card debt",
    "Card points",
    "Red threes",
    "Game total",
  ]);
  expect(screen.queryByText("Books & melds")).toBeNull();
  expect(first.querySelectorAll(".card")).toHaveLength(0);
  expect(first.querySelector(".round-record-player-note")).toBeNull();
});

it("closes from the backdrop or Escape and restores focus and scrolling", () => {
  const { trigger } = open();
  let dialog = screen.getByRole("dialog");
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.pointerDown(within(dialog).getByRole("heading"));
  fireEvent.click(within(dialog).getByRole("heading"));
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.pointerDown(dialog);
  fireEvent.click(dialog);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  expect(document.body.style.overflow).toBe("");
  fireEvent.click(trigger);
  dialog = screen.getByRole("dialog");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
});

it("browses saved scores after reloading and sorts without changing the saved history", () => {
  const snapshot: Snapshot = JSON.parse(JSON.stringify(roundRecordExample()));
  snapshot.history.reverse();
  const original = structuredClone(snapshot);
  expect(completedRoundRecords(snapshot).map((round) => round.round)).toEqual([
    1, 2, 3,
  ]);
  open(snapshot);
  expect(screen.getByRole("dialog", { name: "Round 3" })).toBeTruthy();
  expect(screen.queryByText("Books & melds")).toBeNull();
  expect(snapshot).toEqual(original);
});

it("opens from the live round badge, including an empty first-round record, without exposing the hand", () => {
  const snapshot = { ...roundRecordExample(), round: 1, history: [] };
  render(
    <MemoryRouter>
      <Room rehearsal={{ snapshot, onChoose: () => {} }} />
    </MemoryRouter>,
  );
  const trigger = screen.getByRole("button", {
    name: "Round 1. View round record",
  });
  fireEvent.click(trigger);
  const dialog = screen.getByRole("dialog", { name: "Your round starts here" });
  expect(
    within(dialog).getByText("Completed rounds will appear here."),
  ).toBeTruthy();
  expect(dialog.querySelectorAll(".card")).toHaveLength(0);
  expect(trigger.getAttribute("aria-expanded")).toBe("true");
  fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
});
