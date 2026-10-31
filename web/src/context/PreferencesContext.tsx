import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { readStorage, writeStorage } from "../lib/storage";
import { normalizeTurnSound, type TurnSoundOptions } from "../lib/turnSound";

type Preferences = {
  dark: boolean;
  turnSound: boolean;
  turnSoundOptions: TurnSoundOptions;
  followTurnBehavior: "keep" | "uncheck";
};
const defaults: Preferences = {
  dark: false,
  turnSound: true,
  turnSoundOptions: normalizeTurnSound(),
  followTurnBehavior: "keep",
};
const Context = createContext({
  preferences: defaults,
  saved: true,
  update: (_patch: Partial<Preferences>) => {},
});
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences>(() => {
    const stored = readStorage<Partial<Preferences>>(
      "handandfoot.preferences.v1",
      {},
    );
    return {
      dark: readStorage<unknown>("handandfoot.dark.v1", false) === true,
      turnSound: stored?.turnSound !== false,
      turnSoundOptions: normalizeTurnSound(stored?.turnSoundOptions),
      followTurnBehavior:
        stored?.followTurnBehavior === "uncheck" ? "uncheck" : "keep",
    };
  });
  const [saved, setSaved] = useState(true);
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.dark
      ? "dark"
      : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", preferences.dark ? "#2D2027" : "#DFD3C3");
  }, [preferences.dark]);
  const update = (patch: Partial<Preferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    const mainSaved = writeStorage("handandfoot.preferences.v1", next);
    const themeSaved = writeStorage("handandfoot.dark.v1", next.dark);
    setSaved(mainSaved && themeSaved);
  };
  return (
    <Context.Provider value={{ preferences, saved, update }}>
      {children}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
