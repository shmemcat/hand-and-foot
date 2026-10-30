import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { BoardHeightAudit } from "../components/BoardHeightAudit";
import { INITIAL_OPENING, openingSnapshot } from "../lib/openingSequence";
import { FOOT_CARDS } from "../lib/footSequence";
import type { Card, Meld, Snapshot } from "../types";
import "../draw-preview.css";

export type BookExample =
  | "clean"
  | "dirty"
  | "reds"
  | "first"
  | "whole"
  | "add-clean"
  | "add-dirty"
  | "wild-two"
  | "wild-joker"
  | "last"
  | "multiple"
  | "crowded"
  | "wrapped"
  | "straight"
  | "foot"
  | "finish-wild"
  | "overfull"
  | "burst";
type BookMode = "practice" | "online" | "partnership" | "bot" | "reduced";
const face = (id: string, rank: string, suit = "hearts"): Card => ({
  id,
  rank,
  suit,
  value:
    rank === "3"
      ? -300
      : rank === "Joker"
        ? 50
        : ["A", "2"].includes(rank)
          ? 20
          : 10,
  wild: rank === "2" || rank === "Joker",
  redThree: rank === "3",
});
const set = (
  id: string,
  rank: string,
  count: number,
  complete = false,
): Meld => ({
  id,
  creator: "opening-seat-0",
  rank,
  kind: "set",
  dirty: false,
  complete,
  bonus: complete ? 500 : 0,
  cards: Array.from({ length: count }, (_, index) =>
    face(
      `${id}-${index}`,
      rank,
      ["hearts", "clubs", "diamonds", "spades"][index % 4],
    ),
  ),
});
export function bookExample(
  example: BookExample,
  played: boolean,
  replay = 0,
  mode: BookMode = "practice",
): Snapshot {
  const base = openingSnapshot({
    state: { ...INITIAL_OPENING, step: 7, choice: 0 },
    names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
    mode: "individual",
    dealer: 3,
    duration: 2200,
  });
  const reds = Array.from({ length: 3 }, (_, index) =>
    face(`closing-red-${index}`, "3", index % 2 ? "diamonds" : "hearts"),
  );
  const adding = example === "add-clean" || example === "add-dirty";
  const openWild = example === "wild-two" || example === "wild-joker";
  let last =
    example === "reds"
      ? reds[2]
      : face(
          "closing-last-card",
          example === "wild-joker"
            ? "Joker"
            : ["dirty", "add-dirty", "wild-two", "finish-wild"].includes(
                  example,
                )
              ? "2"
              : "K",
          example === "wild-joker" ? "joker" : "hearts",
        );
  const book = set(
    "closing-book",
    example === "dirty" ? "Q" : "K",
    openWild ? 4 : adding ? 7 : 6,
    adding || (played && !openWild),
  );
  if (example === "straight") {
    book.kind = "run";
    book.rank = "4–10";
    book.cards = Array.from({ length: 6 }, (_, i) =>
      face(`straight-${i}`, String(i + 4), "clubs"),
    );
    last = face("closing-last-card", "10", "clubs");
  }
  if (openWild && played) book.dirty = true;
  if (example === "finish-wild" && played) {
    book.dirty = true;
    book.bonus = 300;
  }
  const extra = face("closing-extra-card", "K", "diamonds");
  const burstJacks = ["clubs", "hearts", "spades"].map((suit, i) =>
    face(`burst-jack-${i}`, "J", suit),
  );
  const burstWild = face("burst-wild", "2", "diamonds");
  const second = set("second-closing-book", "Q", 6, played);
  second.dirty = true;
  second.bonus = played ? 300 : 0;
  second.cards = second.cards.map((card, i) =>
    i >= 4 ? face(card.id, "2", card.suit) : card,
  );
  const secondLast = face("second-closing-last-card", "Q", "clubs");
  if (played) second.cards.push(secondLast);
  const playedCards =
    example === "whole"
      ? [...book.cards, last]
      : example === "multiple"
        ? [last, secondLast, reds[2]]
        : example === "burst"
          ? [last, secondLast, ...burstJacks, burstWild]
          : example === "overfull"
            ? [last, extra]
            : [last];
  if (example === "dirty") {
    book.dirty = true;
    book.bonus = played ? 300 : 0;
  }
  if (example === "add-dirty") {
    book.cards = book.cards.map((card, index) =>
      index >= 5 ? face(card.id, "2", card.suit) : card,
    );
    book.dirty = true;
    book.bonus = 300;
  }
  if (played) book.cards.push(last);
  if (example === "overfull" && played) book.cards.push(extra);
  let hand = [
    ...base.hand
      .filter((card) => !card.redThree)
      .slice(0, example === "burst" ? 5 : 4),
    ...(played ? [] : playedCards),
  ];
  if (example === "foot") hand = played ? FOOT_CARDS : [last];
  const dense = example === "crowded" || example === "wrapped";
  const melds = [
    ...(["first", "last"].includes(example)
      ? []
      : [set("existing-book", "A", 7, true)]),
    ...(example === "reds" || (example === "whole" && !played) ? [] : [book]),
    ...(example === "last" ? [] : [set("remaining-open", "10", 3)]),
    ...(["multiple", "burst"].includes(example) ? [second] : []),
    ...(example === "burst"
      ? [
          {
            ...set("burst-eights", "8", 3),
            cards: [
              ...set("burst-eights", "8", 3).cards,
              ...(played ? [burstWild] : []),
            ],
            dirty: played,
          },
          ...(played
            ? [{ ...set("burst-jacks", "J", 3), cards: burstJacks }]
            : []),
        ]
      : []),
    ...(dense
      ? Array.from({ length: example === "wrapped" ? 13 : 7 }, (_, i) =>
          set(
            `dense-open-${i}`,
            ["A", "Q", "J", "9", "8", "7", "6", "5", "4"][i % 9],
            6,
          ),
        )
      : []),
    ...(dense
      ? Array.from({ length: example === "wrapped" ? 11 : 7 }, (_, i) =>
          set(
            `dense-book-${i}`,
            ["A", "Q", "J", "9", "8", "7", "6", "5", "4"][i % 9],
            7,
            true,
          ),
        )
      : []),
  ];
  const snapshot: Snapshot = {
    ...base,
    code: `CLOSING-${example}-${replay}`,
    revision: played ? 2 : 1,
    token: `closing-${replay}`,
    phase: "play",
    actorId: base.viewerId,
    hand,
    footTop: null,
    opening: {
      id: `closing-${replay}`,
      ready: [base.viewerId],
      complete: true,
    },
    message: openWild
      ? played
        ? "The bottom card slides down as the wild joins the meld."
        : "Add a wild to watch the bottom card make room above it."
      : played
        ? adding
          ? example === "add-clean"
            ? "A matching natural lands. The book stays clean."
            : "A wild lands in the dirty book. Naturals still outnumber wilds."
          : "The cards land, the stack closes, and the book moves up."
        : adding
          ? "Add a card that fits this completed book. Its type stays the same."
          : "Complete the open pile to watch it close and move into the book section.",
    players: base.players.map((player) =>
      player.id === base.viewerId
        ? {
            ...player,
            handCount: hand.length,
            footCount: example === "foot" && !played ? 11 : 0,
            inFoot: example !== "foot" || played,
            redThrees: ["reds", "multiple"].includes(example)
              ? reds.slice(0, played ? 3 : 2)
              : [],
          }
        : player,
    ),
    sides: base.sides.map((side) =>
      side.id === 0 ? { ...side, opened: true, melds } : side,
    ),
  };
  if (mode === "online") snapshot.playMode = "online";
  if (mode === "bot") snapshot.viewerId = snapshot.players[1].id;
  if (mode === "partnership") {
    snapshot.scoringMode = "partnership";
    snapshot.players = snapshot.players.map((player, i) => ({
      ...player,
      team: i % 3,
    }));
    snapshot.sides = snapshot.sides.slice(0, 3).map((side) => ({
      ...side,
      name: snapshot.players
        .filter((player) => player.team === side.id)
        .map((player) => player.name)
        .join(" & "),
    }));
  }
  return snapshot;
}

