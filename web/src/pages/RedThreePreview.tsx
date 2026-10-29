import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { useSound } from "../context/SoundContext";
import { INITIAL_OPENING, openingSnapshot } from "../lib/openingSequence";
import type { Card, Snapshot } from "../types";
import "../draw-preview.css";

const redThrees: Card[] = Array.from({ length: 3 }, (_, index) => ({
  id: `preview-red-three-${index}`,
  rank: "3",
  suit: index % 2 ? "diamonds" : "hearts",
  value: -300,
  wild: false,
  redThree: true,
}));

export function RedThreePreview() {
  const sound = useSound();
  const [mode, setMode] = useState("third");
  const [played, setPlayed] = useState(false);
  const [replay, setReplay] = useState(0);
  const base = useMemo(
    () =>
      openingSnapshot({
        state: { ...INITIAL_OPENING, step: 7, choice: 0 },
        names: ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"],
        mode: "individual",
        dealer: 3,
        duration: 2200,
      }),
    [],
  );
  const before = mode === "third" ? 2 : 0;
  const hand = [
    ...base.hand.filter((card) => !card.redThree),
    ...(played ? [] : redThrees.slice(before)),
  ];
  const snapshot: Snapshot = {
    ...base,
    code: "RED-THREE-REHEARSAL",
    opening: {
      id: "red-three-rehearsal",
      ready: [base.viewerId],
      complete: true,
    },
    phase: "play",
    hand,
    message: played
      ? "Three red 3s! Replay to see and hear the celebration again."
      : mode === "third"
        ? "Two red 3s are down. Play the third to celebrate."
        : "Play all three red 3s together to celebrate.",
    players: base.players.map((player) =>
      player.id === base.viewerId
        ? {
            ...player,
            handCount: hand.length,
            redThrees: redThrees.slice(0, played ? 3 : before),
          }
        : player,
    ),
    sides: base.sides.map((side) => ({ ...side, opened: side.id === 0 })),
  };
  useEffect(() => {
    if (!replay) return;
    // Restore the starting pile before using the live game's celebration hook.
    const timer = window.setTimeout(() => setPlayed(true), 100);
    return () => clearTimeout(timer);
  }, [replay]);

  function reset() {
    setPlayed(false);
    setReplay(0);
  }
  function toggleSound() {
    if (sound.muted || sound.volume === 0) {
      if (sound.volume === 0) sound.setVolume(0.15);
      sound.setMuted(false);
    } else sound.setMuted(true);
  }
  const audible = !sound.muted && sound.volume > 0;
  return (
    <div className="draw-rehearsal">
      <h1 className="sr-only">Red 3 celebration</h1>
      <div className="draw-review-bar">
        <span>
          Red 3 celebration <small>Replay the sound and confetti.</small>
        </span>
        <label>
          Play{" "}
          <select
            aria-label="Red 3 play"
            value={mode}
            onChange={(event) => {
              setMode(event.target.value);
              reset();
            }}
          >
            <option value="third">Third red 3</option>
            <option value="three">All three together</option>
          </select>
        </label>
        <button
          className="button small secondary"
          aria-pressed={audible}
          onClick={toggleSound}
        >
          {audible ? "Sound on" : "Sound off"}
        </button>
        <button className="button small secondary" onClick={reset}>
          Reset
        </button>
        <button
          className="button small"
          onClick={() => {
            setPlayed(false);
            setReplay((value) => value + 1);
          }}
        >
          {played ? "Replay celebration" : "Play celebration"}
        </button>
      </div>
      <Room rehearsal={{ snapshot, onChoose: () => {} }} />
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
