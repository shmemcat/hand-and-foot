import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Card, Snapshot } from "../types";
import { afterCardAnimations } from "../lib/cardAnimations";

export const DRAW_FLIGHT_MS = 660;
export const DRAW_FLIP_MS = 620;
export const DRAW_STAGGER_MS = 90;
export const RED_REPLACEMENT_MS = 300;
export const REPLACEMENT_DRAW_MS = DRAW_FLIGHT_MS;
export const REPLACEMENT_FLIP_MS = DRAW_FLIP_MS;
type Box = { left: number; top: number; width: number; height: number };
export type DrawRequest = {
  key: number;
  token?: string;
  replaced?: {
    card: Card;
    from: { left: number; top: number; width: number; height: number };
    to: Box;
  }[];
  discardBefore?: { card: Card | null; count: number; faceDown: boolean };
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
  const animationRoot = useRef<Element | null>(null);
  const serial = useRef(0);
  const [landedReplacement, setLandedReplacement] = useState(0);
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
  const arrived =
    active &&
    snapshot?.phase === "play" &&
    (cards.length > 0 || !request?.token || request.token !== snapshot.token);
  const cardIds = cards.map((card) => card.id).join(",");
  useEffect(() => {
    if (!arrived || !request?.replaced?.length) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () =>
        afterCardAnimations(
          animationRoot.current,
          ".red-replacement-flight",
          () => {
            if (!cancelled) setLandedReplacement(request.key);
          },
        ),
      RED_REPLACEMENT_MS / request.speed,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [arrived, request?.key]);
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
    let cancelled = false;
    const timer = window.setTimeout(
      () =>
        afterCardAnimations(
          animationRoot.current,
          ".draw-card-flight, .red-replacement-flight",
          () => {
            if (!cancelled) cancel();
          },
        ),
      (DRAW_FLIGHT_MS +
        (request?.replaced?.length ? RED_REPLACEMENT_MS : 0) +
        (cards.length - 1) * DRAW_STAGGER_MS) /
        (request?.speed ?? 1),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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
  function begin(
    source: Snapshot,
    deck: Element | null,
    options?: { replaceIds: string[] },
  ) {
    if (current.current) return false;
    if (reduced || !deck) return true;
    animationRoot.current = deck.closest(".game-page");
    const rect = deck.getBoundingClientRect();
    const discard = deck
      .closest(".game-page")
      ?.querySelector(".discard-pickup .card, .discard-pickup .empty-card");
    const target = discard?.getBoundingClientRect();
    const next: DrawRequest = {
      key: ++serial.current,
      token: source.token,
      discardBefore: options
        ? {
            card: source.discard,
            count: source.discardCount,
            faceDown: Boolean(source.discardFaceDown),
          }
        : undefined,
      replaced: options?.replaceIds.flatMap((id) => {
        const card = source.hand.find((card) => card.id === id);
        const node = deck
          .closest(".game-page")
          ?.querySelector(`[data-card-id="${id}"] .card`);
        if (!card || !node || !target) return [];
        const { left, top, width, height } = node.getBoundingClientRect();
        return [
          {
            card,
            from: { left, top, width, height },
            to: {
              left: target.left,
              top: target.top,
              width: target.width,
              height: target.height,
            },
          },
        ];
      }),
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
      count: options?.replaceIds.length ?? source.drawCount,
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
    discardBefore:
      active && request?.replaced?.length && landedReplacement !== request.key
        ? request.discardBefore
        : undefined,
  };
}
