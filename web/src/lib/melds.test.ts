import { expect, it } from "vitest";
import type { Card, Meld } from "../types";
import {
  canExtendMeld,
  detectMeldKind,
  isValidMeld,
  pickupPlayableCards,
} from "./melds";

function cards(...ranks: string[]): Card[] {
  return ranks.map((rank, index) => ({
    id: `${index}:hearts:${rank}`,
    rank,
    suit: "hearts",
    value: 5,
    wild: rank === "2" || rank === "Joker",
    redThree: rank === "3",
  }));
}

it.each([
  ["natural matching pile", ["8", "8", "8"], "set"],
  ["seven-card matching book", Array(7).fill("8"), "set"],
  ["matching book longer than seven", Array(12).fill("8"), "set"],
  ["initial dirty meld with two naturals", ["8", "8", "2"], "set"],
  ["initial dirty meld with a Joker", ["8", "8", "Joker"], "set"],
  ["dirty pile with three naturals", ["8", "8", "8", "2", "Joker"], "set"],
  ["dirty pile with four naturals", ["8", "8", "8", "8", "2"], "set"],
  ["dirty pile with a Joker", ["8", "8", "8", "8", "Joker"], "set"],
  [
    "dirty book with a natural majority",
    ["8", "8", "8", "8", "2", "2", "Joker"],
    "set",
  ],
  ["natural pile of twos", ["2", "2", "2"], "set"],
  ["clean book of twos", Array(7).fill("2"), "set"],
  ["twos with a Joker", ["2", "2", "Joker"], "set"],
  [
    "dirty book of twos",
    ["2", "2", "2", "2", "Joker", "Joker", "Joker"],
    "set",
  ],
  ["straight flush in selection order", ["5", "6", "7"], "run"],
  ["straight flush in any selection order", ["7", "5", "6"], "run"],
  ["ace-high straight flush", ["Q", "K", "A"], "run"],
  [
    "straight flush longer than seven",
    ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"],
    "run",
  ],
] as const)("detects a %s", (_, ranks, kind) => {
  expect(detectMeldKind(cards(...ranks))).toBe(kind);
});

it.each([
  ["no cards", []],
  ["a pair", ["8", "8"]],
  ["mixed ranks", ["8", "8", "Q"]],
  ["Joker-only pile", ["Joker", "Joker", "Joker"]],
  ["more wilds than naturals", ["8", "2", "Joker"]],
  ["equal naturals and wilds in an initial meld", ["8", "8", "2", "Joker"]],
  [
    "equal naturals and wilds in a larger pile",
    ["8", "8", "8", "2", "2", "Joker"],
  ],
  ["equal twos and Jokers", ["2", "2", "Joker", "Joker"]],
  ["more Jokers than twos", ["2", "Joker", "Joker"]],
  ["twos remain wild with an ordinary rank", ["8", "2", "2"]],
  ["threes", ["3", "3", "3"]],
  ["gaps in a straight flush", ["5", "7", "8"]],
  ["duplicate run ranks from separate decks", ["5", "6", "6", "7"]],
  ["wild in a straight flush", ["5", "2", "7"]],
  ["threes in a straight flush", ["3", "4", "5"]],
  ["ace wrapping to four", ["Q", "K", "A", "4"]],
] as const)("rejects %s", (_, ranks) => {
  expect(detectMeldKind(cards(...ranks))).toBeNull();
});

it("rejects mixed suits in a run and duplicate physical cards", () => {
  const mixed = cards("5", "6", "7");
  mixed[1].suit = "clubs";
  expect(detectMeldKind(mixed)).toBeNull();
  const repeated = cards("8")[0];
  expect(detectMeldKind([repeated, repeated, repeated])).toBeNull();
});

it("preserves the type when adding cards to an existing pile", () => {
  expect(isValidMeld(cards("5", "6", "7", "8"), "set")).toBe(false);
  expect(isValidMeld(cards("8", "8", "8", "8"), "run")).toBe(false);
});

function pickupPile(ranks: string[]): Meld {
  return {
    id: "target",
    creator: "you",
    kind: "set",
    rank: ranks[0],
    cards: cards(...ranks),
    complete: ranks.length >= 7,
    dirty: ranks.includes("Joker"),
    bonus: 0,
  };
}
const discard: Card = {
  id: "discard",
  rank: "8",
  suit: "hearts",
  value: 5,
  wild: false,
  redThree: false,
};

