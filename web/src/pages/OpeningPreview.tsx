import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { OpeningBoard } from "../components/OpeningBoard";
import { Icon } from "../components/Icons";
import { useSound } from "../context/SoundContext";
import {
  INITIAL_OPENING,
  OPENING_BEATS,
  openingCues,
  openingReducer,
  openingSnapshot,
  DEAL_ANIMATIONS,
  type DealAnimation,
  arrivalDuration,
} from "../lib/openingSequence";
import { readStorage, writeStorage } from "../lib/storage";
import "../opening-preview.css";

const NAMES = ["You", "Poppy", "Hazel", "Jasper", "Sunny", "Clover"];
const SETTINGS_KEY = "handandfoot.opening-preview.v1";
type Settings = {
  revision: 7;
  dealStyle: DealAnimation;
  players: number;
  mode: "individual" | "partnership";
  speed: number;
  durations: number[];
};
const DEFAULTS: Settings = {
  revision: 7,
  dealStyle: "drops",
  players: 6,
  mode: "individual",
  speed: 1,
  durations: OPENING_BEATS.map((b) => b.duration),
};
function loadSettings(): Settings {
  const saved = readStorage<
    (Partial<Omit<Settings, "revision">> & { revision?: number }) | null
  >(SETTINGS_KEY, null);
  if (
    !saved ||
    ![2, 3, 4, 5, 6, 8].includes(saved.players ?? 0) ||
    ![0.5, 1, 1.5, 2].includes(saved.speed ?? 0) ||
    !["individual", "partnership"].includes(saved.mode ?? "") ||
    !Array.isArray(saved.durations) ||
    saved.durations.length !== OPENING_BEATS.length ||
    saved.durations.some(
      (n, i) =>
        typeof n !== "number" ||
        !Number.isFinite(n) ||
        (i === 4 ? n !== 0 : n < (i === 5 ? 200 : 800) || n > 12000),
    )
  )
    return DEFAULTS;
  return {
    ...saved,
    players: 6,
    // Apply each requested pacing change once, retaining the other preferences.
    durations: saved.durations.map((n, i) =>
      i === 5 && (saved.revision ?? 0) < 7
        ? OPENING_BEATS[5].duration
        : i === 0 && (saved.revision ?? 0) < 5
          ? arrivalDuration(saved.players!)
          : i === 1 && (saved.revision ?? 0) < 3
            ? Math.max(800, Math.round((n * 2) / 3 / 100) * 100)
            : i === 3 && (saved.revision ?? 0) < 4
              ? (saved.revision ?? 0) >= 2
                ? Math.max(800, Math.round(n / 2 / 100) * 100)
                : OPENING_BEATS[3].duration
              : n,
    ),
    dealStyle:
      (saved.revision ?? 0) >= 4 &&
      DEAL_ANIMATIONS.some((option) => option.id === saved.dealStyle)
        ? saved.dealStyle
        : "drops",
    revision: 7,
  } as Settings;
}

