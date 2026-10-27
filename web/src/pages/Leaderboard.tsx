import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { ProfileIcon } from "../components/ProfileIcon";
import { request } from "../lib/api";

type Entry = {
  rank: number;
  username: string;
  profile_icon: string;
  games_won: number;
};
type Rankings = { monthly: Entry[]; all_time: Entry[] };

export function Leaderboard() {
  const [mode, setMode] = useState<"practice" | "online">("practice");
  const [data, setData] = useState<Rankings | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setData(null);
    setError("");
    void request<Rankings>(`/leaderboard?mode=${mode}`)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((error) => {
        if (active) setError((error as Error).message);
      });
    return () => {
      active = false;
    };
  }, [mode, attempt]);
  return (
    <div className="page leaderboard-page">
      <PageTitle>LEADERBOARD</PageTitle>
      <div className="page-body">
        <div
          className="leaderboard-tabs"
          role="group"
          aria-label="Leaderboard category"
        >
          {(["practice", "online"] as const).map((category) => (
            <button
              key={category}
              type="button"
              aria-pressed={category === mode}
              onClick={() => setMode(category)}
            >
              {category === "practice" ? "Against Bots" : "Multiplayer"}
            </button>
          ))}
        </div>
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
          <div className="leaderboard-columns">
            {(["monthly", "all_time"] as const).map((period) => {
              const title = period === "monthly" ? "Monthly" : "All-Time";
              return (
                <section
                  className="leaderboard-column"
                  aria-label={`${title} leaderboard`}
                  key={period}
                >
                  <h2>{title}</h2>
                  <table
                    aria-label={`${title} ${mode === "practice" ? "Against Bots" : "Multiplayer"} winners`}
                  >
                    <colgroup>
                      <col className="leaderboard-rank-width" />
                      <col />
                      <col className="leaderboard-wins-width" />
                    </colgroup>
                    <thead className="sr-only">
                      <tr>
                        <th scope="col">Rank</th>
                        <th scope="col">Player</th>
                        <th scope="col">Wins</th>
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
                              {entry.games_won.toLocaleString()}{" "}
                              {entry.games_won === 1 ? "win" : "wins"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="leaderboard-empty" colSpan={3}>
                            No winners yet
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
      </div>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
