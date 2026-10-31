import type { ReactNode } from "react";
import type { Snapshot } from "../types";
import { useGameMenuPopover } from "../hooks/useGameMenuPopover";
import { ScoringCheatSheet } from "./ScoringCheatSheet";

export function GameMenu({
  snapshot,
  onView,
  onScores,
  onLeave,
  children,
}: {
  snapshot: Snapshot;
  onView: (side: number) => void;
  onScores: () => void;
  onLeave: () => void;
  children?: ReactNode;
}) {
  const { menu, panel, close, open } = useGameMenuPopover();
  const ownSide = snapshot.sides.find((side) =>
    snapshot.players.some(
      (player) => player.id === snapshot.viewerId && player.team === side.id,
    ),
  );
  const canConcede = snapshot.phase !== "finished";
  return (
    <div className="game-menu-controls">
      <ScoringCheatSheet />
      <details className="game-menu" ref={menu}>
        <summary
          role="button"
          aria-label="Game information and scores"
          title="Game menu"
          aria-expanded={open}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M5 7h14M5 12h14M5 17h14" />
          </svg>
        </summary>
        <div className="game-menu-panel" ref={panel}>
          {children}
          <h2>Scores</h2>
          <p>
            Round {snapshot.round} · Play to{" "}
            {snapshot.targetScore.toLocaleString()}
          </p>
          <ol className="game-menu-scores">
            {snapshot.sides.map((side) => (
              <li key={side.id}>
                <button
                  onClick={() => {
                    onView(side.id);
                    close(true);
                  }}
                >
                  <span>{side.name}</span>
                  <strong>{side.score.toLocaleString()}</strong>
                </button>
              </li>
            ))}
          </ol>
          <button
            className="text-button menu-score-link"
            onClick={() => {
              close(true);
              onScores();
            }}
          >
            View score sheet
          </button>
          <hr />
          <h3>Your progress</h3>
          <dl className="game-menu-facts">
            <div>
              <dt>Minimum to open</dt>
              <dd>{ownSide?.opening ?? 50} points</dd>
            </div>
            <div>
              <dt>Opening meld</dt>
              <dd>{ownSide?.opened ? "Played" : "Not yet played"}</dd>
            </div>
            <div>
              <dt>Clean books</dt>
              <dd>{ownSide?.clean ?? 0}</dd>
            </div>
            <div>
              <dt>Dirty books</dt>
              <dd>{ownSide?.dirty ?? 0}</dd>
            </div>
          </dl>
          <hr />
          {snapshot.playMode === "online" && canConcede && (
            <p>
              Your seat is saved automatically when you leave this page. Return
              to Play to rejoin.
            </p>
          )}
          <button
            className="button menu-leave-button"
            onClick={() => {
              close(true);
              onLeave();
            }}
          >
            {canConcede ? "Concede" : "Leave lobby"}
          </button>
        </div>
      </details>
    </div>
  );
}
