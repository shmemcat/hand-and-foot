import type { CSSProperties } from "react";
import { Card } from "./Card";
import {
  DISCARD_FLIGHT_MS,
  DISCARD_FLIP_MS,
  type TableFlight,
} from "../hooks/useTableMotion";
import {
  DRAW_FLIGHT_MS,
  DRAW_FLIP_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
} from "../hooks/useDrawMotion";
import "../table-motion.css";

export function TableCards({ flight }: { flight: TableFlight }) {
  const { event, from, to } = flight;
  return (
    <div
      className="table-flight-layer"
      data-public={!flight.local}
      aria-hidden="true"
      style={
        {
          "--table-divider": `${Math.max(0, flight.divider)}px`,
        } as CSSProperties
      }
    >
      {Array.from({ length: event.count }, (_, index) => (
        <div
          className="table-card-flight"
          key={`${event.id}-${index}`}
          data-event-kind={event.kind === "replace" ? "discard" : event.kind}
          data-replacement={event.kind === "replace"}
          data-local={flight.local}
          data-face-down={event.faceDown}
          style={
            {
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
              "--table-x": `${to.left - from.left}px`,
              "--table-y": `${to.top - from.top}px`,
              "--table-scale-x": from.width ? to.width / from.width : 1,
              "--table-scale-y": from.height ? to.height / from.height : 1,
              "--table-duration": `${(event.kind === "replace" ? RED_REPLACEMENT_MS : event.kind === "discard" ? DISCARD_FLIGHT_MS : DRAW_FLIGHT_MS) / (flight.speed ?? 1)}ms`,
              "--table-flip-duration": `${(event.kind === "discard" ? DISCARD_FLIP_MS : DRAW_FLIP_MS) / (flight.speed ?? 1)}ms`,
              "--table-delay": `${(index * DRAW_STAGGER_MS) / (flight.speed ?? 1)}ms`,
            } as CSSProperties
          }
        >
          <div
            className="table-card-turn"
            data-turn={Boolean(event.faceDown && flight.local)}
          >
            <div className="table-card-front">
              <Card card={flight.card ?? undefined} small />
            </div>
            <div className="table-card-back">
              <Card small />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
