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
  const roundReview = Boolean(
    incoming && ["round_over", "finished"].includes(incoming.phase),
  );
  const eligible =
    enabled &&
    (incoming?.phase === "scoring" || (roundReview && origin?.scope === scope));
  const inScope = eligible && origin?.scope === scope;
  const skipped = inScope && skippedScope === scope;
  if (inScope && incoming?.scoring) review.current = incoming.scoring;
  const accepted = inScope ? review.current : null;
  const result = roundReview
    ? incoming?.history
        .find((round) => round.round === incoming.round)
        ?.scores.find((score) => score.team === accepted?.team)
    : undefined;
  const beats = useMemo(() => {
    if (!origin || !accepted) return [];
    const pileIds = new Set(accepted.usedPiles);
    // Another tab can finish settlement before its payment snapshot arrives.
    for (const id of result?.canceled ?? []) {
      const pile = origin.scenario.melds.find((meld) =>
        meld.cards.some((card) => card.id === id),
      );
      if (pile) pileIds.add(pile.id);
      else if (origin.scenario.reds.some((card) => card.id === id))
        pileIds.add(`reds:${accepted.team}`);
    }
    return scoringSequence(origin.scenario, {
      pileIds: [...pileIds],
      complete:
        Boolean(result) ||
        accepted.remaining === 0 ||
        accepted.options.length === 0,
      qualified: accepted.redThreeQualified,
    });
  }, [origin, accepted?.revision, result]);
  const index = Math.min(step, Math.max(0, beats.length - 1));
  const done = skipped || (inScope && beats[index]?.kind === "total");
  const completedReview = roundReview && done;
  const active = inScope && !completedReview;
  const beat = active && !skipped ? beats[index] : undefined;
  const key = beat
    ? `${scope}:${index}:${beat.kind}:${beat.reconciled}:${beat.base}:${beat.cardValue}`
    : "";
  useLayoutEffect(() => {
    if (!eligible || completedReview) {
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
        hand: incoming.scoringHand ?? incoming.hand,
        foot: incoming.scoringFoot ?? [],
        melds: incoming.sides[owner.team].melds.map((meld) => ({
          ...meld,
          bonusLost: false,
          spentCardIds: [],
        })),
        reds: incoming.players
          .filter((player) => player.team === owner.team)
          .flatMap((player) => player.redThrees),
        goingOut: incoming.scoring.score.goingOut,
      },
    });
    setStep(0);
    setSkippedScope(null);
  }, [eligible, completedReview, scope, incoming?.scoring, origin?.scope]);
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
    const presented = roundReview ? origin.snapshot : incoming;
    snapshot = {
      ...presented,
      // The authoritative result is ready; finish only this screen's count.
      ...(roundReview && { scoring: { ...accepted!, confirmed: true } }),
      message: beat.title,
      hand: beat.hand.filter((card) => !held.has(card.id)),
      footTop: beat.gathered ? null : (origin.scenario.foot[0] ?? null),
      players: presented.players.map((player) =>
        player.team === team
          ? {
              ...player,
              redThrees: beat.reds.filter(
                (card) =>
                  !held.has(card.id) &&
                  player.redThrees.some((red) => red.id === card.id),
              ),
              ...(player.id === incoming.viewerId && {
                handCount: beat.hand.length,
                footCount: beat.gathered ? 0 : origin.scenario.foot.length,
              }),
            }
          : player,
      ),
      sides: presented.sides.map((side) =>
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
    enabled: eligible && !completedReview,
    active,
    snapshot,
    beat,
    key,
    paused: hidden,
    waiting: beat?.kind === "wait",
    done,
    skip: () => {
      if (active) setSkippedScope(scope);
    },
  };
}
