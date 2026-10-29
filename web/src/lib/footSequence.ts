import {
  INITIAL_OPENING,
  openingSnapshot,
  samplePiles,
} from "./openingSequence";
import type { Card, Meld, Snapshot } from "../types";

export type FootEntry = "play" | "discard";
export type FootBeat = "before" | "leaving" | "gathering" | "ready";

export { FOOT_GATHER_DELAY_MS, footGatherDuration } from "./footMotion";

export const FOOT_CARDS = samplePiles()[1];
export const FINAL_HAND_CARD: Card = {
  id: "foot-last-hand-card",
  rank: "K",
  suit: "clubs",
  value: 10,
  wild: false,
  redThree: false,
};

export function footSnapshot(
  entry: FootEntry,
  beat: FootBeat,
  replay: number,
): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
    mode: "individual",
    dealer: 5,
    duration: 2200,
  });
  const leftHand = beat !== "before";
  const inFoot = beat === "gathering" || beat === "ready";
  const melds: Meld[] = ["K", "9", "7"].map((rank, i) => ({
    id: `foot-meld-${rank}`,
    creator: base.viewerId,
    kind: "set",
    rank,
    cards: ["hearts", "diamonds", "spades"].map((suit, j) => ({
      id: `foot-meld-${i}-${j}`,
      rank,
      suit,
      value: rank === "K" ? 10 : 5,
      wild: false,
      redThree: false,
    })),
    complete: false,
    dirty: false,
    bonus: 0,
  }));
  if (entry === "play" && leftHand) melds[0].cards.push(FINAL_HAND_CARD);
  const hand = inFoot ? FOOT_CARDS : leftHand ? [] : [FINAL_HAND_CARD];
  const messages: Record<FootBeat, string> = {
    before:
      entry === "play"
        ? "Play your last King to pick up your foot and keep playing."
        : "Discard your last King to pick up your foot and end your turn.",
    leaving:
      entry === "play"
        ? "Playing your last hand card…"
        : "Discarding your last hand card…",
    gathering: "Picking up your foot…",
    ready:
      entry === "play"
        ? "You’re in your foot. Keep playing, then discard to end your turn."
        : "Your foot is ready. Poppy’s turn — you can play it on your next turn.",
  };
  return {
    ...base,
    code: "FOOT-REHEARSAL",
    token: `foot-${entry}-${beat}-${replay}`,
    revision: replay,
    opening: { id: "foot-rehearsal", ready: [base.viewerId], complete: true },
    phase: "play",
    actorId:
      entry === "discard" && leftHand ? base.players[1].id : base.viewerId,
    hand,
    footTop: inFoot ? null : FOOT_CARDS[0],
    message: messages[beat],
    discard: entry === "discard" && leftHand ? FINAL_HAND_CARD : base.discard,
    discardCount: base.discardCount + Number(entry === "discard" && leftHand),
    players: base.players.map((player, i) =>
      i === 0
        ? {
            ...player,
            handCount: hand.length,
            footCount: inFoot ? 0 : FOOT_CARDS.length,
            footTop: inFoot ? null : FOOT_CARDS[0],
            inFoot,
          }
        : player,
    ),
    sides: base.sides.map((side, i) => ({
      ...side,
      opened: i === 0,
      melds: i === 0 ? melds : [],
    })),
  };
}
