import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  FOOT_GATHER_DELAY_MS,
  FOOT_GATHER_STAGGER_MS,
  FOOT_GATHER_FLIGHT_MS,
  FOOT_SOURCE_FADE_DELAY_MS,
  FOOT_SOURCE_FADE_MS,
} from "../lib/footMotion";
import "../foot-transition.css";

/** The same face-up cascade as Gather, measured from the real foot icon. */
export function FootGather({
  gathering,
  count,
  speed,
  enabled = true,
  mobile = false,
  children,
}: {
  gathering: boolean;
  count?: number;
  speed: number;
  enabled?: boolean;
  mobile?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!gathering || !root.current || mobile) return;
    const board = root.current;
    let prepared = false;
    const prepare = () => {
      if (prepared) return;
      const source = board
        .querySelector(".foot-stack")
        ?.getBoundingClientRect();
      const cards = [
        ...board.querySelectorAll<HTMLElement>(
          ".hand-card:not([data-concealed-leaving='true'])",
        ),
      ];
      // Concealed hands create their anonymous slots in a subsequent render.
      // Wait for the whole foot before measuring any of its destinations.
      if (!source || !cards.length || (count && cards.length < count)) return;
      prepared = true;
      cards.forEach((card) => {
        card.style.animation = "none";
      });
      const targets = cards.map((card) => card.getBoundingClientRect());
      cards.forEach((card, i) => {
        const target = targets[i];
        card.style.setProperty(
          "--foot-x",
          `${source.left + source.width / 2 - target.left - target.width / 2}px`,
        );
        card.style.setProperty(
          "--foot-y",
          `${source.top + source.height / 2 - target.top - target.height / 2}px`,
        );
        card.style.setProperty(
          "--foot-delay",
          `${(FOOT_GATHER_DELAY_MS + i * FOOT_GATHER_STAGGER_MS) / speed}ms`,
        );
        card.style.animation = "";
      });
    };
    prepare();
    const observer = new MutationObserver(prepare);
    observer.observe(board, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [gathering, count, speed, mobile]);
  return (
    <div
      ref={root}
      className="foot-transition"
      data-enabled={enabled}
      data-gathering={gathering}
      data-mobile={mobile}
      style={
        {
          "--foot-flight-duration": `${FOOT_GATHER_FLIGHT_MS / speed}ms`,
          "--foot-source-fade-delay": `${FOOT_SOURCE_FADE_DELAY_MS / speed}ms`,
          "--foot-source-fade-duration": `${FOOT_SOURCE_FADE_MS / speed}ms`,
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}
