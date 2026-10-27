import { useEffect, useRef } from "react";

export function useHorizontalWheel(enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = ref.current;
    if (!enabled || !strip) return;
    const scroll = (event: WheelEvent) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        !event.deltaY ||
        Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
        strip.scrollWidth <= strip.clientWidth
      )
        return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? strip.clientWidth
            : 1;
      // Keep the board still at either end of an overflowing hand as well.
      event.preventDefault();
      strip.scrollLeft = Math.max(
        0,
        Math.min(
          strip.scrollWidth - strip.clientWidth,
          strip.scrollLeft + event.deltaY * unit,
        ),
      );
    };
    strip.addEventListener("wheel", scroll, { passive: false });
    return () => strip.removeEventListener("wheel", scroll);
  }, [enabled]);
  return ref;
}
