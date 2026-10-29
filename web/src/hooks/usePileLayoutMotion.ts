import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type RefObject,
} from "react";

export const PILE_SHIFT_MS = 420;
type Box = { left: number; top: number };
type Pile = {
  node: HTMLElement;
  box: Box;
  row: string;
  zoom: number;
  animation?: Animation;
};
type Options = {
  scope: string;
  enabled: boolean;
  reduced: boolean;
  speed?: number;
  paused?: boolean;
  delay?: number;
  duration?: number;
};
const offset = (node: HTMLElement) => {
  const transform = getComputedStyle(node).transform;
  const matrix = transform
    .match(/^matrix\(([^)]+)\)$/)?.[1]
    .split(",")
    .map(Number);
  return { x: matrix?.[4] ?? 0, y: matrix?.[5] ?? 0 };
};

/** Move the real piles through grid reflows without stretching their card faces. */
export function usePileLayoutMotion(
  board: RefObject<HTMLDivElement | null>,
  options: Options,
) {
  const latest = useRef(options);
  latest.current = options;
  const previous = useRef(new Map<string, Pile>());
  const scope = useRef("");
  const observer = useRef<ResizeObserver | null>(null);
  const observed = useRef<HTMLElement | null>(null);
  const observedMelds = useRef<Element | null>(null);
  const update = useRef(() => {});
  update.current = () => {
    const settings = latest.current;
    const enabled =
      settings.enabled &&
      !settings.reduced &&
      !document.hidden &&
      window.matchMedia("(min-width: 769px)").matches;
    const sameBoard = scope.current === settings.scope;
    const next = new Map<string, Pile>();
    const origin = (
      board.current?.querySelector(".tableau-content") ??
      board.current?.querySelector(".board-carousel > .tableau") ??
      board.current
    )?.getBoundingClientRect();
    for (const node of board.current?.querySelectorAll<HTMLElement>(
      ".board-carousel .meld-pile, .board-carousel .red-three-pile",
    ) ?? []) {
      const id = node.dataset.meldId
        ? `meld:${node.dataset.meldId}`
        : `reds:${node.dataset.redThreePlayerId}`;
      const anchor = node.querySelector<HTMLElement>(
        ".meld-card-layers, .closed-card-stack, .red-three-stack",
      );
      if (!anchor) continue;
      const delta = offset(node);
      const measured = anchor.getBoundingClientRect();
      const zoom = anchor.offsetWidth ? measured.width / anchor.offsetWidth : 1;
      // Measure inside the moving content so board swipes and page scrolling
      // cannot be mistaken for another pile reflow.
      const box = {
        left: measured.left - (origin?.left ?? 0) - delta.x * zoom,
        top: measured.top - (origin?.top ?? 0) - delta.y * zoom,
      };
      const row = node.closest(".closed-books") ? "closed" : "open";
      const old = previous.current.get(id);
      const pile: Pile = { node, box, row, zoom };
      next.set(id, pile);
      if (
        !enabled ||
        !sameBoard ||
        !old ||
        old.row !== row ||
        old.node !== node
      ) {
        old?.animation?.cancel();
        continue;
      }
      const moved =
        Math.abs(box.left - old.box.left) > 0.5 ||
        Math.abs(box.top - old.box.top) > 0.5;
      if (!moved) {
        pile.animation = old.animation;
        continue;
      }
      const fromX = (old.box.left + delta.x * old.zoom - box.left) / zoom;
      const fromY = (old.box.top + delta.y * old.zoom - box.top) / zoom;
      old.animation?.cancel();
      if (typeof node.animate !== "function") continue;
      const animation = node.animate(
        [
          { transform: `translate(${fromX}px, ${fromY}px)` },
          { transform: "translate(0, 0)" },
        ],
        {
          delay: (settings.delay ?? 0) / (settings.speed ?? 1),
          duration:
            (settings.duration ?? PILE_SHIFT_MS) / (settings.speed ?? 1),
          easing:
            settings.duration === undefined
              ? "cubic-bezier(0.22, 0.68, 0.26, 1)"
              : "cubic-bezier(0.4, 0, 0.2, 1)",
          fill: "backwards",
        },
      );
      if (settings.paused) animation.pause();
      pile.animation = animation;
      animation.onfinish = () => {
        const current = previous.current.get(id);
        if (current?.animation === animation) current.animation = undefined;
      };
    }
    for (const [id, pile] of previous.current)
      if (!next.has(id)) pile.animation?.cancel();
    previous.current = next;
    scope.current = settings.scope;
  };
  const observeBoard = useCallback(() => {
    const melds =
      board.current?.querySelector(".board-carousel .melds") ?? null;
    if (observed.current !== board.current || observedMelds.current !== melds) {
      observer.current?.disconnect();
      observed.current = board.current;
      observedMelds.current = melds;
      if (board.current && typeof ResizeObserver !== "undefined") {
        observer.current = new ResizeObserver(() => update.current());
        observer.current.observe(board.current);
        // Inspection is local to MeldPile and can resize a row while the board
        // stays at its minimum height, without rendering Room again.
        if (melds) observer.current.observe(melds);
      }
    }
  }, [board]);
  useLayoutEffect(() => {
    observeBoard();
    update.current();
  });
  useEffect(() => {
    for (const pile of previous.current.values()) {
      if (options.paused) pile.animation?.pause();
      else if (pile.animation?.playState === "paused") pile.animation.play();
    }
  }, [options.paused]);
  useEffect(() => {
    // Effect replay during StrictMode or a preview refresh must reconnect too.
    observeBoard();
    const reset = () => {
      for (const pile of previous.current.values()) pile.animation?.cancel();
      previous.current.clear();
      scope.current = "";
      update.current();
    };
    const hide = () => {
      if (document.hidden) reset();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      observer.current?.disconnect();
      observer.current = null;
      observed.current = null;
      observedMelds.current = null;
      for (const pile of previous.current.values()) pile.animation?.cancel();
      previous.current.clear();
      document.removeEventListener("visibilitychange", hide);
    };
  }, [observeBoard]);
}
