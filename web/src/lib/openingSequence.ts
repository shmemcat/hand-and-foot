import type { Card } from "../types";

export const OPENING_BEATS = [
  {
    title: "Take your seat",
    short: "Arrive",
    duration: 1800,
    description:
      "The table settles in. Everyone has a seat, and the first round is about to begin.",
    motion: "Players arrive around the table, one at a time.",
    sound: "Soft join ding for each seat.",
  },
  {
    title: "Meet your dealer",
    short: "Dealer",
    duration: 2200,
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
    sound: "Two card fans, then a soft card placement.",
  },
  {
    title: "Two piles for everyone",
    short: "Deal",
    duration: 6200,
    description:
      "Eleven cards go into each player’s first pile, then eleven into their second. Both stay face down.",
    motion: "Cards travel from the deck to each seat in two passes.",
    sound: "Light card slides follow the deal. A placement closes each pass.",
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
      "Your chosen pile opens into your private hand. The other pile turns face down and becomes your foot.",
    motion:
      "Your 11 cards fan into the hand dock; your foot settles beside it.",
    sound: "A card fan for the hand and a placement for the foot.",
  },
  {
    title: "Let the table catch up",
    short: "Ready up",
    duration: 2800,
    description:
      "Your hand is ready. The other players finish choosing theirs before play begins.",
    motion: "Ready marks appear around the table. Other hands stay hidden.",
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
    sound: "A flip, a short opening chime, then the turn cue.",
  },
] as const;

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

export type OpeningCue = {
  at: number;
  sound: "playerJoin" | "select" | "deal" | "flip" | "slide" | "start" | "turn";
};
export function openingCues(
  step: number,
  players: number,
  duration: number,
): OpeningCue[] {
  switch (step) {
    case 0:
      return Array.from({ length: players }, (_, i) => ({
        at: duration * (0.08 + i * 0.075),
        sound: "playerJoin",
      }));
    case 1:
      return [{ at: duration * 0.35, sound: "select" }];
    case 2:
      return [
        { at: duration * 0.05, sound: "deal" },
        { at: duration * 0.4, sound: "deal" },
        { at: duration * 0.8, sound: "select" },
      ];
    case 3:
      return [
        ...Array.from(
          { length: 22 },
          (_, i): OpeningCue => ({
            at: 200 + (i * (duration - 650)) / 22,
            sound: "slide",
          }),
        ),
        { at: duration / 2, sound: "select" as const },
        { at: duration - 100, sound: "select" as const },
      ].sort((a, b) => a.at - b.at);
    case 4:
      return [
        { at: 100, sound: "flip" },
        { at: 450, sound: "flip" },
      ];
    case 5:
      return [
        { at: duration * 0.025, sound: "deal" },
        { at: duration * 0.65, sound: "select" },
      ];
    case 6:
      return Array.from({ length: players - 1 }, (_, i) => ({
        at: ((i + 1) * duration) / players,
        sound: "select",
      }));
    case 7:
      return [
        { at: 100, sound: "flip" },
        { at: duration * 0.3, sound: "start" },
        { at: duration * 0.7, sound: "turn" },
      ];
    default:
      return [];
  }
}
