import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { useSound } from "../context/SoundContext";
import {
  PICKUP_SCENARIOS,
  pickupBeats,
  pickupFrame,
  type PickupScenario,
} from "../lib/pickupSequence";
import "../draw-preview.css";
import "../pickup-preview.css";

export function PickupPreview() {
  const [scenario, setScenario] = useState<PickupScenario>("new");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [flying, setFlying] = useState(false);
  const sound = useSound();
  const playSound = useRef(sound.play);
  playSound.current = sound.play;
  const beats = useMemo(() => pickupBeats(scenario), [scenario]);
  const frame = useMemo(
    () => pickupFrame(scenario, step),
    [scenario, step, replay],
  );
  const beat = beats[step];
  const sounded = useRef("");
  useEffect(() => {
    if (!playing) return;
    const cue = `${scenario}:${replay}:${step}`;
    if (sounded.current !== cue) {
      sounded.current = cue;
      if (beat.sound) playSound.current(beat.sound);
    }
    const timer = window.setTimeout(() => {
      if (step === beats.length - 1) setPlaying(false);
      else setStep((previous) => previous + 1);
    }, beat.hold / speed);
    return () => clearTimeout(timer);
  }, [playing, scenario, replay, step, speed, beats, beat]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
  function seek(index: number) {
    setPlaying(false);
    setStep(Math.max(0, Math.min(index, beats.length - 1)));
  }
  function restart() {
    setStep(0);
    setReplay((previous) => previous + 1);
    setPlaying(true);
  }
  return (
    <div className="pickup-rehearsal" data-playing={playing}>
      <div className="draw-review-bar">
        <div className="pickup-review-heading">
          <h1>Discard pickup</h1>
          <small>Current behavior · replay every step</small>
        </div>
        <label>
          Scenario{" "}
          <select
            aria-label="Pickup scenario"
            value={scenario}
            onChange={(event) => {
              setScenario(event.target.value as PickupScenario);
              setStep(0);
              setPlaying(false);
              setReplay((previous) => previous + 1);
            }}
          >
            {PICKUP_SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pace{" "}
          <select
            aria-label="Pickup playback pace"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={1}>1×</option>
            <option value={0.5}>0.5×</option>
            <option value={0.25}>0.25×</option>
          </select>
        </label>
        <button
          className="button small"
          onClick={() =>
            playing
              ? setPlaying(false)
              : step === beats.length - 1 && !flying
                ? restart()
                : setPlaying(true)
          }
        >
          {playing
            ? "Pause"
            : step === beats.length - 1 && !flying
              ? "Replay sequence"
              : "Play sequence"}
        </button>
        <button className="text-button" onClick={restart}>
          Restart
        </button>
      </div>
      <nav className="pickup-beats" aria-label="Pickup sequence steps">
        {beats.map((item, index) => (
          <button
            key={item.id}
            aria-current={step === index ? "step" : undefined}
            onClick={() => seek(index)}
          >
            <span>{index + 1}</span>
            {item.title}
          </button>
        ))}
      </nav>
      <div className="pickup-beat-detail">
        <div className="pickup-step-controls">
          <button
            className="text-button"
            disabled={!step}
            onClick={() => seek(step - 1)}
            aria-label="Previous pickup step"
          >
            ←
          </button>
          <span>
            {step + 1} / {beats.length}
          </span>
          <button
            className="text-button"
            disabled={step === beats.length - 1}
            onClick={() => seek(step + 1)}
            aria-label="Next pickup step"
          >
            →
          </button>
        </div>
        <p role="status">
          <strong>{beat.title}.</strong> {beat.detail}
        </p>
        <span className="pickup-sound">
          Sound:{" "}
          {beat.sound === "select"
            ? "single card placement"
            : beat.sound === "slide"
              ? "card slide"
              : beat.sound === "deal"
                ? "card draw"
                : "none"}
        </span>
      </div>
      <div
        className="pickup-recording"
        // Keep the recorded frame fixed while allowing hover and focus hints.
        onClickCapture={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
        onKeyDownCapture={(event) => {
          if (["Enter", " ", "ArrowLeft", "ArrowRight"].includes(event.key)) {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <Room
          key={`${scenario}:${replay}`}
          rehearsal={{
            ...frame,
            onChoose: () => {},
            meldSpeed: speed,
            meldAnimate: beat.id === "complete",
            drawSpeed: speed,
            drawReview:
              beat.drawn && playing
                ? {
                    key: `${scenario}:${replay}:${step}`,
                    before: pickupFrame(scenario, step - 1).snapshot,
                  }
                : undefined,
            meldPaused: !playing,
            onMeldMotion: setFlying,
          }}
        />
      </div>
      <p className="pickup-review-note">
        Recorded steps: use the controls above to replay or inspect any moment.
        Pace changes the pauses between actions; live timing depends on your
        clicks and the server reply. Confirmed draft cards slide from the hand
        or discard into their melds.
      </p>
      <Link className="text-link draw-review-back" to="/preview">
        ← All previews
      </Link>
    </div>
  );
}
