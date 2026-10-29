import type { Card, Draft, Meld, Snapshot } from "../types";
import {
  INITIAL_OPENING,
  openingSnapshot,
  samplePiles,
} from "./openingSequence";

export type PickupScenario =
  | "new"
  | "existing"
  | "cancel"
  | "rejected"
  | "meld"
  | "meld-existing"
  | "mixed";
export const PICKUP_SCENARIOS: { id: PickupScenario; label: string }[] = [
  { id: "new", label: "Start a matching pile" },
  { id: "existing", label: "Add to an existing pile" },
  { id: "cancel", label: "Cancel a staged pickup" },
  { id: "rejected", label: "Opening below minimum" },
  { id: "meld", label: "Hand draft · new meld" },
  { id: "meld-existing", label: "Hand draft · existing meld" },
  { id: "mixed", label: "Mixed draft · multiple melds" },
];

type Beat = {
  id: string;
  title: string;
  detail: string;
  hold: number;
  selected?: number;
  staged?: boolean;
  waiting?: boolean;
  complete?: boolean;
  drawn?: boolean;
  canceled?: boolean;
  sound?: "select" | "slide" | "deal";
};

export function pickupBeats(scenario: PickupScenario): Beat[] {
  if (["meld", "meld-existing", "mixed"].includes(scenario))
    return [
      {
        id: "ready",
        title: "Play phase",
        hold: 1000,
        detail:
          "Cards have already been drawn. Build a draft using cards from the hand.",
      },
      {
        id: "select",
        title: "Select hand cards",
        hold: 1000,
        selected: scenario === "mixed" ? 5 : scenario === "meld" ? 3 : 2,
        sound: "select",
        detail:
          scenario === "mixed"
            ? "Select two aces for the existing pile and three kings for a new meld. The complete draft will play both groups together."
            : "Select the hand cards to play. Each physical card keeps its own starting position for the slide.",
      },
      {
        id: "stage",
        title: "Stage draft",
        hold: 1400,
        staged: true,
        detail:
          scenario === "mixed"
            ? "The draft has two groups: an addition to the aces and a new pile of kings. The cards remain staged in the hand until the play is accepted."
            : "The selected cards stay in the hand, marked STAGED, until the draft is accepted.",
      },
      {
        id: "submit",
        title: "Play draft",
        hold: 900,
        staged: true,
        waiting: true,
        detail:
          "The whole draft is submitted. A rejected move leaves the cards where they are; an accepted move starts the slides.",
      },
      {
        id: "complete",
        title: "Cards slide into place",
        hold: 1600,
        complete: true,
        sound: "select",
        detail:
          "Every staged hand card slides face up to its own destination. Additions land in the existing meld and new groups land in their new melds. The hand closes its gaps when the cards arrive.",
      },
    ];
  const existing = scenario === "existing";
  return [
    {
      id: "ready",
      title: "Draw phase",
      hold: 1000,
      detail:
        "The deck and top discard are available. Only the top discard can be taken; the cards underneath stay put.",
    },
    {
      id: "pickup",
      title: "Click discard",
      hold: 1200,
      detail:
        "The discard slides up 5 pixels in 120ms and its outline fades in and out. Hand cards that cannot play with it dim and disable; legal existing melds get a dashed outline. The phase hint changes and the label below the card becomes Cancel.",
    },
    ...(!existing
      ? [
          {
            id: "first",
            title: "First match",
            hold: 800,
            selected: 1,
            sound: "select" as const,
            detail:
              "Select the first matching natural card. It lifts and shows a check. One match plus the discard is not enough to start a pile.",
          },
          {
            id: "second",
            title: "Second match",
            hold: 1000,
            selected: 2,
            sound: "select" as const,
            detail:
              "Select the second matching natural card. The pending discard is included automatically, so Stage meld becomes available for this three-card pile.",
          },
        ]
      : []),
    {
      id: "stage",
      title: existing ? "Click target pile" : "Click Stage meld",
      hold: 1400,
      staged: true,
      detail: existing
        ? "Click the existing matching pile. Its count shows +1 staged. The discard dims and is marked STAGED at the top of the discard pile; no hand cards are needed here."
        : "The two hand cards and the discard dim and are marked STAGED. The draft summary appears. The new meld is not shown on the board yet; all three cards stay where they were until the play is accepted.",
    },
    ...(scenario === "cancel"
      ? [
          {
            id: "cancel",
            title: "Cancel pickup",
            hold: 1200,
            canceled: true,
            detail:
              "The Cancel link below the discard clears the draft and selection. The card slides back, its Discard label returns, and drawing is available again. The hand and discard are unchanged; no request or sound is sent.",
          },
        ]
      : scenario === "rejected"
        ? [
            {
              id: "blocked",
              title: "Opening too small",
              hold: 1400,
              staged: true,
              detail:
                "Three nines total 30 points, below the required opening of at least 50. Play draft stays disabled; hover, focus, or tap it to see the minimum. The cards stay staged so you can add another meld. No request or placement sound is sent.",
            },
          ]
        : [
            {
              id: "submit",
              title: "Play draft",
              hold: 900,
              staged: true,
              waiting: true,
              detail:
                "The complete pickup and draft are submitted together. Controls disable while the reply is pending. No cards move yet. This review holds the reply for 0.9 seconds; live timing varies.",
            },
            {
              id: "complete",
              title: "Pickup accepted",
              hold: 1600,
              complete: true,
              sound: "select" as const,
              detail: existing
                ? "The discard slides into the existing meld. Once it lands, draw exactly one card from the deck to finish drawing for this turn."
                : "The discard and staged hand cards slide into the new meld. The opening includes the discard’s points. Once the cards land, the deck highlights for your second card.",
            },
            {
              id: "await-draw",
              title: "Draw from the deck",
              hold: 1400,
              complete: true,
              detail:
                "The deck highlights for exactly one card, without the +2 badge. Both discard controls stay disabled and explain that you need to draw first. You cannot take another discard or play more cards yet.",
            },
            {
              id: "draw-second",
              title: "Second card drawn",
              hold: 1200,
              complete: true,
              drawn: true,
              sound: "deal" as const,
              detail:
                "One card arrives from the deck. Once it lands you can play more melds or select one card to discard and finish the turn.",
            },
          ]),
  ];
}

