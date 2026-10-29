import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../types";
import {
  scoringHeldCards,
  scoringSequence,
  type ScoringScenario,
} from "../lib/scoringSequence";

/** Presentation never pays or confirms a score: only accepted scoring revisions advance it. */
export function useLiveScoring(
  incoming: Snapshot | null,
  enabled: boolean,
  reduced: boolean,
) {
  const scope = incoming
    ? `${incoming.code}:${incoming.round}:${incoming.viewerId}`
    : "";
  const [origin, setOrigin] = useState<{
    scope: string;
    snapshot: Snapshot;
    scenario: ScoringScenario;
  } | null>(null);
  const [step, setStep] = useState(0);
  const [skippedScope, setSkippedScope] = useState<string | null>(null);
  const [hidden, setHidden] = useState(document.hidden);
  const review = useRef<Snapshot["scoring"]>(null);
  const eligible = enabled && incoming?.phase === "scoring";
  const active = eligible && origin?.scope === scope;
  const skipped = active && skippedScope === scope;
  if (active && incoming?.scoring) review.current = incoming.scoring;
  useLayoutEffect(() => {
    if (!eligible) {
      if (origin) setOrigin(null);
      return;
    }
    if (!incoming?.scoring || origin?.scope === scope) return;
    const owner = incoming.players.find(
      (player) => player.id === incoming.viewerId,
    )!;
    review.current = incoming.scoring;
    setOrigin({
      scope,
      snapshot: incoming,
      scenario: {
        id: scope,
        label: "Your round",
        reason: incoming.scoring.reason,
        hand: incoming.hand,
        foot: incoming.scoringFoot ?? [],
        melds: incoming.sides[owner.team].melds.map((meld) => ({
          ...meld,
          bonusLost: false,
          spentCardIds: [],
        })),
        reds: owner.redThrees,
        goingOut: incoming.scoring.score.goingOut,
      },
    });
    setStep(0);
    setSkippedScope(null);
  }, [eligible, scope, incoming?.scoring, origin?.scope]);
  const accepted = active ? review.current : null;
  const beats = useMemo(
    () =>
      origin && accepted
        ? scoringSequence(origin.scenario, {
            pileIds: accepted.usedPiles,
            complete: accepted.remaining === 0 || accepted.options.length === 0,
            qualified: accepted.redThreeQualified,
          })
        : [],
    [origin, accepted?.revision],
  );
  const index = Math.min(step, Math.max(0, beats.length - 1));
  const beat = active && !skipped ? beats[index] : undefined;
  const key = beat
    ? `${scope}:${index}:${beat.kind}:${beat.reconciled}:${beat.base}:${beat.cardValue}`
    : "";
  useEffect(() => {
    const visibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, []);
  useEffect(() => {
    if (!beat || hidden || ["wait", "total"].includes(beat.kind)) return;
    const timer = window.setTimeout(
      () => setStep(index + 1),
      reduced ? 100 : beat.duration,
    );
    return () => clearTimeout(timer);
  }, [key, hidden, reduced]);
  let snapshot = incoming;
  if (active && incoming && beat && origin) {
    const team = origin.snapshot.scoring!.team;
    const held = new Set(scoringHeldCards(beat).map((card) => card.id));
    snapshot = {
      ...incoming,
      message: beat.title,
      hand: beat.hand.filter((card) => !held.has(card.id)),
      footTop: beat.gathered ? null : origin.snapshot.footTop,
      players: incoming.players.map((player) =>
        player.id === incoming.viewerId
          ? {
              ...player,
              redThrees: beat.reds.filter((card) => !held.has(card.id)),
              handCount: beat.hand.length,
              footCount: beat.gathered ? 0 : origin.scenario.foot.length,
            }
          : player,
      ),
      sides: incoming.sides.map((side) =>
        side.id === team
          ? {
              ...side,
              melds: beat.melds
                .map((meld) => ({
                  ...meld,
                  cards: meld.cards.filter((card) => !held.has(card.id)),
                }))
                .filter((meld) => meld.cards.length),
            }
          : side,
      ),
    };
  }
  return {
    enabled: eligible,
    active,
    snapshot,
    beat,
    key,
    paused: hidden,
    waiting: beat?.kind === "wait",
    done: skipped || beat?.kind === "total",
    skip: () => {
      if (active) setSkippedScope(scope);
    },
  };
}
