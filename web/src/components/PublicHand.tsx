import { useLayoutEffect, useState, type ReactNode } from "react";
import { useHorizontalWheel } from "../hooks/useHorizontalWheel";
import { useSwipePages } from "../hooks/useSwipePages";
import { Card } from "./Card";
import { Icon } from "./Icons";
import type { ConcealedSlot } from "../hooks/useConcealedHand";
import type { Card as Face } from "../types";

/** Other players' cards stay concealed until the round results reveal them. */
export function PublicHand({
  playerId,
  title,
  count,
  mobile,
  foot,
  slots,
  drawKey,
  cards,
}: {
  playerId: string;
  title: string;
  count: number;
  mobile: boolean;
  foot: ReactNode;
  slots?: ConcealedSlot[];
  drawKey?: string;
  cards?: Face[];
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(count / 10));
  const current = Math.min(page, pages - 1);
  useLayoutEffect(() => setPage(0), [playerId]);
  const swipe = useSwipePages(mobile, current, pages, setPage);
  const scroll = useHorizontalWheel(!mobile, count);
  useLayoutEffect(() => {
    if (!drawKey) return;
    setPage(0);
    if (scroll.current) scroll.current.scrollLeft = 0;
  }, [drawKey]);
  const start = mobile ? current * 10 : 0;
  const length = mobile ? Math.min(10, count - start) : count;
  const visibleSlots: ConcealedSlot[] =
    slots && !cards
      ? mobile
        ? slots.slice(start, start + 10)
        : slots
      : Array.from({ length }, (_, index) => ({ id: start + index }));
  return (
    <>
      <div className="hand-heading public-hand-heading">
        <div className="hand-info">
          <span className="eyebrow">{title.toLocaleUpperCase()}</span>
          <span>
            {count} {count === 1 ? "card" : "cards"}
          </span>
        </div>
        {foot}
      </div>
      {visibleSlots.length ? (
        <div
          {...swipe}
          className="hand-scroll public-hand-cards"
          aria-label={`${title}, ${count}${cards ? "" : " face-down"} cards`}
          ref={scroll}
        >
          {visibleSlots.map((slot, index) => (
            <div
              className="hand-card"
              key={slot.id}
              data-public-slot={slot.id}
              data-concealed-hidden={slot.hidden}
              data-concealed-leaving={slot.leaving}
            >
              <Card card={cards?.[start + index]} />
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-hand">{title} is empty.</p>
      )}
      {mobile && count > 0 && (
        <div className="mobile-hand-pagination" aria-label="Hand pages">
          <button
            type="button"
            className="icon-button previous"
            aria-label="Previous hand cards"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            <Icon name="arrow" />
          </button>
          <span>
            {start + 1}–{Math.min(start + 10, count)} of {count} cards
          </span>
          <button
            type="button"
            className="icon-button"
            aria-label="Next hand cards"
            disabled={current + 1 >= pages}
            onClick={() => setPage(current + 1)}
          >
            <Icon name="arrow" />
          </button>
        </div>
      )}
    </>
  );
}
