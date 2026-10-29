import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Card } from "./Card";
import {
  DRAW_FLIGHT_MS,
  DRAW_FLIP_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
  type DrawRequest,
} from "../hooks/useDrawMotion";
import type { Card as Face } from "../types";

export function DrawCards({
  request,
  cards,
  board,
  toDivider = false,
}: {
  request: DrawRequest;
  cards: Face[];
  board: RefObject<HTMLDivElement | null>;
  toDivider?: boolean;
}) {
  const [targets, setTargets] = useState<
    { x: number; y: number; sx: number; sy: number }[]
  >([]);
  const ids = cards.map((card) => card.id).join(",");
  const travel = DRAW_FLIGHT_MS;
  const flip = DRAW_FLIP_MS;
  const revealed = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (toDivider || !cards.length || revealed.current === request.key) return;
    const strip = board.current?.querySelector<HTMLElement>(".hand-scroll");
    if (!strip) return;
    const slots = [
      ...strip.querySelectorAll<HTMLElement>(".hand-card[data-card-id]"),
    ];
    // The rendered hand is sorted from high to low, independently of draw order.
    const incoming = slots
      .filter((slot) => cards.some((card) => card.id === slot.dataset.cardId))
      .map((slot) => slot.getBoundingClientRect());
    if (incoming.length !== cards.length) return;
    revealed.current = request.key;
    const bounds = strip.getBoundingClientRect();
    const scale = strip.offsetWidth ? bounds.width / strip.offsetWidth : 1;
    const contentLeft = bounds.left + strip.clientLeft * scale;
    const left = Math.max(0, contentLeft);
    const right = Math.min(
      window.innerWidth,
      contentLeft + strip.clientWidth * scale,
    );
    if (
      right <= left ||
      incoming.some((rect) => rect.right > left && rect.left < right)
    )
      return;
    // Even a partly visible draw keeps the current view. Reveal the whole group
    // with breathing room if it fits; otherwise give the higher card priority.
    const higher = incoming[0];
    const inset = 16 * scale;
    const groupLeft = Math.min(...incoming.map((rect) => rect.left));
    const groupRight = Math.max(...incoming.map((rect) => rect.right));
    const fits = groupRight - groupLeft <= right - left - 2 * inset;
    const start = fits ? groupLeft : higher.left;
    const end = fits ? groupRight : higher.right;
    const shift =
      start < left + inset ? start - left - inset : end - right + inset;
    strip.scrollTo({
      left: strip.scrollLeft + shift / scale,
      behavior: "smooth",
    });
  }, [request.key, ids, board, toDivider]);
  useLayoutEffect(() => {
    const shifts: Animation[] = [];
    for (const slot of board.current?.querySelectorAll<HTMLElement>(
      ".hand-card[data-card-id]",
    ) ?? []) {
      const previous = request.handPositions.get(slot.dataset.cardId!);
      if (!previous || typeof slot.animate !== "function") continue;
      const now = slot.getBoundingClientRect();
      const scale = slot.offsetWidth ? now.width / slot.offsetWidth : 1;
      const x = (previous.left - now.left) / scale;
      const y = (previous.top - now.top) / scale;
      if (!x && !y) continue;
      shifts.push(
        slot.animate(
          [
            { transform: `translate(${x}px, ${y}px)` },
            { transform: "translate(0, 0)" },
          ],
          {
            duration: travel / request.speed,
            easing: "cubic-bezier(.22,.68,.26,1)",
          },
        ),
      );
    }
    return () => shifts.forEach((animation) => animation.cancel());
  }, [request.key, ids, board]);
  useLayoutEffect(() => {
    const measure = () => {
      if (toDivider) {
        const divider = board.current
          ?.querySelector(".game-header")
          ?.getBoundingClientRect().bottom;
        setTargets(
          cards.map(() => ({
            x: 0,
            y:
              (divider ?? request.from.top) -
              request.from.top -
              request.from.height * 0.15,
            sx: 1,
            sy: 1,
          })),
        );
        return;
      }
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
  }, [request.key, ids, board, toDivider]);
  const divider =
    toDivider && targets[0]
      ? Math.max(
          0,
          targets[0].y + request.from.top + request.from.height * 0.15,
        )
      : undefined;
  return (
    <div
      className="draw-flight-layer"
      data-to-divider={toDivider}
      style={
        divider === undefined
          ? undefined
          : { height: divider, bottom: "auto", overflow: "hidden" }
      }
      aria-hidden="true"
    >
      {request.replaced?.map(({ card, from, to }) => (
        <div
          className="red-replacement-flight"
          key={`replace-${card.id}`}
          style={
            {
              left: from.left,
              top: from.top,
              width: from.width,
              height: from.height,
              "--replace-x": `${to.left - from.left}px`,
              "--replace-y": `${to.top - from.top}px`,
              "--replace-scale-x": to.width / from.width,
              "--replace-scale-y": to.height / from.height,
              animationDuration: `${RED_REPLACEMENT_MS / request.speed}ms`,
            } as CSSProperties
          }
        >
          <Card card={card} />
        </div>
      ))}
      {cards.map(
        (card, i) =>
          targets[i] && (
            <div
              className="draw-card-flight"
              data-to-divider={toDivider}
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
                  "--draw-duration": `${travel / request.speed}ms`,
                  "--draw-flip-duration": `${flip / request.speed}ms`,
                  "--draw-delay": `${((request.replaced?.length ? RED_REPLACEMENT_MS : 0) + i * DRAW_STAGGER_MS) / request.speed}ms`,
                  "--draw-flip-delay": `${((request.replaced?.length ? RED_REPLACEMENT_MS : 0) + 24 + i * DRAW_STAGGER_MS) / request.speed}ms`,
                } as CSSProperties
              }
            >
              {toDivider ? (
                <Card small />
              ) : (
                <div className="draw-card-flip">
                  <div className="draw-card-back">
                    <Card small />
                  </div>
                  <div className="draw-card-face">
                    <Card card={card} small />
                  </div>
                </div>
              )}
            </div>
          ),
      )}
    </div>
  );
}