export function OpeningPreview() {
  const [settings, setSettings] = useState(loadSettings);
  const [dealer, setDealer] = useState(0);
  const [state, dispatch] = useReducer(openingReducer, INITIAL_OPENING);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [notes, setNotes] = useState(() =>
    readStorage<string>(`${SETTINGS_KEY}.notes`, ""),
  );
  const sound = useSound();
  const soundRef = useRef(sound.play);
  soundRef.current = sound.play;
  const cueCursor = useRef(-1);
  const frameTime = useRef<number | null>(null);
  const beat = OPENING_BEATS[state.step];
  const duration = settings.durations[state.step];
  const players = NAMES.slice(0, settings.players);
  const progress = duration ? state.elapsed / duration : 0;
  const cues = useMemo(
    () =>
      openingCues(
        state.step,
        settings.players,
        duration || 1000,
        settings.dealStyle,
      ),
    [state.step, settings.players, duration, settings.dealStyle],
  );
  const waiting = state.step === 4;
  const finished = state.step === 7 && state.elapsed >= duration;
  const snapshot = openingSnapshot({
    state,
    names: players,
    mode: settings.mode,
    dealer,
    duration,
    dealStyle: settings.dealStyle,
  });
  const dealIdea =
    DEAL_ANIMATIONS.find((option) => option.id === settings.dealStyle) ??
    DEAL_ANIMATIONS[0];

  useEffect(() => {
    if (settings.revision !== 7) setSettings(loadSettings());
    else writeStorage(SETTINGS_KEY, settings);
  }, [settings]);
  useEffect(() => {
    writeStorage(`${SETTINGS_KEY}.notes`, notes);
  }, [notes]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    cueCursor.current = -1;
  }, [state.replay]);
  useEffect(() => {
    if (!state.playing) return;
    let frame = 0;
    frameTime.current = null;
    const tick = (now: number) => {
      const previous = frameTime.current ?? now;
      frameTime.current = now;
      // Background tabs never skip a choice or play a burst of delayed cues.
      if (!document.hidden)
        dispatch({
          type: "tick",
          delta: Math.min(now - previous, 100) * settings.speed,
          duration,
        });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [state.playing, state.step, state.replay, duration, settings.speed]);
  useEffect(() => {
    if (!state.playing || waiting) return;
    for (let i = cueCursor.current + 1; i < cues.length; i++) {
      if (cues[i].at > state.elapsed) break;
      soundRef.current(cues[i].sound);
      cueCursor.current = i;
    }
  }, [state.elapsed, state.playing, waiting, cues]);
  // Choice has no countdown. Its two reveal cues run once, with pause cleanup.
  useEffect(() => {
    if (!waiting || !state.playing) return;
    const timers = cues.map((cue, i) =>
      window.setTimeout(() => {
        if (i > cueCursor.current) {
          soundRef.current(cue.sound);
          cueCursor.current = i;
        }
      }, cue.at / settings.speed),
    );
    return () => timers.forEach(clearTimeout);
  }, [waiting, state.playing, state.replay, cues, settings.speed]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) dispatch({ type: "pause" });
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);

  function configure(next: Settings) {
    setSettings(
      next.players === settings.players
        ? next
        : {
            ...next,
            durations: next.durations.map((duration, i) =>
              i === 0 ? arrivalDuration(next.players) : duration,
            ),
          },
    );
    setDealer(0);
    dispatch({ type: "reset" });
  }
  function choose(pile: number) {
    sound.play("select");
    dispatch({ type: "choose", pile });
  }
  const seek = (step: number) => dispatch({ type: "seek", step });
  return (
    <div className="opening-rehearsal">
      <h1 className="sr-only">Opening rehearsal</h1>
      <div className="opening-review-bar">
        <span className="opening-review-label">
          Opening rehearsal{" "}
          <small>
            {String(state.step + 1).padStart(2, "0")} / 08 · {beat.title}
          </small>
        </span>
        <div className="opening-transport">
          <div className="opening-play-controls">
            <button
              className="button small"
              onClick={() =>
                dispatch({
                  type: state.playing ? "pause" : finished ? "restart" : "play",
                })
              }
            >
              {state.playing
                ? "Pause"
                : finished
                  ? "Replay opening"
                  : "Play opening"}
            </button>
            <button
              className="opening-control"
              onClick={() => dispatch({ type: "restart" })}
              aria-label="Restart opening"
            >
              ↺ <span>Restart</span>
            </button>
          </div>
          <div className="opening-step-controls">
            <button
              className="opening-control"
              onClick={() => seek(state.step - 1)}
              disabled={state.step === 0}
            >
              ← Back
            </button>
            <button
              className="opening-control"
              onClick={() => dispatch({ type: "replay" })}
            >
              Replay beat
            </button>
            <button
              className="opening-control"
              onClick={() => seek(state.step + 1)}
              disabled={waiting || state.step === 7}
            >
              Next →
            </button>
          </div>
        </div>
        <div className="opening-playback-status" role="status">
          {waiting
            ? "Choose either pile to continue."
            : finished
              ? "Opening complete. Replay any moment to refine it."
              : state.playing
                ? `${state.continuous ? "Playing opening" : "Previewing beat"} · ${settings.speed}× speed`
                : state.elapsed
                  ? "Paused · continue or move to the next beat."
                  : "Press Play opening, or choose a beat below."}
        </div>
      </div>
      <OpeningBoard
        state={state}
        snapshot={snapshot}
        duration={duration}
        speed={settings.speed}
        reduced={reduced}
        onChoose={choose}
        dealStyle={settings.dealStyle}
      />
      <section
        className="opening-review-panel"
        aria-label="Opening rehearsal controls"
      >
        <nav className="opening-timeline" aria-label="Opening beats">
          {OPENING_BEATS.map((b, i) => (
            <button
              key={b.short}
              aria-label={`${String(i + 1).padStart(2, "0")} ${b.short}`}
              aria-current={state.step === i ? "step" : undefined}
              onClick={() => seek(i)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {b.short}
              <i
                style={{
                  width:
                    state.step > i
                      ? "100%"
                      : state.step === i
                        ? `${waiting ? 100 : progress * 100}%`
                        : "0%",
                }}
              />
            </button>
          ))}
        </nav>
        <details className="opening-refine">
          <summary>Timing, sound & refinement notes</summary>
          <div className="opening-director" aria-label="Rehearsal controls">
            <div className="opening-beat-description">
              <span className="opening-eyebrow">
                Beat {String(state.step + 1).padStart(2, "0")} / 08
              </span>
              <h2>{beat.title}</h2>
              <p>{beat.description}</p>
              <dl>
                <dt>Animation</dt>
                <dd>{state.step === 3 ? dealIdea.description : beat.motion}</dd>
                <dt>Sound</dt>
                <dd>{state.step === 3 ? dealIdea.sound : beat.sound}</dd>
              </dl>
              <button
                className="text-link opening-audition"
                disabled={sound.muted || sound.volume === 0}
                onClick={() => sound.play(cues[0]?.sound ?? "select")}
              >
                <Icon name="volume" /> Hear this cue
              </button>
              {(sound.muted || sound.volume === 0) && (
                <small className="opening-muted-note">
                  Effects are muted. Turn them on below to hear cues.
                </small>
              )}
            </div>
            <div className="opening-quick-settings">
              <label>
                Playback speed
                <select
                  value={settings.speed}
                  onChange={(e) => {
                    setSettings({ ...settings, speed: Number(e.target.value) });
                    dispatch({ type: "replay" });
                  }}
                >
                  <option value={0.5}>0.5× · Slow</option>
                  <option value={1}>1× · Natural</option>
                  <option value={1.5}>1.5× · Brisk</option>
                  <option value={2}>2× · Quick</option>
                </select>
              </label>
              <label className="opening-check">
                <input
                  type="checkbox"
                  checked={!sound.muted}
                  onChange={(e) => {
                    if (e.target.checked && !sound.volume)
                      sound.setVolume(0.15);
                    sound.setMuted(!e.target.checked);
                  }}
                />{" "}
                Sound effects
              </label>
              <label>
                Effects volume <span>{Math.round(sound.volume * 100)}%</span>
                <input
                  aria-label="Rehearsal effects volume"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={sound.volume}
                  onChange={(e) => sound.setVolume(Number(e.target.value))}
                />
              </label>
              <label className="opening-check">
                <input
                  type="checkbox"
                  checked={sound.music}
                  onChange={(e) => {
                    if (e.target.checked && !sound.musicVolume)
                      sound.setMusicVolume(0.15);
                    sound.setMusic(e.target.checked);
                  }}
                />{" "}
                Background jazz
              </label>
              <label className="opening-check">
                <input
                  type="checkbox"
                  checked={reduced}
                  onChange={(e) => setReduced(e.target.checked)}
                />{" "}
                Reduced motion
              </label>
            </div>
            <details className="opening-tuning">
              <summary>Table & timing</summary>
              <label>
                Scoring
                <select
                  value={settings.mode}
                  onChange={(e) => {
                    const mode = e.target.value as Settings["mode"];
                    configure({
                      ...settings,
                      mode,
                    });
                  }}
                >
                  <option value="individual">6 individuals</option>
                  <option value="partnership">3 teams of 2</option>
                </select>
              </label>
              <p>6 players · 7 decks</p>
              <label>
                Dealer for this rehearsal
                <select
                  value={dealer}
                  onChange={(e) => {
                    setDealer(Number(e.target.value));
                    dispatch({ type: "reset" });
                  }}
                >
                  {players.map((name, i) => (
                    <option key={name} value={i}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              {waiting ? (
                <p className="opening-timing-note">
                  This beat waits for your choice.
                </p>
              ) : (
                <label>
                  This beat’s duration{" "}
                  <span>
                    {(duration / 1000).toFixed(state.step === 5 ? 2 : 1)}s
                  </span>
                  <input
                    aria-label="Current beat duration"
                    type="range"
                    min={state.step === 5 ? 200 : 800}
                    max="12000"
                    step={state.step === 5 ? 50 : 100}
                    value={duration}
                    onChange={(e) => {
                      const durations = [...settings.durations];
                      durations[state.step] = Number(e.target.value);
                      setSettings({ ...settings, durations });
                      dispatch({ type: "replay" });
                    }}
                  />
                </label>
              )}
              <button className="text-link" onClick={() => configure(DEFAULTS)}>
                Reset table & timing
              </button>
            </details>
            <details className="opening-notes">
              <summary>Refinement notes</summary>
              <label htmlFor="opening-notes">What should change?</label>
              <textarea
                id="opening-notes"
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Let the hand settle before the ready chime…"
              />
              <small>Notes and timing are saved in this browser.</small>
            </details>
          </div>
        </details>
        <Link className="text-link opening-preview-back" to="/preview">
          ← All previews
        </Link>
      </section>
    </div>
  );
}
