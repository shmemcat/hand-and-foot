import type { Meld, RoundResult, Score, Snapshot } from "../types";
import { turnMotionExample } from "./turnMotionExamples";

/** A local record with real card artwork, exact score arithmetic, and no game writes. */
export function roundRecordExample(): Snapshot {
  const base = turnMotionExample("hand", "meld", false);
  const totals = base.sides.map(() => 0);
  const history: RoundResult[] = [1, 2, 3].map((round) => {
    const boards = base.sides.map((side) => {
      const source = base.sides[side.id % 2];
      const melds: Meld[] = source.melds.map((meld) => ({
        ...meld,
        id: `${round}:${side.id}:${meld.id}`,
        creator: base.players[side.id].id,
        cards: meld.cards.map((card) => ({
          ...card,
          id: `${round}:${side.id}:${card.id}`,
        })),
      }));
      const redThrees =
        side.id === 0 && round >= 2
          ? [0, 1, 2].map((i) => ({
              id: `${round}:red-${i}`,
              rank: "3",
              suit: i % 2 ? "diamonds" : "hearts",
              value: -300,
              wild: false,
              redThree: true,
            }))
          : [];
      return {
        team: side.id,
        name: side.name,
        melds,
        redThrees,
        redThreesQualified: redThrees.length >= 3,
        redThreesBroken: false,
      };
    });
    const scores: Score[] = boards.map((board) => {
      const loss = round === 3 && board.team === 2;
      const breakDirty = round === 2 && board.team === 1;
      const rawCards = board.melds.flatMap((meld) => meld.cards);
      const cards =
        rawCards.reduce((sum, card) => sum + card.value, 0) +
        board.redThrees.length * 5;
      const wentOut = board.team === round;
      const debt = loss
        ? cards + 140
        : wentOut || board.team === 0
          ? 0
          : breakDirty
            ? 20
            : 10 + board.team * 5;
      const broken = board.melds
        .filter((meld) => meld.complete && (loss || (breakDirty && meld.dirty)))
        .map((meld) => meld.id);
      const books = board.melds
        .filter((meld) => !broken.includes(meld.id))
        .reduce((sum, meld) => sum + meld.bonus, 0);
      const redThrees = board.redThrees.length * 300;
      const goingOut = wentOut ? 100 : 0;
      const canceled: string[] = [];
      let remaining = debt;
      for (const meld of board.melds.filter(
        (meld) => !meld.complete || broken.includes(meld.id),
      )) {
        for (const card of meld.cards) {
          if (remaining <= 0) break;
          remaining -= Math.min(remaining, card.value);
          canceled.push(card.id);
        }
      }
      for (const meld of board.melds)
        if (broken.includes(meld.id)) {
          meld.complete = false;
          meld.bonusLost = true;
        }
      const total = cards - debt + books + redThrees + goingOut;
      totals[board.team] += total;
      return {
        team: board.team,
        cards,
        debt,
        redThrees,
        redCredit: 0,
        books,
        goingOut,
        total,
        canceled,
        broken,
        lostBooks: broken.length,
        uncovered: remaining,
      };
    });
    return {
      round,
      reason: `${base.players[round].name} went out.`,
      scores,
    };
  });
  return {
    ...base,
    code: "ROUND-RECORD-PREVIEW",
    round: 4,
    history,
    sides: base.sides.map((side) => ({ ...side, score: totals[side.id] })),
  };
}
