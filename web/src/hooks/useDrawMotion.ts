import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";

export const DRAW_FLIGHT_MS = 600;
export const DRAW_FLIP_MS = 560;
export const DRAW_STAGGER_MS = 90;
export type DrawRequest = {
  key: number;
  code: string;
  round: number;
  viewer: string;
  handIds: Set<string>;
  handPositions: Map<string, { left: number; top: number }>;
  speed: number;
  count: number;
  afterPickup: boolean;
  from: { left: number; top: number; width: number; height: number };
};

/** Only animate cards actually returned by the server for this draw. */
export function useDrawMotion(
  snapshot: Snapshot | null,
  reduced: boolean,
  speed = 1,
) {
  const [request, setRequest] = useState<DrawRequest | null>(null);
  const current = useRef<DrawRequest | null>(null);
  const serial = useRef(0);
  const active = Boolean(
    request &&
      snapshot &&
      request.code === snapshot.code &&
      request.round === snapshot.round &&
      request.viewer === snapshot.viewerId &&
      snapshot.actorId === request.viewer &&
      ["draw", "play"].includes(snapshot.phase),
  );
  const cards = active
    ? snapshot!.hand.filter((card) => !request!.handIds.has(card.id))
    : [];
  const arrived = active && snapshot?.phase === "play";
  const cardIds = cards.map((card) => card.id).join(",");
  function cancel() {
    current.current = null;
    setRequest(null);
  }
  useLayoutEffect(() => {
    if (request && (!active || (arrived && (reduced || !cards.length))))
      cancel();
  }, [request, active, arrived, reduced, cards.length]);
  useEffect(() => {
    if (!arrived || !cards.length) return;
    const timer = window.setTimeout(
      cancel,
      (DRAW_FLIGHT_MS + (cards.length - 1) * DRAW_STAGGER_MS) /
        (request?.speed ?? 1),
    );
    return () => clearTimeout(timer);
  }, [arrived, request?.key, cardIds]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) cancel();
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      document.removeEventListener("visibilitychange", hide);
      current.current = null;
    };
  }, []);
  function begin(source: Snapshot, deck: Element | null) {
    if (current.current) return false;
    if (reduced || !deck) return true;
    const rect = deck.getBoundingClientRect();
    const next: DrawRequest = {
      key: ++serial.current,
      code: source.code,
      round: source.round,
      viewer: source.viewerId,
      handIds: new Set(source.hand.map((card) => card.id)),
      handPositions: new Map(
        [
          ...(deck
            .closest(".game-page")
            ?.querySelectorAll<HTMLElement>(".hand-card[data-card-id]") ?? []),
        ].map((slot) => {
          const position = slot.getBoundingClientRect();
          return [
            slot.dataset.cardId!,
            { left: position.left, top: position.top },
          ];
        }),
      ),
      speed,
      count: source.drawCount,
      afterPickup: Boolean(source.pickupDrawPending),
      from: {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    };
    current.current = next;
    setRequest(next);
    return true;
  }
  return {
    active,
    request: active ? request : null,
    cards,
    begin,
    cancel,
    hiddenIds: new Set(cards.map((card) => card.id)),
  };
}
