import { useEffect, useRef } from "react";
import { useSound } from "../context/SoundContext";
import type { Snapshot, TableEvent } from "../types";

const scopeOf = (snapshot: Snapshot) =>
  `${snapshot.code}:${snapshot.round}:${snapshot.viewerId}`;
const tableCards = (snapshot: Snapshot) => [
  ...snapshot.sides.flatMap((side) => side.melds.flatMap((meld) => meld.cards)),
  ...snapshot.players.flatMap((player) => player.redThrees),
];

/** Local commands already play their own cues; remote actions arrive via snapshots. */
export function useCardMovementSounds(
  snapshot: Snapshot | null,
  movingEvent: TableEvent | null | undefined,
  tableBlocking: boolean,
) {
  const { play } = useSound();
  const previous = useRef<Snapshot | null>(null);
  const seen = useRef(new Set<string>());
  const pending = useRef(new Map<string, TableEvent>());

  useEffect(() => {
    const prior = previous.current;
    previous.current = snapshot;
    if (!snapshot || !prior || scopeOf(snapshot) !== scopeOf(prior)) {
      seen.current = new Set(snapshot?.tableEvents?.map((event) => event.id));
      pending.current.clear();
      return;
    }

    let pickedUpDiscard = false;
    for (const event of snapshot.tableEvents ?? []) {
      if (seen.current.has(event.id)) continue;
      seen.current.add(event.id);
      // FootPickupNotice already owns the card-fan cue for every player.
      if (event.playerId !== snapshot.viewerId && event.kind !== "foot") {
        pending.current.set(event.id, event);
        if (event.kind === "pickup") pickedUpDiscard = true;
      }
    }

    // Consume background updates without replaying them when the tab returns.
    if (document.hidden) {
      pending.current.clear();
      return;
    }

    const soundEvent = (event: TableEvent) => {
      if (!pending.current.delete(event.id)) return;
      play("select");
    };
    // Follow the animation queue so batched draws/discards each get their own cue.
    if (movingEvent) soundEvent(movingEvent);
    // Reduced motion and actions on other boards may have no flight at all.
    if (!tableBlocking)
      for (const event of pending.current.values()) soundEvent(event);

    if (!["draw", "play"].includes(snapshot.phase) || pickedUpDiscard) return;
    // Physical card IDs distinguish remote plays even if a whole bot turn was batched.
    const knownCards = new Set([
      ...tableCards(prior).map((card) => card.id),
      ...prior.hand.map((card) => card.id),
      ...(prior.actorId === prior.viewerId && prior.discard
        ? [prior.discard.id]
        : []),
    ]);
    if (tableCards(snapshot).some((card) => !knownCards.has(card.id)))
      play("select");
  });
}
