import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { MELD_FLIGHT_MS } from "./useMeldMotion";

type Layer = { node: HTMLElement; top: number };

/** Keep existing cards sliding beneath a wild inserted into an open meld. */
export function useMeldStackMotion(
  board: RefObject<HTMLDivElement | null>,
  scope: string,
  reduced: boolean,
  speed = 1,
  paused = false,
  duration = MELD_FLIGHT_MS,
) {
  const previous = useRef<{
    scope: string;
    piles: Map<string, Map<string, Layer>>;
  } | null>(null);
  const running = useRef(new Map<HTMLElement, Animation>());

  useLayoutEffect(() => {
    const old = previous.current;
    const reset = reduced || document.hidden || old?.scope !== scope;
    if (reset) {
      for (const animation of running.current.values()) animation.cancel();
      running.current.clear();
    }
    const piles = new Map<string, Map<string, Layer>>();
    const visible = new Set<HTMLElement>();
    for (const pile of board.current?.querySelectorAll<HTMLElement>(
      ".meld-pile[data-meld-id]",
    ) ?? []) {
      const layers = new Map<string, Layer>();
      for (const node of pile.querySelectorAll<HTMLElement>(
        ".meld-card-layer[data-card-id]",
      )) {
        layers.set(node.dataset.cardId!, {
          node,
          top: parseFloat(node.style.top),
        });
        visible.add(node);
      }
      piles.set(pile.dataset.meldId!, layers);
      const prior = old?.piles.get(pile.dataset.meldId!);
      // Replays, removals, and book closing should settle immediately.
      const added =
        prior &&
        layers.size > prior.size &&
        [...prior.keys()].every((id) => layers.has(id));
      if (
        prior &&
        !added &&
        (layers.size !== prior.size ||
          [...prior.keys()].some((id) => !layers.has(id)))
      ) {
        for (const { node } of prior.values()) {
          running.current.get(node)?.cancel();
          running.current.delete(node);
        }
      }
      if (reset || !added) continue;
      for (const [id, { node, top }] of layers) {
        const from = prior.get(id);
        if (from?.node !== node || from.top === top || !node.animate) continue;
        const fromTop = running.current.has(node)
          ? parseFloat(getComputedStyle(node).top)
          : from.top;
        running.current.get(node)?.cancel();
        // Animate the layer's local offset so card rotation and board zoom stay intact.
        const animation = node.animate(
          [{ top: `${fromTop}px` }, { top: `${top}px` }],
          {
            duration: duration / speed,
            easing: "cubic-bezier(0.22, 0.68, 0.26, 1)",
          },
        );
        if (paused) animation.pause();
        running.current.set(node, animation);
        animation.onfinish = () => {
          if (running.current.get(node) === animation)
            running.current.delete(node);
        };
      }
    }
    for (const [node, animation] of running.current) {
      if (reset || !visible.has(node)) {
        animation.cancel();
        running.current.delete(node);
      }
    }
    previous.current = { scope, piles };
  });

  useEffect(() => {
    for (const animation of running.current.values()) {
      if (paused) animation.pause();
      else if (animation.playState === "paused") animation.play();
    }
  }, [paused]);
  useEffect(() => {
    const clear = () => {
      for (const animation of running.current.values()) animation.cancel();
      running.current.clear();
      previous.current = null;
    };
    const hide = () => {
      if (document.hidden) clear();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      clear();
      document.removeEventListener("visibilitychange", hide);
    };
  }, []);
}
