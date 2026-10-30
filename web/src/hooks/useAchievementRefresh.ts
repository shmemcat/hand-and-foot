import { useEffect } from "react";
import { ACHIEVEMENT_EVENT } from "../lib/achievementEvents";
import type { Snapshot } from "../types";

export function useAchievementRefresh(
  snapshot: Snapshot | null,
  enabled: boolean,
) {
  const code = snapshot?.code;
  const viewerId = snapshot?.viewerId;
  const inFoot = snapshot?.players.find(
    (player) => player.id === viewerId,
  )?.inFoot;
  const round = snapshot?.round;
  const phase = snapshot?.phase;
  const reviewPhase =
    phase === "scoring" || phase === "round_over" || phase === "finished"
      ? phase
      : null;
  const fixture = snapshot?.developmentFixture;
  useEffect(() => {
    // Check persisted unlocks at the transitions that can award them, without
    // fetching the account's full history on every turn or room poll.
    if (enabled && code && !fixture)
      window.dispatchEvent(new Event(ACHIEVEMENT_EVENT));
  }, [enabled, code, viewerId, inFoot, round, reviewPhase, fixture]);
}
