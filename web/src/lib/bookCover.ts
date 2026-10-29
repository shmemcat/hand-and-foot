import type { Meld } from "../types";

export function bookCover(meld: Meld) {
  if (meld.kind === "run") return meld.cards.at(-1);
  const naturals = meld.cards
    .slice()
    .reverse()
    .filter((card) => card.rank === meld.rank);
  return (
    naturals.find(
      (card) => ["hearts", "diamonds"].includes(card.suit) === !meld.dirty,
    ) ?? naturals[0]
  );
}
