import type { Card, Meld, Snapshot } from "../../types";
import { INITIAL_OPENING } from "../../lib/openingSequence";
import { openingSnapshot } from "./opening";
import { SCORING_SCENARIOS, scoringSnapshot } from "./scoring";
import { scoringSequence } from "../../lib/scoringSequence";

const faces = [
  ["A", "hearts"],
  ["A", "spades"],
  ["A", "diamonds"],
  ["K", "hearts"],
  ["K", "clubs"],
  ["Q", "hearts"],
  ["Q", "diamonds"],
  ["J", "clubs"],
  ["J", "spades"],
  ["10", "hearts"],
  ["10", "clubs"],
  ["9", "clubs"],
  ["9", "hearts"],
  ["8", "spades"],
  ["7", "hearts"],
  ["7", "clubs"],
  ["7", "diamonds"],
  ["6", "hearts"],
  ["6", "spades"],
  ["5", "clubs"],
  ["4", "diamonds"],
  ["4", "clubs"],
  ["2", "spades"],
  ["Joker", "joker"],
];

function face(id: string, rank: string, suit: string): Card {
  return {
    id,
    rank,
    suit,
    value:
      rank === "Joker"
        ? 50
        : ["A", "2"].includes(rank)
          ? 20
          : ["4", "5", "6", "7", "8"].includes(rank)
            ? 5
            : 10,
    wild: ["2", "Joker"].includes(rank),
    redThree: false,
  };
}

export function mobileTableFixture(count = 24, partnership = false): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Maya", "Ben", "June", "Sam", "Alex"],
    mode: partnership ? "partnership" : "individual",
    dealer: 5,
    duration: 2200,
  });
  const ranks = ["A", "7", "K", "Q", "J", "10", "9", "8", "6", "4"];
  const hand = Array.from({ length: count }, (_, i) =>
    face(`mobile-hand-${i}`, ...(faces[i % faces.length] as [string, string])),
  );
  return {
    ...base,
    code: "MOBILE-PREVIEW",
    token: `mobile-${count}-${partnership}`,
    phase: "play",
    round: 3,
    opening: {
      id: "mobile-preview",
      ready: base.players.map((p) => p.id),
      complete: true,
    },
    actorId: base.viewerId,
    hand,
    stockCount: 168,
    discardCount: 23,
    discard: face("mobile-discard", "K", "diamonds"),
    message: "Your turn. Build your melds, then discard to finish.",
    players: base.players.map((p, i) => ({
      ...p,
      handCount: i === 0 ? count : 11,
    })),
    sides: base.sides.map((side, team) => {
      const creator = base.players.find((p) => p.team === team)!.id;
      const melds: Meld[] = [...ranks, ...ranks.slice(0, 8)].map((rank, i) => {
        const complete = i >= 10,
          dirty = i % 3 === 2;
        const length = complete ? 7 : [5, 4, 4, 3, 5, 6, 4, 3, 5, 3][i];
        return {
          id: `mobile-${team}-meld-${i}`,
          creator,
          rank,
          kind: "set",
          complete,
          dirty,
          bonus: complete ? (dirty ? 300 : 500) : 0,
          cards: Array.from({ length }, (_, j) =>
            face(
              `mobile-${team}-meld-${i}-card-${j}`,
              dirty && j === 0 ? "2" : rank,
              ["hearts", "spades", "diamonds", "clubs"][j % 4],
            ),
          ),
        };
      });
      return {
        ...side,
        score: [3240, 3010, 2480, 2260, 1940, 1860][team],
        opened: true,
        opening: 90,
        clean: melds.filter((m) => m.complete && !m.dirty).length,
        dirty: melds.filter((m) => m.complete && m.dirty).length,
        melds,
      };
    }),
  };
}

export function countingTableFixture(): Snapshot {
  const scenario = SCORING_SCENARIOS[0];
  const usedPiles = [
    ...scenario.melds.filter((meld) => !meld.complete),
    ...scenario.melds.filter((meld) => meld.complete),
  ].map((meld) => meld.id);
  usedPiles.push("reds:0");
  const beats = scoringSequence(scenario, {
    pileIds: usedPiles,
    complete: true,
    qualified: true,
  });
  const total = beats.at(-1)!;
  return {
    ...scoringSnapshot(scenario, beats[0], 0),
    scoringFoot: scenario.foot,
    scoring: {
      team: 0,
      debt: beats[0].remaining,
      remaining: 0,
      canceled: [],
      usedPiles,
      broken: total.broken,
      confirmed: false,
      revision: 0,
      reason: scenario.reason,
      confirmedSides: [],
      debtBreakdown: [],
      redThreeQualified: true,
      options: [],
      score: {
        team: 0,
        cards: total.cardValue,
        debt: beats[0].remaining,
        redThrees: scenario.reds.length * 300,
        redCredit: 0,
        books: scenario.melds
          .filter((meld) => meld.complete && !total.broken.includes(meld.id))
          .reduce((sum, meld) => sum + meld.bonus, 0),
        goingOut: scenario.goingOut,
        total: total.base + total.cardValue,
        canceled: [],
        lostBooks: total.broken.length,
        broken: total.broken,
        uncovered: total.uncovered,
      },
    },
  };
}
