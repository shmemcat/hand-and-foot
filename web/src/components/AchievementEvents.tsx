import { useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { request } from "../lib/api";
import { readStorage, removeStorage, writeStorage } from "../lib/storage";
import { ACHIEVEMENT_EVENT, MUSIC_OFF_EVENT } from "../lib/achievementEvents";

export function AchievementEvents() {
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return;
    const key = `handandfoot.music-achievement.v1:${encodeURIComponent(user.id)}`;
    let alive = true;
    let syncing = false;
    let pending = readStorage<unknown>(key, false) === true;
    const sync = async () => {
      if (syncing || !alive || !pending) return;
      syncing = true;
      try {
        await request("/achievements", { id: "geezer", userId: user.id });
        pending = false;
        removeStorage(key);
        if (alive) window.dispatchEvent(new Event(ACHIEVEMENT_EVENT));
      } catch {
        // Retry this account's pending unlock on focus or its next sign-in.
      } finally {
        syncing = false;
      }
    };
    const record = () => {
      pending = true;
      writeStorage(key, true);
      void sync();
    };
    const refresh = () => {
      void sync();
    };
    void sync();
    window.addEventListener(MUSIC_OFF_EVENT, record);
    window.addEventListener("focus", refresh);
    return () => {
      alive = false;
      window.removeEventListener(MUSIC_OFF_EVENT, record);
      window.removeEventListener("focus", refresh);
    };
  }, [user?.id]);
  return null;
}
