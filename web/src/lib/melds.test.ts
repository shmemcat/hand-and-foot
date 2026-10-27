import { expect, it } from "vitest";
import type { Card } from "../types";
import { detectMeldKind, isValidMeld } from "./melds";

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
