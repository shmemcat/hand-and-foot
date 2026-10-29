import { useEffect, useRef, type RefObject } from "react";
import party from "party-js";
import { useSound } from "../context/SoundContext";
import type { Snapshot } from "../types";

/** Celebrate a side's shared red-three pile only when it first reaches three. */
export function useRedThreeCelebration(
  snapshot: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  reduced: boolean,
) {
  const { play } = useSound();
  const previous = useRef<{
    scope: string;
    counts: Map<number, number>;
  } | null>(null);
  const frames = useRef(new Set<number>());

  useEffect(() => {
    if (!snapshot) {
      previous.current = null;
      return;
    }
    const scope = `${snapshot.code}:${snapshot.round}:${snapshot.viewerId}`;
    const counts = new Map<number, number>();
    for (const player of snapshot.players)
      counts.set(
        player.team,
        (counts.get(player.team) ?? 0) + player.redThrees.length,
      );
    const prior = previous.current;
    previous.current = { scope, counts };
    // Joining an existing game or a new round establishes a baseline.
    if (!prior || prior.scope !== scope) return;
    const celebrating = [...counts].filter(
      ([team, count]) => count >= 3 && (prior.counts.get(team) ?? 0) < 3,
    );
    if (!celebrating.length || document.hidden) return;
    play("redThreeCelebration");
    if (reduced) return;

    // Let Follow turn finish selecting the board before locating the burst.
    const frame = requestAnimationFrame(() => {
      frames.current.delete(frame);
      if (previous.current?.scope !== scope || document.hidden) return;
      const tableau = board.current?.querySelector<HTMLElement>(".tableau");
      if (
        tableau &&
        celebrating.some(([team]) => String(team) === tableau.dataset.sideId)
      )
        party.confetti(
          tableau.querySelector<HTMLElement>(".tableau-heading") ?? tableau,
          { count: party.variation.range(60, 120) },
        );
    });
    frames.current.add(frame);
  });

  useEffect(
    () => () => {
      for (const frame of frames.current) cancelAnimationFrame(frame);
      frames.current.clear();
    },
    [],
  );
}
