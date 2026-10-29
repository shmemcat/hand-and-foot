import type { CSSProperties } from "react";
import { Fragment, useId } from "react";
import type { Player, Side } from "../types";
import {
  FOOT_SOURCE_FADE_DELAY_MS,
  FOOT_SOURCE_FADE_MS,
} from "../lib/footMotion";
import { ProfileIcon } from "./ProfileIcon";
import { AnimatedNumber } from "./ScoringReview";

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
  showLeader = true,
  pendingFootPlayerIds = [],
  footPickupPlayerId,
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
  showLeader?: boolean;
  pendingFootPlayerIds?: string[];
  footPickupPlayerId?: string;
}) {
  const footId = useId();
  const hasFoot = (player: Player) =>
    (player.chosen && !player.inFoot && player.footCount > 0) ||
    pendingFootPlayerIds.includes(player.id);
  const footStatus = (player: Player) => (
    <span
      className="board-player-foot"
      id={`${footId}-${player.id}`}
      role="img"
      aria-label="Foot not picked up"
      aria-hidden={!hasFoot(player) || undefined}
      title={hasFoot(player) ? "Foot not picked up" : undefined}
      data-visible={hasFoot(player)}
      data-pickup={player.id === footPickupPlayerId}
    >
      <span className="board-player-foot-icon" aria-hidden="true" />
    </span>
  );
  const partners = players.length > sides.length;
  const viewerTeam = players.find((player) => player.id === viewerId)?.team;
  const leadingScore = Math.max(...sides.map((side) => side.score));
  return (
    <nav
      className={`player-board-nav${partners ? " team-board-nav" : ""}`}
      aria-label={partners ? "Team boards" : "Player boards"}
      style={
        {
          "--player-count": sides.length,
          "--board-foot-fade-delay": `${FOOT_SOURCE_FADE_DELAY_MS}ms`,
          "--board-foot-fade-duration": `${FOOT_SOURCE_FADE_MS}ms`,
        } as CSSProperties
      }
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
            data-turn={!partners && Boolean(playing)}
            data-leading={
              showLeader && side.score > 0 && side.score === leadingScore
            }
            aria-pressed={side.id === viewed}
            aria-current={!partners && playing ? "step" : undefined}
            aria-label={`View ${destination}, ${side.score.toLocaleString()} points${turnLabel}${dealer ? ", dealer" : ""}`}
            aria-describedby={
              members
                .filter(hasFoot)
                .map((player) => `${footId}-${player.id}`)
                .join(" ") || undefined
            }
            title={`View ${destination}`}
            onClick={() => onView(side.id)}
          >
            {!partners && (
              <span className="board-player-turn" aria-hidden="true" />
            )}
            {!partners && members[0] && footStatus(members[0])}
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
                    {partners && footStatus(player)}
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
                        D
                      </span>
                    )}
                    {player.id === previousDealerId &&
                      player.id !== dealerId && (
                        <span
                          className="dealer-marker opening-dealer-origin"
                          aria-hidden="true"
                        >
                          D
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
