import { useLayoutEffect, useRef, useState } from "react";
import { HandInfo } from "./HandInfo";

export function HandTabs({
  hands,
  selected,
  onSelect,
  disabled = false,
}: {
  hands: { id: string; title: string; name?: string; count: number }[];
  selected?: string;
  onSelect: (id: string) => void;
  disabled?: boolean;
}) {
  const tabs = useRef<HTMLDivElement>(null);
  const naturalWidth = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);
  useLayoutEffect(() => {
    const container = tabs.current;
    const content = naturalWidth.current;
    if (!container || !content) return;
    const measure = () => {
      if (container.clientWidth)
        setCompact(content.scrollWidth > container.clientWidth + 1);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(container);
    observer?.observe(content);
    return () => observer?.disconnect();
  }, [hands]);

  return (
    <div
      ref={tabs}
      className="hand-owner-tabs"
      role="group"
      aria-label="Player hands"
      data-compact={compact}
    >
      {hands.map((hand) => (
        <button
          key={hand.id}
          type="button"
          className="hand-owner-tab"
          data-named={Boolean(hand.name)}
          aria-pressed={hand.id === selected}
          aria-label={`View ${hand.title}, ${hand.count} ${hand.count === 1 ? "card" : "cards"}`}
          title={hand.title}
          disabled={disabled}
          onClick={() => onSelect(hand.id)}
        >
          <HandInfo
            title={
              hand.name ? (
                <>
                  <span className="hand-owner-name" aria-hidden="true">
                    <span className="hand-owner-name-full">{hand.name}</span>
                    <span className="hand-owner-name-compact">
                      {Array.from(hand.name).length > 14
                        ? `${Array.from(hand.name).slice(0, 14).join("")}…`
                        : hand.name}
                    </span>
                  </span>
                  <span className="hand-owner-kind">
                    {hand.title.slice(hand.name.length)}
                  </span>
                </>
              ) : (
                hand.title
              )
            }
            count={hand.count}
          />
        </button>
      ))}
      <span className="hand-owner-tabs-measure" aria-hidden="true">
        <span ref={naturalWidth} className="hand-owner-tabs-natural">
          {hands.map((hand) => (
            <span key={hand.id} className="hand-owner-tab">
              <HandInfo title={hand.title} count={hand.count} />
            </span>
          ))}
        </span>
      </span>
    </div>
  );
}
