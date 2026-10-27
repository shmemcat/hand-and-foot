import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createAccountClient, type AccountUser } from "../lib/account";
import { invalidateGameSession } from "../lib/api";

const Context = createContext<{
  user: AccountUser | null;
  loading: boolean;
  error: string;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() =>
    createAccountClient(
      import.meta.env.VITE_ACCOUNT_API_URL?.trim() || "/api/account",
    ),
  );
  const [user, setUser] = useState<AccountUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const identity = useRef<string | null>(null);
  const generation = useRef(0);
  const working = useRef(false);
  const apply = (next: AccountUser | null) => {
    if (identity.current !== (next?.id ?? null)) invalidateGameSession();
    identity.current = next?.id ?? null;
    setUser(next);
    setError("");
  };
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || working.current) return;
      const version = ++generation.current;
      try {
        const state = await client.session(controller.signal);
        if (alive && version === generation.current) apply(state.user);
      } catch (e) {
        if (
          alive &&
          !controller.signal.aborted &&
          version === generation.current
        )
          setError((e as Error).message);
      } finally {
        if (alive && version === generation.current) setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("pageshow", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      alive = false;
      controller.abort();
      window.removeEventListener("focus", refresh);
      window.removeEventListener("pageshow", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [client]);
  const mutate = async (username?: string, password?: string) => {
    if (working.current) return;
    working.current = true;
    const version = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const fresh = await client.session();
      const next =
        username === undefined
          ? await client.logout(fresh.csrf_token)
          : await client.login(username, password!, fresh.csrf_token);
      if (version === generation.current) apply(next.user);
    } catch (e) {
      if (version === generation.current) setError((e as Error).message);
      throw e;
    } finally {
      working.current = false;
      if (version === generation.current) setLoading(false);
    }
  };
  return (
    <Context.Provider
      value={{
        user,
        loading,
        error,
        login: (name, password) => mutate(name, password),
        logout: () => mutate(),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useAuth() {
  const auth = useContext(Context);
  if (!auth) throw new Error("Missing AuthProvider");
  return auth;
}
