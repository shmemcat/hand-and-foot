import { useRef, type TouchEvent, type MouseEvent } from "react";

/** Consume horizontal paging here so a pile swipe cannot switch player boards. */
export function useSwipePages(
  enabled: boolean,
  page: number,
  pages: number,
  onPage: (page: number) => void,
) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const suppressClickUntil = useRef(0);
  return {
    onTouchStart(event: TouchEvent<HTMLElement>) {
      if (!enabled) return;
      event.stopPropagation();
      suppressClickUntil.current = 0;
      const touch = event.touches.length === 1 ? event.touches[0] : null;
      start.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    onTouchEnd(event: TouchEvent<HTMLElement>) {
      if (!enabled) return;
      event.stopPropagation();
      const from = start.current;
      start.current = null;
      const touch = event.changedTouches[0];
      if (!from || !touch) return;
      const dx = touch.clientX - from.x,
        dy = touch.clientY - from.y;
      if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (event.cancelable) event.preventDefault();
      suppressClickUntil.current = Date.now() + 500;
      const next = Math.max(0, Math.min(pages - 1, page + (dx < 0 ? 1 : -1)));
      if (next !== page) onPage(next);
    },
    onTouchCancel() {
      start.current = null;
    },
    onClickCapture(event: MouseEvent<HTMLElement>) {
      if (enabled && Date.now() < suppressClickUntil.current) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
  };
}
