import { useLayoutEffect, useRef, type RefObject } from "react";

/** Surviving hand cards slide to their sorted slots after a play or discard. */
export function useHandLayoutMotion(
  board: RefObject<HTMLDivElement | null>,
  scope: string,
  disabled: boolean,
  speed = 1,
) {
  const previous = useRef<{
    scope: string;
    ids: string;
    positions: Map<string, { left: number; top: number }>;
  } | null>(null);
  const running = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const slots = [
      ...(board.current?.querySelectorAll<HTMLElement>(
        ".hand-card[data-card-id]",
      ) ?? []),
    ];
    const ids = slots.map((slot) => slot.dataset.cardId).join(",");
    const old = previous.current;
    const reset = disabled || old?.scope !== scope;
    // Cancel before measuring so a held hand caches its real resting slots.
    if (reset) {
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
    }
    const positions = new Map(
      slots.map((slot) => {
        const rect = slot.getBoundingClientRect();
        return [
          slot.dataset.cardId!,
          { left: rect.left, top: rect.top },
        ] as const;
      }),
    );
    if (!reset && old.ids !== ids) {
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
      for (const slot of slots) {
        const from = old.positions.get(slot.dataset.cardId!),
          to = positions.get(slot.dataset.cardId!);
        if (!from || !to || !slot.animate) continue;
        const scale = slot.offsetWidth
          ? slot.getBoundingClientRect().width / slot.offsetWidth
          : 1;
        const x = (from.left - to.left) / scale,
          y = (from.top - to.top) / scale;
        if (Math.abs(x) + Math.abs(y) < 1) continue;
        running.current.push(
          slot.animate(
            [
              { transform: `translate(${x}px,${y}px)` },
              { transform: "translate(0,0)" },
            ],
            { duration: 360 / speed, easing: "cubic-bezier(.22,.68,.26,1)" },
          ),
        );
      }
    }
    previous.current = { scope, ids, positions };
  });
  useLayoutEffect(
    () => () => running.current.forEach((animation) => animation.cancel()),
    [],
  );
}
