import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GameMenu } from "./GameMenu";
import { ScoringCheatSheet } from "./ScoringCheatSheet";
import type { Snapshot } from "../types";

async function openReference() {
  const trigger = screen.getByTitle("Scoring cheat sheet");
  fireEvent.click(trigger);
  return {
    trigger,
    dialog: await screen.findByRole("dialog", { name: "Scoring cheat sheet" }),
  };
}

it("opens the chosen gallery with real game cards and the bonus and threes sections", async () => {
  render(<ScoringCheatSheet />);
  expect(screen.queryByRole("dialog")).toBeNull();
  const { dialog } = await openReference();
  const reference = within(dialog);
  expect(
    reference
      .getAllByRole("img")
      .map((card) => card.getAttribute("aria-label")),
  ).toEqual(["4 of spades", "K of clubs", "A of hearts", "Joker, 50 points"]);
  expect(dialog.querySelectorAll(".card-art")).toHaveLength(4);
  expect(reference.getByRole("region", { name: "Bonuses" })).toBeTruthy();
  const threes = within(reference.getByRole("region", { name: "Threes" }));
  expect(threes.getByText("+300 each")).toBeTruthy();
  expect(threes.getAllByText("−300 each")).toHaveLength(2);
  expect(threes.getByText("−100 each")).toBeTruthy();
  expect(reference.getByText("+1,300")).toBeTruthy();
  expect(
    reference.getByText("7 cards; +50 per extra flush card."),
  ).toBeTruthy();
  expect(reference.getAllByRole("separator")).toHaveLength(2);
  expect(reference.queryByText(/Played reds also count/)).toBeNull();
  expect(reference.queryByText(/Played cards add points/)).toBeNull();
});

it("dismisses with the close button, Escape, and an outside press, and restores focus", async () => {
  render(<ScoringCheatSheet />);
  const { trigger } = await openReference();
  fireEvent.click(
    screen.getByRole("button", { name: "Close scoring cheat sheet" }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await openReference();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(trigger);
  await openReference();
  fireEvent.pointerDown(document.body);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("places the receipt before the hamburger and keeps only one popup open", async () => {
  render(
    <GameMenu
      snapshot={
        {
          sides: [],
          players: [],
          phase: "play",
          round: 1,
          targetScore: 10000,
        } as unknown as Snapshot
      }
      onView={vi.fn()}
      onScores={vi.fn()}
      onLeave={vi.fn()}
    />,
  );
  const reference = screen.getByTitle("Scoring cheat sheet");
  const menu = screen.getByLabelText("Game information and scores");
  expect(
    reference.compareDocumentPosition(menu) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  // Keyboard activation does not send the outside pointer event.
  fireEvent.click(menu);
  await waitFor(() => expect(menu.closest("details")?.open).toBe(true));
  await openReference();
  await waitFor(() => expect(menu.closest("details")?.open).toBe(false));
  fireEvent.click(menu);
  await waitFor(() => expect(reference.closest("details")?.open).toBe(false));
  expect(menu.closest("details")?.open).toBe(true);
});

it("keeps the reference above the mobile hand drawer and updates its height when resized", async () => {
  render(
    <div
      className="site-frame"
      style={{ paddingBottom: 20, borderBottomWidth: 1 }}
    >
      <main style={{ overflowY: "auto", paddingBottom: 12 }}>
        <ScoringCheatSheet />
      </main>
    </div>,
  );
  const frame = document.querySelector<HTMLElement>(".site-frame")!;
  const main = document.querySelector("main")!;
  vi.spyOn(frame, "getBoundingClientRect").mockReturnValue({
    bottom: 800,
  } as DOMRect);
  vi.spyOn(main, "getBoundingClientRect").mockReturnValue({
    top: 100,
  } as DOMRect);
  Object.defineProperty(main, "clientHeight", {
    configurable: true,
    value: 480,
  });
  const panel = document.querySelector<HTMLElement>(
    ".scoring-cheat-sheet-panel",
  )!;
  vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({
    top: 200,
  } as DOMRect);
  await openReference();
  await waitFor(() => expect(panel.style.maxHeight).toBe("364px"));
  Object.defineProperty(main, "clientHeight", {
    configurable: true,
    value: 400,
  });
  act(() => fireEvent.resize(window));
  expect(panel.style.maxHeight).toBe("284px");
});
