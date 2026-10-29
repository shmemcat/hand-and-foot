import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { INITIAL_OPENING, openingSnapshot } from "../lib/openingSequence";
import type { Card, Meld, Snapshot } from "../types";
import "../draw-preview.css";

export type BookExample =
  | "clean"
  | "dirty"
  | "reds"
  | "first"
  | "whole"
  | "add-clean"
  | "add-dirty";
const face = (id: string, rank: string, suit = "hearts"): Card => ({
  id,
  rank,
  suit,
  value: rank === "3" ? -300 : ["A", "2"].includes(rank) ? 20 : 10,
  wild: rank === "2",
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
  const last =
    example === "reds"
      ? reds[2]
      : face(
          "closing-last-card",
          ["dirty", "add-dirty"].includes(example) ? "2" : "K",
        );
  const book = set(
    "closing-book",
    example === "dirty" ? "Q" : "K",
    adding ? 7 : 6,
    adding || played,
  );
  const playedCards = example === "whole" ? [...book.cards, last] : [last];
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
  const hand = [
    ...base.hand.filter((card) => !card.redThree).slice(0, 4),
    ...(played ? [] : playedCards),
  ];
  const melds = [
    ...(example === "first" ? [] : [set("existing-book", "A", 7, true)]),
    ...(example === "reds" || (example === "whole" && !played) ? [] : [book]),
    set("remaining-open", "10", 3),
  ];
  return {
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
    message: played
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
            footCount: 0,
            inFoot: true,
            redThrees: example === "reds" ? reds.slice(0, played ? 3 : 2) : [],
          }
        : player,
    ),
    sides: base.sides.map((side) =>
      side.id === 0 ? { ...side, opened: true, melds } : side,
    ),
  };
}

export function BookPreview() {
  const [example, setExample] = useState<BookExample>("clean");
  const [played, setPlayed] = useState(false);
  const [replay, setReplay] = useState(0);
  const [speed, setSpeed] = useState(0.5);
  const [paused, setPaused] = useState(false);
  const [moving, setMoving] = useState(false);
  const adding = example === "add-clean" || example === "add-dirty";
  const snapshot = useMemo(
    () => bookExample(example, played, replay),
    [example, played, replay],
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
          <h1>{adding ? "Adding to a book" : "Closing a book"}</h1>
          <small>
            {adding
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
      <Room
        rehearsal={{
          snapshot,
          onChoose: () => {},
          meldSpeed: speed,
          meldPaused: paused,
          onMeldMotion: setMoving,
        }}
      />
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
