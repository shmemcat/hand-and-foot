import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import "../scoring-preview.css";

type Halo = {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Keep the glow behind the board, outside the pile rows' clipping boundaries. */
export function ScoreHalo({
  board,
  activePile,
  beatKey,
  reduced,
}: {
  board: RefObject<HTMLDivElement | null>;
  activePile?: string;
  beatKey: string;
  reduced: boolean;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [halos, setHalos] = useState<Halo[]>([]);
  useEffect(() => {
    setHost(
      board.current?.querySelector<HTMLElement>(".board-carousel") ?? null,
    );
  }, [board, beatKey]);
  useLayoutEffect(() => {
    if (!host) return;
    const measure = () => {
      const bounds = host.getBoundingClientRect();
      const scale = host.offsetWidth ? bounds.width / host.offsetWidth : 1;
      if (!scale) return;
      const next = Array.from(
        host.querySelectorAll<HTMLElement>(
          ".closed-card-stack, .meld-card-stack, .red-three-stack",
        ),
      ).flatMap((stack): Halo[] => {
        const id = stack.classList.contains("red-three-stack")
          ? "reds"
          : stack.closest<HTMLElement>("[data-meld-id]")?.dataset.meldId;
        const box = stack.getBoundingClientRect();
        if (!id || !box.width || !box.height) return [];
        // A pile may be horizontally scrolled out of view; its glow should
        // disappear with the card while the visible card's glow stays uncut.
        const row = stack.closest(".pile-group")?.getBoundingClientRect();
        if (row && (box.right <= row.left || box.left >= row.right)) return [];
        const lane = stack.closest(".player-lane")?.getBoundingClientRect();
        if (lane && (box.bottom <= lane.top || box.top >= lane.bottom))
          return [];
        return [
          {
            id,
            left: (box.left - bounds.left) / scale,
            top: (box.top - bounds.top) / scale,
            width: box.width / scale,
            height: box.height / scale,
          },
        ];
      });
      setHalos((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(host);
    for (const stack of host.querySelectorAll(
      ".closed-card-stack, .meld-card-stack, .red-three-stack",
    ))
      observer?.observe(stack);
    host.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      host.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [host, beatKey]);
  return host
    ? createPortal(
        <div
          className="score-halo-layer"
          data-reduced={reduced}
          aria-hidden="true"
        >
          {halos.map(({ id, ...box }) => (
            <div
              className="score-book-halo"
              data-score-halo-id={id}
              data-active={id === activePile}
              key={id}
              style={box}
            />
          ))}
        </div>,
        host,
      )
    : null;
}
