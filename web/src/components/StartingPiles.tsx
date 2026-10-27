import type { Card as Face } from "../types";
import { Card } from "./Card";

/** Shared by the live choice and the opening rehearsal's outgoing piles. */
export function StartingPiles({
  piles,
  onChoose,
  disabled = false,
  opening = false,
  exiting = false,
  choice = null,
}: {
  piles: Face[][];
  onChoose?: (pile: number) => void;
  disabled?: boolean;
  opening?: boolean;
  exiting?: boolean;
  choice?: number | null;
}) {
  return (
    <div
      className={`choose-piles${exiting ? " opening-exit-piles" : ""}`}
      aria-hidden={exiting || undefined}
    >
      {!opening && (
        <p>
          See the top & bottom cards. Choose one pile as your hand.
          <br />
          <span>The other becomes your foot, with its top card visible.</span>
        </p>
      )}
      <div>
        {piles.map((pile, index) => (
          <button
            className="choose-pile"
            key={index}
            aria-label={
              opening ? `Choose pile ${index + 1} as your hand` : undefined
            }
            disabled={disabled || exiting}
            onClick={() => onChoose?.(index)}
            data-chosen={exiting ? choice === index : undefined}
          >
            <span
              className={`pile-preview${opening ? " opening-choice-stack" : ""}`}
            >
              <Card card={pile[0]} />
              <Card />
              <Card card={pile[1]} />
              {opening && (
                <span className="opening-stack-depth" aria-hidden="true">
                  <Card />
                  <Card />
                </span>
              )}
              {exiting && choice === index && (
                <span className="opening-gather-source" aria-hidden="true">
                  <Card />
                  <Card />
                  <Card />
                </span>
              )}
            </span>
            <strong>Play pile {index + 1}</strong>
            <small>11 cards · Top & bottom shown</small>
          </button>
        ))}
      </div>
    </div>
  );
}
