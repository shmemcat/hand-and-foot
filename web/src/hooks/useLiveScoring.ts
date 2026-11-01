import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Snapshot } from "../types";
import {
  scoringHeldCards,
  scoringSequence,
  type ScoringScenario,
} from "../lib/scoringSequence";

const scoringScope = (snapshot: Snapshot | null) =>
  snapshot
    ? `${snapshot.code}:${snapshot.round}:${snapshot.viewerId}:${snapshot.players.map((player) => player.id).join(":")}`
    : "";

/** Completed rounds reveal the original cards and retain the accepted settlement. */
function completedScoringSnapshot(
  snapshot: Snapshot,
  previous: Snapshot,
): Snapshot | null {
  const owner = snapshot.players.find(
    (player) => player.id === snapshot.viewerId,
  );
  const round = snapshot.history.find(
    (round) => round.round === snapshot.round,
  );
  const score = round?.scores.find((score) => score.team === owner?.team);
  if (!owner || !round || !score) return null;
  const teammates = snapshot.players.filter(
    (player) => player.team === owner.team,
  );
  if (teammates.some((player) => !player.roundCards)) return null;
  const hand: Snapshot["hand"] = [];
  const foot: Snapshot["hand"] = [];
  for (const player of teammates) {
    const cards = player.roundCards!;
    const footCount = player.inFoot
      ? 0
      : Math.min(
          previous.players.find((seat) => seat.id === player.id)?.footCount ??
            0,
          cards.length,
        );
    hand.push(...cards.slice(0, cards.length - footCount));
    foot.push(...cards.slice(cards.length - footCount));
  }
  const reds = teammates.flatMap((player) => player.redThrees);
  const usedPiles = new Set<string>();
  // Canceled cards retain payment order; board order could break fewer books
  // than the accepted settlement and make the displayed total disagree.
  for (const id of score.canceled) {
    const meld = snapshot.sides[owner.team].melds.find((meld) =>
      meld.cards.some((card) => card.id === id),
    );
    if (meld) usedPiles.add(meld.id);
    else if (reds.some((card) => card.id === id))
      usedPiles.add(`reds:${owner.team}`);
  }
  return {
    ...snapshot,
    phase: "scoring",
    scoringHand: hand,
    scoringFoot: foot,
    sides: snapshot.sides.map((side) => ({
      ...side,
      score:
        side.score -
        (round.scores.find((score) => score.team === side.id)?.total ?? 0),
    })),
    scoring: {
      team: owner.team,
      debt: score.debt + (reds.length < 3 ? reds.length * 300 : 0),
      remaining: score.uncovered,
      canceled: score.canceled,
      usedPiles: [...usedPiles],
      broken: score.broken,
      confirmed: true,
      revision: snapshot.revision,
      reason: round.reason,
      confirmedSides: snapshot.sides.map((side) => side.id),
      debtBreakdown: [],
      redThreeQualified: reds.length >= 3,
      options: [],
      score,
    },
  };
}

/** Presentation replays accepted settlements; it never pays or confirms a score. */
export function useLiveScoring(
  incoming: Snapshot | null,
  enabled: boolean,
  reduced: boolean,
) {
  const scope = scoringScope(incoming);
  const previous = useRef<Snapshot | null>(null);
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
  // Updates can coalesce, or another tab/partner can confirm before this screen
  // finishes the final discard. Replay only a round this screen saw in progress.
  const recovered =
    roundReview &&
    origin?.scope !== scope &&
    previous.current &&
    scoringScope(previous.current) === scope &&
    ["draw", "play", "scoring"].includes(previous.current.phase)
      ? completedScoringSnapshot(incoming!, previous.current)
      : null;
  const eligible =
    enabled &&
    incoming?.status !== "closed" &&
    (incoming?.phase === "scoring" ||
      (roundReview && (origin?.scope === scope || Boolean(recovered))));
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
    const source = incoming?.scoring ? incoming : recovered;
    if (!source?.scoring || origin?.scope === scope) return;
    const owner = source.players.find(
      (player) => player.id === source.viewerId,
    )!;
    review.current = source.scoring;
    setOrigin({
      scope,
      snapshot: source,
      scenario: {
        id: scope,
        label: "Your round",
        reason: source.scoring.reason,
        hand: source.scoringHand ?? source.hand,
        foot: source.scoringFoot ?? [],
        melds: source.sides[owner.team].melds.map((meld) => ({
          ...meld,
          bonusLost: false,
          spentCardIds: [],
        })),
        reds: source.players
          .filter((player) => player.team === owner.team)
          .flatMap((player) => player.redThrees),
        goingOut: source.scoring.score.goingOut,
      },
    });
    setStep(0);
    setSkippedScope(null);
  }, [eligible, completedReview, scope, incoming?.scoring, origin?.scope]);
  useLayoutEffect(() => {
    // The final-discard presentation can carry completed results under a play
    // phase. Retain the actual hand/foot split until that presentation releases.
    if (
      !incoming ||
      roundReview ||
      !incoming.history.some((round) => round.round === incoming.round)
    )
      previous.current = incoming;
  });
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
