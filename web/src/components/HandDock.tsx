import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import { usePageSweep } from "../hooks/usePageSweep";
import { Card } from "./Card";
import { Icon } from "./Icons";
import type { Card as Face } from "../types";

/** The viewed player's cards, with a mobile-only disclosure. */
export function HandDock({
  mobile,
  expanded,
  onExpand,
  title,
  cards,
  count,
  children,
  locked = false,
  ariaLabel = "Your private hand",
  foot,
  playerPicker,
  navigation,
}: {
  mobile: boolean;
  expanded: boolean;
  onExpand: (expanded: boolean) => void;
  title: string;
  cards: (Face | undefined)[];
  count: number;
  children: ReactNode;
  locked?: boolean;
  ariaLabel?: string;
  foot?: ReactNode;
  playerPicker?: ReactNode;
  navigation?: {
    enabled: boolean;
    page: number;
    scope: string;
    direction?: number;
    duration: number;
  };
}) {
  const id = useId();
  const dock = useRef<HTMLElement>(null);
  usePageSweep(
    dock,
    navigation?.enabled ?? false,
    navigation?.page ?? 0,
    navigation?.scope ?? "",
    navigation?.direction,
    navigation?.duration,
  );
  const drag = useRef<number | null>(null);
  const dragged = useRef(false);
  const height = useRef<number | null>(null);
  const previousExpanded = useRef<boolean | null>(null);
  const moving = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    if (!mobile || !dock.current) return;
    const element = dock.current;
    const frame = element.closest<HTMLElement>(".site-frame");
    const nav = frame?.querySelector<HTMLElement>(".site-nav");
    const from = moving.current
      ? element.getBoundingClientRect().height
      : height.current;
    moving.current?.cancel();
    moving.current = null;
    const to = element.getBoundingClientRect().height;
    const changed =
      previousExpanded.current !== null &&
      previousExpanded.current !== expanded;
    previousExpanded.current = expanded;
    const measure = () => {
      const viewport = window.visualViewport;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const top = Math.max(
        12,
        (nav?.getBoundingClientRect().bottom ?? 56) + 10,
      );
      element.style.setProperty(
        "--hand-drawer-max-height",
        `${Math.max(100, viewportHeight - top)}px`,
      );
      const measuredHeight = element.getBoundingClientRect().height;
      height.current = measuredHeight;
      frame?.style.setProperty("--hand-drawer-height", `${measuredHeight}px`);
      if (!expanded)
        frame?.style.setProperty(
          "--hand-peek-height",
          `${element.offsetHeight}px`,
        );
    };
    measure();
    if (
      changed &&
      from !== null &&
      Math.abs(from - to) > 1 &&
      element.animate &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      element.dataset.drawerMoving = "true";
      const animation = element.animate(
        [{ height: `${from}px` }, { height: `${to}px` }],
        { duration: 180, easing: "cubic-bezier(.22,.68,.26,1)" },
      );
      animation.id = "mobile-drawer-toggle";
      moving.current = animation;
      const finish = () => {
        if (moving.current !== animation) return;
        moving.current = null;
        delete element.dataset.drawerMoving;
        measure();
      };
      animation.onfinish = finish;
      animation.oncancel = finish;
    } else delete element.dataset.drawerMoving;
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(element);
    if (nav) observer?.observe(nav);
    window.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("resize", measure);
    };
  }, [mobile, expanded]);
  useLayoutEffect(() => {
    if (!mobile) {
      previousExpanded.current = null;
      height.current = null;
      return;
    }
    const frame = dock.current?.closest<HTMLElement>(".site-frame");
    return () => {
      moving.current?.cancel();
      moving.current = null;
      frame?.style.removeProperty("--hand-peek-height");
      frame?.style.removeProperty("--hand-drawer-height");
    };
  }, [mobile]);

  return (
    <section
      ref={dock}
      className={`hand-dock${mobile ? " mobile-hand-drawer" : ""}`}
      aria-label={ariaLabel}
      data-expanded={mobile ? expanded : undefined}
      onKeyDown={(event) => {
        if (mobile && expanded && event.key === "Escape") {
          event.stopPropagation();
          onExpand(false);
          dock.current
            ?.querySelector<HTMLButtonElement>(".hand-drawer-toggle")
            ?.focus();
        }
      }}
    >
      {mobile && (
        <button
          type="button"
          className="hand-drawer-toggle"
          disabled={locked}
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => {
            if (dragged.current) {
              dragged.current = false;
              return;
            }
            onExpand(!expanded);
          }}
          onPointerDown={(event) => {
            drag.current = event.clientY;
            dragged.current = false;
            event.currentTarget.setPointerCapture?.(event.pointerId);
          }}
          onPointerUp={(event) => {
            if (drag.current === null) return;
            const delta = event.clientY - drag.current;
            drag.current = null;
            if (Math.abs(delta) > 35) {
              dragged.current = true;
              onExpand(delta < 0);
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <span className="hand-drawer-grip" aria-hidden="true" />
          <span className="hand-drawer-label">
            <span className="hand-drawer-title">
              <span className="eyebrow">{title}</span>
              <span>
                {count} {count === 1 ? "card" : "cards"}
              </span>
            </span>
            <span className="hand-drawer-view" hidden={locked}>
              {expanded ? "Table" : "Open hand"}
              <Icon name="chevron-down" />
            </span>
          </span>
        </button>
      )}
      {playerPicker}
      {mobile && !expanded && (
        <div className="hand-drawer-peek">
          {cards.slice(0, 4).map((card, index) => (
            <button
              type="button"
              key={card?.id ?? index}
              className="hand-card"
              data-card-id={card?.id}
              aria-label={`Open ${title.toLowerCase()}`}
              onClick={() => onExpand(true)}
            >
              <Card card={card} />
            </button>
          ))}
          {cards.length > 4 && (
            <button
              type="button"
              className="hand-peek-more"
              onClick={() => onExpand(true)}
              aria-label={`Open all ${count} cards`}
            >
              +{count - 4}
            </button>
          )}
          {!cards.length && (
            <span className="hand-peek-empty">{title} is empty.</span>
          )}
        </div>
      )}
      {mobile && !expanded && foot && (
        <div className="hand-drawer-foot">{foot}</div>
      )}
      {mobile ? (
        <div id={id} className="hand-drawer-content" hidden={!expanded}>
          {children}
        </div>
      ) : (
        children
      )}
    </section>
  );
}
