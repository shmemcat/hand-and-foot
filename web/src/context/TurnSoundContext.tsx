import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "../components/Icons";
import { usePreferences } from "./PreferencesContext";
import {
  createTurnSoundPlayer,
  DEFAULT_TURN_SOUND,
  TURN_SOUNDS,
  type TurnSoundOptions,
  type TurnSoundUpdate,
} from "../lib/turnSound";
import styles from "./TurnSound.module.css";

type TurnSoundState = TurnSoundOptions & {
  enabled: boolean;
  available: boolean;
  saving: boolean;
  error: string;
  update: (patch: TurnSoundUpdate) => Promise<void>;
  preview: (volume: number) => void;
  setPlaybackVolume: (volume: number) => void;
  playIndicator: () => void;
};
const Context = createContext<TurnSoundState>({
  ...DEFAULT_TURN_SOUND,
  enabled: false,
  available: false,
  saving: false,
  error: "",
  update: async () => {},
  preview: () => {},
  setPlaybackVolume: () => {},
  playIndicator: () => {},
});

export function TurnSoundProvider({ children }: { children: ReactNode }) {
  const { preferences, update: savePreferences, saved } = usePreferences();
  const { sound, volume } = preferences.turnSoundOptions;
  const enabled = preferences.turnSound;
  const [player] = useState(createTurnSoundPlayer);
  const [previewError, setPreviewError] = useState("");
  useEffect(() => () => player.stop(), [player]);
  useEffect(() => {
    if (!enabled) player.stop();
  }, [enabled, player]);
  const update = async (patch: TurnSoundUpdate) => {
    player.stop();
    setPreviewError("");
    savePreferences({
      turnSound: patch.enabled ?? enabled,
      turnSoundOptions: {
        sound: patch.sound ?? sound,
        volume: patch.volume ?? volume,
      },
    });
  };
  const preview = (level: number) => {
    if (!enabled) return;
    setPreviewError("");
    player.play(sound, level, undefined, () =>
      setPreviewError("Unable to preview this sound. Please try again."),
    );
  };
  const playIndicator = useCallback(() => {
    if (enabled && volume > 0) player.play(sound, volume);
  }, [enabled, sound, volume, player]);
  return (
    <Context.Provider
      value={{
        enabled,
        sound,
        volume,
        available: true,
        saving: false,
        error: saved
          ? previewError
          : "Your browser couldn’t save your preferences.",
        update,
        preview,
        playIndicator,
        setPlaybackVolume: player.setVolume,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function TurnSoundOption() {
  const {
    enabled,
    sound,
    volume,
    available,
    saving,
    error,
    update,
    preview,
    setPlaybackVolume,
  } = useContext(Context);
  const volumeId = useId();
  const [draftVolume, setDraftVolume] = useState(volume);
  useEffect(() => setDraftVolume(volume), [volume]);
  const saveVolume = () => {
    if (draftVolume !== volume && !saving) void update({ volume: draftVolume });
  };
  return (
    <section className={styles.section} aria-label="Turn indicator">
      <h2>Turn Indicator</h2>
      <label className={styles.option}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!available || saving}
          onChange={(event) => void update({ enabled: event.target.checked })}
        />
        <span>Play a sound when it’s my turn</span>
      </label>
      {enabled && (
        <div className={styles.controls}>
          <div className={styles.selectorRow}>
            <div className={styles.selectWrap}>
              <select
                aria-label="Turn indicator sound"
                value={sound}
                disabled={saving}
                onChange={(event) =>
                  void update({
                    sound: event.target.value as TurnSoundOptions["sound"],
                  })
                }
              >
                {TURN_SOUNDS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Icon name="chevron-down" className={styles.chevron} />
            </div>
            <button
              type="button"
              className={`button ${styles.preview}`}
              onClick={() => preview(draftVolume)}
              aria-label="Preview sound"
            >
              <Icon name="play" />
              <span>Preview</span>
            </button>
          </div>
          <div className={styles.volume}>
            <div className={styles.volumeHeading}>
              <label htmlFor={volumeId}>Turn sound volume</label>
              <output htmlFor={volumeId}>
                {Math.round(draftVolume * 100)}%
              </output>
            </div>
            <input
              id={volumeId}
              type="range"
              min="0"
              max="100"
              step="1"
              value={Math.round(draftVolume * 100)}
              disabled={saving}
              onChange={(event) => {
                const level = Number(event.target.value) / 100;
                setDraftVolume(level);
                setPlaybackVolume(level);
              }}
              onPointerUp={saveVolume}
              onKeyUp={saveVolume}
              onBlur={saveVolume}
            />
          </div>
        </div>
      )}

      {error && <p role="alert">{error}</p>}
    </section>
  );
}

// Record decisions even while opted out or silent, so edits and reconnections
// cannot replay a turn that has already been announced.
export function useTurnIndicator(canAct: boolean, decision: string) {
  const { playIndicator } = useContext(Context);
  const lastDecision = useRef<string | null>(null);
  useEffect(() => {
    if (!canAct || !decision || decision === lastDecision.current) return;
    lastDecision.current = decision;
    playIndicator();
  }, [canAct, decision, playIndicator]);
}
