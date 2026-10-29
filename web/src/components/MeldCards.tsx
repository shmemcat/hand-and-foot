import type { CSSProperties } from "react";
import { Card } from "./Card";
import { MELD_FLIGHT_MS, type MeldFlight } from "../hooks/useMeldMotion";

export function MeldCards({
  flight,
  paused,
}: {
  flight: MeldFlight;
  paused: boolean;
}) {
  return (
    <div
      className="meld-flight-layer"
      data-to-divider={flight.divider !== undefined}
      style={
        {
          "--meld-divider": `${Math.max(0, flight.divider ?? 0)}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {flight.cards.map(({ card, from, to, meldId }) => (
        <div
          className="meld-card-flight"
          key={card.id}
          data-card-id={card.id}
          data-meld-id={meldId}
          style={
            {
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
              animationPlayState: paused ? "paused" : "running",
              "--meld-x": `${to.left - from.left}px`,
              "--meld-y": `${to.top - from.top}px`,
              "--meld-scale-x": from.width ? to.width / from.width : 1,
              "--meld-scale-y": from.height ? to.height / from.height : 1,
              "--meld-rotation": `${to.rotation ?? 0}deg`,
              "--meld-duration": `${MELD_FLIGHT_MS / flight.speed}ms`,
            } as CSSProperties
          }
        >
          <Card card={card} />
        </div>
      ))}
    </div>
  );
}
