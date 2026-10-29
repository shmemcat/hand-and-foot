import { useLayoutEffect, useState, type ReactNode } from "react";
import { useHorizontalWheel } from "../hooks/useHorizontalWheel";
import { useSwipePages } from "../hooks/useSwipePages";
import { Card } from "./Card";
import { Icon } from "./Icons";

/** Only counts are needed to draw another player's concealed cards. */
export function PublicHand({
  playerId,
  title,
  count,
  mobile,
  foot,
}: {
  playerId: string;
  title: string;
  count: number;
  mobile: boolean;
  foot: ReactNode;
}) {
  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil(count / 10));
  const current = Math.min(page, pages - 1);
  useLayoutEffect(() => setPage(0), [playerId]);
  const swipe = useSwipePages(mobile, current, pages, setPage);
  const scroll = useHorizontalWheel(!mobile, count);
  const start = mobile ? current * 10 : 0;
  const length = mobile ? Math.min(10, count - start) : count;
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
      {count ? (
        <div
          {...swipe}
          className="hand-scroll public-hand-cards"
          aria-label={`${title}, ${count} face-down cards`}
          ref={scroll}
        >
          {Array.from({ length }, (_, index) => (
            <div className="hand-card" key={start + index}>
              <Card />
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
