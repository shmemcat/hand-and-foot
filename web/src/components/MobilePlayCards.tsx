import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Card } from "./Card";
import {
  MOBILE_PLAY_MS,
  MOBILE_PLAY_STAGGER_MS,
  type MobilePlayFlight,
} from "../hooks/useMobilePlayMotion";

export function MobilePlayCards({ flight }: { flight: MobilePlayFlight }) {
  const layer = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ left: 0, top: 0 });
  useLayoutEffect(() => {
    const rect = layer.current?.getBoundingClientRect();
    if (rect) setOrigin({ left: rect.left, top: rect.top });
  }, [flight.key]);
  return (
    <div
      ref={layer}
      className="mobile-play-flight-layer"
      aria-hidden="true"
      data-kind={flight.kind}
    >
      {flight.cards.map(({ card, from, to }, index) => (
        <div
          className="mobile-play-card"
          key={card.id}
          data-card-id={card.id}
          style={
            {
              left: from.left - origin.left,
              top: from.top - origin.top,
              width: from.width,
              height: from.height,
              "--play-x": `${to.left - from.left}px`,
              "--play-y": `${to.top - from.top}px`,
              "--play-scale-x": to.width / from.width,
              "--play-scale-y": to.height / from.height,
              "--play-rotation": `${to.rotation ?? 0}deg`,
              animationDuration: `${MOBILE_PLAY_MS}ms`,
              animationDelay: `${index * MOBILE_PLAY_STAGGER_MS}ms`,
            } as CSSProperties
          }
        >
          <div className="mobile-play-face" data-face-down={flight.faceDown}>
            <Card card={card} />
            <div className="mobile-play-back">
              <Card />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
