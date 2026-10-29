import type { CSSProperties } from "react";
import { Card } from "./Card";
import { BOOK_CLOSE_MS, type BookClosingFlight } from "../hooks/useBookClosing";

export function ClosingBooks({
  flight,
  speed,
  paused,
  direction = "close",
}: {
  flight: BookClosingFlight;
  speed: number;
  paused: boolean;
  direction?: "close" | "open";
}) {
  const openingPiles =
    direction === "open"
      ? [
          ...new Set(
            flight.cards.map(({ pile }) =>
              pile.red
                ? ".game-page .open-piles .red-three-pile"
                : `.game-page .open-piles [data-meld-id="${pile.id}"]`,
            ),
          ),
        ]
      : [];
  return (
    <div
      className={`book-closing-layer${direction === "open" ? " book-opening-layer" : ""}`}
      aria-hidden="true"
    >
      {openingPiles.length > 0 && (
        <style>
          {openingPiles
            .map(
              (selector) =>
                `${selector} > .meld-kind, ${selector} > .meld-count {opacity:0;transition:none;}`,
            )
            .join("\n")}
        </style>
      )}
      {flight.cards.map(({ card, from, gather, to, cover, indexed }) => (
        <div
          className={`book-closing-card${direction === "open" ? " book-opening-card" : ""}`}
          key={card.id}
          data-closing-card-id={card.id}
          data-opening-card-id={direction === "open" ? card.id : undefined}
          style={
            {
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
              "--book-cover-layer": cover ? 1 : 0,
              animationPlayState: paused ? "paused" : "running",
              "--book-gather-x": `${gather.left - from.left}px`,
              "--book-gather-y": `${gather.top - from.top}px`,
              "--book-start-rotation": `${from.rotation ?? 0}deg`,
              "--book-x": `${to.left - from.left}px`,
              "--book-y": `${to.top - from.top}px`,
              "--book-scale-x": from.width ? to.width / from.width : 1,
              "--book-scale-y": from.height ? to.height / from.height : 1,
              "--book-duration": `${BOOK_CLOSE_MS / speed}ms`,
            } as CSSProperties
          }
        >
          <Card card={card} indexed={indexed} />
        </div>
      ))}
    </div>
  );
}
