import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { Book, Icon } from "../components/Icons";
import { useSound } from "../context/SoundContext";
import {
  INITIAL_OPENING,
  OPENING_BEATS,
  openingCues,
  openingReducer,
  samplePiles,
} from "../lib/openingSequence";
import { readStorage, writeStorage } from "../lib/storage";
import "../opening-preview.css";

const NAMES = [
  "You",
  "Poppy",
  "Jules",
  "Robin",
  "Sunny",
  "Clover",
  "Wren",
  "Kit",
];
const PILES = samplePiles();
const SETTINGS_KEY = "handandfoot.opening-preview.v1";
type Settings = {
  players: number;
  mode: "individual" | "partnership";
  speed: number;
  durations: number[];
};
const DEFAULTS: Settings = {
  players: 4,
  mode: "individual",
  speed: 1,
  durations: OPENING_BEATS.map((b) => b.duration),
};
function loadSettings(): Settings {
  const saved = readStorage<Partial<Settings> | null>(SETTINGS_KEY, null);
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
        (i === 4 ? n !== 0 : n < 800 || n > 12000),
    )
  )
    return DEFAULTS;
  if (
    (saved.mode === "individual" && saved.players! > 6) ||
    (saved.mode === "partnership" && ![4, 6, 8].includes(saved.players!))
  )
    return DEFAULTS;
  return saved as Settings;
}
function variables(values: Record<string, string | number>): CSSProperties {
  return values as CSSProperties;
}