function face(id: string, rank: string, suit: string): Card {
  return {
    id,
    rank,
    suit,
    value: rank === "A" ? 20 : 10,
    wild: false,
    redThree: false,
  };
}

/** Fixed private views; this rehearsal never creates or mutates a game. */
export function pickupFrame(
  scenario: PickupScenario,
  index: number,
): {
  snapshot: Snapshot;
  draftReview: {
    selected: string[];
    drafts: Draft[];
    pickup: boolean;
    busy: boolean;
    error: string;
    showOpeningRequirement?: boolean;
  };
} {
  if (["meld", "meld-existing", "mixed"].includes(scenario))
    return handDraftFrame(scenario, index);
  const beats = pickupBeats(scenario);
  const beat = beats[Math.max(0, Math.min(index, beats.length - 1))];
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
    mode: "individual",
    dealer: 5,
    duration: 2200,
  });
  const rank = scenario === "rejected" ? "9" : "A";
  const matches = [
    face("pickup-hand-clubs", rank, "clubs"),
    face("pickup-hand-hearts", rank, "hearts"),
  ];
  const top = face("pickup-top", rank, "spades");
  const lower = face("pickup-lower", "K", "diamonds");
  const hand = [...matches, ...samplePiles()[0].slice(2)];
  const existing = scenario === "existing";
  const previous = existing
    ? [
        face("pickup-existing-0", rank, "clubs"),
        face("pickup-existing-1", rank, "hearts"),
        face("pickup-existing-2", rank, "diamonds"),
      ]
    : [];
  const cards = existing ? [top] : [...matches, top];
  const meld: Meld = {
    id: "pickup-meld",
    creator: base.viewerId,
    kind: "set",
    rank,
    cards: beat.complete ? [...previous, ...cards] : previous,
    complete: false,
    dirty: false,
    bonus: 0,
  };
  const drawn = samplePiles()[1][1];
  const remaining = [
    ...(beat.complete && !existing ? hand.slice(2) : hand),
    ...(beat.drawn ? [drawn] : []),
  ];
  const snapshot: Snapshot = {
    ...base,
    code: "PICKUP-REHEARSAL",
    token: `pickup-${scenario}-${beat.id}`,
    opening: { id: "pickup-rehearsal", ready: [base.viewerId], complete: true },
    hand: remaining,
    discard: beat.complete ? lower : top,
    discardCount: beat.complete ? 3 : 4,
    phase: beat.drawn ? "play" : "draw",
    pickupDrawPending: Boolean(beat.complete && !beat.drawn),
    drawCount: beat.complete && !beat.drawn ? 1 : 2,
    stockCount: base.stockCount - Number(Boolean(beat.drawn)),
    players: base.players.map((player) =>
      player.id === base.viewerId
        ? { ...player, handCount: remaining.length }
        : player,
    ),
    sides: base.sides.map((side) =>
      side.id === 0
        ? {
            ...side,
            opened: existing || Boolean(beat.complete),
            melds: existing || beat.complete ? [meld] : [],
          }
        : side,
    ),
  };
  const draft: Draft = {
    cardIds: cards.map((card) => card.id),
    ...(existing ? { meldId: meld.id } : { kind: "set" }),
  };
  return {
    snapshot,
    draftReview: {
      selected: matches.slice(0, beat.selected ?? 0).map((card) => card.id),
      drafts: beat.staged ? [draft] : [],
      pickup: beat.id !== "ready" && !beat.complete && !beat.canceled,
      busy: Boolean(beat.waiting),
      error: "",
      showOpeningRequirement: beat.id === "blocked",
    },
  };
}

