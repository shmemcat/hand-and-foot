import { describe, expect, it } from "vitest";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  scoringSnapshot,
  scoringHeldCards,
  rawCardValue,
  debtCardValue,
} from "./scoringSequence";

describe("physical end-of-round score count", () => {
  it("waits after gathering the foot, and follows only accepted pile choices", () => {
    const scenario = SCORING_SCENARIOS[0];
    const waiting = scoringSequence(scenario, { pileIds: [], complete: false });
    expect(waiting.map((beat) => beat.kind)).toEqual([
      "ready",
      "gather",
      "wait",
    ]);
    const paid = scoringSequence(scenario, {
      pileIds: ["fives"],
      complete: false,
    });
    expect(paid.at(-1)?.kind).toBe("wait");
    expect(
      paid
        .filter((beat) => beat.kind === "pair")
        .every((beat) => beat.activePile === "fives"),
    ).toBe(true);
    expect(paid.some((beat) => beat.kind === "break")).toBe(false);
    expect(paid.at(-1)?.remaining).toBe(waiting.at(-1)!.remaining - 15);
    expect(scoringHeldCards(paid.at(-1)!)).toHaveLength(1);
  });
  it("honors a chosen book before open piles and spends cards in server order", () => {
    const beats = scoringSequence(SCORING_SCENARIOS[0], {
      pileIds: ["queens", "kings", "fives"],
      complete: true,
    });
    expect(beats[2].kind).toBe("break");
    expect(beats[2].activePile).toBe("queens");
    const paired = beats.filter((beat) => beat.kind === "pair");
    const first = paired[0].transfers.find(
      (move) => move.source === "table",
    )!.card;
    expect(first.value).toBe(10);
    const canceled = [
      ...new Set(
        paired.flatMap((beat) =>
          beat.transfers
            .filter(
              (move) =>
                move.source === "table" && beat.pointsLeft[move.card.id] === 0,
            )
            .map((move) => move.card.id),
        ),
      ),
    ];
    expect(canceled.length).toBeGreaterThan(7);
    expect(beats.at(-1)!.base).toBe(2200);
    expect(beats.at(-1)!.base + beats.at(-1)!.cardValue).toBe(2485);
  });
  it("uses accepted qualified reds without reviving the bonus or adding a penalty", () => {
    const scenario = SCORING_SCENARIOS.find(
      (item) => item.id === "ace-vs-reds",
    )!;
    const final = scoringSequence(scenario, {
      pileIds: ["reds:0"],
      complete: true,
      qualified: true,
    }).at(-1)!;
    expect(final.base).toBe(0);
    expect(final.cardValue).toBe(-5);
    expect(final.penalizedReds).toEqual([]);
  });
  it.each([
    ["break-book", 2700, 285, 2985],
    ["in-foot", 2700, 345, 3045],
    ["no-debt", 3100, 480, 3580],
    ["uncovered", 0, -155, -155],
    ["red-threes", 0, 10, 10],
    ["ace-vs-reds", 0, -5, -5],
    ["short-reds", -600, 0, -600],
  ])("reconciles %s to base %i plus net cards %i", (id, base, cards, total) => {
    const scenario = SCORING_SCENARIOS.find((item) => item.id === id)!;
    const final = scoringSequence(scenario).at(-1)!;
    expect(final.base).toBe(base);
    expect(final.cardValue).toBe(cards);
    expect(final.base + final.cardValue).toBe(total);
    const raw = [
      ...scenario.melds.flatMap((meld) => meld.cards),
      ...scenario.reds,
    ].reduce((sum, card) => sum + rawCardValue(card), 0);
    const debt = [...scenario.hand, ...scenario.foot].reduce(
      (sum, card) => sum + debtCardValue(card),
      0,
    );
    expect(final.cardValue).toBe(raw - debt - final.penalizedReds.length * 5);
    expect(final.hand).toHaveLength(0);
    expect(final.melds).toHaveLength(0);
    expect(final.reds).toHaveLength(0);
  });
  it("adds all eleven foot cards before pairing a hand card", () => {
    const scenario = SCORING_SCENARIOS[0],
      beats = scoringSequence(scenario);
    expect(beats[0].hand).toHaveLength(4);
    expect(beats[0].gathered).toBe(false);
    expect(beats[1].kind).toBe("gather");
    expect(beats[1].hand).toHaveLength(15);
    expect(beats[1].transfers).toHaveLength(11);
    expect(beats[2].kind).toBe("pair");
    expect(scoringSnapshot(scenario, beats[1], 0).players[0].footCount).toBe(0);
  });
  it("moves a broken book into the open row before using its first card", () => {
    const beats = scoringSequence(SCORING_SCENARIOS[0]);
    const index = beats.findIndex((beat) => beat.kind === "break");
    const broken = beats[index],
      before = beats[index - 1];
    const original = before.melds.find(
      (pile) => pile.id === broken.activePile,
    )!;
    const moved = broken.melds.find((pile) => pile.id === broken.activePile)!;
    expect(original.complete).toBe(true);
    expect(moved.complete).toBe(false);
    expect(moved.bonusLost).toBe(true);
    expect(moved.cards.map((card) => card.id)).toEqual(
      original.cards.map((card) => card.id),
    );
    expect(beats[index + 1].kind).toBe("pair");
    expect(beats[index + 1].activePile).toBe(moved.id);
    expect(broken.base).toBe(0);
  });
  it("awards red bonuses first and counts the retained red faces at five points later", () => {
    const beats = scoringSequence(
      SCORING_SCENARIOS.find((item) => item.id === "no-debt")!,
    );
    const bonus = beats.findIndex(
      (beat) => beat.kind === "bonus" && beat.activePile === "reds",
    );
    const raw = beats.findIndex(
      (beat) =>
        beat.kind === "count" &&
        beat.transfers.some((move) => move.card.redThree),
    );
    expect(beats[bonus].delta).toBe(1200);
    expect(raw).toBeGreaterThan(bonus);
    expect(
      beats[raw].transfers.filter((move) => move.card.redThree),
    ).toHaveLength(4);
    expect(beats[raw].title).toContain("4 red 3s at 5 each");
  });
  it("returns only unspent values to the table instead of overpaying or leaving a ghost", () => {
    const beats = scoringSequence(SCORING_SCENARIOS[0]);
    const partial = beats.find(
      (beat) =>
        beat.kind === "pair" &&
        beat.transfers.some((move) => move.target === "table"),
    )!;
    expect(partial).toBeTruthy();
    const move = partial.transfers.find((item) => item.target === "table")!;
    expect(partial.pointsLeft[move.card.id]).toBeGreaterThan(0);
    expect(partial.pointsLeft[move.card.id]).toBeLessThan(
      rawCardValue(move.card),
    );
    expect(
      partial.melds
        .flatMap((meld) => meld.cards)
        .some((card) => card.id === move.card.id),
    ).toBe(true);
  });
  it("parks partial hand and table cards, then restores unused table points before counting", () => {
    const scenario = SCORING_SCENARIOS[0];
    const beats = scoringSequence(scenario);
    const handPartial = beats.find((beat) =>
      scoringHeldCards(beat).some((face) =>
        beat.hand.some((handCard) => handCard.id === face.id),
      ),
    )!;
    const heldHand = scoringHeldCards(handPartial)[0];
    expect(
      scoringSnapshot(scenario, handPartial, 0).hand.some(
        (face) => face.id === heldHand.id,
      ),
    ).toBe(false);
    const settled = beats.find((beat) => beat.kind === "settled")!;
    const returned = settled.transfers.find(
      (move) => move.source === "holding" && move.target === "table",
    )!;
    expect(returned).toBeTruthy();
    expect(settled.pointsLeft[returned.card.id]).toBe(20);
    expect(scoringHeldCards(settled)).toHaveLength(0);
    expect(
      scoringSnapshot(scenario, settled, 0)
        .sides[0].melds.flatMap((meld) => meld.cards)
        .some((face) => face.id === returned.card.id),
    ).toBe(true);
    expect(beats.at(-1)!.base + beats.at(-1)!.cardValue).toBe(2985);
  });
  it("returns a never-fully-reconciled hand card before counting it into debt", () => {
    const scenario = SCORING_SCENARIOS.find((item) => item.id === "uncovered")!;
    const beats = scoringSequence(scenario);
    const index = beats.findIndex((beat) => beat.kind === "return");
    expect(index).toBeGreaterThan(0);
    const move = beats[index].transfers[0];
    expect(move.source).toBe("holding");
    expect(move.target).toBe("hand");
    expect(beats[index].pointsLeft[move.card.id]).toBe(35);
    expect(scoringHeldCards(beats[index])).toHaveLength(0);
    expect(
      scoringSnapshot(scenario, beats[index], 0).hand.some(
        (face) => face.id === move.card.id,
      ),
    ).toBe(true);
    expect(beats[index + 1].kind).toBe("uncovered");
    expect(beats[index + 1].transfers[0]).toMatchObject({
      source: "hand",
      target: "debt",
    });
  });
  it("counts reds that were short at round end only as -300 penalties", () => {
    const beats = scoringSequence(
      SCORING_SCENARIOS.find((item) => item.id === "short-reds")!,
    );
    const penalty = beats.find(
      (beat) => beat.kind === "bonus" && beat.activePile === "reds",
    )!;
    expect(penalty.delta).toBe(-600);
    expect(penalty.penalizedReds).toHaveLength(2);
    expect(penalty.reds).toHaveLength(0);
    expect(penalty.transfers).toHaveLength(2);
    expect(penalty.title).toContain("No 5-point raw card value");
    expect(
      beats
        .filter((beat) => beat.kind === "count")
        .flatMap((beat) => beat.transfers)
        .some((move) => move.card.redThree),
    ).toBe(false);
    expect(beats.at(-1)!.cardValue).toBe(0);
    expect(beats.at(-1)!.base).toBe(-600);
  });
  it("keeps qualification after breaking three reds, loses the whole bonus, and counts the remaining reds at five", () => {
    const beats = scoringSequence(
      SCORING_SCENARIOS.find((item) => item.id === "red-threes")!,
    );
    const broken = beats.find(
      (beat) => beat.kind === "break" && beat.activePile === "reds",
    )!;
    expect(broken.redsQualified).toBe(true);
    expect(broken.redsBroken).toBe(true);
    expect(broken.reds).toHaveLength(3);
    const final = beats.at(-1)!;
    expect(final.penalizedReds).toHaveLength(0);
    expect(final.base).toBe(0);
    expect(final.cardValue).toBe(10);
    expect(
      beats.some(
        (beat) =>
          beat.kind === "count" &&
          beat.transfers.filter((move) => move.card.redThree).length === 2 &&
          beat.delta === 10,
      ),
    ).toBe(true);
  });
  it("uses three qualified reds to pay fifteen toward an ace, leaving exactly five points of debt", () => {
    const beats = scoringSequence(
      SCORING_SCENARIOS.find((item) => item.id === "ace-vs-reds")!,
    );
    const final = beats.at(-1)!;
    expect(final.redsQualified).toBe(true);
    expect(final.redsBroken).toBe(true);
    expect(final.reconciled).toBe(15);
    expect(final.uncovered).toBe(5);
    expect(final.penalizedReds).toHaveLength(0);
    expect(final.base).toBe(0);
    expect(final.cardValue).toBe(-5);
  });
  it("forfeits the entire qualified bonus even when three reds remain after payment", () => {
    const original = SCORING_SCENARIOS.find(
      (item) => item.id === "red-threes",
    )!;
    const typical = SCORING_SCENARIOS[0];
    const final = scoringSequence({ ...original, reds: typical.reds }).at(-1)!;
    expect(final.redsQualified).toBe(true);
    expect(final.redsBroken).toBe(true);
    expect(final.base).toBe(0);
    expect(final.cardValue).toBe(15);
    expect(final.penalizedReds).toHaveLength(0);
  });
  it.each(SCORING_SCENARIOS)(
    "conserves every point and immutable snapshot: $id",
    (scenario) => {
      const beats = scoringSequence(scenario);
      const debt = [...scenario.hand, ...scenario.foot].reduce(
        (sum, face) => sum + debtCardValue(face),
        0,
      );
      const raw = [
        ...scenario.melds.flatMap((meld) => meld.cards),
        ...scenario.reds,
      ].reduce((sum, face) => sum + rawCardValue(face), 0);
      for (const beat of beats) {
        expect(beat.remaining + beat.reconciled + beat.uncovered).toBe(debt);
        const left = [
          ...beat.melds.flatMap((meld) => meld.cards),
          ...beat.reds,
        ].reduce(
          (sum, face) => sum + (beat.pointsLeft[face.id] ?? rawCardValue(face)),
          0,
        );
        const counted = beat.lines
          .filter((line) => line.type === "cards" && line.points > 0)
          .reduce((sum, line) => sum + line.points, 0);
        expect(
          left + beat.reconciled + counted + beat.penalizedReds.length * 5,
        ).toBe(raw);
        expect(beat.remaining).toBeGreaterThanOrEqual(0);
      }
      expect(beats[0].melds).toEqual(scenario.melds);
      expect(beats[0].pointsLeft).toEqual({});
    },
  );
});
