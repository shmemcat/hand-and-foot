import { useId, useState } from "react";
import type { Card as Face } from "../types";
import { Card, cardName } from "./Card";
import { Icon } from "./Icons";

export function FootPreview({
  topCard,
  count,
  owner = "Your",
  ownerBack,
}: {
  topCard: Face | null;
  count: number;
  owner?: string;
  ownerBack?: string;
}) {
  const tooltipId = useId();
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = Boolean(topCard && (hovered || focused));
  const red = topCard && ["hearts", "diamonds"].includes(topCard.suit);

  return (
    <span
      className="foot-status"
      role="group"
      aria-label={`${owner} foot, ${count} cards`}
      aria-describedby={open ? tooltipId : undefined}
      tabIndex={topCard ? 0 : undefined}
      data-preview-open={open}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      <span className="foot-stack" aria-hidden="true">
        <Card small ownerBack={ownerBack} />
        <Card small ownerBack={ownerBack} />
        {topCard ? (
          <span className={`card foot-rank${red ? " red" : ""}`}>
            {topCard.rank === "Joker" ? <Icon name="joker" /> : topCard.rank}
          </span>
        ) : (
          <Card small ownerBack={ownerBack} />
        )}
      </span>
      <span>Foot · {count} cards</span>
      {topCard && (
        <span
          className="foot-preview"
          role="tooltip"
          id={tooltipId}
          aria-hidden={!open}
        >
          <span aria-hidden="true">
            <Card card={topCard} />
          </span>
          <span className="sr-only">{cardName(topCard)}</span>
        </span>
      )}
    </span>
  );
}
