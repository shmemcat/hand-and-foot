import type { Card, Draft, Meld } from "../types";
import { canExtendMeld, CLEAN_BOOK_NATURALS_ONLY, isValidMeld } from "./melds";

export const KEEP_AFTER_DISCARD =
  "You need a clean book and a dirty book to go out. Keep one card after discarding.";
export const KEEP_FINAL_DISCARD = "Keep one card for your final discard.";

export function hasGoingOutBooks(
  melds: readonly Pick<Meld, "kind" | "complete" | "dirty">[],
) {
  return (
    melds.some((meld) => meld.kind === "set" && meld.complete && !meld.dirty) &&
    melds.some((meld) => meld.kind === "set" && meld.complete && meld.dirty)
  );
}

/** Mirror the server's final-card check against the whole proposed draft. */
export function goingOutRequirement(
  inFoot: boolean,
  hand: readonly Card[],
  melds: readonly Meld[],
  drafts: readonly Draft[],
  discard: Card | null = null,
  followupDraw = 0,
): string | null {
  if (!inFoot || !drafts.length) return null;
  const staged = new Set(drafts.flatMap((draft) => draft.cardIds));
  const remaining =
    hand.filter((card) => !staged.has(card.id)).length + followupDraw;
  if (remaining === 0) return KEEP_FINAL_DISCARD;
  if (remaining !== 1) return null;
  const cards = new Map(
    [...hand, ...(discard ? [discard] : [])].map((card) => [card.id, card]),
  );
  const projected = new Map(melds.map((meld) => [meld.id, { ...meld }]));
  for (const [index, draft] of drafts.entries()) {
    if (draft.redThree) continue;
    const key = draft.meldId ?? `draft-${index}`;
    const target = projected.get(key);
    const additions = draft.cardIds.flatMap((id) => cards.get(id) ?? []);
    if (target && !canExtendMeld(target, additions))
      return target.complete && !target.dirty && target.kind === "set"
        ? CLEAN_BOOK_NATURALS_ONLY
        : "Those cards cannot be added to that pile.";
    const combined = [...(target?.cards ?? []), ...additions];
    const kind = target?.kind ?? draft.kind ?? "set";
    const natural = combined.filter((card) => !card.wild);
    const naturals = natural.length
      ? natural
      : combined.filter((card) => card.rank === "2");
    projected.set(key, {
      id: key,
      creator: target?.creator ?? "",
      rank: target?.rank ?? "",
      bonus: 0,
      cards: combined,
      kind,
      complete: combined.length >= 7 && isValidMeld(combined, kind),
      dirty: kind === "set" && naturals.length !== combined.length,
    });
  }
  return hasGoingOutBooks([...projected.values()]) ? null : KEEP_AFTER_DISCARD;
}
