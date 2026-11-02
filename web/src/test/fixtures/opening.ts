import type { Card, Snapshot } from "../../types";
import {
  INITIAL_OPENING,
  DEAL_LAUNCH,
  type DealAnimation,
  type OpeningState,
} from "../../lib/openingSequence";

export function samplePiles(): Card[][] {
  const faces = [
    [
      ["A", "hearts"],
      ["7", "clubs"],
      ["K", "spades"],
      ["9", "diamonds"],
      ["2", "clubs"],
      ["6", "hearts"],
      ["K", "diamonds"],
      ["Joker", "joker"],
      ["7", "diamonds"],
      ["4", "spades"],
      ["Q", "clubs"],
    ],
    [
      ["2", "diamonds"],
      ["8", "hearts"],
      ["J", "clubs"],
      ["5", "spades"],
      ["A", "clubs"],
      ["9", "hearts"],
      ["8", "spades"],
      ["Q", "diamonds"],
      ["5", "hearts"],
      ["10", "clubs"],
      ["K", "hearts"],
    ],
  ];
  return faces.map((pile, p) =>
    pile.map(([rank, suit], i) => ({
      id: `opening-${p}-${i}`,
      rank,
      suit,
      value:
        rank === "Joker"
          ? 50
          : ["A", "2"].includes(rank)
            ? 20
            : ["4", "5", "6", "7", "8"].includes(rank)
              ? 5
              : 10,
      wild: ["Joker", "2"].includes(rank),
      redThree: false,
    })),
  );
}

/** The same private snapshot shape the live Room renderer receives. */
export function openingSnapshot({
  state,
  names,
  mode,
  dealer,
  duration,
  dealStyle = "sweeps",
}: {
  state: OpeningState;
  names: string[];
  mode: "individual" | "partnership";
  dealer: number;
  duration: number;
  dealStyle?: DealAnimation;
}): Snapshot {
  const piles = samplePiles();
  const count = names.length;
  const sideCount = mode === "partnership" ? count / 2 : count;
  const handVisible = state.step >= 5;
  const progress = duration ? state.elapsed / duration : 0;
  const first = (dealer + 1) % count;
  const players = names.map((name, i) => {
    const chosen =
      i === 0
        ? handVisible
        : state.step === 7 || (state.step === 6 && progress >= i / count);
    return {
      id: `opening-seat-${i}`,
      name,
      team: i % sideCount,
      bot: i !== 0,
      handCount: chosen ? 11 : 0,
      footCount: chosen ? 11 : 0,
      footTop: chosen
        ? {
            ...piles[1 - (state.choice ?? 0)][0],
            id: `opening-public-foot-${i}`,
          }
        : null,
      inFoot: false,
      chosen,
      redThrees: [],
      ready: false,
      away: false,
    };
  });
  const dealt =
    state.step < 3
      ? 0
      : state.step > 3
        ? count * 22
        : count *
          11 *
          (dealStyle === "split"
            ? Number(progress >= DEAL_LAUNCH[0]) * 2
            : Number(progress >= DEAL_LAUNCH[0]) +
              Number(progress >= DEAL_LAUNCH[1]));
  const messages = [
    "Everyone’s here. Getting the table ready.",
    `${names[dealer] === "You" ? "You’re" : `${names[dealer]} is`} dealing. ${first === 0 ? "You’ll" : `${names[first]} will`} play first.`,
    `Shuffling ${count + 1} decks, including ${(count + 1) * 2} Jokers.`,
    "Dealing two piles of eleven cards to each player.",
    "Choose a pile for your hand. The other becomes your foot.",
    "Your hand is ready. Each foot’s top card is visible to the table.",
    "Waiting for the other players to choose their hands.",
    first === 0
      ? "Your turn. Draw 2 cards, or play the top discard."
      : `${names[first]} leads. Draw from the stack or play the top discard.`,
  ];
  return {
    code: "OPENING",
    revision: state.replay,
    token: `opening-${state.step}-${state.replay}`,
    status: "playing",
    capacity: count,
    scoringMode: mode,
    playMode: "practice",
    viewerId: players[0].id,
    hostId: players[0].id,
    players,
    sides: Array.from({ length: sideCount }, (_, i) => ({
      id: i,
      name:
        mode === "individual"
          ? names[i]
          : players
              .filter((p) => p.team === i)
              .map((p) => p.name)
              .join(" & "),
      score: 0,
      opened: false,
      melds: [],
      clean: 0,
      dirty: 0,
      opening: 50,
    })),
    decks: count + 1,
    drawCount: 2,
    round: 1,
    targetScore: 10000,
    phase: state.step === 7 ? "draw" : "choose",
    actorId: state.step === 7 ? players[first].id : null,
    dealerId: state.step >= 1 ? players[dealer].id : null,
    hand: handVisible ? piles[state.choice ?? 0] : [],
    footPreview: state.step === 4 ? piles.map((p) => [p[0], p[10]]) : null,
    footTop: handVisible ? piles[1 - (state.choice ?? 0)][0] : null,
    discard:
      state.step === 7
        ? {
            id: "opening-discard",
            rank: "8",
            suit: "spades",
            value: 5,
            wild: false,
            redThree: false,
          }
        : null,
    discardCount: state.step === 7 ? 1 : 0,
    stockCount: (count + 1) * 54 - dealt - Number(state.step === 7),
    history: [],
    winners: [],
    message: messages[state.step],
    ruleset: "family-v1",
    scoring: null,
  };
}