export function OpeningPreview() {
  const [settings, setSettings] = useState(loadSettings);
  const [dealer, setDealer] = useState(settings.players - 1);
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
  const first = (dealer + 1) % settings.players;
  const players = NAMES.slice(0, settings.players);
  const progress = duration ? state.elapsed / duration : 0;
  const cues = useMemo(
    () => openingCues(state.step, settings.players, duration || 1000),
    [state.step, settings.players, duration],
  );
  const waiting = state.step === 4;
  const finished = state.step === 7 && state.elapsed >= duration;
  const handVisible = state.step >= 5;
  const chosen = PILES[state.choice ?? 0];
  const sortedHand = [...chosen].sort(
    (a, b) =>
      [
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
        "A",
        "2",
        "Joker",
      ].indexOf(a.rank) -
      [
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "J",
        "Q",
        "K",
        "A",
        "2",
        "Joker",
      ].indexOf(b.rank),
  );

  useEffect(() => {
    writeStorage(SETTINGS_KEY, settings);
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
    setSettings(next);
    setDealer(next.players - 1);
    dispatch({ type: "reset" });
  }
  function choose(pile: number) {
    sound.play("select");
    dispatch({ type: "choose", pile });
  }
  const seek = (step: number) => dispatch({ type: "seek", step });
  const animationStyle = variables({
    "--opening-speed": settings.speed,
    "--beat-duration": `${(duration || 1000) / settings.speed}ms`,
    "--opening-play-state": state.playing ? "running" : "paused",
  });
  return (
    <div className="opening-lab">
      <header className="opening-title">
        <div>
          <Link className="text-link" to="/preview">
            ← All previews
          </Link>
          <h1>Opening rehearsal</h1>
          <p>A little space to get the beginning just right.</p>
        </div>
        <span className="opening-local">Local simulation</span>
      </header>
      <div className="opening-layout">
        <div className="opening-experience">
          <section
            className={`opening-stage ${reduced ? "opening-reduced" : ""}`}
            aria-label="Opening sequence simulation"
            style={animationStyle}
          >
            <header className="opening-table-header">
              <span className="round-pill">Round 1</span>
              <div
                className="opening-stock"
                aria-label={`${(settings.players + 1) * 54 - (state.step >= 4 ? settings.players * 22 + 1 : 0)} cards in the stock`}
              >
                <div>
                  <Card small />
                  <span>Deck</span>
                </div>
                <div
                  className={state.step === 7 ? "opening-discard" : ""}
                  key={state.step === 7 ? state.replay : "empty"}
                >
                  {state.step === 7 ? (
                    <Card
                      card={{
                        id: "starter",
                        rank: "9",
                        suit: "clubs",
                        value: 10,
                        wild: false,
                        redThree: false,
                      }}
                      small
                    />
                  ) : (
                    <span className="empty-card">—</span>
                  )}
                  <span>Discard</span>
                </div>
              </div>
              <span className="opening-deck-count">
                {settings.players + 1} decks
                <small>
                  {settings.mode === "partnership"
                    ? `${settings.players / 2} teams`
                    : `${settings.players} players`}
                </small>
              </span>
            </header>
            <div className="opening-roster" aria-label="Players at the table">
              {players.map((name, i) => {
                const ready =
                  i === 0
                    ? handVisible
                    : state.step === 7 ||
                      (state.step === 6 && progress >= i / settings.players);
                return (
                  <div
                    key={`${i}-${state.step === 0 ? state.replay : "seat"}`}
                    className={`opening-seat ${state.step === 0 && (state.playing || state.elapsed > 0) ? "opening-arriving" : ""} ${(state.step === 7 || (state.step === 1 && progress > 0.5)) && i === first ? "opening-first" : ""}`}
                    style={variables({
                      "--seat-delay": `${(i * duration * 0.075) / settings.speed}ms`,
                    })}
                  >
                    <span className="opening-avatar">{name.slice(0, 1)}</span>
                    <span>
                      <strong>
                        {name}
                        {settings.mode === "partnership" && (
                          <small>Team {(i % (settings.players / 2)) + 1}</small>
                        )}
                      </strong>
                      <small>
                        {ready
                          ? "✓ Ready"
                          : state.step >= 4
                            ? "Choosing…"
                            : "At the table"}
                      </small>
                    </span>
                    {state.step >= 1 && i === dealer && (
                      <span className="opening-dealer" title="Dealer">
                        D
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <div
              className="opening-scene"
              key={`${state.step}-${state.replay}`}
              data-step={state.step}
            >
              {state.step === 0 && (
                <div className="opening-welcome">
                  <Book />
                  <span className="opening-eyebrow">Hand & Foot</span>
                  <h2>
                    Good company.
                    <br />A fresh deck.
                  </h2>
                  <p>Everyone’s here. Let’s get a hand going.</p>
                  <span className="opening-scene-detail">
                    {settings.players} players · {settings.players + 1} decks ·
                    2 piles each
                  </span>
                </div>
              )}
              {state.step === 1 && (
                <div className="opening-dealer-scene">
                  <span className="opening-large-dealer">D</span>
                  <h2>
                    {players[dealer] === "You"
                      ? "You’re dealing."
                      : `${players[dealer]} is dealing.`}
                  </h2>
                  <p>
                    {first === 0 ? "You’ll" : `${players[first]} will`} play
                    first, to the dealer’s left.
                  </p>
                  <span className="opening-scene-detail">
                    The first dealer is random in a real game.
                  </span>
                </div>
              )}
              {state.step === 2 && (
                <div className="opening-shuffle-scene">
                  <div
                    className="opening-shuffle"
                    aria-label="Shuffling the decks"
                  >
                    {[0, 1, 2].map((i) => (
                      <div key={i}>
                        <Card />
                      </div>
                    ))}
                  </div>
                  <h2>A fresh shuffle.</h2>
                  <p>
                    {settings.players + 1} decks, including{" "}
                    {(settings.players + 1) * 2} Jokers.
                  </p>
                </div>
              )}
              {state.step === 3 && (
                <div className="opening-deal-scene">
                  <h2>
                    {progress < 0.5
                      ? "The first eleven…"
                      : "…and eleven for later."}
                  </h2>
                  <p>Two face-down piles for every player.</p>
                  <div className="opening-deal-table">
                    <div className="opening-deal-source" aria-hidden="true">
                      <Card small />
                    </div>
                    {players.map((name, seat) => (
                      <div
                        key={seat}
                        className="opening-deal-destination"
                        style={{
                          left: `${10 + (seat % 4) * (80 / Math.min(3, settings.players - 1))}%`,
                          top: `${seat < 4 ? 22 : 79}%`,
                        }}
                      >
                        <span>{name}</span>
                        <div>
                          {[0, 1].map((pile) => {
                            const count = Math.max(
                              0,
                              Math.min(
                                11,
                                Math.floor(
                                  (state.elapsed - 200) /
                                    ((duration - 650) /
                                      (settings.players * 22)) /
                                    settings.players -
                                    pile * 11 +
                                    (settings.players - seat - 1) /
                                      settings.players,
                                ) + 1,
                              ),
                            );
                            return (
                              <div
                                className={`opening-mini-pile ${count ? "has-cards" : ""}`}
                                key={pile}
                              >
                                {count > 0 && <Card small />}
                                <small>{count}/11</small>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {!reduced &&
                      Array.from({ length: settings.players * 22 }, (_, i) => {
                        const seat = i % settings.players;
                        return (
                          <div
                            className="opening-flying-card"
                            key={i}
                            aria-hidden="true"
                            style={variables({
                              "--flight-delay": `${(200 + (i * (duration - 650)) / (settings.players * 22)) / settings.speed}ms`,
                              "--flight-time": `${350 / settings.speed}ms`,
                              "--target-x": `${10 + (seat % 4) * (80 / Math.min(3, settings.players - 1))}%`,
                              "--target-y": `${seat < 4 ? 22 : 79}%`,
                            })}
                          >
                            <Card small />
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
              {state.step === 4 && (
                <div className="opening-choice-scene">
                  <h2>Which one feels lucky?</h2>
                  <p>Top & bottom only. The middle stays a mystery.</p>
                  <div className="opening-choices">
                    {PILES.map((pile, i) => (
                      <button
                        key={i}
                        className="choose-pile"
                        onClick={() => choose(i)}
                        aria-label={`Choose pile ${i + 1} as your hand`}
                      >
                        <span className="pile-preview">
                          <span
                            className="opening-reveal"
                            style={variables({
                              "--reveal-delay": `${100 / settings.speed}ms`,
                            })}
                          >
                            <Card card={pile[0]} />
                          </span>
                          <Card />
                          <span
                            className="opening-reveal"
                            style={variables({
                              "--reveal-delay": `${450 / settings.speed}ms`,
                            })}
                          >
                            <Card card={pile[10]} />
                          </span>
                        </span>
                        <strong>Play pile {i + 1}</strong>
                        <small>11 cards · Top & bottom shown</small>
                      </button>
                    ))}
                  </div>
                  <span className="opening-choice-note">
                    Take your time. The sequence waits for your choice.
                  </span>
                </div>
              )}
              {state.step === 5 && (
                <div className="opening-gather-scene">
                  <span className="opening-success">✓</span>
                  <h2>A hand to start with.</h2>
                  <p>
                    Pile {(state.choice ?? 0) + 1} is your hand. The other is
                    your foot.
                  </p>
                  <span className="opening-scene-detail">
                    Your cards are arranged below, ready for play.
                  </span>
                </div>
              )}
              {state.step === 6 && (
                <div className="opening-wait-scene">
                  <span className="opening-wait-mark">
                    <Book />
                  </span>
                  <h2>Your hand is ready.</h2>
                  <p>Waiting for the other players to choose…</p>
                  <span className="opening-scene-detail">
                    {Math.min(
                      settings.players,
                      1 + Math.floor(progress * settings.players),
                    )}{" "}
                    of {settings.players} ready
                  </span>
                </div>
              )}
              {state.step === 7 && (
                <div className="opening-ready-scene">
                  <span className="opening-eyebrow">Everyone’s ready</span>
                  <h2>
                    {first === 0
                      ? "You’re up first."
                      : `${players[first]} is up first.`}
                  </h2>
                  <p>
                    {first === 0
                      ? "Draw two cards, or play the top discard."
                      : "The first turn starts to the dealer’s left."}
                  </p>
                  <span className="opening-end-label">
                    End of opening rehearsal
                  </span>
                  <small>We stop here, just before the first draw.</small>
                </div>
              )}
            </div>
            <div
              className={`opening-hand-dock ${handVisible ? "has-hand" : ""}`}
              aria-label="Your private hand"
            >
              <div className="opening-hand-heading">
                <strong>
                  Your hand{" "}
                  <span>
                    {handVisible
                      ? "11 cards"
                      : waiting
                        ? "Choose a pile"
                        : "Waiting for the deal"}
                  </span>
                </strong>
                <small>Visible only to you</small>
              </div>
              {handVisible ? (
                <div className="opening-hand-content">
                  <div
                    className={`opening-hand-cards ${state.step === 5 ? "opening-fan" : ""}`}
                    key={state.step === 5 ? state.replay : "hand"}
                  >
                    {sortedHand.map((card, i) => (
                      <div
                        key={card.id}
                        style={variables({
                          "--card-order": i,
                          "--fan-delay": `${(i * duration * 0.0325) / settings.speed}ms`,
                        })}
                      >
                        <Card card={card} indexed />
                      </div>
                    ))}
                  </div>
                  <div className="opening-foot">
                    <Card small />
                    <span>
                      Foot<small>11 face down</small>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="opening-hand-placeholder">
                  Two piles. One choice. Your hand will land here.
                </div>
              )}
            </div>
          </section>
          <div className="opening-transport">
            <div className="opening-play-controls">
              <button
                className="button small"
                onClick={() =>
                  dispatch({
                    type: state.playing
                      ? "pause"
                      : finished
                        ? "restart"
                        : "play",
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
        </div>
        <aside className="opening-director" aria-label="Rehearsal controls">
          <div className="opening-beat-description">
            <span className="opening-eyebrow">
              Beat {String(state.step + 1).padStart(2, "0")} / 08
            </span>
            <h2>{beat.title}</h2>
            <p>{beat.description}</p>
            <dl>
              <dt>Animation</dt>
              <dd>{beat.motion}</dd>
              <dt>Sound</dt>
              <dd>{beat.sound}</dd>
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
                  if (e.target.checked && !sound.volume) sound.setVolume(0.15);
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
                    players:
                      mode === "partnership" &&
                      ![4, 6, 8].includes(settings.players)
                        ? 4
                        : mode === "individual" && settings.players > 6
                          ? 6
                          : settings.players,
                  });
                }}
              >
                <option value="individual">Individual</option>
                <option value="partnership">Partnerships</option>
              </select>
            </label>
            <label>
              Players
              <select
                value={settings.players}
                onChange={(e) =>
                  configure({ ...settings, players: Number(e.target.value) })
                }
              >
                {(settings.mode === "individual"
                  ? [2, 3, 4, 5, 6]
                  : [4, 6, 8]
                ).map((n) => (
                  <option key={n} value={n}>
                    {n} players
                  </option>
                ))}
              </select>
            </label>
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
                <span>{(duration / 1000).toFixed(1)}s</span>
                <input
                  aria-label="Current beat duration"
                  type="range"
                  min="800"
                  max="12000"
                  step="100"
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
        </aside>
      </div>
    </div>
  );
}
