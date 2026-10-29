import { useState } from "react";
import { Room, type RoomRehearsal } from "./Room";
import { INITIAL_OPENING, openingSnapshot } from "../lib/openingSequence";
import { SettlementPiles } from "../components/ScoreCount";
import { SCORING_SCENARIOS, scoringSequence } from "../lib/scoringSequence";
import type { Card, Meld, Snapshot } from "../types";

const suits = ["hearts", "spades", "diamonds", "clubs"];
const settlementBeat = scoringSequence(
  SCORING_SCENARIOS.find((scenario) => scenario.id === "uncovered")!,
).find((beat) => beat.kind === "settled");
function face(id: string, rank: string, suit: string): Card {
  return {
    id,
    rank,
    suit,
    value:
      rank === "Joker"
        ? 50
        : ["A", "2"].includes(rank)
          ? 20
          : Number(rank) <= 8
            ? 5
            : 10,
    wild: ["2", "Joker"].includes(rank),
    redThree: rank === "3" && ["hearts", "diamonds"].includes(suit),
  };
}

function boardSnapshot(): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Sam", "Kelly", "John"],
    mode: "individual",
    dealer: 3,
    duration: 0,
  });
  const hand = [
    ["Joker", "joker"],
    ["A", "hearts"],
    ["A", "clubs"],
    ["K", "hearts"],
    ["K", "clubs"],
    ["K", "spades"],
    ["Q", "diamonds"],
    ["J", "spades"],
    ["10", "hearts"],
    ["9", "clubs"],
    ["8", "diamonds"],
    ["7", "hearts"],
    ["6", "spades"],
    ["4", "clubs"],
    ["2", "spades"],
  ].map(([rank, suit], i) => face(`board-hand-${i}`, rank, suit));
  return {
    ...base,
    code: "BOARD-PREVIEW",
    token: "board-preview",
    revision: 1,
    round: 5,
    phase: "play",
    actorId: base.viewerId,
    opening: {
      id: "board-preview",
      ready: base.players.map((p) => p.id),
      complete: true,
    },
    stockCount: 162,
    discardCount: 10,
    discard: face("board-discard", "9", "diamonds"),
    hand,
    message: "Your turn. Build your melds, then discard to finish.",
    players: base.players.map((player, i) => ({
      ...player,
      handCount: i === 0 ? hand.length : 11,
      redThrees: Array.from({ length: 3 }, (_, j) =>
        face(`board-red-${i}-${j}`, "3", j % 2 ? "diamonds" : "hearts"),
      ),
    })),
    sides: base.sides.map((side, team) => {
      const melds: Meld[] = [
        "A",
        "K",
        "Q",
        "J",
        "10",
        "9",
        "8",
        "7",
        "6",
        "5",
        "4",
        "2",
      ].map((rank, i) => {
        const complete = i >= 6;
        const dirty = i % 2 === 1 && rank !== "2";
        return {
          id: `board-${team}-meld-${i}`,
          creator: base.players[team].id,
          rank,
          kind: "set",
          complete,
          dirty,
          bonus: complete ? (dirty ? 300 : 500) : 0,
          cards: Array.from({ length: complete ? 7 : 6 }, (_, j) =>
            face(
              `board-${team}-meld-${i}-card-${j}`,
              dirty && j < 2 ? "2" : rank,
              suits[j % suits.length],
            ),
          ),
        };
      });
      return {
        ...side,
        score: [3965, 365, 2575, 1915][team],
        opened: true,
        opening: 90,
        clean: melds.filter((meld) => meld.complete && !meld.dirty).length,
        dirty: melds.filter((meld) => meld.complete && meld.dirty).length,
        melds,
      };
    }),
  };
}

/** A fixed desktop layout sample; Room keeps its normal sizing and controls. */
export function BoardPreview() {
  const [replay, setReplay] = useState(0);
  const [showSettlement, setShowSettlement] = useState(true);
  const [snapshot] = useState(boardSnapshot);
  const [draftReview] = useState<RoomRehearsal["draftReview"]>({
    selected: ["board-hand-3", "board-hand-4", "board-hand-5"],
    drafts: [
      { cardIds: ["board-hand-1", "board-hand-2"], meldId: "board-0-meld-0" },
    ],
    pickup: false,
    busy: false,
    error: "",
  });
  return (
    <Room
      key={replay}
      rehearsal={{
        snapshot,
        onChoose: () => {},
        meldAnimate: false,
        draftReview,
        footerSummary: <SettlementPiles beat={settlementBeat} />,
        footerSummaryVisible: showSettlement,
        previewControls: (
          <>
            <p>
              Desktop layout sample · six-card piles, seven-card books, red
              threes, a staged draft, and settlement piles.
            </p>
            <button
              className="text-button"
              onClick={() => setShowSettlement((visible) => !visible)}
            >
              {showSettlement
                ? "Hide settlement piles"
                : "Show settlement piles"}
            </button>
            <button
              className="text-button"
              onClick={() => setReplay((value) => value + 1)}
            >
              Reset full board
            </button>
            <hr />
          </>
        ),
      }}
    />
  );
}
