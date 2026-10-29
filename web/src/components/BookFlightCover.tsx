import type { Card as CardData } from "../types";
import type { CardPosition } from "../hooks/useMeldMotion";
import { Card } from "./Card";

/** Keep the book above incoming cards throughout their flight. */
export function BookFlightCover({
  card,
  position,
  origin = { left: 0, top: 0 },
}: {
  card: CardData;
  position: CardPosition;
  origin?: { left: number; top: number };
}) {
  return (
    <div
      className="book-flight-cover closed-card-stack"
      style={{
        left: position.left - origin.left,
        top: position.top - origin.top,
        width: position.width,
        height: position.height,
      }}
    >
      <Card card={card} small />
    </div>
  );
}
