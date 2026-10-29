import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Card } from "./Card";
import type { Card as Face } from "../types";
import {
  FOOT_GATHER_DELAY_MS,
  FOOT_GATHER_FLIGHT_MS,
  FOOT_GATHER_STAGGER_MS,
} from "../lib/footMotion";

type Landing = {
  card: Face;
  left: number;
  top: number;
  width: number;
  height: number;
  dx: number;
  dy: number;
  scaleX: number;
  scaleY: number;
  overflow: boolean;
};

/** Every returned foot card travels from the real stack, including cards on another hand page. */
export function MobileFootCards({
  cards,
  board,
}: {
  cards: Face[];
  board: RefObject<HTMLDivElement | null>;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [landings, setLandings] = useState<Landing[]>([]);
  useLayoutEffect(() => {
    const root = board.current,
      overlay = layer.current;
    const source = root?.querySelector(".foot-stack")?.getBoundingClientRect();
    const drawer = root
      ?.querySelector(".hand-drawer-toggle")
      ?.getBoundingClientRect();
    if (!root || !overlay || !source || !drawer) return;
    const origin = overlay.getBoundingClientRect();
    const slots = [
      ...root.querySelectorAll<HTMLElement>(
        ".hand-scroll .hand-card[data-card-id]",
      ),
    ];
    setLandings(
      cards.map((card) => {
        const slot = slots.find((node) => node.dataset.cardId === card.id);
        const face = slot?.querySelector(".card")?.getBoundingClientRect();
        const visible = Boolean(face?.width && face?.height);
        const target = visible
          ? face!
          : {
              left: drawer.left + drawer.width / 2 - 31,
              top: drawer.top + 14,
              width: 62,
              height: 87,
            };
        const width = target.width,
          height = target.height;
        const left = source.left + source.width / 2 - width / 2,
          top = source.top + source.height / 2 - height / 2;
        return {
          card,
          left: left - origin.left,
          top: top - origin.top,
          width,
          height,
          dx: target.left - left,
          dy: target.top - top,
          scaleX: source.width / width,
          scaleY: source.height / height,
          overflow: !visible,
        };
      }),
    );
  }, [cards, board]);
  return (
    <div ref={layer} className="mobile-foot-flight-layer" aria-hidden="true">
      {landings.map((landing, index) => (
        <div
          className="mobile-foot-card"
          key={landing.card.id}
          data-card-id={landing.card.id}
          data-overflow={landing.overflow}
          style={
            {
              left: landing.left,
              top: landing.top,
              width: landing.width,
              height: landing.height,
              "--foot-end-x": `${landing.dx}px`,
              "--foot-end-y": `${landing.dy}px`,
              "--foot-source-scale-x": landing.scaleX,
              "--foot-source-scale-y": landing.scaleY,
              animationDuration: `${FOOT_GATHER_FLIGHT_MS}ms`,
              animationDelay: `${FOOT_GATHER_DELAY_MS + index * FOOT_GATHER_STAGGER_MS}ms`,
            } as CSSProperties
          }
        >
          <Card card={landing.card} />
        </div>
      ))}
    </div>
  );
}
