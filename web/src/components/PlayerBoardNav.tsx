import type { CSSProperties } from "react";
import { Fragment } from "react";
import type { Player, Side } from "../types";
import { ProfileIcon } from "./ProfileIcon";
import { AnimatedNumber } from "./ScoringReview";
import { DealerGlyph } from "./DealerGlyph";

export function PlayerBoardNav({
  sides,
  players,
  viewed,
  viewerId,
  activePlayerId,
  dealerId,
  previousDealerId,
  profileIcon,
  onView,
  disabled = false,
  showLeader = true,
}: {
  sides: Side[];
  players: Player[];
  viewed: number;
  viewerId: string;
  activePlayerId: string | null;
  dealerId: string | null;
  previousDealerId?: string;
  profileIcon?: string;
  onView: (id: number) => void;
  disabled?: boolean;
  showLeader?: boolean;
}) {
  const partners = players.length > sides.length;
  const viewerTeam = players.find((player) => player.id === viewerId)?.team;
  const leadingScore = Math.max(...sides.map((side) => side.score));
  return (
    <nav
      className={`player-board-nav${partners ? " team-board-nav" : ""}`}
      aria-label={partners ? "Team boards" : "Player boards"}
      style={{ "--player-count": sides.length } as CSSProperties}
    >
      {sides.map((side) => {
        const isYou = side.id === viewerTeam;
        const members = players.filter((player) => player.team === side.id);
        const playing = members.find((player) => player.id === activePlayerId);
        const dealer = members.some((player) => player.id === dealerId);
        const destination =
          isYou && !partners ? "your board" : `${side.name}’s board`;
        const turnLabel = playing
          ? !partners
            ? ", current turn"
            : playing.id === viewerId
              ? ", your turn"
              : `, ${playing.name}’s turn`
          : "";
        return (
          <button
            type="button"
            className="board-player"
            key={side.id}
            disabled={disabled && !isYou}
            data-turn={!partners && Boolean(playing)}
            data-leading={
              showLeader && side.score > 0 && side.score === leadingScore
            }
            aria-pressed={side.id === viewed}
            aria-current={!partners && playing ? "step" : undefined}
            aria-label={`View ${destination}, ${side.score.toLocaleString()} points${turnLabel}${dealer ? ", dealer" : ""}`}
            title={`View ${destination}`}
            onClick={() => onView(side.id)}
          >
            {!partners && (
              <span className="board-player-turn" aria-hidden="true" />
            )}
            <span
              className={
                partners ? "board-player-pair" : "board-player-members"
              }
            >
              {members.map((player, index) => (
                <Fragment key={player.id}>
                  {index > 0 && (
                    <span className="board-partner-amp" aria-hidden="true">
                      &
                    </span>
                  )}
                  <span
                    className={`board-player-name${partners ? " board-partner" : ""}`}
                    data-player-id={player.id}
                    data-turn={
                      partners ? player.id === activePlayerId : undefined
                    }
                    aria-current={
                      partners && player.id === activePlayerId
                        ? "step"
                        : undefined
                    }
                    title={player.name}
                  >
                    {partners && (
                      <span className="board-player-turn" aria-hidden="true" />
                    )}
                    <ProfileIcon
                      name={player.id === viewerId ? profileIcon : undefined}
                    />
                    <span className="board-player-text">{player.name}</span>
                    {player.id === dealerId && (
                      <span
                        className="dealer-marker"
                        role="img"
                        aria-label="Dealer"
                        title="Dealer this round"
                      >
                        <DealerGlyph />
                      </span>
                    )}
                    {player.id === previousDealerId &&
                      player.id !== dealerId && (
                        <span
                          className="dealer-marker opening-dealer-origin"
                          aria-hidden="true"
                        >
                          <DealerGlyph />
                        </span>
                      )}
                  </span>
                </Fragment>
              ))}
            </span>
            <span className="board-player-score">
              <AnimatedNumber value={side.score} /> <small>points</small>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
