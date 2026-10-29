import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import { ScoreDesignsPreview, scoreDesignResults } from "./ScoreDesignsPreview";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";

it("keeps the earned/deducted and before/after explanations consistent with every sample score", () => {
  for (const example of ENDING_EXAMPLES) {
    for (const side of scoreDesignResults(endingSnapshot(example))) {
      expect(side.earned - side.deductions).toBe(side.score.total);
      expect(side.previous + side.score.total).toBe(side.game);
    }
  }
  const tough = scoreDesignResults(
    endingSnapshot(
      ENDING_EXAMPLES.find((example) => example.id === "round-deck")!,
    ),
  )[0];
  expect(tough.earned).toBe(165);
  expect(tough.deductions).toBe(1095);
});

it("shows ten pitches and lets a player expand the compact scoreboard", () => {
  render(
    <MemoryRouter>
      <ScoreDesignsPreview />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole("article")).toHaveLength(10);
  fireEvent.change(screen.getByLabelText("Show"), {
    target: { value: "rows" },
  });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.click(screen.getAllByRole("button", { name: "Details" })[0]);
  expect(screen.getByText("Card points")).toBeTruthy();
  expect(screen.getByText("+160")).toBeTruthy();
  expect(screen.getByText("+5")).toBeTruthy();
});

it("can compare a full table and inspect an individual player", () => {
  render(
    <MemoryRouter>
      <ScoreDesignsPreview />
    </MemoryRouter>,
  );
  fireEvent.change(screen.getByLabelText("Sample round"), {
    target: { value: "round-six" },
  });
  fireEvent.change(screen.getByLabelText("Show"), {
    target: { value: "matrix" },
  });
  const table = screen.getByRole("table", { name: "Score comparison" });
  expect(within(table).getAllByRole("columnheader")).toHaveLength(7);
  fireEvent.change(screen.getByLabelText("Show"), {
    target: { value: "focus" },
  });
  fireEvent.click(screen.getByRole("button", { name: /Marigold/ }));
  expect(screen.getByRole("region", { name: "Marigold score" })).toBeTruthy();
});
