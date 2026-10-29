import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { publicHandSlots } from "../hooks/useConcealedHand";
import type { CardPosition } from "../hooks/useMeldMotion";
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

export function TableCards({
  flight,
  board,
}: {
  flight: TableFlight;
  board?: RefObject<HTMLDivElement | null>;
}) {
  const { event, from, to } = flight;
  const [origin, setOrigin] = useState<{
    id: string;
    position: CardPosition;
  } | null>(null);
  useLayoutEffect(() => {
    if (
      !board ||
      !flight.concealed ||
      !["discard", "replace"].includes(event.kind)
    )
      return;
    const slot = publicHandSlots(board.current).find(
      (slot) => slot.dataset.concealedLeaving === "true",
    );
    if (!slot) return;
    const { left, top, width, height } = (
      slot.querySelector(".card") ?? slot
    ).getBoundingClientRect();
    const position = { left, top, width, height };
    if (
      origin?.id !== event.id ||
      JSON.stringify(origin.position) !== JSON.stringify(position)
    )
      setOrigin({ id: event.id, position });
  });
  const source = origin?.id === event.id ? origin.position : from;
  const [landings, setLandings] = useState<{
    id: string;
    targets: CardPosition[];
  } | null>(null);
  useLayoutEffect(() => {
    if (!board || !flight.concealed || !["draw", "pickup"].includes(event.kind))
      return;
    const slots = publicHandSlots(board.current).filter(
      (slot) =>
        slot.dataset.concealedHidden === "true" &&
        slot.dataset.concealedLeaving !== "true",
    );
    if (slots.length < event.count) return;
    const targets = slots.slice(0, event.count).map((slot) => {
      const { left, top, width, height } = (
        slot.querySelector(".card") ?? slot
      ).getBoundingClientRect();
      return { left, top, width, height };
    });
    if (
      landings?.id !== event.id ||
      JSON.stringify(landings.targets) !== JSON.stringify(targets)
    )
      setLandings({ id: event.id, targets });
  });
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
      {Array.from({ length: event.count }, (_, index) => {
        const target =
          (landings?.id === event.id ? landings.targets[index] : undefined) ??
          flight.targets?.[index] ??
          to;
        const reveal =
          flight.concealed &&
          ["discard", "replace"].includes(event.kind) &&
          !event.faceDown;
        return (
          <div
            className="table-card-flight"
            key={`${event.id}-${index}`}
            data-event-kind={event.kind === "replace" ? "discard" : event.kind}
            data-replacement={event.kind === "replace"}
            data-local={flight.local}
            data-face-down={event.faceDown}
            data-concealed={flight.concealed}
            style={
              {
                left: source.left,
                top: source.top,
                width: source.width,
                height: source.height,
                "--table-x": `${target.left - source.left}px`,
                "--table-y": `${target.top - source.top}px`,
                "--table-scale-x": source.width
                  ? target.width / source.width
                  : 1,
                "--table-scale-y": source.height
                  ? target.height / source.height
                  : 1,
                "--table-duration": `${(event.kind === "replace" ? RED_REPLACEMENT_MS : event.kind === "discard" ? DISCARD_FLIGHT_MS : DRAW_FLIGHT_MS) / (flight.speed ?? 1)}ms`,
                "--table-flip-duration": `${(event.kind === "replace" ? RED_REPLACEMENT_MS : event.kind === "discard" ? DISCARD_FLIP_MS : DRAW_FLIP_MS) / (flight.speed ?? 1)}ms`,
                "--table-delay": `${(index * DRAW_STAGGER_MS) / (flight.speed ?? 1)}ms`,
              } as CSSProperties
            }
          >
            <div
              className="table-card-turn"
              data-turn={Boolean(
                (event.faceDown && flight.local && !flight.concealed) || reveal,
              )}
            >
              <div className="table-card-front">
                <Card
                  card={
                    flight.concealed ? undefined : (flight.card ?? undefined)
                  }
                  small
                />
              </div>
              <div className="table-card-back">
                <Card
                  card={reveal ? (flight.card ?? undefined) : undefined}
                  small
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
