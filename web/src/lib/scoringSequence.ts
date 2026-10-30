import type { Card, Meld, Snapshot } from "../types";
import { INITIAL_OPENING, openingSnapshot } from "./openingSequence";

export type ScoringScenario = {
  id: string;
  label: string;
  reason: string;
  hand: Card[];
  foot: Card[];
  melds: Meld[];
  reds: Card[];
  goingOut: number;
};
export type ScoreTransfer = {
  card: Card;
  source: "hand" | "table" | "foot" | "holding";
  target: "hand" | "table" | "reconciled" | "debt" | "count";
  paired?: boolean;
};
export type ScoreBeat = {
  kind:
    | "ready"
    | "wait"
    | "gather"
    | "pair"
    | "break"
    | "uncovered"
    | "return"
    | "settled"
    | "bonus"
    | "base"
    | "count"
    | "total";
  title: string;
  duration: number;
  hand: Card[];
  melds: Meld[];
  reds: Card[];
  gathered: boolean;
  penalizedReds: Card[];
  redsQualified: boolean;
  redsBroken: boolean;
  pointsLeft: Record<string, number>;
  remaining: number;
  reconciled: number;
  uncovered: number;
  reconciledCards: number;
  debtCards: number;
  base: number;
  cardValue: number;
  broken: string[];
  lines: { label: string; points: number; type: "base" | "cards" }[];
  transfers: ScoreTransfer[];
  activePile?: string;
  delta?: number;
};
const suits = ["hearts", "clubs", "diamonds", "spades"];
export const rawCardValue = (card: Card) => (card.redThree ? 5 : card.value);
export const debtCardValue = (card: Card) => Math.abs(card.value);

/** Partially spent cards stay beside the settlement pile until resolution. */
export function scoringHeldCards(beat: ScoreBeat): Card[] {
  if (!["pair", "break", "uncovered", "wait"].includes(beat.kind)) return [];
  return [
    ...beat.hand.filter(
      (face) =>
        beat.pointsLeft[face.id] > 0 &&
        beat.pointsLeft[face.id] < debtCardValue(face),
    ),
    ...[...beat.melds.flatMap((meld) => meld.cards), ...beat.reds].filter(
      (face) =>
        beat.pointsLeft[face.id] > 0 &&
        beat.pointsLeft[face.id] < rawCardValue(face),
    ),
  ];
}
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
    label: "Two reds · 10 card points − 600 penalty = −590",
    reason:
      "Two played red threes are worth 10 card points and a separate −600 penalty.",
    hand: [],
    foot: [],
    melds: [],
    reds: reds.slice(0, 2),
    goingOut: 0,
  },
];

