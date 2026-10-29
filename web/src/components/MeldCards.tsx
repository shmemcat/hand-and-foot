import type { CSSProperties, RefObject } from "react";
import { Card } from "./Card";
import { MELD_FLIGHT_MS, type MeldFlight } from "../hooks/useMeldMotion";
import { bookCover } from "../lib/bookCover";
import { BookFlightCover } from "./BookFlightCover";
import { MeldStackCovers } from "./MeldStackCovers";

export function MeldCards({
  flight,
  paused,
  board,
}: {
  flight: MeldFlight;
  paused: boolean;
  board?: RefObject<HTMLDivElement | null>;
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
      {[...new Set(flight.cards.map(({ meldId }) => meldId))].map((meldId) => {
        const meld = flight.before.sides
          .flatMap((side) => side.melds)
          .find((meld) => meld.id === meldId);
        const cover = meld?.complete ? bookCover(meld) : undefined;
        return (
          cover && (
            <BookFlightCover
              key={meldId}
              card={cover}
              position={flight.cards.find((card) => card.meldId === meldId)!.to}
            />
          )
        );
      })}
      <MeldStackCovers
        flightKey={flight.key}
        board={board}
        paused={paused}
        targets={flight.before.sides.flatMap((side) =>
          side.melds.flatMap((meld) => {
            const natural =
              !meld.complete && meld.kind !== "run"
                ? meld.cards
                    .slice()
                    .reverse()
                    .find((card) => card.rank === meld.rank)
                : undefined;
            return natural &&
              flight.cards.some(
                ({ meldId, card }) =>
                  meldId === meld.id && card.rank !== meld.rank,
              )
              ? [{ meldId: meld.id, card: natural }]
              : [];
          }),
        )}
      />
    </div>
  );
}
