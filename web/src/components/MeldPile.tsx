import { useEffect, useId, useState, type CSSProperties } from "react";
import type { Meld } from "../types";
import { Card } from "./Card";

export function MeldPile({
  meld,
  canTarget,
  onTarget,
  staged,
  flyingIds,
  cardPoints,
  targetLabel,
}: {
  meld: Meld;
  canTarget: boolean;
  onTarget: () => void;
  staged: number;
  flyingIds?: Set<string>;
  cardPoints?: Record<string, number>;
  targetLabel?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [inspectionMounted, setInspectionMounted] = useState(false);
  const inspectionId = useId();
  useEffect(() => {
    if (expanded || !inspectionMounted) return;
    const timer = window.setTimeout(() => setInspectionMounted(false), 220);
    return () => clearTimeout(timer);
  }, [expanded, inspectionMounted]);
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
  const actionLabel = canTarget
    ? (targetLabel ?? `Add selected cards to ${title}`)
    : meld.bonusLost
      ? `Inspect ${title}, book broken`
      : meld.complete
        ? `Inspect ${title}, ${kind.toLowerCase()}${straight ? "" : " book"}, ${meld.bonus} bonus points`
        : `Inspect ${title}, ${meld.cards.length} cards`;
  function activate() {
    if (canTarget) onTarget();
    else {
      setInspectionMounted(true);
      setExpanded(!expanded);
    }
  }
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
  const cover = straight
    ? meld.cards[meld.cards.length - 1]
    : meld.cards
        .slice()
        .reverse()
        .find(
          (card) =>
            card.rank === meld.rank &&
            ["hearts", "diamonds"].includes(card.suit) === !meld.dirty,
        ) || natural;
  return (
    <div
      className={`meld-pile ${meld.complete ? "completed-book" : ""} ${straight ? "straight-book" : meld.dirty ? "dirty-book" : "clean-book"} ${canTarget ? "legal-target" : ""} ${needsHandCard ? "six-card-meld" : ""}`}
      role="group"
      aria-label={`${kind} ${title}`}
      data-meld-id={meld.id}
    >
      <span className="meld-kind">{label}</span>
      {meld.complete ? (
        <button
          className={`closed-card-stack ${meld.bonusLost ? "broken-book" : ""}`}
          data-book-cover-id={cover?.id}
          onClick={activate}
          aria-label={actionLabel}
          aria-expanded={canTarget ? undefined : expanded}
          aria-controls={canTarget ? undefined : inspectionId}
          data-meld-hidden={Boolean(cover && flyingIds?.has(cover.id))}
        >
          <Card card={cover} small />
        </button>
      ) : (
        <button
          className="meld-card-stack indexed-stack"
          onClick={activate}
          aria-label={actionLabel}
          aria-expanded={canTarget ? undefined : expanded}
          aria-controls={canTarget ? undefined : inspectionId}
          aria-describedby={
            needsHandCard ? `${inspectionId}-finish` : undefined
          }
          title={needsHandCard ? finishingHint : undefined}
        >
          <div
            className="meld-card-layers"
            style={
              {
                "--stack-height": `${106 + (cards.length - 1) * 25}px`,
              } as CSSProperties
            }
          >
            {cards.map((card, index) => (
              <div
                className="meld-card-layer"
                style={{ top: index * 25 }}
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
        </button>
      )}
      {needsHandCard && (
        <span className="sr-only" id={`${inspectionId}-finish`}>
          {finishingHint}
        </span>
      )}
      <span className="meld-count">
        {meld.cards.length}
        {staged > 0 && <span className="meld-staged-count"> +{staged}</span>}
        {meld.complete || meld.bonusLost ? " cards" : " / 7"}
      </span>
      <div
        className="meld-inspection"
        id={inspectionId}
        data-expanded={expanded}
        aria-hidden={!expanded}
      >
        <div className="meld-inspection-inner">
          {inspectionMounted && (
            <>
              {meld.complete && !meld.bonusLost && (
                <span className="book-bonus">+{meld.bonus} bonus</span>
              )}
              <div
                className="meld-inspection-cards"
                role="group"
                aria-label={`Cards in ${title}`}
              >
                {cards.map((card) => (
                  <Card card={card} small key={card.id} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
