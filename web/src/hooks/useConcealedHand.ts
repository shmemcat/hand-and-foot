import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import type { TableEvent } from "../types";

export const CONCEALED_FADE_MS = 180;
export const CONCEALED_COLLAPSE_MS = 620;
export type ConcealedSlot = { id: number; hidden?: boolean; leaving?: boolean };

/** These slots have no relationship to physical cards or their sorted values. */
export function useConcealedHand({
  scope,
  count,
  action,
  disabled,
  speed = 1,
  board,
}: {
  scope: string;
  count: number;
  action?: TableEvent;
  disabled: boolean;
  speed?: number;
  board: RefObject<HTMLDivElement | null>;
}) {
  const serial = useRef(0);
  const make = (length: number): ConcealedSlot[] =>
    Array.from({ length }, () => ({ id: ++serial.current }));
  const [state, setState] = useState(() => ({ scope, slots: make(count) }));
  const active = state.scope === scope;
  const slots = active ? state.slots : [];
  const live = slots.filter((slot) => !slot.leaving);
  const drawing = action?.kind === "draw" || action?.kind === "pickup";
  const discarding = action?.kind === "discard" || action?.kind === "replace";
  const ghosts = useRef<
    { element: HTMLElement; animation?: Animation; timer: number }[]
  >([]);
  useLayoutEffect(() => {
    const clear = () => {
      ghosts.current.forEach(({ element, animation, timer }) => {
        clearTimeout(timer);
        animation?.cancel();
        element.remove();
      });
      ghosts.current = [];
    };
    clear();
    return clear;
  }, [scope, disabled]);

  useLayoutEffect(() => {
    if (!active || disabled || document.hidden) {
      setState({ scope, slots: make(count) });
      return;
    }
    if (count > live.length) {
      setState({
        scope,
        slots: [
          ...make(count - live.length).map((slot) => ({
            ...slot,
            hidden: drawing,
          })),
          ...live,
        ],
      });
      return;
    }
    if (count < live.length) {
      const remove = live.length - count;
      const liveIds = new Set(live.map((slot) => slot.id));
      const visible = visiblePublicHandSlots(board.current)
        .filter((element) => element.dataset.concealedHidden !== "true")
        .map((element) => Number(element.dataset.publicSlot))
        .filter((id) => liveIds.has(id));
      const order = discarding ? [...visible].reverse() : visible;
      const ids = new Set(
        [
          ...order,
          ...live.map((slot) => slot.id).filter((id) => !order.includes(id)),
        ].slice(0, remove),
      );
      if (!discarding) {
        // Fade anonymous copies outside layout while survivors close the gap.
        for (const element of visiblePublicHandSlots(board.current)) {
          if (!ids.has(Number(element.dataset.publicSlot))) continue;
          const parent = element.parentElement!;
          const rect = element.getBoundingClientRect(),
            box = parent.getBoundingClientRect();
          const scale = element.offsetWidth
            ? rect.width / element.offsetWidth
            : 1;
          const ghost = element.cloneNode(true) as HTMLElement;
          delete ghost.dataset.publicSlot;
          ghost.dataset.concealedGhost = "true";
          ghost.setAttribute("aria-hidden", "true");
          ghost.setAttribute("inert", "");
          Object.assign(ghost.style, {
            position: "absolute",
            margin: "0",
            pointerEvents: "none",
            left: `${(rect.left - box.left) / scale + parent.scrollLeft}px`,
            top: `${(rect.top - box.top) / scale + parent.scrollTop}px`,
            width: `${rect.width / scale}px`,
            height: `${rect.height / scale}px`,
          });
          parent.appendChild(ghost);
          const animation = ghost.animate?.([{ opacity: 1 }, { opacity: 0 }], {
            duration: CONCEALED_FADE_MS / speed,
            easing: "ease-out",
            fill: "forwards",
          });
          const timer = window.setTimeout(() => {
            animation?.cancel();
            ghost.remove();
            ghosts.current = ghosts.current.filter(
              (item) => item.element !== ghost,
            );
          }, CONCEALED_FADE_MS / speed);
          ghosts.current.push({ element: ghost, animation, timer });
        }
      }
      setState({
        scope,
        slots: discarding
          ? live.map((slot) => ({
              ...slot,
              leaving: ids.has(slot.id),
              hidden: ids.has(slot.id),
            }))
          : live.filter((slot) => !ids.has(slot.id)),
      });
      return;
    }
    if (!drawing && !discarding && slots.some((slot) => slot.hidden))
      setState({
        scope,
        slots: slots.map((slot) => ({ ...slot, hidden: false })),
      });
  }, [scope, count, action?.id, disabled, active, live.length]);

  useLayoutEffect(() => {
    if (!discarding && slots.some((slot) => slot.leaving && slot.hidden))
      setState((old) => ({
        ...old,
        slots: old.slots.filter((slot) => !slot.leaving),
      }));
  }, [discarding]);

  const previous = useRef<{
    scope: string;
    surface: string;
    positions: Map<string, DOMRect>;
  } | null>(null);
  const running = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    const elements = publicHandSlots(board.current);
    const old = previous.current;
    const surface =
      board.current?.querySelector<HTMLElement>(".hand-dock")?.dataset
        .expanded ?? "desktop";
    const changed =
      elements.map((element) => element.dataset.publicSlot).join() !==
      [...(old?.positions.keys() ?? [])].join();
    board.current?.style.setProperty(
      "--concealed-fade-duration",
      `${CONCEALED_FADE_MS / speed}ms`,
    );
    const reset = disabled || old?.scope !== scope || old.surface !== surface;
    if (changed || reset) {
      running.current.forEach((animation) => animation.cancel());
      running.current = [];
    }
    const positions = new Map(
      elements.map((element) => [
        element.dataset.publicSlot!,
        (() => {
          const rect = element.getBoundingClientRect(),
            parent = element.parentElement!.getBoundingClientRect();
          return new DOMRect(
            rect.left - parent.left,
            rect.top - parent.top,
            rect.width,
            rect.height,
          );
        })(),
      ]),
    );
    if (changed || reset) {
      if (!reset && old)
        for (const element of elements) {
          const from = old.positions.get(element.dataset.publicSlot!),
            to = positions.get(element.dataset.publicSlot!);
          if (!from || !to || !element.animate) continue;
          const scale = element.offsetWidth
            ? to.width / element.offsetWidth
            : 1;
          const x = (from.left - to.left) / scale,
            y = (from.top - to.top) / scale;
          if (Math.abs(x) + Math.abs(y) < 1) continue;
          const animation = element.animate(
            [
              { transform: `translate(${x}px,${y}px)` },
              { transform: "translate(0,0)" },
            ],
            {
              duration: CONCEALED_COLLAPSE_MS / speed,
              easing: "cubic-bezier(.22,.68,.26,1)",
            },
          );
          animation.id = "concealed-hand-spacing";
          running.current.push(animation);
        }
    }
    // Keep resting positions while a spacing animation is in progress.
    if (
      changed ||
      reset ||
      !running.current.some((animation) => animation.playState === "running")
    )
      previous.current = { scope, surface, positions };
  });
  useLayoutEffect(
    () => () => running.current.forEach((animation) => animation.cancel()),
    [],
  );

  return { slots, count };
}

export function publicHandSlots(root: Element | null): HTMLElement[] {
  return [
    ...(root?.querySelectorAll<HTMLElement>(".hand-dock [data-public-slot]") ??
      []),
  ].filter((element) => !element.closest("[hidden]"));
}

export function visiblePublicHandSlots(root: Element | null): HTMLElement[] {
  return publicHandSlots(root).filter((element) => {
    const scroll = element.closest(".hand-scroll");
    if (!scroll) return true;
    const rect = element.getBoundingClientRect(),
      clip = scroll.getBoundingClientRect();
    return rect.right > clip.left && rect.left < clip.right;
  });
}
