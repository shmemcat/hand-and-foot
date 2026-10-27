import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Card } from "./Card";
import {
  DRAW_FLIGHT_MS,
  DRAW_FLIP_MS,
  DRAW_STAGGER_MS,
  type DrawRequest,
} from "../hooks/useDrawMotion";
import type { Card as Face } from "../types";

export function DrawCards({
  request,
  cards,
  board,
}: {
  request: DrawRequest;
  cards: Face[];
  board: RefObject<HTMLDivElement | null>;
}) {
  const [targets, setTargets] = useState<
    { x: number; y: number; sx: number; sy: number }[]
  >([]);
  const ids = cards.map((card) => card.id).join(",");
  useLayoutEffect(() => {
    const shifts: Animation[] = [];
    for (const slot of board.current?.querySelectorAll<HTMLElement>(
      ".hand-card[data-card-id]",
    ) ?? []) {
      const previous = request.handPositions.get(slot.dataset.cardId!);
      if (!previous || typeof slot.animate !== "function") continue;
      const now = slot.getBoundingClientRect();
      const x = previous.left - now.left;
      const y = previous.top - now.top;
      if (!x && !y) continue;
      shifts.push(
        slot.animate(
          [
            { transform: `translate(${x}px, ${y}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: DRAW_FLIGHT_MS / request.speed,
            easing: "cubic-bezier(.22,.68,.26,1)",
          },
        ),
      );
    }
    return () => shifts.forEach((animation) => animation.cancel());
  }, [request.key, ids, board]);
  useLayoutEffect(() => {
    const measure = () => {
      const slots = [
        ...(board.current?.querySelectorAll<HTMLElement>(
          ".hand-card[data-card-id]",
        ) ?? []),
      ];
      setTargets(
        cards.map((card) => {
          const rect = slots
            .find((slot) => slot.dataset.cardId === card.id)
            ?.getBoundingClientRect();
          return rect
            ? {
                x: rect.left - request.from.left,
                y: rect.top - request.from.top,
                sx: rect.width / (request.from.width || 1),
                sy: rect.height / (request.from.height || 1),
              }
            : { x: 0, y: 0, sx: 1, sy: 1 };
        }),
      );
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [request.key, ids, board]);
  return (
    <div className="draw-flight-layer" aria-hidden="true">
      {cards.map(
        (card, i) =>
          targets[i] && (
            <div
              className="draw-card-flight"
              key={card.id}
              style={
                {
                  left: request.from.left,
                  top: request.from.top,
                  width: request.from.width,
                  height: request.from.height,
                  "--draw-x": `${targets[i].x}px`,
                  "--draw-y": `${targets[i].y}px`,
                  "--draw-scale-x": targets[i].sx,
                  "--draw-scale-y": targets[i].sy,
                  "--draw-duration": `${DRAW_FLIGHT_MS / request.speed}ms`,
                  "--draw-flip-duration": `${DRAW_FLIP_MS / request.speed}ms`,
                  "--draw-delay": `${(i * DRAW_STAGGER_MS) / request.speed}ms`,
                  "--draw-flip-delay": `${(24 + i * DRAW_STAGGER_MS) / request.speed}ms`,
                } as CSSProperties
              }
            >
              <div className="draw-card-flip">
                <div className="draw-card-back">
                  <Card small />
                </div>
                <div className="draw-card-face">
                  <Card card={card} small />
                </div>
              </div>
            </div>
          ),
      )}
    </div>
  );
}
