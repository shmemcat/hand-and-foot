import { expect, it } from "vitest";
import type { Card, Meld } from "../types";
import { CLEAN_BOOK_NATURALS_ONLY } from "./melds";
import {
  goingOutRequirement,
  hasGoingOutBooks,
  KEEP_AFTER_DISCARD,
  KEEP_FINAL_DISCARD,
} from "./goingOut";

const card = (id: string, rank = "8"): Card => ({
  id,
  rank,
  suit: "clubs",
  value: 10,
  wild: rank === "2" || rank === "Joker",
  redThree: false,
});
const pile = (
  id: string,
  ranks: string[],
  kind: Meld["kind"] = "set",
): Meld => ({
  id,
  creator: "you",
  kind,
  rank: ranks[0],
  cards: ranks.map((rank, i) => card(`${id}-${i}`, rank)),
  complete: ranks.length >= 7,
  dirty: ranks.includes("Joker"),
  bonus: 0,
});
const clean = pile("clean", Array(7).fill("K"));
const dirty = pile("dirty", ["Q", "Q", "Q", "Q", "Joker", "Joker", "Joker"]);

it("reserves the final discard and keeps an extra card until both books exist", () => {
  const hand = [card("a"), card("b"), card("c"), card("keep", "4")];
  const draft = [{ cardIds: ["a", "b", "c"], kind: "set" as const }];
  expect(goingOutRequirement(true, hand, [clean], draft)).toBe(
    KEEP_AFTER_DISCARD,
  );
  expect(goingOutRequirement(true, hand, [clean, dirty], draft)).toBeNull();
  expect(
    goingOutRequirement(
      true,
      hand,
      [clean, dirty],
      [{ cardIds: hand.map((card) => card.id) }],
    ),
  ).toBe(KEEP_FINAL_DISCARD);
  expect(goingOutRequirement(false, hand, [], draft)).toBeNull();
  expect(
    goingOutRequirement(true, [...hand, card("spare", "5")], [], draft),
  ).toBeNull();
});

it("counts the dirty book completed by this draft, including repeated additions to one target", () => {
  const six = pile("six", ["Q", "Q", "Q", "Q", "Joker", "Joker"]);
  const hand = [card("last-queen", "Q"), card("keep", "4")];
  expect(
    goingOutRequirement(
      true,
      hand,
      [clean, six],
      [{ meldId: "six", cardIds: ["last-queen"] }],
    ),
  ).toBeNull();
  const five = { ...six, cards: six.cards.slice(0, 5) };
  expect(
    goingOutRequirement(
      true,
      [card("q1", "Q"), ...hand],
      [clean, five],
      [
        { meldId: "six", cardIds: ["q1"] },
        { meldId: "six", cardIds: ["last-queen"] },
      ],
    ),
  ).toBeNull();
});

it("does not count a straight flush and explains an illegal wild addition to a completed clean book", () => {
  expect(
    hasGoingOutBooks([
      dirty,
      pile("run", ["4", "5", "6", "7", "8", "9", "10"], "run"),
    ]),
  ).toBe(false);
  expect(
    goingOutRequirement(
      true,
      [card("wild", "Joker"), card("keep", "4")],
      [clean, dirty],
      [{ meldId: clean.id, cardIds: ["wild"] }],
    ),
  ).toBe(CLEAN_BOOK_NATURALS_ONLY);
});

it("treats a natural book of twos as clean and includes the required pickup draw", () => {
  const twos = pile("twos", Array(6).fill("2"));
  expect(
    goingOutRequirement(
      true,
      [card("two", "2"), card("keep", "4")],
      [twos, dirty],
      [{ meldId: "twos", cardIds: ["two"] }],
    ),
  ).toBeNull();
  const hand = [card("a"), card("b")];
  const discard = card("top");
  const draft = [{ cardIds: ["a", "b", "top"] }];
  expect(goingOutRequirement(true, hand, [], draft, discard, 1)).toBe(
    KEEP_AFTER_DISCARD,
  );
  expect(
    goingOutRequirement(true, hand, [clean, dirty], draft, discard, 1),
  ).toBeNull();
});
