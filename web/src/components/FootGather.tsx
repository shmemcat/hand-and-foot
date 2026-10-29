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
  speed,
  enabled = true,
  children,
}: {
  gathering: boolean;
  speed: number;
  enabled?: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!gathering || !root.current) return;
    const board = root.current;
    const source = board.querySelector(".foot-stack")?.getBoundingClientRect();
    if (!source) return;
    const cards = [...board.querySelectorAll<HTMLElement>(".hand-card")];
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
  }, [gathering, speed]);
  return (
    <div
      ref={root}
      className="foot-transition"
      data-enabled={enabled}
      data-gathering={gathering}
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
