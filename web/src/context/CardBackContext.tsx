import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./AuthContext";
import {
  DEFAULT_CARD_BACK,
  normalizeCardBack,
  type CardBackId,
} from "../lib/cardBacks";
import {
  normalizeCardBackDisplay,
  type CardBackDisplayMode,
} from "../lib/cardBackDisplay";

type Settings = { cardBack: CardBackId; displayMode: CardBackDisplayMode };
type Change = { design?: CardBackId; display?: CardBackDisplayMode };
const Context = createContext<
  Settings & {
    saving: boolean;
    displaySaving: boolean;
    error: string;
    displayError: string;
    available: boolean;
    choose: (id: CardBackId) => Promise<void>;
    chooseDisplay: (mode: CardBackDisplayMode) => Promise<void>;
  }
>({
  cardBack: DEFAULT_CARD_BACK,
  displayMode: "uniform",
  saving: false,
  displaySaving: false,
  error: "",
  displayError: "",
  available: false,
  choose: async () => {},
  chooseDisplay: async () => {},
});

export function CardBackProvider({ children }: { children: ReactNode }) {
  const { user, updateProfile } = useAuth();
  const accountId = user?.id ?? null;
  const cardBack = normalizeCardBack(user?.card_backs?.handandfoot);
  const displayMode = normalizeCardBackDisplay(
    user?.card_back_display?.handandfoot,
  );
  const [operation, setOperation] = useState({
    accountId,
    value: { cardBack, displayMode },
    saving: false,
    error: "",
    kind: "design",
  });
  const pending = useRef<{ accountId: string } | null>(null);
  const currentAccount = useRef(accountId);
  currentAccount.current = accountId;
  const owned = operation.accountId === accountId;
  const value: Settings = !user
    ? { cardBack: DEFAULT_CARD_BACK, displayMode: "uniform" }
    : owned
      ? operation.value
      : { cardBack, displayMode };
  const saving = owned && operation.saving;

  useEffect(() => {
    if (!pending.current || pending.current.accountId !== accountId)
      setOperation({
        accountId,
        value: { cardBack, displayMode },
        saving: false,
        error: "",
        kind: "design",
      });
  }, [accountId, cardBack, displayMode]);

  const update = async (patch: Change) => {
    if (!user || !accountId || pending.current?.accountId === accountId) return;
    const request = { accountId };
    const kind = patch.design === undefined ? "display" : "design";
    pending.current = request;
    const next = {
      cardBack: patch.design ?? value.cardBack,
      displayMode: patch.display ?? value.displayMode,
    };
    setOperation({ accountId, value: next, saving: true, error: "", kind });
    try {
      await updateProfile({ card_back: { game: "handandfoot", ...patch } });
      if (currentAccount.current === accountId && pending.current === request)
        setOperation({
          accountId,
          value: next,
          saving: false,
          error: "",
          kind,
        });
    } catch (error) {
      if (currentAccount.current === accountId && pending.current === request)
        setOperation({
          accountId,
          value,
          saving: false,
          error:
            error instanceof Error
              ? error.message
              : "Unable to save your card settings. Please try again.",
          kind,
        });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  };
  return (
    <Context.Provider
      value={{
        ...value,
        saving,
        displaySaving: saving && operation.kind === "display",
        error: owned && operation.kind === "design" ? operation.error : "",
        displayError:
          owned && operation.kind === "display" ? operation.error : "",
        available: !!user,
        choose: (id) => update({ design: normalizeCardBack(id) }),
        chooseDisplay: (mode) =>
          update({ display: normalizeCardBackDisplay(mode) }),
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useCardBack() {
  return useContext(Context);
}

// Local design review uses the real picker without writing account preferences.
export function CardBackPreviewProvider({ children }: { children: ReactNode }) {
  const [cardBack, setCardBack] = useState<CardBackId>(DEFAULT_CARD_BACK);
  const [displayMode, setDisplayMode] =
    useState<CardBackDisplayMode>("uniform");
  return (
    <Context.Provider
      value={{
        cardBack,
        displayMode,
        available: true,
        saving: false,
        displaySaving: false,
        error: "",
        displayError: "",
        choose: async (id) => {
          setCardBack(normalizeCardBack(id));
        },
        chooseDisplay: async (mode) => {
          setDisplayMode(normalizeCardBackDisplay(mode));
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
