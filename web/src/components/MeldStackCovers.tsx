import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import type { Card as CardData } from "../types";
import { landingPosition, type CardPosition } from "../hooks/useMeldMotion";
import { Card } from "./Card";

type Target = { meldId: string; card: CardData };
type Cover = Target & {
  position: CardPosition;
  fromY: number;
  toY: number;
  duration: number;
  elapsed: number;
};

/** Mirror the top natural's slide above incoming wilds, including its current progress. */
export function MeldStackCovers({
  flightKey,
  targets,
  board,
  paused = false,
}: {
  flightKey: string | number;
  targets: Target[];
  board?: RefObject<HTMLDivElement | null>;
  paused?: boolean;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [covers, setCovers] = useState<Cover[]>([]);
  useLayoutEffect(() => {
    const container = layer.current;
    const root =
      board?.current ??
      container?.closest(".game-page") ??
      container?.parentElement?.parentElement;
    if (!container || !root) return;
    const origin = container.getBoundingClientRect();
    setCovers(
      targets.flatMap(({ meldId, card }) => {
        const top = root.querySelector<HTMLElement>(
          `.meld-pile[data-meld-id="${meldId}"] .meld-card-layer:last-child[data-card-id="${card.id}"]`,
        );
        const face = top?.querySelector(".card");
        if (!top || !face) return [];
        const position = landingPosition(face);
        const slide = top
          .getAnimations?.()
          .find((animation) =>
            (animation.effect as KeyframeEffect | null)
              ?.getKeyframes?.()
              .some((frame) => frame.top !== undefined),
          );
        const effect = slide?.effect as KeyframeEffect | undefined;
        const frames = effect?.getKeyframes();
        const currentTop = parseFloat(getComputedStyle(top).top) || 0;
        const zoom = top.offsetWidth
          ? top.getBoundingClientRect().width / top.offsetWidth
          : 1;
        return [
          {
            meldId,
            card,
            position: {
              ...position,
              left: position.left - origin.left,
              top: position.top - origin.top,
            },
            fromY:
              (parseFloat(String(frames?.[0]?.top ?? currentTop)) -
                currentTop) *
              zoom,
            toY:
              (parseFloat(String(frames?.at(-1)?.top ?? currentTop)) -
                currentTop) *
              zoom,
            duration: Number(effect?.getTiming().duration) || 1,
            elapsed: Number(slide?.currentTime) || 0,
          },
        ];
      }),
    );
  }, [flightKey, board]);
  return (
    <div ref={layer} className="meld-stack-cover-layer" aria-hidden="true">
      {covers.map(
        ({ meldId, card, position, fromY, toY, duration, elapsed }) => (
          <div
            key={meldId}
            className="meld-stack-cover"
            data-cover-card-id={card.id}
            style={
              {
                left: position.left,
                top: position.top,
                width: position.width,
                height: position.height,
                "--cover-from-y": `${fromY}px`,
                "--cover-to-y": `${toY}px`,
                "--cover-rotation": `${position.rotation ?? 0}deg`,
                animationDuration: `${duration}ms`,
                animationDelay: `${-elapsed}ms`,
                animationPlayState: paused ? "paused" : "running",
              } as CSSProperties
            }
          >
            <Card card={card} />
          </div>
        ),
      )}
    </div>
  );
}