function handDraftFrame(scenario: PickupScenario, index: number) {
  const base = pickupFrame("new", 0).snapshot;
  const beats = pickupBeats(scenario);
  const beat = beats[Math.max(0, Math.min(index, beats.length - 1))];
  const existing = scenario !== "meld";
  const mixed = scenario === "mixed";
  const aces = [
    face("hand-ace-clubs", "A", "clubs"),
    face("hand-ace-hearts", "A", "hearts"),
    face("hand-ace-spades", "A", "spades"),
  ].slice(0, existing ? 2 : 3);
  const kings = mixed
    ? [
        face("hand-king-clubs", "K", "clubs"),
        face("hand-king-hearts", "K", "hearts"),
        face("hand-king-spades", "K", "spades"),
      ]
    : [];
  const played = [...aces, ...kings];
  const hand = [...played, ...samplePiles()[0].slice(0, 11 - played.length)];
  const oldAces = existing
    ? [
        face("table-ace-0", "A", "clubs"),
        face("table-ace-1", "A", "hearts"),
        face("table-ace-2", "A", "diamonds"),
      ]
    : [];
  const meld = (id: string, rank: string, cards: Card[]): Meld => ({
    id,
    rank,
    cards,
    creator: base.viewerId,
    kind: "set",
    complete: false,
    dirty: false,
    bonus: 0,
  });
  const remaining = beat.complete ? hand.slice(played.length) : hand;
  const snapshot: Snapshot = {
    ...base,
    phase: "play",
    token: `draft-${scenario}-${beat.id}`,
    hand: remaining,
    players: base.players.map((player) =>
      player.id === base.viewerId
        ? { ...player, handCount: remaining.length }
        : player,
    ),
    sides: base.sides.map((side) =>
      side.id === 0
        ? {
            ...side,
            opened: existing || Boolean(beat.complete),
            melds: [
              ...(existing || beat.complete
                ? [
                    meld("hand-aces", "A", [
                      ...oldAces,
                      ...(beat.complete ? aces : []),
                    ]),
                  ]
                : []),
              ...(mixed && beat.complete
                ? [meld("hand-kings", "K", kings)]
                : []),
            ],
          }
        : side,
    ),
  };
  const drafts: Draft[] = [
    {
      cardIds: aces.map((card) => card.id),
      ...(existing ? { meldId: "hand-aces" } : { kind: "set" }),
    },
    ...(mixed
      ? [{ cardIds: kings.map((card) => card.id), kind: "set" as const }]
      : []),
  ];
  return {
    snapshot,
    draftReview: {
      selected: played.slice(0, beat.selected ?? 0).map((card) => card.id),
      drafts: beat.staged ? drafts : [],
      pickup: false,
      busy: Boolean(beat.waiting),
      error: "",
    },
  };
}
