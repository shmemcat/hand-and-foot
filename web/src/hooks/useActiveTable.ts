import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { command, GameApiError, getRoom, request } from "../lib/api";
import { readStorage, removeStorage } from "../lib/storage";
import type { Snapshot } from "../types";

export type ActiveTable = Pick<
  Snapshot,
  "code" | "playMode" | "scoringMode" | "capacity" | "phase" | "round"
>;

export function useActiveTable() {
  const { user, loading } = useAuth();
  const owner = user?.id ?? "guest";
  const [lookup, setLookup] = useState<{
    owner: string;
    rooms: ActiveTable[];
    pending: boolean;
  }>({ owner, rooms: [], pending: true });
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState<{
    owner: string;
    table: ActiveTable;
  } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const working = useRef(false);
  const dismissed = useRef(new Set<string>());
  const retry = () => setAttempt((value) => value + 1);
  useEffect(() => {
    const refresh = () => {
      setOnline(navigator.onLine);
      retry();
    };
    const offline = () => setOnline(false);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("offline", offline);
    };
  }, []);
  useEffect(() => {
    if (loading) return;
    let active = true;
    setLookup((old) => ({
      owner,
      rooms: old.owner === owner ? old.rooms : [],
      pending: true,
    }));
    setError("");
    void request<{ rooms: ActiveTable[] }>("/active")
      .then(({ rooms }) => {
        if (active) setLookup({ owner, rooms, pending: false });
      })
      .catch(() => {
        if (active) {
          setLookup((old) => ({ ...old, pending: false }));
          setError("Couldn’t check your current table. Please try again.");
        }
      });
    return () => {
      active = false;
    };
  }, [owner, loading, attempt]);
  const rooms =
    !loading && lookup.owner === owner
      ? lookup.rooms.filter(
          (room) => !dismissed.current.has(`${owner}:${room.code}`),
        )
      : [];
  // Older previews could have more than one table. Resolve them one at a time.
  const table =
    !loading && leaving?.owner === owner
      ? leaving.table
      : (rooms.find((room) => room.playMode === "practice") ??
        rooms[0] ??
        null);
  async function leave() {
    if (!table || working.current || !online) return;
    working.current = true;
    setLeaving({ owner, table });
    setError("");
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const latest = await getRoom(table.code);
          await command(
            latest,
            ["lobby", "finished"].includes(latest.phase) ? "leave" : "concede",
          );
          break;
        } catch (error) {
          if (error instanceof GameApiError) {
            if (
              error.status === 404 ||
              (error.status === 403 &&
                error.message === "Join this table before viewing it.")
            )
              break;
            if (error.status === 409 && attempt < 2) continue;
          }
          throw error;
        }
      }
      dismissed.current.add(`${owner}:${table.code}`);
      setLookup((old) => ({
        ...old,
        rooms: old.rooms.filter((room) => room.code !== table.code),
      }));
      if (readStorage("handandfoot.room.v1", null) === table.code)
        removeStorage("handandfoot.room.v1");
    } catch (error) {
      setError((error as Error).message);
    } finally {
      working.current = false;
      setLeaving(null);
    }
  }
  return {
    table,
    checking: loading || lookup.owner !== owner || lookup.pending,
    busy: Boolean(leaving),
    error,
    online,
    leave,
    retry,
  };
}
