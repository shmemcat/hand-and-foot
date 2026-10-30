import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/** Overlay cards obey the hand's scroll edges once they enter its row. */
export function ScoreFlightClip({
  board,
  beatKey,
  children,
}: {
  board: RefObject<HTMLDivElement | null>;
  beatKey: string;
  children: ReactNode;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const lastHand = useRef<DOMRect | null>(null);
  const [clipPath, setClipPath] = useState<string>();
  const measure = () => {
    const origin = layer.current?.getBoundingClientRect();
    const hand = board.current
      ?.querySelector(".hand-scroll")
      ?.getBoundingClientRect();
    // The final departing card can remove the hand row in this render.
    if (hand && hand.width > 0) lastHand.current = hand;
    const bounds = hand && hand.width > 0 ? hand : lastHand.current;
    if (!origin || !bounds) return;
    const left = bounds.left - origin.left;
    const right = bounds.right - origin.left;
    const top = bounds.top - origin.top;
    const root = board.current;
    const page = (
      root?.matches(".game-page") ? root : root?.querySelector(".game-page")
    )?.getBoundingClientRect();
    const pageLeft = page?.width ? `${page.left - origin.left}px` : "0px";
    const pageRight = page?.width ? `${page.right - origin.left}px` : "100%";
    setClipPath(
      `polygon(${pageLeft} 0, ${pageRight} 0, ${pageRight} ${top}px, ${right}px ${top}px, ${right}px 100%, ${left}px 100%, ${left}px ${top}px, ${pageLeft} ${top}px)`,
    );
  };
  useLayoutEffect(measure, [board, beatKey]);
  // The board's parent ref is attached after its children's layout effects.
  useEffect(measure, [board, beatKey]);
  return (
    <div ref={layer} className="score-flight-clip" style={{ clipPath }}>
      {children}
    </div>
  );
}
