import type { Card, Draft, Meld } from "../types";

type MeldKind = NonNullable<Draft["kind"]>;
const runRanks = ["4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
export const CLEAN_BOOK_NATURALS_ONLY =
  "A completed clean book only accepts matching natural cards.";

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

/** Closed books keep their type; twos are natural in a matching book of twos. */
export function canExtendMeld(meld: Meld, additions: readonly Card[]): boolean {
  return (
    additions.length > 0 &&
    (!(meld.kind === "set" && meld.complete && !meld.dirty) ||
      additions.every((card) => card.rank === meld.rank)) &&
    isValidMeld([...meld.cards, ...additions], meld.kind)
  );
}

/** Cards that can join the pending discard in at least one completable pile. */
export function pickupPlayableCards(
  hand: readonly Card[],
  discard: Card,
  melds: readonly Meld[],
  selectedIds: readonly string[] = [],
): Set<string> {
  if (discard.rank === "3") return new Set();
  const selected = hand.filter((card) => selectedIds.includes(card.id));
  const targets = [
    undefined,
    ...melds.filter((meld) => meld.cards.length !== 6),
  ];
  const unique = (cards: readonly Card[]) => [
    ...new Map(cards.map((card) => [card.id, card])).values(),
  ];
  function canComplete(card: Card, meld?: Meld) {
    const required = unique([
      ...(meld?.cards ?? []),
      discard,
      ...selected,
      card,
    ]);
    if (!meld || meld.kind === "set") {
      // A discarded wild can join any matching rank, including a meld of twos.
      const ranks = meld
        ? [meld.rank]
        : discard.wild
          ? [
              ...new Set(
                hand
                  .filter((item) => !item.wild || item.rank === "2")
                  .map((item) => item.rank),
              ),
            ]
          : [discard.rank];
      for (const rank of ranks) {
        const naturals = hand.filter((item) => item.rank === rank);
        const matching = unique([...required, ...naturals]);
        // A matching pair can use an unselected wild to become a complete meld.
        if (matching.length < 3) {
          const wild = hand.find(
            (item) => item.wild && !matching.some((old) => old.id === item.id),
          );
          if (wild) matching.push(wild);
        }
        if (
          meld
            ? canExtendMeld(
                meld,
                matching.filter(
                  (item) => !meld.cards.some((old) => old.id === item.id),
                ),
              )
            : isValidMeld(matching, "set")
        )
          return true;
      }
    }
    if (meld && meld.kind !== "run") return false;
    if (
      required.some(
        (item) =>
          item.wild ||
          item.suit !== discard.suit ||
          !runRanks.includes(item.rank),
      )
    )
      return false;
    if (new Set(required.map((item) => item.rank)).size !== required.length)
      return false;
    // Fill any missing ranks from the available hand, without duplicate ranks.
    const available = new Map(
      [
        ...hand.filter((item) => !item.wild && item.suit === discard.suit),
        ...required,
      ].map((item) => [item.rank, item]),
    );
    let low = runRanks.indexOf(discard.rank);
    let high = low;
    while (low > 0 && available.has(runRanks[low - 1])) low--;
    while (high < runRanks.length - 1 && available.has(runRanks[high + 1]))
      high++;
    return (
      required.every((item) => {
        const rank = runRanks.indexOf(item.rank);
        return rank >= low && rank <= high;
      }) &&
      isValidMeld(
        runRanks.slice(low, high + 1).map((rank) => available.get(rank)!),
        "run",
      )
    );
  }
  return new Set(
    hand
      .filter((card) => targets.some((meld) => canComplete(card, meld)))
      .map((card) => card.id),
  );
}
