import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import {
  INITIAL_OPENING,
  openingSnapshot,
  samplePiles,
} from "../lib/openingSequence";
import "../draw-preview.css";

export function DrawPreview() {
  const [count, setCount] = useState(2);
  const [speed, setSpeed] = useState(1);
  const [delivered, setDelivered] = useState(false);
  const [replay, setReplay] = useState(0);
  const base = useMemo(
    () =>
      openingSnapshot({
        state: { ...INITIAL_OPENING, step: 7, choice: 0 },
        names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
        mode: "individual",
        dealer: 5,
        duration: 2200,
      }),
    [],
  );
  const extra = samplePiles()[1].slice(0, count);
  const snapshot = {
    ...base,
    code: "DRAW-REHEARSAL",
    opening: { id: "draw-rehearsal", ready: [base.viewerId], complete: true },
    drawCount: count,
    message: delivered
      ? "Cards drawn. Replay to watch again."
      : `Your turn. Draw ${count} cards, or play the top discard.`,
    phase: delivered ? ("play" as const) : ("draw" as const),
    hand: delivered ? [...base.hand, ...extra] : base.hand,
    stockCount: base.stockCount - (delivered ? count : 0),
    players: base.players.map((player) =>
      player.id === base.viewerId
        ? { ...player, handCount: base.hand.length + (delivered ? count : 0) }
        : player,
    ),
  };
  function replayDraw() {
    setDelivered(false);
    setReplay((previous) => previous + 1);
  }
  return (
    <div className="draw-rehearsal">
      <h1 className="sr-only">Draw rehearsal</h1>
      <div className="draw-review-bar">
        <span>
          Draw rehearsal <small>Replay as often as you like.</small>
        </span>
        <label>
          Cards{" "}
          <select
            aria-label="Cards per draw"
            value={count}
            onChange={(event) => {
              setCount(Number(event.target.value));
              replayDraw();
            }}
          >
            <option value={2}>2 · Normal draw</option>
            <option value={3}>3 · Catch-up draw</option>
          </select>
        </label>
        <label>
          Speed{" "}
          <select
            aria-label="Draw playback speed"
            value={speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value));
              replayDraw();
            }}
          >
            <option value={1}>1× · Natural</option>
            <option value={0.5}>0.5× · Slow</option>
            <option value={0.25}>0.25× · Very slow</option>
          </select>
        </label>
        <button className="button small" onClick={replayDraw}>
          {delivered ? "Replay draw" : "Play draw"}
        </button>
      </div>
      <Room
        rehearsal={{
          snapshot,
          onChoose: () => {},
          onDraw: () => setDelivered(true),
          drawReplay: replay,
          drawSpeed: speed,
        }}
      />
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
