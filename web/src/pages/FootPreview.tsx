import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { FootGather } from "../components/FootGather";
import { MeldCards } from "../components/MeldCards";
import {
  MELD_FLIGHT_MS,
  type CardPosition,
  type MeldFlight,
} from "../hooks/useMeldMotion";
import { useSound } from "../context/SoundContext";
import {
  FINAL_HAND_CARD,
  FOOT_CARDS,
  FOOT_GATHER_DELAY_MS,
  footGatherDuration,
  footSnapshot,
  type FootBeat,
  type FootEntry,
} from "../lib/footSequence";
import "../draw-preview.css";
import "../foot-preview.css";

const position = (element: Element): CardPosition => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};

export function FootPreview() {
  const [entry, setEntry] = useState<FootEntry>("play");
  const [speed, setSpeed] = useState(1);
  const [beat, setBeat] = useState<FootBeat>("before");
  const [replay, setReplay] = useState(0);
  const [autoplay, setAutoplay] = useState(false);
  const [flight, setFlight] = useState<MeldFlight | null>(null);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const board = useRef<HTMLDivElement>(null);
  const source = useRef<CardPosition | null>(null);
  const sound = useSound();
  const playSound = useRef(sound.play);
  playSound.current = sound.play;
  const snapshot = useMemo(
    () => footSnapshot(entry, beat, replay),
    [entry, beat, replay],
  );
  const review = useMemo(
    () => ({
      selected: [],
      drafts: [],
      pickup: false,
      busy: beat !== "ready",
      error: "",
    }),
    [beat],
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useLayoutEffect(() => {
    if (!autoplay || beat !== "before") return;
    const card = board.current?.querySelector(".hand-card .card");
    source.current = card ? position(card) : null;
    setAutoplay(false);
    setBeat("leaving");
    playSound.current("slide");
  }, [autoplay, beat]);
  useEffect(() => {
    if (beat !== "leaving" && beat !== "gathering") return;
    const timer = window.setTimeout(
      () => {
        setFlight(null);
        setBeat(beat === "leaving" ? "gathering" : "ready");
      },
      reduced
        ? 0
        : (beat === "leaving"
            ? MELD_FLIGHT_MS + 100
            : footGatherDuration(FOOT_CARDS.length)) / speed,
    );
    return () => clearTimeout(timer);
  }, [beat, speed, reduced, replay]);
  useEffect(() => {
    if (beat !== "gathering") return;
    const timer = window.setTimeout(
      () => playSound.current("deal"),
      reduced ? 0 : FOOT_GATHER_DELAY_MS / speed,
    );
    return () => clearTimeout(timer);
  }, [beat, speed, reduced]);
  useLayoutEffect(() => {
    if (beat !== "leaving" || reduced || !source.current) return;
    const target = board.current?.querySelector(
      entry === "play"
        ? `.meld-card-layer[data-card-id="${FINAL_HAND_CARD.id}"] .card`
        : ".discard-pickup .card",
    );
    if (!target) return;
    setFlight({
      key: replay,
      token: snapshot.token,
      before: footSnapshot(entry, "before", replay),
      speed,
      boardHeight: 0,
      cards: [
        {
          card: FINAL_HAND_CARD,
          from: source.current,
          to: position(target),
          meldId: entry === "play" ? "foot-meld-K" : "discard",
        },
      ],
    });
  }, [beat, entry, speed, replay, reduced, snapshot.token]);

  function reset() {
    setAutoplay(false);
    setBeat("before");
    setFlight(null);
    setReplay((value) => value + 1);
  }
  function start() {
    const card = board.current?.querySelector(".hand-card .card");
    source.current = beat === "before" && card ? position(card) : null;
    // Replays restore the one-card hand first so its source is measured afresh.
    if (beat !== "before") {
      reset();
      setAutoplay(true);
      return;
    }
    setBeat("leaving");
    playSound.current("slide");
  }
  return (
    <div className="foot-rehearsal">
      <div className="draw-review-bar">
        <div className="foot-review-heading">
          <h1>Into your foot</h1>
          <small>Single player · Desktop preview</small>
        </div>
        <label>
          Last card{" "}
          <select
            aria-label="Foot entry method"
            value={entry}
            onChange={(event) => {
              setEntry(event.target.value as FootEntry);
              reset();
            }}
          >
            <option value="play">Play it · Keep playing</option>
            <option value="discard">Discard it · Wait until next turn</option>
          </select>
        </label>
        <label>
          Speed{" "}
          <select
            aria-label="Foot playback speed"
            value={speed}
            onChange={(event) => {
              setSpeed(Number(event.target.value));
              reset();
            }}
          >
            <option value={1}>1× · Natural</option>
            <option value={0.5}>0.5× · Slow</option>
            <option value={0.25}>0.25× · Very slow</option>
          </select>
        </label>
        <button className="button small secondary" onClick={reset}>
          Reset
        </button>
        <button className="button small" onClick={start}>
          {beat === "before"
            ? entry === "play"
              ? "Play last card"
              : "Discard last card"
            : "Replay"}
        </button>
      </div>
      <div
        ref={board}
        className="foot-rehearsal-board"
        data-beat={beat}
        data-entry={entry}
      >
        <FootGather gathering={beat === "gathering" && !reduced} speed={speed}>
          <Room
            rehearsal={{
              snapshot,
              onChoose: () => {},
              meldAnimate: false,
              draftReview: review,
              footSource:
                beat === "gathering" && !reduced
                  ? { topCard: FOOT_CARDS[0], count: FOOT_CARDS.length }
                  : undefined,
            }}
          />
        </FootGather>
        {flight && <MeldCards flight={flight} paused={false} />}
      </div>
      <p className="foot-review-note">
        {entry === "play"
          ? "Play the last card: your foot opens into your hand and you can keep playing this turn."
          : "Discard the last card: your foot opens into your hand, then waits for your next turn."}{" "}
        Cards cascade from the foot at the bottom right; the foot pile fades
        away as they leave.
      </p>
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