export function BookPreview() {
  const [example, setExample] = useState<BookExample>("clean");
  const [mode, setMode] = useState<BookMode>("practice");
  const [played, setPlayed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [speed, setSpeed] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [moving, setMoving] = useState(false);
  const adding =
    example === "add-clean" ||
    example === "add-dirty" ||
    example === "wild-two" ||
    example === "wild-joker";
  const openWild = example === "wild-two" || example === "wild-joker";
  const snapshot = useMemo(
    () => bookExample(example, played, replay, mode),
    [example, played, replay, mode],
  );
  useEffect(() => {
    if (!replay) return;
    const timer = window.setTimeout(() => setPlayed(true), 100);
    return () => clearTimeout(timer);
  }, [replay]);
  function reset() {
    setPlayed(false);
    setReplay(0);
    setPaused(false);
  }
  return (
    <div className="draw-rehearsal">
      <div className="draw-review-bar">
        <div>
          <h1>
            {openWild
              ? "Adding a wild to a meld"
              : adding
                ? "Adding to a book"
                : "Closing a book"}
          </h1>
          <small>
            {openWild
              ? "Bottom card slides down → wild lands above it"
              : adding
                ? "Card lands → count updates → book keeps its type"
                : "Last card → gather the stack → move up"}
          </small>
        </div>
        <label>
          Example{" "}
          <select
            aria-label="Book closing example"
            value={example}
            onChange={(event) => {
              setExample(event.target.value as BookExample);
              reset();
            }}
          >
            <option value="clean">Clean book</option>
            <option value="first">First completed book</option>
            <option value="dirty">Dirty book</option>
            <option value="reds">Third red 3</option>
            <option value="whole">Seven cards at once</option>
            <option value="add-clean">Add a natural to a clean book</option>
            <option value="add-dirty">Add a wild to a dirty book</option>
            <option value="wild-two">Add a two to an open meld</option>
            <option value="wild-joker">Add a Joker to an open meld</option>
            <option value="last">Close the only open pile</option>
            <option value="multiple">
              Close two books and red threes together
            </option>
            <option value="crowded">
              Crowded open piles and completed books
            </option>
            <option value="wrapped">Long rows of piles and books</option>
            <option value="straight">Complete a straight</option>
            <option value="foot">Complete a book and pick up foot</option>
            <option value="finish-wild">
              Finish a clean six-card pile with a wild
            </option>
            <option value="overfull">Add two cards to a six-card pile</option>
            <option value="burst">Play six foot cards across four piles</option>
          </select>
        </label>
        <label>
          Table{" "}
          <select
            aria-label="Book preview table"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value as BookMode);
              reset();
            }}
          >
            <option value="practice">Individual practice</option>
            <option value="online">Individual online</option>
            <option value="partnership">Partnership</option>
            <option value="bot">Watching another player</option>
            <option value="reduced">Reduced motion</option>
          </select>
        </label>
        <label>
          Speed{" "}
          <select
            aria-label="Book closing speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
            disabled={moving}
          >
            <option value={1}>1×</option>
            <option value={0.5}>0.5×</option>
            <option value={0.25}>0.25×</option>
          </select>
        </label>
        <button className="button small secondary" onClick={reset}>
          Reset
        </button>
        <button
          className="button small secondary"
          disabled={!moving}
          onClick={() => setPaused(!paused)}
        >
          {paused ? "Resume" : "Pause"}
        </button>
        <button
          className="button small"
          disabled={moving}
          onClick={() => {
            setPlayed(false);
            setPaused(false);
            setReplay((value) => value + 1);
          }}
        >
          {adding
            ? played
              ? "Replay addition"
              : "Play addition"
            : played
              ? "Replay closing"
              : "Play closing"}
        </button>
      </div>
      <BoardHeightAudit
        scope={`${example}:${mode}`}
        replay={replay}
        duration={(example === "foot" ? 3000 : 1600) / speed + 500}
      />
      <Room
        rehearsal={{
          snapshot,
          onChoose: () => {},
          meldSpeed: speed,
          meldPaused: paused,
          meldAnimate: mode !== "reduced",
          footAnimate: example === "foot" && mode !== "reduced",
          onMeldMotion: setMoving,
        }}
      />
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
