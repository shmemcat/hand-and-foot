import type { Snapshot } from "../types";
import {
  arrivalDuration,
  dealPilesLanded,
  INITIAL_OPENING,
  OPENING_BEATS,
  type OpeningState,
} from "./openingSequence";

export type LiveOpening = OpeningState & {
  id: string;
  round: number;
  piles: NonNullable<Snapshot["footPreview"]>;
  previousDealerId?: string;
  done: boolean;
};
export const liveOpeningDuration = (state: LiveOpening, players: number) =>
  state.step === 0
    ? arrivalDuration(players)
    : OPENING_BEATS[state.step].duration;

export function syncLiveOpening(
  state: LiveOpening | null,
  snapshot: Snapshot | null,
): LiveOpening | null {
  if (
    snapshot?.status === "closed" ||
    !snapshot?.opening ||
    !["choose", "draw"].includes(snapshot.phase)
  )
    return null;
  const viewer = snapshot.players.find((p) => p.id === snapshot.viewerId);
  if (!viewer) return null;
  if (state?.id !== snapshot.opening.id) {
    if (snapshot.opening.complete || snapshot.opening.ready.includes(viewer.id))
      return null;
    const dealer = snapshot.players.findIndex(
      (p) => p.id === snapshot.dealerId,
    );
    return {
      ...INITIAL_OPENING,
      id: snapshot.opening.id,
      round: snapshot.round,
      step: viewer.chosen
        ? snapshot.phase === "choose"
          ? 6
          : 7
        : snapshot.round === 1
          ? 0
          : 1,
      playing: true,
      continuous: true,
      piles: snapshot.footPreview ?? [],
      previousDealerId:
        snapshot.round > 1
          ? snapshot.players[
              (dealer - 1 + snapshot.players.length) % snapshot.players.length
            ]?.id
          : undefined,
      done: false,
    };
  }
  if (state.done) return state;
  if (state.step === 4 && viewer.chosen)
    return { ...state, step: 5, elapsed: 0, replay: state.replay + 1 };
  if (state.step === 6 && snapshot.phase === "draw")
    return { ...state, step: 7, elapsed: 0, replay: state.replay + 1 };
  if (
    state.step === 7 &&
    state.elapsed >= OPENING_BEATS[7].duration &&
    snapshot.opening.complete
  )
    return { ...state, done: true };
  return state;
}

export function tickLiveOpening(
  state: LiveOpening,
  delta: number,
  players: number,
): LiveOpening {
  if (state.done || state.step === 4 || state.step === 6) return state;
  const duration = liveOpeningDuration(state, players);
  const elapsed = Math.min(duration, state.elapsed + delta);
  if (elapsed >= duration && state.step < 7)
    return {
      ...state,
      step: state.step + 1,
      elapsed: 0,
      replay: state.replay + 1,
    };
  return elapsed === state.elapsed ? state : { ...state, elapsed };
}

export function liveOpeningSnapshot(
  snapshot: Snapshot,
  state: LiveOpening,
): Snapshot {
  if (state.done) return snapshot;
  const step = state.step;
  const count = snapshot.players.length;
  const dealer = snapshot.players.findIndex((p) => p.id === snapshot.dealerId);
  const first = snapshot.players[(dealer + 1) % count];
  const dealerName =
    snapshot.players[dealer]?.id === snapshot.viewerId
      ? "You’re"
      : `${snapshot.players[dealer]?.name} is`;
  const firstName =
    first?.id === snapshot.viewerId ? "You’ll" : `${first?.name} will`;
  const messages = [
    "Everyone’s here. Getting the table ready.",
    `${dealerName} dealing. ${firstName} play first.`,
    `Shuffling ${snapshot.decks} decks, including ${snapshot.decks * 2} Jokers.`,
    "Dealing two piles of eleven cards to each player.",
    "Choose a pile for your hand. The other becomes your foot.",
    "Your hand is ready. The top card of your foot stays visible to you.",
    "Waiting for the other players to choose their hands.",
    state.elapsed >= OPENING_BEATS[7].duration && !snapshot.opening?.complete
      ? "Waiting for the table to be ready."
      : first?.id === snapshot.viewerId
        ? `Your turn. Draw ${snapshot.drawCount} cards, or play the top discard.`
        : `${first?.name} leads. Draw from the stack or play the top discard.`,
  ];
  const dealtPiles =
    step < 3
      ? 0
      : step === 3
        ? dealPilesLanded(state.elapsed / OPENING_BEATS[3].duration, "drops")
        : 2;
  return {
    ...snapshot,
    dealerId: step === 0 ? null : snapshot.dealerId,
    actorId: step < 7 ? null : snapshot.actorId,
    phase: step < 7 ? "choose" : snapshot.phase,
    hand: step >= 5 ? snapshot.hand : [],
    footPreview: step === 4 ? state.piles : null,
    footTop: step >= 5 ? snapshot.footTop : null,
    discard: step >= 7 ? snapshot.discard : null,
    discardCount: step >= 7 ? snapshot.discardCount : 0,
    stockCount:
      snapshot.stockCount + (2 - dealtPiles) * count * 11 + Number(step < 7),
    players: snapshot.players.map((p) => ({
      ...p,
      chosen: p.id === snapshot.viewerId ? step >= 5 : step >= 6 && p.chosen,
      handCount: step < 3 ? 0 : p.handCount,
      footCount: step < 3 ? 0 : p.footCount,
    })),
    message: messages[step],
  };
}
