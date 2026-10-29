import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Room } from "./Room";
import {
  REPLACEMENT_DRAW_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
  DRAW_FLIGHT_MS,
} from "../hooks/useDrawMotion";
import {
  turnMotionExample,
  type TurnExample,
  type TurnScene,
} from "../lib/turnMotionExamples";
import "../draw-preview.css";
import "../motion-preview.css";

const scenes: {
  id: TurnScene;
  label: string;
  description: string;
  examples: [TurnExample, string][];
}[] = [
  {
    id: "public",
    label: "Opponent hand",
    description:
      "Face-down draws on the left · token plays · right-edge discards",
    examples: [
      ["two", "Draw two cards"],
      ["meld", "Play and collapse hand"],
      ["discard", "Flip a right-edge discard"],
      ["replace", "Replace a red three"],
      ["replace-two", "Replace two red threes"],
      ["pickup", "Play the top discard, then draw"],
      ["offscreen", "Another board · divider cutoff"],
    ],
  },
  {
    id: "replacement",
    label: "Red 3 replacement",
    description:
      "Red onto discard → replacement arrives → final discard covers it",
    examples: [
      ["one", "One red 3"],
      ["two", "Two red 3s"],
    ],
  },
  {
    id: "hand",
    label: "Hand spacing",
    description: "Cards leave → remaining hand slides into sorted positions",
    examples: [
      ["meld", "Play three aces"],
      ["discard", "Discard a ten"],
    ],
  },
  {
    id: "draw",
    label: "Large-hand draw",
    description:
      "Only scroll when every drawn card lands outside the visible hand",
    examples: [
      ["offscreen", "Both cards off screen"],
      ["mixed", "One visible, one off screen"],
    ],
  },
  {
    id: "bot",
    label: "Bot melds",
    description: "Cards arrive on Poppy’s board before a completed book closes",
    examples: [
      ["new", "New meld"],
      ["add", "Add to an open pile"],
      ["close", "Close a book"],
    ],
  },
];
export function MotionPreview() {
  const [params, setParams] = useSearchParams();
  const scene =
    scenes.find((scene) => scene.id === params.get("scene")) ??
    scenes.find((scene) => scene.id === "replacement")!;
  return (
    <div className="draw-rehearsal turn-motion-preview">
      <h1>Play animations</h1>
      <nav className="motion-preview-tabs" aria-label="Animation previews">
        {scenes.map((item) => (
          <button
            className={`button small ${item.id === scene.id ? "" : "secondary"}`}
            aria-pressed={item.id === scene.id}
            key={item.id}
            onClick={() => setParams({ scene: item.id })}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <MotionStudy key={scene.id} scene={scene} />
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
function MotionStudy({ scene }: { scene: (typeof scenes)[number] }) {
  const [example, setExample] = useState<TurnExample>(scene.examples[0][0]);
  const [speed, setSpeed] = useState(1);
  const [played, setPlayed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [launched, setLaunched] = useState(false);
  const [run, setRun] = useState(0);
  const [drawReplay, setDrawReplay] = useState(0);
  const [covered, setCovered] = useState(false);
  const snapshot = useMemo(
    () => turnMotionExample(scene.id, example, played, run, covered),
    [scene.id, example, played, run, covered],
  );
  useEffect(() => {
    if (scene.id !== "public" || example !== "pickup" || !played || covered)
      return;
    const timer = window.setTimeout(() => setCovered(true), 800 / speed);
    return () => clearTimeout(timer);
  }, [scene.id, example, played, covered, speed]);
  useEffect(() => {
    if (!playing || launched) return;
    const timer = window.setTimeout(() => {
      setLaunched(true);
      if (scene.id === "replacement" || scene.id === "draw") setDrawReplay(1);
      else setPlayed(true);
    }, 100);
    return () => clearTimeout(timer);
  }, [playing, launched, run, scene.id]);
  useEffect(() => {
    if (!playing || !launched) return;
    const duration =
      scene.id === "replacement"
        ? RED_REPLACEMENT_MS +
          REPLACEMENT_DRAW_MS +
          (example === "two" ? DRAW_STAGGER_MS : 0)
        : scene.id === "draw"
          ? DRAW_FLIGHT_MS + DRAW_STAGGER_MS
          : scene.id === "hand"
            ? example === "meld"
              ? 800
              : 600
            : scene.id === "public"
              ? 1800
              : example === "close"
                ? 1340
                : 440;
    const timer = window.setTimeout(
      () => setPlaying(false),
      duration / speed + 60,
    );
    return () => clearTimeout(timer);
  }, [playing, launched, scene.id, example, speed]);
  function reset() {
    setPlaying(false);
    setLaunched(false);
    setPlayed(false);
    setDrawReplay(0);
    setCovered(false);
    setRun((value) => value + 1);
  }
  function play() {
    reset();
    setPlaying(true);
  }
  const outlined = snapshot.hand.filter((card) =>
    scene.id === "replacement"
      ? card.redThree
      : scene.id === "hand"
        ? example === "discard"
          ? card.rank === "10"
          : card.rank === "A"
        : false,
  );
  return (
    <>
      <div className="draw-review-bar motion-review-bar">
        <div>
          <h2>{scene.label}</h2>
          <small>{scene.description}</small>
        </div>
        <label>
          Example{" "}
          <select
            aria-label="Animation example"
            value={example}
            onChange={(event) => {
              setExample(event.target.value as TurnExample);
              reset();
            }}
          >
            {scene.examples.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed{" "}
          <select
            aria-label="Animation playback speed"
            value={speed}
            disabled={playing}
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
        <button className="button small" onClick={play}>
          {played || playing ? "Replay animation" : "Play animation"}
        </button>
      </div>
      <div className="motion-preview-status">
        <span role="status">
          {playing
            ? "Playing…"
            : covered
              ? "Turn ended. The red three is covered."
              : played
                ? "Finished. Replay to watch again."
                : "Ready when you are."}
        </span>
        {scene.id === "replacement" && (
          <button
            className="button small secondary"
            disabled={!played || playing || covered}
            onClick={() => setCovered(true)}
          >
            {covered ? "Turn ended" : "Discard to end turn"}
          </button>
        )}
      </div>
      <div className="motion-native-stage">
        {!played && (
          <style>
            {outlined
              .map(
                (card) =>
                  `.motion-native-stage .hand-card[data-card-id="${card.id}"] > .card {outline:2px solid var(--secondary);outline-offset:3px;}`,
              )
              .join("\n")}
          </style>
        )}
        <Room
          key={run}
          rehearsal={{
            snapshot,
            onChoose: () => {},
            onDraw:
              scene.id === "replacement" || scene.id === "draw"
                ? () => setPlayed(true)
                : undefined,
            drawReplay,
            drawSpeed: speed,
            replacementIds:
              scene.id === "replacement"
                ? outlined.map((card) => card.id)
                : undefined,
            meldSpeed: speed,
            handAnimate: true,
            handExpanded: scene.id === "public",
            tableAnimate:
              scene.id === "public" ||
              scene.id === "replacement" ||
              (scene.id === "hand" && example === "discard"),
            viewedTeam:
              scene.id === "public"
                ? example === "offscreen"
                  ? 2
                  : 1
                : scene.id === "bot"
                  ? 1
                  : 0,
            followTurn: false,
            portalMotion: true,
          }}
        />
      </div>
    </>
  );
}
