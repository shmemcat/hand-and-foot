import type { Card, Draft } from "../types";

type MeldKind = NonNullable<Draft["kind"]>;
const runRanks = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

// Match the family rules enforced by the game service for each pile.
export function isValidMeld(cards: readonly Card[], kind: MeldKind): boolean {
  if (
    cards.length < 3 ||
    new Set(cards.map((card) => card.id)).size !== cards.length
  )
    return false;

  if (kind === "run") {
    if (
      cards.some(
        (card) =>
          card.wild ||
          !runRanks.includes(card.rank) ||
          card.suit !== cards[0].suit,
      )
    )
      return false;
    const positions = cards
      .map((card) => runRanks.indexOf(card.rank))
      .sort((a, b) => a - b);
    return positions.every(
      (position, index) => position === positions[0] + index,
    );
  }

  const ordinary = cards.filter((card) => !card.wild);
  const naturals = ordinary.length
    ? ordinary
    : cards.filter((card) => card.rank === "2");
  return (
    naturals.length > cards.length - naturals.length &&
    naturals.every(
      (card) => card.rank !== "3" && card.rank === naturals[0].rank,
    )
  );
}

export function detectMeldKind(cards: readonly Card[]): MeldKind | null {
  if (isValidMeld(cards, "set")) return "set";
  return isValidMeld(cards, "run") ? "run" : null;
}
