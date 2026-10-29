import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

/** A short directional entrance for page and board changes, never for selection. */
export function usePageSweep(
  target: RefObject<HTMLElement | null>,
  enabled: boolean,
  page: number,
  scope: string,
  navigationDirection?: number,
  duration = 180,
) {
  const previous = useRef<{ page: number; scope: string } | null>(null);
  const running = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { page, scope };
    running.current?.cancel();
    running.current = null;
    const element = target.current;
    if (
      !enabled ||
      !old ||
      old.scope !== scope ||
      old.page === page ||
      !element?.animate ||
      !element.getClientRects().length ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const direction = navigationDirection ?? (page > old.page ? 1 : -1);
    const animation = element.animate(
      [
        { transform: `translateX(${direction * 28}px)`, opacity: 0.45 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration, easing: "cubic-bezier(.22,.68,.26,1)" },
    );
    animation.id = "page-sweep";
    running.current = animation;
  }, [enabled, page, scope, target, navigationDirection, duration]);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (media.matches) running.current?.cancel();
    };
    media.addEventListener("change", stop);
    return () => {
      media.removeEventListener("change", stop);
      running.current?.cancel();
    };
  }, []);
}
