import type { Card, Snapshot } from "../types";

export const OPENING_BEATS = [
  {
    title: "Take your seat",
    short: "Arrive",
    duration: 900,
    description:
      "The table settles in. Everyone has a seat, and the first round is about to begin.",
    motion: "Players arrive around the table, one at a time.",
    sound: "Soft join ding for each seat.",
  },
  {
    title: "Meet your dealer",
    short: "Dealer",
    duration: 1500,
    description:
      "A dealer is chosen for round one. The player to their left will take the first turn.",
    motion: "The dealer marker lands, followed by the first-player marker.",
    sound: "A small placement sound as the dealer marker lands.",
  },
  {
    title: "Shuffle the decks",
    short: "Shuffle",
    duration: 2000,
    description:
      "One more deck than the number of players, with two Jokers in every deck.",
    motion: "The combined deck splits, shuffles, and squares up.",
    sound: "One card fan, played once.",
  },
  {
    title: "Two piles for everyone",
    short: "Deal",
    duration: 900,
    description:
      "Two short gestures suggest the whole deal. Everyone receives two piles of eleven, both face down.",
    motion: "Two squared stacks drop into place, one after the other.",
    sound: "One short cue for each of the two gestures.",
  },
  {
    title: "Choose your hand",
    short: "Choose",
    duration: 0,
    description:
      "Inspect just the top and bottom cards of each 11-card pile. Choose the one you want to play first.",
    motion: "Only the two outer cards of each pile turn face up.",
    sound: "Two soft flips. Your choice gets a placement sound.",
  },
  {
    title: "Your hand, your foot",
    short: "Gather",
    duration: 2000,
    description:
      "Your chosen pile opens into your private hand. The other becomes your foot, with its top card visible to you.",
    motion:
      "Both pile previews and their controls fade away. Cards cascade from the chosen deck into your hand, and Foot fades into place.",
    sound: "A card fan for the hand and a placement for the foot.",
  },
  {
    title: "Let the table catch up",
    short: "Ready up",
    duration: 2800,
    description:
      "Your hand is ready. The other players finish choosing theirs before play begins.",
    motion:
      "The table waits on the current board. Other players’ hands stay private.",
    sound: "Quiet placement sounds as the other players become ready.",
  },
  {
    title: "The first turn is ready",
    short: "Begin",
    duration: 2200,
    description:
      "The starting discard turns over and the first player is highlighted. This rehearsal ends before anyone draws.",
    motion:
      "The discard flips and the first-player marker receives a gentle pulse.",
    sound: "One opening chime after the discard turns over.",
  },
] as const;

export const ARRIVAL_FADE_MS = 396;
export const ARRIVAL_STAGGER_MS = 135;
export function arrivalMotionScale(players: number, duration: number): number {
  const span = ARRIVAL_FADE_MS + (players - 1) * ARRIVAL_STAGGER_MS;
  return Math.min(1, Math.max(0, duration - 80) / span);
}
export function arrivalDuration(players: number): number {
  const span = ARRIVAL_FADE_MS + (players - 1) * ARRIVAL_STAGGER_MS;
  return Math.max(800, Math.round((span + 100) / 100) * 100);
}

export const DEAL_ANIMATIONS = [
  {
    id: "sweeps",
    name: "Two sweeps",
    description:
      "A small packet sweeps into the first pile, then a second into the other. My pick: clear, quick, and tactile.",
    sound: "Two soft card slides, one per packet.",
  },
  {
    id: "drops",
    name: "Packet drops",
    description:
      "Two squared stacks drop into place in quick succession, like small decks of cards.",
    sound: "Two soft card placements, one per pile.",
  },
  {
    id: "split",
    name: "Split & settle",
    description:
      "One packet arrives between the piles, then splits left and right. A slightly more playful two-part gesture.",
    sound: "One slide to arrive, one slide to split.",
  },
] as const;
export type DealAnimation = (typeof DEAL_ANIMATIONS)[number]["id"];
export const DEAL_LAUNCH = [0.1, 0.51] as const;
export const DEAL_LAND = [0.32, 0.73] as const;
export function dealPilesLanded(
  progress: number,
  style: DealAnimation,
): number {
  if (progress >= DEAL_LAND[1]) return 2;
  return style !== "split" && progress >= DEAL_LAND[0] ? 1 : 0;
}

