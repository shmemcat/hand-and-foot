import type { CSSProperties } from "react";
import type { Side } from "../types";
import { ProfileIcon } from "./ProfileIcon";

export function PlayerBoardNav({
  sides,
  viewed,
  viewerTeam,
  activeTeam,
  dealerTeam,
  previousDealerTeam,
  profileIcon,
  onView,
}: {
  sides: Side[];
  viewed: number;
  viewerTeam: number;
  activeTeam: number | null;
  dealerTeam: number | null;
  previousDealerTeam?: number;
  profileIcon?: string;
  onView: (id: number) => void;
}) {
  return (
    <nav
      className="player-board-nav"
      aria-label="Player boards"
      style={{ "--player-count": sides.length } as CSSProperties}
    >
      {sides.map((side) => {
        const isYou = side.id === viewerTeam;
        const playing = side.id === activeTeam;
        const dealer = side.id === dealerTeam;
        const destination = isYou ? "your board" : `${side.name}’s board`;
        return (
          <button
            type="button"
            className="board-player"
            key={side.id}
            data-turn={playing}
            aria-pressed={side.id === viewed}
            aria-current={playing ? "step" : undefined}
            aria-label={`View ${destination}, ${side.score.toLocaleString()} points${playing ? ", current turn" : ""}${dealer ? ", dealer" : ""}`}
            title={`View ${destination}`}
            onClick={() => onView(side.id)}
          >
            <span className="board-player-turn" aria-hidden="true" />
            <span className="board-player-name">
              <ProfileIcon name={isYou ? profileIcon : undefined} />
              <span className="board-player-text">{side.name}</span>
              {dealer && (
                <span
                  className="dealer-marker"
                  role="img"
                  aria-label="Dealer"
                  title="Dealer this round"
                >
                  D
                </span>
              )}
              {side.id === previousDealerTeam && !dealer && (
                <span
                  className="dealer-marker opening-dealer-origin"
                  aria-hidden="true"
                >
                  D
                </span>
              )}
            </span>
            <span className="board-player-score">
              {side.score.toLocaleString()} <small>points</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
