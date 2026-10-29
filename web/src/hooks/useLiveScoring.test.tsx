import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLiveScoring } from "./useLiveScoring";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  scoringSnapshot,
} from "../lib/scoringSequence";
import type { Snapshot } from "../types";

function round(): Snapshot {
  const scenario = SCORING_SCENARIOS.find((item) => item.id === "ace-vs-reds")!;
  const snapshot = scoringSnapshot(scenario, scoringSequence(scenario)[0], 0);
  snapshot.scoringFoot = [];
  snapshot.scoring = {
    team: 0,
    debt: 20,
    remaining: 20,
    canceled: [],
    usedPiles: [],
    broken: [],
    confirmed: false,
    revision: 0,
    reason: scenario.reason,
    confirmedSides: [],
    debtBreakdown: [],
    redThreeQualified: true,
    options: [
      {
        id: "reds:0",
        label: "Red threes",
        points: 15,
        bonusAtRisk: 900,
        cardIds: scenario.reds.map((card) => card.id),
        redThree: true,
      },
    ],
    score: {
      team: 0,
      cards: 15,
      debt: 20,
      redThrees: 900,
      redCredit: 0,
      books: 0,
      goingOut: 0,
      total: 895,
      canceled: [],
      lostBooks: 0,
      broken: [],
      uncovered: 20,
    },
  };
  return snapshot;
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("waits for an accepted payment, opens qualified reds and counts to minus five", () => {
  const source = round();
  const view = renderHook(
    ({ snapshot }) => useLiveScoring(snapshot, true, false),
    { initialProps: { snapshot: source } },
  );
  expect(view.result.current.beat?.kind).toBe("ready");
  act(() => vi.advanceTimersByTime(1200));
  expect(view.result.current.waiting).toBe(true);
  const paid = {
    ...source,
    revision: 1,
    scoring: {
      ...source.scoring!,
      revision: 1,
      remaining: 5,
      usedPiles: ["reds:0"],
      canceled: source.players[0].redThrees.map((card) => card.id),
      options: [],
      score: {
        ...source.scoring!.score,
        total: -5,
        redThrees: 0,
        redCredit: 15,
        cards: 0,
      },
    },
  };
  view.rerender({ snapshot: paid });
  expect(view.result.current.beat?.kind).toBe("break");
  expect(view.result.current.beat?.redsBroken).toBe(true);
  for (let step = 0; step < 100 && !view.result.current.done; step++)
    act(() => vi.advanceTimersByTime(view.result.current.beat!.duration));
  expect(view.result.current.done).toBe(true);
  expect(
    view.result.current.beat!.base + view.result.current.beat!.cardValue,
  ).toBe(paid.scoring.score.total);
  expect(view.result.current.snapshot?.hand).toHaveLength(0);
  expect(paid.scoring.confirmed).toBe(false);
});
it("pauses while hidden and resumes without changing the accepted score", () => {
  const source = round();
  const view = renderHook(() => useLiveScoring(source, true, false));
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => vi.advanceTimersByTime(10000));
  expect(view.result.current.beat?.kind).toBe("ready");
  expect(source.scoring?.revision).toBe(0);
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => vi.advanceTimersByTime(1200));
  expect(view.result.current.waiting).toBe(true);
  act(() => vi.advanceTimersByTime(10000));
  expect(view.result.current.waiting).toBe(true);
});
it("gathers every private foot face before permitting settlement and resets next deal", () => {
  const scenario = SCORING_SCENARIOS[0];
  const source = round();
  source.hand = scenario.hand;
  source.scoringFoot = scenario.foot;
  source.footTop = scenario.foot[0];
  source.scoring!.debt = 195;
  source.scoring!.remaining = 195;
  const view = renderHook(
    ({ snapshot }) => useLiveScoring(snapshot, true, false),
    { initialProps: { snapshot: source } },
  );
  expect(view.result.current.snapshot?.hand).toHaveLength(4);
  act(() => vi.advanceTimersByTime(1200));
  expect(view.result.current.beat?.kind).toBe("gather");
  expect(view.result.current.snapshot?.hand).toHaveLength(15);
  expect(view.result.current.snapshot?.footTop).toBeNull();
  view.rerender({
    snapshot: { ...source, round: 5, phase: "choose", scoring: null },
  });
  expect(view.result.current.enabled).toBe(false);
  expect(view.result.current.beat).toBeUndefined();
});
