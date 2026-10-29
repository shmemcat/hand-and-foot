import { useId, type CSSProperties } from "react";
import type { Meld } from "../types";
import { Card } from "./Card";
import { bookCover } from "../lib/bookCover";

export function MeldPile({
  meld,
  canTarget,
  onTarget,
  staged,
  flyingIds,
  cardPoints,
  targetLabel,
  compact = false,
}: {
  meld: Meld;
  canTarget: boolean;
  onTarget: () => void;
  staged: number;
  flyingIds?: Set<string>;
  cardPoints?: Record<string, number>;
  targetLabel?: string;
  compact?: boolean;
}) {
  const finishHintId = useId();
  const Stack = canTarget ? "button" : "div";
  const straight = meld.kind === "run";
  const needsHandCard =
    !meld.complete && !meld.bonusLost && meld.cards.length === 6;
  const finishingHint =
    "Finish this pile with a card from your hand. You cannot take the discard to complete it.";
  const kind = straight ? "Straight" : meld.dirty ? "Dirty" : "Clean";
  const label = meld.bonusLost
    ? "Broken book"
    : meld.complete
      ? straight
        ? "Complete straight"
        : `${kind} book`
      : kind;
  const title = straight ? `${meld.rank} straight` : `${meld.rank}’s`;
  const stackLabel = canTarget
    ? (targetLabel ?? `Add selected cards to ${title}`)
    : meld.bonusLost
      ? `${title}, book broken`
      : meld.complete
        ? `${title}, ${kind.toLowerCase()}${straight ? "" : " book"}, ${meld.bonus} bonus points`
        : `${title}, ${meld.cards.length} cards`;
  // Twos are natural in a pile of twos; other matching piles use their own rank.
  const natural = !straight
    ? meld.cards
        .slice()
        .reverse()
        .find((card) => card.rank === meld.rank)
    : undefined;
  const cards = natural
    ? [...meld.cards.filter((card) => card.id !== natural.id), natural]
    : meld.cards;
  const cover = bookCover(meld);
  return (
    <div
      className={`meld-pile ${meld.complete ? "completed-book" : ""} ${straight ? "straight-book" : meld.dirty ? "dirty-book" : "clean-book"} ${canTarget ? "legal-target" : ""} ${needsHandCard ? "six-card-meld" : ""}`}
      role="group"
      aria-label={`${kind} ${title}`}
      data-meld-id={meld.id}
    >
      <span className="meld-kind">{label}</span>
      {meld.complete ? (
        <Stack
          type={canTarget ? "button" : undefined}
          role={canTarget ? undefined : "group"}
          className={`closed-card-stack ${meld.bonusLost ? "broken-book" : ""}`}
          data-book-cover-id={cover?.id}
          onClick={canTarget ? onTarget : undefined}
          aria-label={stackLabel}
          data-meld-hidden={Boolean(cover && flyingIds?.has(cover.id))}
        >
          <Card card={cover} small />
        </Stack>
      ) : (
        <Stack
          type={canTarget ? "button" : undefined}
          role={canTarget ? undefined : "group"}
          className="meld-card-stack indexed-stack"
          onClick={canTarget ? onTarget : undefined}
          aria-label={stackLabel}
          aria-describedby={needsHandCard ? finishHintId : undefined}
          title={needsHandCard ? finishingHint : undefined}
        >
          <div
            className="meld-card-layers"
            style={
              {
                "--stack-height": `${(compact ? 86 : 106) + (cards.length - 1) * (compact ? 17 : 25)}px`,
              } as CSSProperties
            }
          >
            {cards.map((card, index) => (
              <div
                className="meld-card-layer"
                style={{ top: index * (compact ? 17 : 25) }}
                key={card.id}
                data-card-id={card.id}
                data-meld-hidden={flyingIds?.has(card.id)}
              >
                <Card
                  card={card}
                  indexed={index < cards.length - 1}
                  pointsLeft={cardPoints?.[card.id]}
                />
              </div>
            ))}
          </div>
        </Stack>
      )}
      {needsHandCard && (
        <span className="sr-only" id={finishHintId}>
          {finishingHint}
        </span>
      )}
      <span className="meld-count">
        {meld.cards.length}
        {staged > 0 && <span className="meld-staged-count"> +{staged}</span>}
        {meld.complete || meld.bonusLost ? " cards" : " / 7"}
      </span>
    </div>
  );
}
