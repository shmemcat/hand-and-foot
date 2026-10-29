import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { ProfileIcon } from "../components/ProfileIcon";
import { request } from "../lib/api";
import { ResultCategoryTabs } from "../components/ResultCategoryTabs";
import {
  CATEGORY_LABELS,
  LEADERBOARD_CATEGORIES,
  leaderboardCategory,
} from "../lib/resultCategories";
import "../leaderboard.css";

type Entry = {
  rank: number;
  username: string;
  profile_icon: string;
} & ({ games_won: number } | { achievement_count: number });
type Rankings = { monthly: Entry[]; all_time: Entry[] };

export function Leaderboard() {
  const [search, setSearch] = useSearchParams();
  const category = leaderboardCategory(search);
  const achievements = category === "achievements";
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void request<Rankings>(`/leaderboard?category=${category}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [category, attempt]);
  return (
    <div className="page leaderboard-page">
      <PageTitle>LEADERBOARD</PageTitle>
      <div className="page-body">
        <ResultCategoryTabs
          categories={LEADERBOARD_CATEGORIES}
          value={category}
          onChange={(selected) =>
            setSearch({ category: selected }, { replace: true })
          }
          label="Leaderboard category"
        />
        {!data && !error && (
          <p className="leaderboard-status" role="status">
            Loading scores…
          </p>
        )}
        {error && (
          <div className="button-stack">
            <p className="error" role="alert">
              {error}
            </p>
            <button
              className="button"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Try Again
            </button>
          </div>
        )}
        {data && (
          <div
            className={`leaderboard-columns${achievements ? " achievement-standings" : ""}`}
          >
            {(achievements
              ? (["all_time"] as const)
              : (["monthly", "all_time"] as const)
            ).map((period) => {
              const title = period === "monthly" ? "Monthly" : "All-Time";
              return (
                <section
                  className="leaderboard-column"
                  aria-label={`${title} leaderboard`}
                  key={period}
                >
                  <h2>{title}</h2>
                  <table
                    aria-label={
                      achievements
                        ? "All-Time achievements leaderboard"
                        : `${title} ${CATEGORY_LABELS[category]} winners`
                    }
                  >
                    <colgroup>
                      <col className="leaderboard-rank-width" />
                      <col />
                      <col
                        className={
                          achievements
                            ? "leaderboard-achievements-width"
                            : "leaderboard-wins-width"
                        }
                      />
                    </colgroup>
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Player</th>
                        <th scope="col">
                          {achievements ? "Achievements" : "Wins"}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data[period].length ? (
                        data[period].map((entry) => (
                          <tr key={entry.rank}>
                            <td className="leaderboard-rank">{entry.rank}</td>
                            <td className="leaderboard-player">
                              <div>
                                <ProfileIcon name={entry.profile_icon} />
                                <span title={entry.username}>
                                  {entry.username}
                                </span>
                              </div>
                            </td>
                            <td className="leaderboard-wins">
                              {"achievement_count" in entry
                                ? `${entry.achievement_count.toLocaleString()} ${entry.achievement_count === 1 ? "achievement" : "achievements"}`
                                : `${entry.games_won.toLocaleString()} ${entry.games_won === 1 ? "win" : "wins"}`}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="leaderboard-empty" colSpan={3}>
                            {achievements
                              ? "No achievements yet"
                              : "No winners yet"}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </section>
              );
            })}
          </div>
        )}
        {achievements && (
          <p className="leaderboard-tier-note">
            Each earned tier counts separately.
          </p>
        )}
      </div>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
