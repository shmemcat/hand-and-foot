import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useLiveScoring } from "./useLiveScoring";
import {
  SCORING_SCENARIOS,
  scoringHeldCards,
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

it.each([0, 3])(
  "uses the single-player sequence for both partners' hands, feet and reds (viewer seat %s)",
  (seat) => {
    const source = round();
    source.scoringMode = "partnership";
    source.players = source.players.map((player, index) => ({
      ...player,
      team: index % 3,
    }));
    source.sides = source.sides.slice(0, 3);
    source.viewerId = source.players[seat].id;
    const ownHand = source.hand;
    const partnerHand = [{ ...ownHand[0], id: "partner-ace" }];
    source.scoringHand = [...ownHand, ...partnerHand];
    source.hand = seat === 0 ? ownHand : partnerHand;
    source.scoringFoot = ["own-foot", "partner-foot"].map((id) => ({
      ...ownHand[0],
      id,
      rank: "4",
      value: 5,
    }));
    source.footTop = source.scoringFoot[seat === 0 ? 0 : 1];
    const reds = source.players[0].redThrees;
    source.players[0].redThrees = reds.slice(0, 1);
    source.players[3].redThrees = reds.slice(1);
    source.scoring = {
      ...source.scoring!,
      debt: 50,
      remaining: 35,
      options: [],
      usedPiles: ["reds:0"],
      canceled: reds.map((card) => card.id),
      score: {
        ...source.scoring!.score,
        debt: 50,
        cards: 0,
        redThrees: 0,
        redCredit: 15,
        total: -35,
        uncovered: 35,
      },
    };
    const expected = scoringSequence(
      {
        id: "partners",
        label: "Partners",
        reason: source.scoring.reason,
        hand: source.scoringHand,
        foot: source.scoringFoot,
        melds: [],
        reds,
        goingOut: 0,
      },
      { pileIds: ["reds:0"], complete: true, qualified: true },
    );
    const view = renderHook(() => useLiveScoring(source, true, false));
    for (const beat of expected) {
      expect(view.result.current.beat).toEqual(beat);
      const held = new Set(scoringHeldCards(beat).map((card) => card.id));
      expect(
        view.result.current.snapshot?.players
          .filter((player) => player.team === 0)
          .flatMap((player) => player.redThrees),
      ).toEqual(beat.reds.filter((card) => !held.has(card.id)));
      if (beat.kind !== "total")
        act(() => vi.advanceTimersByTime(beat.duration));
    }
    expect(
      view.result.current.beat!.base + view.result.current.beat!.cardValue,
    ).toBe(-35);
    expect(view.result.current.done).toBe(true);
    expect(source.scoring.confirmed).toBe(false);
  },
);
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it.each(["round_over", "finished"] as const)(
  "keeps counting locally when %s is ready and releases results on the last beat",
  (phase) => {
    const source = round();
    const view = renderHook(
      ({ snapshot }) => useLiveScoring(snapshot, true, false),
      { initialProps: { snapshot: source } },
    );
    act(() => vi.advanceTimersByTime(1200));
    expect(view.result.current.waiting).toBe(true);
    const result: Snapshot = {
      ...source,
      phase,
      scoring: null,
      history: [
        {
          round: source.round,
          reason: source.scoring!.reason,
          scores: [
            {
              ...source.scoring!.score,
              cards: 0,
              redThrees: 0,
              redCredit: 15,
              canceled: source.players[0].redThrees.map((card) => card.id),
              uncovered: 5,
              total: -5,
            },
          ],
        },
      ],
    };
    view.rerender({ snapshot: result });
    expect(view.result.current.snapshot?.phase).toBe("scoring");
    expect(view.result.current.snapshot?.scoring?.confirmed).toBe(true);
    expect(view.result.current.beat?.kind).toBe("break");
    for (let step = 0; step < 100; step++) {
      const beat = view.result.current.beat;
      if (!beat) break;
      expect(view.result.current.snapshot?.phase).toBe("scoring");
      if (beat.kind === "count") expect(beat.base + beat.cardValue).toBe(-5);
      act(() => vi.advanceTimersByTime(beat.duration - 1));
      expect(view.result.current.snapshot?.phase).toBe("scoring");
      act(() => vi.advanceTimersByTime(1));
    }
    expect(view.result.current.snapshot).toBe(result);
    expect(view.result.current.enabled).toBe(false);
    expect(view.result.current.beat).toBeUndefined();
  },
);

it("opens an already prepared result immediately when counting is skipped", () => {
  const source = round();
  source.scoring!.options = [];
  const view = renderHook(
    ({ snapshot }) => useLiveScoring(snapshot, true, false),
    { initialProps: { snapshot: source } },
  );
  const result: Snapshot = { ...source, phase: "round_over", scoring: null };
  view.rerender({ snapshot: result });
  expect(view.result.current.snapshot?.phase).toBe("scoring");
  act(() => view.result.current.skip());
  expect(view.result.current.snapshot).toBe(result);
  expect(view.result.current.enabled).toBe(false);
  expect(view.result.current.beat).toBeUndefined();
});

it.each(["round_over", "finished"] as const)(
  "restores the full round board and removes counting presentation when %s arrives",
  (phase) => {
    const scenario = SCORING_SCENARIOS[0];
    const source = scoringSnapshot(scenario, scoringSequence(scenario)[0], 0);
    source.scoringFoot = scenario.foot;
    source.scoring = {
      ...round().scoring!,
      debt: 195,
      remaining: 0,
      revision: 1,
      usedPiles: ["tens", "fives", "nines", "queens"],
      options: [],
    };
    const view = renderHook(
      ({ snapshot }) => useLiveScoring(snapshot, true, false),
      { initialProps: { snapshot: source } },
    );
    for (let step = 0; step < 100 && !view.result.current.done; step++)
      act(() => vi.advanceTimersByTime(view.result.current.beat!.duration));
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.snapshot?.hand).toHaveLength(0);
    expect(view.result.current.snapshot?.sides[0].melds).toHaveLength(0);
    const result: Snapshot = {
      ...source,
      phase,
      scoring: null,
      scoringFoot: null,
      hand: [...scenario.hand, ...scenario.foot],
      footTop: null,
      sides: source.sides.map((side) => ({ ...side, score: side.score + 100 })),
      players: source.players.map((player) => ({ ...player, ready: true })),
    };
    view.rerender({ snapshot: result });
    expect(view.result.current.snapshot).toBe(result);
    expect(view.result.current.snapshot?.hand).toEqual([
      ...scenario.hand,
      ...scenario.foot,
    ]);
    expect(view.result.current.snapshot?.footTop).toBeNull();
    expect(view.result.current.snapshot?.players[0].redThrees).toEqual(
      scenario.reds,
    );
    expect(view.result.current.snapshot?.sides[0].melds).toHaveLength(
      scenario.melds.length,
    );
    expect(view.result.current.enabled).toBe(false);
    expect(view.result.current.beat).toBeUndefined();
  },
);

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
it.each([false, true])(
  "skips counting while payment is pending (waiting: %s) and resets next round",
  (waiting) => {
    const source = round();
    const view = renderHook(
      ({ snapshot }) => useLiveScoring(snapshot, true, false),
      { initialProps: { snapshot: source } },
    );
    if (waiting) act(() => vi.advanceTimersByTime(1200));
    act(() => view.result.current.skip());
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.beat).toBeUndefined();
    expect(view.result.current.snapshot).toBe(source);
    expect(source.scoring?.confirmed).toBe(false);
    const paid = {
      ...source,
      revision: 2,
      scoring: {
        ...source.scoring!,
        revision: 1,
        remaining: 5,
        usedPiles: ["reds:0"],
        options: [],
      },
    };
    view.rerender({ snapshot: paid });
    act(() => vi.advanceTimersByTime(10000));
    expect(view.result.current.done).toBe(true);
    expect(view.result.current.beat).toBeUndefined();
    expect(view.result.current.snapshot).toBe(paid);
    view.rerender({ snapshot: { ...source, round: source.round + 1 } });
    expect(view.result.current.done).toBe(false);
    expect(view.result.current.beat?.kind).toBe("ready");
  },
);
it("replays scoring after a rematch reuses the same round number", () => {
  const source = round();
  const view = renderHook(
    ({ snapshot }) => useLiveScoring(snapshot, true, false),
    { initialProps: { snapshot: source } },
  );
  act(() => view.result.current.skip());
  expect(view.result.current.done).toBe(true);
  view.rerender({ snapshot: { ...source, phase: "finished", scoring: null } });
  view.rerender({ snapshot: source });
  expect(view.result.current.done).toBe(false);
  expect(view.result.current.beat?.kind).toBe("ready");
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
