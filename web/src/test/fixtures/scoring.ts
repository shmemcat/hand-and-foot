import type { Card, Meld, Snapshot } from "../../types";
import { INITIAL_OPENING } from "../../lib/openingSequence";
import { openingSnapshot } from "./opening";
import {
  scoringHeldCards,
  type ScoringScenario,
  type ScoreBeat,
} from "../../lib/scoringSequence";

const suits = ["hearts", "clubs", "diamonds", "spades"];

function card(id: string, rank: string, suit = "clubs"): Card {
  return {
    id,
    rank,
    suit,
    value:
      rank === "Joker"
        ? 50
        : rank === "3"
          ? ["hearts", "diamonds"].includes(suit)
            ? -300
            : -100
          : ["A", "2"].includes(rank)
            ? 20
            : ["4", "5", "6", "7", "8"].includes(rank)
              ? 5
              : 10,
    wild: ["2", "Joker"].includes(rank),
    redThree: rank === "3" && ["hearts", "diamonds"].includes(suit),
  };
}

function pile(
  id: string,
  rank: string,
  count: number,
  wilds: string[] = [],
): Meld {
  const cards = [
    ...Array.from({ length: count }, (_, i) =>
      card(`${id}-${i}`, rank, suits[i % 4]),
    ),
    ...wilds.map((rank, i) =>
      card(`${id}-wild-${i}`, rank, rank === "Joker" ? "joker" : suits[i % 4]),
    ),
  ];
  return {
    id,
    rank,
    creator: "opening-seat-0",
    kind: "set",
    cards,
    complete: cards.length >= 7,
    dirty: wilds.length > 0,
    bonus: cards.length < 7 ? 0 : wilds.length ? 300 : 500,
  };
}

const reds = Array.from({ length: 4 }, (_, i) =>
  card(`red-${i}`, "3", i % 2 ? "diamonds" : "hearts"),
);

const typicalMelds = [
  pile("kings", "K", 7),
  pile("queens", "Q", 4, ["2", "2", "Joker"]),
  pile("sevens", "7", 7),
  pile("aces", "A", 7),
  pile("tens", "10", 3),
  pile("fives", "5", 3),
  pile("nines", "9", 4),
];

const hand = [
  card("hand-K", "K", "hearts"),
  card("hand-9", "9"),
  card("hand-4", "4", "diamonds"),
  card("hand-A", "A", "spades"),
];

const foot = ["Joker", "2", "A", "K", "Q", "J", "9", "8", "7", "6", "4"].map(
  (rank, i) =>
    card(`foot-${i}`, rank, rank === "Joker" ? "joker" : suits[i % 4]),
);

export const SCORING_SCENARIOS: ScoringScenario[] = [
  {
    id: "break-book",
    label: "Unplayed foot · settle & break a book",
    reason: "Poppy went out. Settle your hand and unplayed foot.",
    hand,
    foot,
    melds: typicalMelds,
    reds,
    goingOut: 0,
  },
  {
    id: "in-foot",
    label: "Already in your foot · settle the hand",
    reason: "Poppy went out. Settle the cards left in your hand.",
    hand: [...hand, ...foot.slice(0, 3)],
    foot: [],
    melds: typicalMelds,
    reds,
    goingOut: 0,
  },
  {
    id: "no-debt",
    label: "You went out · count the whole board",
    reason: "You went out. Count your books, then your cards.",
    hand: [],
    foot: [],
    melds: typicalMelds,
    reds,
    goingOut: 100,
  },
  {
    id: "uncovered",
    label: "Not enough table cards · uncovered debt",
    reason: "The stack ran out. Settle your remaining cards.",
    hand: [
      card("debt-joker", "Joker", "joker"),
      card("debt-A", "A"),
      card("debt-3", "3", "clubs"),
    ],
    foot: [],
    melds: [pile("short-fives", "5", 3)],
    reds: [],
    goingOut: 0,
  },
  {
    id: "red-threes",
    label: "Break qualified reds · no penalty",
    reason:
      "Three reds qualified at round end. Use one for the last five points of debt.",
    hand: [card("red-debt", "A")],
    foot: [],
    melds: [pile("short-fives", "5", 3)],
    reds: reds.slice(0, 3),
    goingOut: 0,
  },
  {
    id: "ace-vs-reds",
    label: "Ace vs three reds · −5 round",
    reason: "Your ace costs 20. Three qualified red threes cover 15.",
    hand: [card("ace-debt", "A")],
    foot: [],
    melds: [],
    reds: reds.slice(0, 3),
    goingOut: 0,
  },
  {
    id: "short-reds",
    label: "Two committed reds · 600 debt, no card points",
    reason:
      "Only two reds were committed. They add 600 debt and earn no card points.",
    hand: [],
    foot: [],
    melds: [],
    reds: reds.slice(0, 2),
    goingOut: 0,
  },
  {
    id: "short-reds-debt",
    label: "Two committed reds · break four books to cover debt",
    reason:
      "Two committed reds add 600 debt to the 30 left in hand. All four books must break.",
    hand: ["6", "J", "J", "4"].map((rank, i) =>
      card(`short-red-debt-${i}`, rank, suits[i]),
    ),
    foot: [],
    melds: [
      pile("short-red-aces", "A", 6, ["Joker"]),
      pile("short-red-kings", "K", 4, ["2", "2", "2"]),
      pile("short-red-queens", "Q", 6, ["Joker"]),
      pile("short-red-nines", "9", 7),
      pile("short-red-tens", "10", 3),
      pile("short-red-eights", "8", 3),
    ],
    reds: reds.slice(0, 2),
    goingOut: 0,
  },
];

export function scoringSnapshot(
  scenario: ScoringScenario,
  beat: ScoreBeat,
  replay: number,
): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
    mode: "individual",
    dealer: 3,
    duration: 2200,
  });
  const held = new Set(scoringHeldCards(beat).map((face) => face.id));
  const hand = beat.hand.filter((face) => !held.has(face.id));
  const melds = beat.melds
    .map((meld) => ({
      ...meld,
      cards: meld.cards.filter((face) => !held.has(face.id)),
    }))
    .filter((meld) => meld.cards.length);
  return {
    ...base,
    code: "SCORE-REHEARSAL",
    token: `score-${scenario.id}-${replay}`,
    revision: replay,
    round: 4,
    phase: "scoring",
    scoring: null,
    actorId: null,
    message: beat.title,
    opening: { id: "score-rehearsal", ready: [base.viewerId], complete: true },
    hand,
    footTop: beat.gathered ? null : (scenario.foot[0] ?? null),
    discardFaceDown: scenario.id !== "uncovered",
    stockCount: scenario.id === "uncovered" ? 0 : 89,
    discardCount: 42,
    players: base.players.map((player, i) => ({
      ...player,
      handCount: i === 0 ? hand.length : i === 1 ? 0 : 3 + i,
      footCount: i === 0 && !beat.gathered ? scenario.foot.length : 0,
      inFoot: i === 0 ? beat.gathered : true,
      redThrees: i === 0 ? beat.reds : [],
    })),
    sides: base.sides.map((side, i) => ({
      ...side,
      score: [2850, 3260, 1940, 2675, 2180, 3020][i],
      opened: true,
      melds: i === 0 ? melds : [],
      clean:
        i === 0
          ? beat.melds.filter((meld) => meld.complete && !meld.dirty).length
          : 1,
      dirty:
        i === 0
          ? beat.melds.filter((meld) => meld.complete && meld.dirty).length
          : 1,
    })),
  };
}