export type OpeningState = {
  step: number;
  elapsed: number;
  playing: boolean;
  continuous: boolean;
  choice: number | null;
  replay: number;
};
export const INITIAL_OPENING: OpeningState = {
  step: 0,
  elapsed: 0,
  playing: false,
  continuous: false,
  choice: null,
  replay: 0,
};
export type OpeningAction =
  | { type: "tick"; delta: number; duration: number }
  | { type: "seek"; step: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "replay" }
  | { type: "restart" }
  | { type: "reset" }
  | { type: "choose"; pile: number };

export function openingReducer(
  state: OpeningState,
  action: OpeningAction,
): OpeningState {
  switch (action.type) {
    case "reset":
      return { ...INITIAL_OPENING, replay: state.replay + 1 };
    case "restart":
      return {
        ...INITIAL_OPENING,
        playing: true,
        continuous: true,
        replay: state.replay + 1,
      };
    case "pause":
      return { ...state, playing: false };
    case "play":
      return {
        ...state,
        playing: true,
        continuous: true,
        elapsed: state.elapsed,
        replay: state.replay,
      };
    case "replay":
      return {
        ...state,
        elapsed: 0,
        playing: true,
        continuous: false,
        replay: state.replay + 1,
      };
    case "seek": {
      const step = Math.max(0, Math.min(OPENING_BEATS.length - 1, action.step));
      // A later beat needs a choice; entering it supplies the first sample pile.
      return {
        ...state,
        step,
        elapsed: 0,
        playing: true,
        continuous: false,
        choice: step <= 4 ? null : (state.choice ?? 0),
        replay: state.replay + 1,
      };
    }
    case "choose":
      if (state.step !== 4 || ![0, 1].includes(action.pile)) return state;
      return {
        ...state,
        choice: action.pile,
        step: 5,
        elapsed: 0,
        playing: true,
        replay: state.replay + 1,
      };
    case "tick": {
      if (!state.playing || state.step === 4) return state;
      const elapsed = Math.min(action.duration, state.elapsed + action.delta);
      if (elapsed < action.duration) return { ...state, elapsed };
      if (state.continuous && state.step < OPENING_BEATS.length - 1) {
        return {
          ...state,
          step: state.step + 1,
          elapsed: 0,
          replay: state.replay + 1,
        };
      }
      return { ...state, elapsed, playing: false };
    }
  }
}

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
    "Your hand is ready. The top card of your foot stays visible to you.",
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

export type OpeningCue = {
  at: number;
  sound: "playerJoin" | "select" | "deal" | "flip" | "slide" | "start";
};
export function openingCues(
  step: number,
  players: number,
  duration: number,
  dealStyle: DealAnimation = "sweeps",
): OpeningCue[] {
  switch (step) {
    case 0:
      return Array.from({ length: players }, (_, i) => ({
        at:
          (144 + i * ARRIVAL_STAGGER_MS) *
          arrivalMotionScale(players, duration),
        sound: "playerJoin",
      }));
    case 1:
      return [{ at: duration * 0.2, sound: "select" }];
    case 2:
      return [{ at: duration * 0.1, sound: "deal" }];
    case 3:
      return (dealStyle === "drops" ? DEAL_LAND : DEAL_LAUNCH).map((ratio) => ({
        at: duration * ratio,
        sound: dealStyle === "drops" ? "select" : "slide",
      }));
    case 4:
      return [
        { at: 100, sound: "flip" },
        { at: 450, sound: "flip" },
      ];
    case 5:
      return [
        { at: duration * 0.075, sound: "deal" },
        { at: duration * 0.65, sound: "select" },
      ];
    case 6:
      return Array.from({ length: players - 1 }, (_, i) => ({
        at: ((i + 1) * duration) / players,
        sound: "select",
      }));
    case 7:
      return [{ at: Math.max(500, duration * 0.3), sound: "start" }];
    default:
      return [];
  }
}
