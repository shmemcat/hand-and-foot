import { useEffect, useState } from "react";
import { request } from "../lib/api";
import {
  computeAchievements,
  type AccountSummary as Summary,
  type Stats,
} from "../lib/achievements";
import { AchievementBadge } from "./AchievementBadge";
import { ACHIEVEMENT_EVENT } from "../lib/achievementEvents";
import { ResultCategoryTabs } from "./ResultCategoryTabs";
import {
  RESULT_CATEGORIES,
  type ResultCategory,
} from "../lib/resultCategories";

const emptyStats: Stats = {
  games: 0,
  wins: 0,
  rounds: 0,
  best: null,
  total: 0,
  cleanBooks: 0,
  dirtyBooks: 0,
  goingOut: 0,
};

export function AccountSummary({ preview }: { preview?: Summary }) {
  const [data, setData] = useState<Summary | null>(preview ?? null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [separate, setSeparate] = useState(false);
  const [category, setCategory] = useState<ResultCategory>("medium");
  useEffect(() => {
    if (preview) return;
    const refresh = () => setAttempt((value) => value + 1);
    window.addEventListener(ACHIEVEMENT_EVENT, refresh);
    return () => window.removeEventListener(ACHIEVEMENT_EVENT, refresh);
  }, [preview]);
  useEffect(() => {
    if (preview) return;
    let active = true;
    setError("");
    void request<Summary>("/achievements")
      .then((result) => {
        if (!result.stats || !result.counters || !Array.isArray(result.unlocks))
          throw new Error(
            "Your statistics and achievements couldn’t be loaded.",
          );
        if (active) setData(result);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [attempt, preview]);
  if (error)
    return (
      <div className="account-load-error">
        <p className="error" role="alert">
          {error}
        </p>
        <button className="text-button" onClick={() => setAttempt(attempt + 1)}>
          Try Again
        </button>
      </div>
    );
  if (!data)
    return (
      <p role="status" className="account-status">
        Loading statistics and achievements…
      </p>
    );
  const stats = separate
    ? (data.stats[category] ??
      (category === "medium"
        ? data.stats.practice
        : category === "multiplayer"
          ? data.stats.online
          : emptyStats))
    : data.stats.all;
  const badges = computeAchievements(data);
  const rows = [
    [
      ["Games Played", stats.games],
      ["Games Won", stats.wins],
      [
        "Win Rate",
        stats.games ? `${Math.round((stats.wins / stats.games) * 100)}%` : "—",
      ],
      ["Rounds Played", stats.rounds],
    ],
    [
      ["Clean Books", stats.cleanBooks],
      ["Dirty Books", stats.dirtyBooks],
      ["Best Score", stats.best === null ? "—" : stats.best.toLocaleString()],
      [
        "Avg Score",
        stats.games
          ? Math.round(stats.total / stats.games).toLocaleString()
          : "—",
      ],
    ],
  ];
  return (
    <>
      <div
        className="account-view-buttons"
        role="group"
        aria-label="Statistics view"
      >
        <button
          className="button"
          type="button"
          aria-pressed={!separate}
          onClick={() => setSeparate(false)}
        >
          All Time
        </button>
        <button
          className="button"
          type="button"
          aria-pressed={separate}
          onClick={() => setSeparate(true)}
        >
          Separate
        </button>
      </div>
      {separate && (
        <ResultCategoryTabs
          categories={RESULT_CATEGORIES}
          value={category}
          onChange={setCategory}
          label="Statistics category"
        />
      )}
      <div className="account-stats" aria-label="Your statistics">
        {rows.map((column, index) => (
          <dl key={index}>
            {column.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  {typeof value === "number" ? value.toLocaleString() : value}
                </dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      {!stats.games && (
        <p className="account-status">
          Your story starts at the table. Finish a game to record your first
          result.
        </p>
      )}
      <section
        className="achievements-panel"
        aria-labelledby="achievements-heading"
      >
        <h2 id="achievements-heading">Achievements</h2>
        <div className="achievements-grid">
          {badges.map((badge) => (
            <AchievementBadge key={badge.id} achievement={badge} />
          ))}
        </div>
      </section>
    </>
  );
}