it("allows matching naturals and usable wilds while excluding unrelated cards and threes", () => {
  const hand = cards("8", "8", "Joker", "2", "K", "3");
  expect([...pickupPlayableCards(hand, discard, [])]).toEqual(
    hand.slice(0, 4).map((card) => card.id),
  );
});

it("does not substitute a wild for either of the two matching hand cards required for a new pile", () => {
  expect([
    ...pickupPlayableCards(cards("8", "Joker", "2"), discard, []),
  ]).toEqual([]);
});

it("finds straight-flush completions, excludes gaps, wrong suits and duplicate ranks, and follows the selection", () => {
  const hand = cards("6", "7", "9", "10", "Q", "8", "7");
  hand[6].suit = "clubs";
  const options = pickupPlayableCards(hand, discard, [], [hand[1].id]);
  expect([...options]).toEqual(hand.slice(0, 4).map((card) => card.id));
  expect([...pickupPlayableCards(cards("6", "9", "J"), discard, [])]).toEqual(
    [],
  );
});

it("lets hand cards join a legal existing pickup but excludes six-card targets", () => {
  const hand = cards("8", "Joker", "Q").map((card) => ({
    ...card,
    id: `hand-${card.id}`,
  }));
  expect([
    ...pickupPlayableCards(hand, discard, [pickupPile(["8", "8", "8"])]),
  ]).toEqual(hand.slice(0, 2).map((card) => card.id));
  expect([
    ...pickupPlayableCards(hand, discard, [pickupPile(Array(6).fill("8"))]),
  ]).toEqual([]);
});

it("keeps a natural majority when suggesting additional wild cards", () => {
  const hand = cards("Joker", "Joker").map((card) => ({
    ...card,
    id: `hand-${card.id}`,
  }));
  const target = pickupPile(["8", "8", "Joker"]);
  expect([...pickupPlayableCards(hand, discard, [target])]).toEqual(
    hand.map((card) => card.id),
  );
  expect([
    ...pickupPlayableCards(hand, discard, [target], [hand[0].id]),
  ]).toEqual([hand[0].id]);
});

it.each(["8", "2"])(
  "preserves a completed clean book of %s while allowing natural additions",
  (rank) => {
    const target = pickupPile(Array(7).fill(rank));
    const [natural, joker] = cards(rank, "Joker").map((card) => ({
      ...card,
      id: `hand-${card.id}`,
    }));
    expect(canExtendMeld(target, [natural])).toBe(true);
    expect(canExtendMeld(target, [joker])).toBe(false);
    expect(canExtendMeld(target, [natural, joker])).toBe(false);
  },
);

it("allows a wild to close an open clean pile, and only extends a dirty book with a natural majority", () => {
  const [wild] = cards("Joker").map((card) => ({
    ...card,
    id: `hand-${card.id}`,
  }));
  expect(canExtendMeld(pickupPile(Array(6).fill("8")), [wild])).toBe(true);
  expect(
    canExtendMeld(pickupPile(["8", "8", "8", "8", "8", "Joker", "Joker"]), [
      wild,
    ]),
  ).toBe(true);
  expect(
    canExtendMeld(pickupPile(["8", "8", "8", "8", "Joker", "Joker", "Joker"]), [
      wild,
    ]),
  ).toBe(false);
});

it("only suggests naturals for pickup onto a completed clean book without blocking a separate dirty pile", () => {
  const hand = cards("8", "Joker").map((card) => ({
    ...card,
    id: `hand-${card.id}`,
  }));
  const clean = pickupPile(Array(7).fill("8"));
  expect([...pickupPlayableCards(hand, discard, [clean])]).toEqual([
    hand[0].id,
  ]);
  expect([
    ...pickupPlayableCards(hand, discard, [clean], [hand[1].id]),
  ]).toEqual([]);
  const extraNatural = { ...hand[0], id: "second-natural" };
  expect(
    pickupPlayableCards([...hand, extraNatural], discard, [clean]).has(
      hand[1].id,
    ),
  ).toBe(true);
});

it("rejects pickup guidance for a three or a wild discard", () => {
  expect(
    pickupPlayableCards(cards("8", "8"), { ...discard, rank: "3" }, []).size,
  ).toBe(0);
  expect(
    pickupPlayableCards(cards("8", "8"), { ...discard, wild: true }, []).size,
  ).toBe(0);
});
