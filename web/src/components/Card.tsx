import type { Card as Face } from "../types";
import { asset } from "../lib/assets";
import { iconData } from "./iconData";

const suits = {
  hearts: iconData.heart,
  diamonds: iconData.diamond,
  clubs: iconData.club,
  spades: iconData.spade,
  joker: iconData.joker,
};
export function cardName(card: Face) {
  return card.rank === "Joker"
    ? "Joker, 50 points"
    : `${card.rank} of ${card.suit}${card.redThree ? ", red three" : ""}`;
}
export function Card({
  card,
  selected = false,
  onClick,
  small = false,
  disabled = false,
  indexed = false,
  pointsLeft,
}: {
  card?: Face;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  disabled?: boolean;
  indexed?: boolean;
  pointsLeft?: number;
}) {
  const className = `card ${small ? "card-small" : ""} ${selected ? "selected" : ""} ${indexed ? "indexed-card" : ""} ${card && ["hearts", "diamonds"].includes(card.suit) ? "red" : ""} ${card?.wild ? "wild" : ""}`;
  const suit = card
    ? suits[card.suit as keyof typeof suits] || suits.joker
    : null;
  const face = card ? (
    <>
      {indexed && (
        <span className="card-index" aria-hidden="true">
          <span>{card.rank}</span>
          <svg viewBox={suit!.viewBox} focusable="false">
            {suit!.paths.map((path, index) => (
              <path key={index} d={path} />
            ))}
          </svg>
        </span>
      )}
      <svg
        className="card-art"
        viewBox="0 0 80 112"
        aria-hidden="true"
        focusable="false"
      >
        <text
          className={card.rank === "Joker" ? "joker-rank" : undefined}
          x="40"
          y="50"
          textAnchor="middle"
        >
          {card.rank === "Joker" ? "JOKER" : card.rank}
        </text>
        <svg x="28" y="60" width="24" height="24" viewBox={suit!.viewBox}>
          {suit!.paths.map((path, index) => (
            <path key={index} d={path} />
          ))}
        </svg>
      </svg>
      {selected && (
        <span className="selection-check" aria-hidden="true">
          ✓
        </span>
      )}
      {pointsLeft !== undefined && (
        <span className="card-points-left">{pointsLeft} pts left</span>
      )}
    </>
  ) : (
    <>
      <img
        className="card-back light-back"
        src={asset(`cards/card-back-light${small ? "-mini" : ""}.svg`)}
        alt=""
        draggable="false"
      />
      <img
        className="card-back dark-back"
        src={asset(`cards/card-back-dark${small ? "-mini" : ""}.svg`)}
        alt=""
        draggable="false"
      />
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={className}
      aria-label={card ? cardName(card) : "Face-down card"}
      aria-pressed={selected}
      onClick={onClick}
      disabled={disabled}
    >
      {face}
    </button>
  ) : (
    <div
      className={className}
      role="img"
      aria-label={card ? cardName(card) : "Face-down card"}
    >
      {face}
    </div>
  );
}
