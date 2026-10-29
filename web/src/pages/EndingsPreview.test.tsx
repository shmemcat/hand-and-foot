import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import { EndingsPreview } from "./EndingsPreview";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";

afterEach(() => vi.useRealTimers());

it("shows every result without changing a game, and can preview readiness", () => {
  render(
    <MemoryRouter>
      <EndingsPreview />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("article")).toHaveLength(ENDING_EXAMPLES.length);
  expect(screen.queryByRole("dialog")).toBeNull();
  const sample = screen.getByRole("article", { name: "Round complete" });
  fireEvent.click(within(sample).getByRole("button", { name: "Next Round" }));
  expect(
    within(sample)
      .getByRole("button", { name: "Waiting for players..." })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Reset samples" }));
  expect(
    within(screen.getByRole("article", { name: "Round complete" }))
      .getByRole("button", { name: "Next Round" })
      .hasAttribute("disabled"),
  ).toBe(false);
});

it("filters the gallery and opens a final result with its animated reveal", () => {
  vi.useFakeTimers();
  render(
    <MemoryRouter>
      <EndingsPreview />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: "End of game" }));
  expect(screen.queryByRole("article", { name: "Round complete" })).toBeNull();
  fireEvent.click(
    screen.getByRole("button", { name: "Open You win at full size" }),
  );
  const dialog = screen.getByRole("dialog", { name: "Score sheet" });
  expect(within(dialog).getByText("Adding the final round…")).toBeTruthy();
  expect(
    within(dialog)
      .getByRole("button", { name: "Play Again" })
      .hasAttribute("disabled"),
  ).toBe(true);
  act(() => vi.advanceTimersByTime(600));
  expect(within(dialog).getByText("You win!")).toBeTruthy();
  fireEvent.click(
    within(dialog).getByRole("button", { name: /All ending screens/ }),
  );
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("keeps the requested round details and only shows the full round breakdown at game end", () => {
  render(
    <MemoryRouter>
      <EndingsPreview />
    </MemoryRouter>,
  );
  const round = screen.getByRole("article", { name: "Deck exhausted" });
  expect(
    within(round).getByRole("heading", { name: "Round 3 Scores" }),
  ).toBeTruthy();
  expect(within(round).queryByText("Previous rounds")).toBeNull();
  expect(within(round).queryByText("Round breakdown")).toBeNull();
  expect(within(round).queryByText("Books broken by debt")).toBeNull();
  expect(within(round).queryByText(/players ready/)).toBeNull();
  expect(
    within(round).queryByRole("link", { name: "Back to Play" }),
  ).toBeNull();
  expect(within(round).getAllByText("Books & straights")).toHaveLength(3);
  expect(within(round).getAllByText("Game total")).toHaveLength(3);
  expect(within(round).queryByText("Red-three debt credit")).toBeNull();
  const yourResult = within(round)
    .getByRole("heading", { name: "You" })
    .closest<HTMLElement>(".side-result")!;
  expect(within(yourResult).getByText("165")).toBeTruthy();
  expect(
    [...yourResult.querySelectorAll("dl dt")].map((term) => term.textContent),
  ).toEqual([
    "Books & straights",
    "Going out first",
    "Leftover card debt",
    "Card points",
    "Red threes",
    "Round 3",
  ]);
  expect(yourResult.querySelector(".round-total dd")?.textContent).toBe("-930");
  const final = screen.getByRole("article", { name: "You win" });
  expect(within(final).queryByText("A MATCH WELL PLAYED")).toBeNull();
  fireEvent.click(within(final).getByText("Round breakdown"));
  const breakdown = within(final).getByRole("table", {
    name: "Round breakdown",
  });
  expect(within(breakdown).getAllByRole("row")).toHaveLength(7);
  expect(within(final).getByRole("button", { name: "Home" })).toBeTruthy();
});

it("previews the host tooltip, leave action, and hide/show eye", () => {
  render(
    <MemoryRouter>
      <EndingsPreview />
    </MemoryRouter>,
  );
  const guest = screen.getByRole("article", { name: "Waiting for host" });
  expect(
    within(guest)
      .getByRole("button", { name: "Waiting for host..." })
      .hasAttribute("disabled"),
  ).toBe(true);
  fireEvent.focus(
    within(guest).getByRole("group", { name: "Waiting for host" }),
  );
  expect(within(guest).getByRole("tooltip").textContent).toBe(
    "Only the host can start a new game.",
  );
  expect(screen.getAllByRole("button", { name: "Hide results" })).toHaveLength(
    1,
  );
  fireEvent.click(screen.getByRole("button", { name: "Hide results" }));
  expect(
    within(guest).queryByRole("region", { name: "Score sheet" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Show results" }));
  expect(
    within(guest).getByRole("region", { name: "Score sheet" }),
  ).toBeTruthy();
  fireEvent.click(within(guest).getByRole("button", { name: "Leave Lobby" }));
  expect(within(guest).getByText("You left the lobby.")).toBeTruthy();
});

it("keeps sample score calculations, histories and winners consistent", () => {
  for (const example of ENDING_EXAMPLES) {
    const snapshot = endingSnapshot(example);
    for (const round of snapshot.history) {
      for (const score of round.scores) {
        expect(score.cards).toBeGreaterThanOrEqual(0);
        expect(score.total).toBe(
          score.cards -
            score.debt +
            score.books +
            score.redThrees +
            score.redCredit +
            score.goingOut,
        );
      }
    }
    for (const side of snapshot.sides) {
      expect(side.score).toBe(
        snapshot.history.reduce(
          (total, round) => total + round.scores[side.id].total,
          0,
        ),
      );
    }
    if (snapshot.phase === "finished") {
      const high = Math.max(...snapshot.sides.map((side) => side.score));
      expect(high).toBeGreaterThanOrEqual(snapshot.targetScore);
      expect(snapshot.winners).toEqual(
        snapshot.sides
          .filter((side) => side.score === high)
          .map((side) => side.id),
      );
      for (const side of snapshot.sides) {
        expect(
          snapshot.history
            .slice(0, -1)
            .reduce((total, round) => total + round.scores[side.id].total, 0),
        ).toBeLessThan(snapshot.targetScore);
      }
    }
  }
});