/** A supplied settlement follows accepted server pile order and card order exactly. */
export function scoringSequence(
  scenario: ScoringScenario,
  settlement?: {
    pileIds: string[];
    complete: boolean;
    qualified?: boolean;
  },
): ScoreBeat[] {
  const debt = [...scenario.hand, ...scenario.foot].reduce(
    (sum, face) => sum + debtCardValue(face),
    0,
  );
  let state: ScoreBeat = {
    kind: "ready",
    title: scenario.reason,
    duration: 1200,
    hand: [...scenario.hand],
    melds: scenario.melds.map((meld) => ({ ...meld, cards: [...meld.cards] })),
    reds: [...scenario.reds],
    gathered: !scenario.foot.length,
    penalizedReds: [],
    redsQualified: settlement?.qualified ?? scenario.reds.length >= 3,
    redsBroken: false,
    pointsLeft: {},
    remaining: debt,
    reconciled: 0,
    uncovered: 0,
    reconciledCards: 0,
    debtCards: 0,
    base: 0,
    cardValue: 0,
    broken: [],
    lines: [],
    transfers: [],
  };
  const beats: ScoreBeat[] = [state];
  const add = (change: Partial<ScoreBeat>) => {
    state = {
      ...state,
      transfers: [],
      activePile: undefined,
      delta: undefined,
      duration: 850,
      ...change,
    };
    beats.push(state);
  };
  const handValue = (face: Card) =>
    state.pointsLeft[face.id] ?? debtCardValue(face);
  const tableValue = (face: Card) =>
    state.pointsLeft[face.id] ?? rawCardValue(face);
  const removeTable = (ids: Set<string>, melds = state.melds) =>
    melds
      .map((meld) => ({
        ...meld,
        cards: meld.cards.filter((face) => !ids.has(face.id)),
      }))
      .filter((meld) => meld.cards.length);
  const automaticBonusPile = () => {
    const choices = state.melds
      .filter((meld) => meld.complete)
      .map((meld) => ({
        id: meld.id,
        points: meld.cards.reduce((sum, face) => sum + tableValue(face), 0),
        bonus: meld.bonus,
      }));
    if (state.reds.length)
      choices.push({
        id: "reds",
        points: state.reds.length * 5,
        bonus: state.redsQualified ? scenario.reds.length * 300 : 0,
      });
    const target = Math.min(
      state.remaining,
      choices.reduce((sum, choice) => sum + choice.points, 0),
    );
    const plans = new Map<number, { cost: number; ids: string[] }>([
      [0, { cost: 0, ids: [] }],
    ]);
    for (const choice of choices)
      for (const [covered, plan] of [...plans]) {
        const next = Math.min(target, covered + choice.points);
        const candidate = {
          cost: plan.cost + choice.bonus,
          ids: [...plan.ids, choice.id],
        };
        const previous = plans.get(next);
        if (
          !previous ||
          candidate.cost < previous.cost ||
          (candidate.cost === previous.cost &&
            candidate.ids.length < previous.ids.length)
        )
          plans.set(next, candidate);
      }
    return plans.get(target)?.ids[0];
  };
  if (scenario.foot.length)
    add({
      kind: "gather",
      title: `Bring all ${scenario.foot.length} foot cards into your hand.`,
      duration: 1800,
      hand: [...scenario.hand, ...scenario.foot],
      gathered: true,
      transfers: scenario.foot.map((face) => ({
        card: face,
        source: "foot",
        target: "hand",
      })),
    });
  for (const handCard of [...state.hand]) {
    while (state.hand.some((face) => face.id === handCard.id)) {
      const needed = handValue(handCard);
      const acceptedPile = settlement?.pileIds.find((id) =>
        id.startsWith("reds:")
          ? state.reds.length > 0
          : state.melds.some((meld) => meld.id === id && meld.cards.length > 0),
      );
      const acceptedBook = state.melds.find((meld) => meld.id === acceptedPile);
      let available = state.melds
        .filter((meld) => !meld.complete)
        .flatMap((meld) => meld.cards.map((face) => ({ face, pile: meld.id })));
      if (settlement)
        available =
          acceptedBook && !acceptedBook.complete
            ? acceptedBook.cards.map((face) => ({
                face,
                pile: acceptedBook.id,
              }))
            : [];
      else if ((!state.redsQualified || state.redsBroken) && state.reds.length)
        available = state.reds.map((face) => ({ face, pile: "reds" }));
      if (!available.length) {
        const automaticPile = settlement ? undefined : automaticBonusPile();
        const book = settlement
          ? acceptedBook?.complete
            ? acceptedBook
            : undefined
          : state.melds.find((meld) => meld.id === automaticPile);
        if (book) {
          add({
            kind: "break",
            title: `${book.rank}’s book opens for reconciliation.`,
            duration: 1400,
            activePile: book.id,
            broken: [...state.broken, book.id],
            melds: state.melds.map((meld) =>
              meld.id === book.id
                ? { ...meld, complete: false, bonusLost: true }
                : meld,
            ),
            transfers: book.cards.map((face) => ({
              card: face,
              source: "table",
              target: "table",
            })),
          });
          available = book.cards.map((face) => ({ face, pile: book.id }));
        }
      }
      if (
        !available.length &&
        (!settlement || acceptedPile?.startsWith("reds:"))
      )
        available = state.reds.map((face) => ({ face, pile: "reds" }));
      if (!available.length) {
        if (settlement && !settlement.complete) {
          add({
            kind: "wait",
            title: "Settling your remaining cards automatically.",
            duration: 0,
          });
          return beats;
        }
        if (
          state.pointsLeft[handCard.id] > 0 &&
          needed < debtCardValue(handCard)
        )
          add({
            kind: "return",
            title: `${needed} points remain on your ${handCard.rank}. Return it to your hand before counting the debt.`,
            duration: 900,
            transfers: [{ card: handCard, source: "holding", target: "hand" }],
          });
        add({
          kind: "uncovered",
          title: `${needed} points cannot be covered. Move this card to debt.`,
          duration: 900,
          hand: state.hand.filter((face) => face.id !== handCard.id),
          remaining: state.remaining - needed,
          uncovered: state.uncovered + needed,
          debtCards: state.debtCards + 1,
          transfers: [{ card: handCard, source: "hand", target: "debt" }],
        });
        continue;
      }
      available.sort(
        settlement
          ? (a, b) =>
              tableValue(a.face) - tableValue(b.face) ||
              a.face.id.localeCompare(b.face.id)
          : (a, b) =>
              Math.abs(tableValue(a.face) - needed) -
                Math.abs(tableValue(b.face) - needed) ||
              a.face.id.localeCompare(b.face.id),
      );
      const { face: tableCard, pile: pileId } = available[0];
      if (pileId === "reds" && state.redsQualified && !state.redsBroken)
        add({
          kind: "break",
          title: "Red threes open for reconciliation. Each is worth 5 points.",
          duration: 1600,
          activePile: "reds",
          redsBroken: true,
          transfers: state.reds.map((face) => ({
            card: face,
            source: "table",
            target: "table",
          })),
        });
      const availablePoints = tableValue(tableCard);
      const payment = Math.min(needed, availablePoints);
      const handRemainder = needed - payment;
      const tableRemainder = availablePoints - payment;
      const used = new Set(tableRemainder ? [] : [tableCard.id]);
      add({
        kind: "pair",
        title: `${payment} points reconciled${handRemainder ? ` · ${handRemainder} left on your ${handCard.rank}` : ""}.`,
        duration: 820,
        activePile: pileId,
        delta: payment,
        remaining: state.remaining - payment,
        reconciled: state.reconciled + payment,
        reconciledCards:
          state.reconciledCards +
          Number(!handRemainder) +
          Number(!tableRemainder),
        hand: handRemainder
          ? [...state.hand]
          : state.hand.filter((face) => face.id !== handCard.id),
        melds: removeTable(used),
        reds: state.reds.filter((face) => !used.has(face.id)),
        pointsLeft: {
          ...state.pointsLeft,
          [handCard.id]: handRemainder,
          [tableCard.id]: tableRemainder,
        },
        transfers: [
          {
            card: handCard,
            source: "hand",
            target: handRemainder ? "hand" : "reconciled",
            paired: true,
          },
          {
            card: tableCard,
            source: "table",
            target: tableRemainder ? "table" : "reconciled",
            paired: true,
          },
        ],
      });
    }
  }
  add({
    kind: "settled",
    title: state.uncovered
      ? `Hand settled. ${state.uncovered} points remain in debt.`
      : "Debt reconciled. Count books first, then the remaining cards.",
    duration: 1300,
    transfers: scoringHeldCards(state).map((face) => ({
      card: face,
      source: "holding",
      target: state.hand.some((handCard) => handCard.id === face.id)
        ? "hand"
        : "table",
    })),
  });
  for (const book of state.melds.filter((meld) => meld.complete))
    add({
      kind: "bonus",
      title: `${book.rank}’s ${book.dirty ? "dirty" : "clean"} book · +${book.bonus}.`,
      activePile: book.id,
      base: state.base + book.bonus,
      delta: book.bonus,
      lines: [
        ...state.lines,
        { label: `${book.rank}’s book`, points: book.bonus, type: "base" },
      ],
    });
  if (state.reds.length) {
    const redBonus = state.redsQualified
      ? state.redsBroken
        ? 0
        : scenario.reds.length * 300
      : -state.reds.length * 300;
    add({
      kind: "bonus",
      title:
        redBonus === 0
          ? `${state.reds.length} qualified reds remain · no bonus or penalty. Count 5 points each next.`
          : `${state.reds.length} red 3s · ${redBonus < 0 ? "−" : "+"}${Math.abs(redBonus)} ${redBonus < 0 ? "penalty" : "bonus"}. Count 5 card points each next.`,
      duration: 1500,
      activePile: "reds",
      base: state.base + redBonus,
      delta: redBonus,
      penalizedReds: redBonus < 0 ? [...state.reds] : [],
      lines: [
        ...state.lines,
        {
          label: `${state.reds.length} red 3s${state.redsBroken ? " · bonus forfeited" : ""}`,
          points: redBonus,
          type: "base",
        },
      ],
    });
  }
  if (scenario.goingOut)
    add({
      kind: "bonus",
      title: "Going out first · +100.",
      base: state.base + scenario.goingOut,
      delta: scenario.goingOut,
      lines: [
        ...state.lines,
        { label: "Going out first", points: scenario.goingOut, type: "base" },
      ],
    });
  add({
    kind: "base",
    title: `Base ${state.base.toLocaleString()}. Now count the card values.`,
    duration: 1300,
  });
  if (state.uncovered)
    add({
      kind: "count",
      title: `Carry forward the ${state.uncovered}-point debt deduction.`,
      delta: -state.uncovered,
      cardValue: -state.uncovered,
      lines: [
        ...state.lines,
        { label: "Uncovered debt", points: -state.uncovered, type: "cards" },
      ],
    });
  const remainingCards = [
    ...state.melds.flatMap((meld) => meld.cards),
    ...state.reds,
  ];
  const groups = [50, 20, 10, 5]
    .map((value) => ({
      value,
      cards: remainingCards.filter((face) => tableValue(face) === value),
    }))
    .filter((group) => group.cards.length);
  const standard = new Set(
    groups.flatMap((group) => group.cards.map((face) => face.id)),
  );
  for (const face of remainingCards.filter((face) => !standard.has(face.id)))
    groups.push({ value: tableValue(face), cards: [face] });
  for (const group of groups) {
    const points = group.value * group.cards.length;
    const ids = new Set(group.cards.map((face) => face.id));
    const redCount = group.cards.filter((face) => face.redThree).length;
    add({
      kind: "count",
      title: `${group.cards.length} ${group.cards.length === 1 ? "card" : "cards"} × ${group.value} · +${points}${redCount ? ` (including ${redCount} red 3s at 5 each)` : ""}.`,
      duration: Math.max(1500, 850 + group.cards.length * 45),
      delta: points,
      cardValue: state.cardValue + points,
      melds: removeTable(ids),
      reds: state.reds.filter((face) => !ids.has(face.id)),
      transfers: group.cards.map((face) => ({
        card: face,
        source: "table",
        target: "count",
      })),
      lines: [
        ...state.lines,
        {
          label: `${group.cards.length} × ${group.value}${redCount ? ` · includes ${redCount} red 3s` : ""}`,
          points,
          type: "cards",
        },
      ],
    });
  }
  add({
    kind: "total",
    title: `${state.base.toLocaleString()} base ${state.cardValue < 0 ? "−" : "+"} ${Math.abs(state.cardValue).toLocaleString()} cards = ${(state.base + state.cardValue).toLocaleString()}.`,
    duration: 0,
  });
  return beats;
}

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
