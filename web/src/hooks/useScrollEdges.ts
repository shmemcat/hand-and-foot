import { useLayoutEffect, type RefObject } from "react";

/** Mark hidden content without rerendering the board during scrolling. */
export function useScrollEdges(
  ref: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  revision?: number | string,
) {
  useLayoutEffect(() => {
    const strip = ref.current;
    if (!enabled || !strip) return;
    const update = () => {
      const end = strip.scrollWidth - strip.clientWidth;
      const left = end > 1 && strip.scrollLeft > 1;
      const right = end > 1 && strip.scrollLeft < end - 1;
      const gutter = `${Math.max(0, strip.offsetHeight - strip.clientHeight)}px`;
      strip.toggleAttribute("data-scroll-left", left);
      strip.toggleAttribute("data-scroll-right", right);
      if (strip.style.getPropertyValue("--scrollbar-height") !== gutter)
        strip.style.setProperty("--scrollbar-height", gutter);
    };
    const resize =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    const observe = () => {
      resize?.disconnect();
      resize?.observe(strip);
      // Pile rows have one content wrapper; hands have individual card slots.
      for (const child of strip.children) resize?.observe(child);
      update();
    };
    const changes = new MutationObserver(observe);
    changes.observe(strip, { childList: true, subtree: true });
    observe();
    strip.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      resize?.disconnect();
      changes.disconnect();
      strip.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      strip.removeAttribute("data-scroll-left");
      strip.removeAttribute("data-scroll-right");
      strip.style.removeProperty("--scrollbar-height");
    };
  }, [ref, enabled, revision]);
}
