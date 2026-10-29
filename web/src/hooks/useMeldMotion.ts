import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card, Snapshot } from "../types";

export const MELD_FLIGHT_MS = 440;
export type CardPosition = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotation?: number;
};
export function landingPosition(element: Element): CardPosition {
  const rect = position(element);
  const style = getComputedStyle(element);
  const matrix = style.transform
    .match(/^matrix\(([^)]+)\)$/)?.[1]
    .split(",")
    .map(Number);
  const rotation = matrix ? Math.atan2(matrix[1], matrix[0]) : 0;
  if (!rotation) return rect;
  const width = parseFloat(style.width) || rect.width;
  const height = parseFloat(style.height) || rect.height;
  const cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  const minX = Math.min(
    0,
    width * cos,
    -height * sin,
    width * cos - height * sin,
  );
  const minY = Math.min(
    0,
    width * sin,
    height * cos,
    width * sin + height * cos,
  );
  return {
    left: rect.left - minX,
    top: rect.top - minY,
    width,
    height,
    rotation: (rotation * 180) / Math.PI,
  };
}
export type MeldFlight = {
  key: number;
  token: string;
  before: Snapshot;
  speed: number;
  boardHeight: number;
  divider?: number;
  cards: { card: Card; from: CardPosition; to: CardPosition; meldId: string }[];
};
const position = (element: Element): CardPosition => {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

/** Detect confirmed moves by physical card ID, including socket replies and new meld IDs. */
export function useMeldMotion(
  incoming: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  reduced: boolean,
  speed = 1,
  paused = false,
  viewedTeam?: number,
) {
  const [flight, setFlight] = useState<MeldFlight | null>(null);
  const current = useRef<MeldFlight | null>(null);
  const previous = useRef<{
    snapshot: Snapshot;
    sources: Map<string, CardPosition>;
    boardHeight: number;
  } | null>(null);
  const serial = useRef(0);
  const elapsed = useRef({ key: 0, milliseconds: 0 });
  const cancel = useCallback(() => {
    current.current = null;
    setFlight(null);
  }, []);
  const sameTable = (first: Snapshot, second: Snapshot) =>
    first.code === second.code &&
    first.round === second.round &&
    first.viewerId === second.viewerId;
  const active = Boolean(
    flight &&
      incoming &&
      sameTable(flight.before, incoming) &&
      flight.token === incoming.token &&
      (incoming.phase === "play" ||
        (incoming.phase === "draw" && incoming.pickupDrawPending)) &&
      flight.cards.every(
        ({ card, meldId }) =>
          incoming.players.some(
            (player) =>
              meldId === `reds:${player.id}` &&
              player.redThrees.some((item) => item.id === card.id),
          ) ||
          incoming.sides.some((side) =>
            side.melds.some(
              (meld) =>
                meld.id === meldId &&
                meld.cards.some((item) => item.id === card.id),
            ),
          ),
      ),
  );
  const hiddenIds = new Set(
    active ? flight!.cards.map(({ card }) => card.id) : [],
  );
  const snapshot =
    active && incoming
      ? {
          ...incoming,
          hand: flight!.before.hand,
          footTop: flight!.before.footTop,
          // A closed book keeps its cover, type, and count until the addition lands.
          sides: incoming.sides.map((side) => ({
            ...side,
            melds: side.melds.map((meld) => {
              const old = flight!.before.sides
                .flatMap((item) => item.melds)
                .find((item) => item.id === meld.id);
              return old?.complete &&
                meld.complete &&
                flight!.cards.some((card) => card.meldId === meld.id)
                ? {
                    ...meld,
                    cards: old.cards,
                    dirty: old.dirty,
                    bonus: old.bonus,
                  }
                : meld;
            }),
          })),
          players: incoming.players.map((player) =>
            player.id === incoming.viewerId
              ? {
                  ...player,
                  handCount: flight!.before.hand.length,
                  inFoot: flight!.before.players.find(
                    (item) => item.id === player.id,
                  )!.inFoot,
                  footCount: flight!.before.players.find(
                    (item) => item.id === player.id,
                  )!.footCount,
                }
              : player,
          ),
        }
      : incoming;

  // Cache the visible source positions after every local selection/staging update.
  useLayoutEffect(() => {
    if (flight && (!active || reduced)) cancel();
    if (!incoming || !board.current) {
      previous.current = null;
      return;
    }
    const prior = previous.current;
    if (
      !current.current &&
      prior &&
      sameTable(prior.snapshot, incoming) &&
      !reduced &&
      !document.hidden &&
      (incoming.phase === "play" ||
        (incoming.phase === "draw" && incoming.pickupDrawPending)) &&
      prior.snapshot.actorId === incoming.actorId &&
      (incoming.actorId === incoming.viewerId ||
        incoming.players.some(
          (player) =>
            player.id === incoming.actorId &&
            player.bot &&
            player.team === viewedTeam,
        ))
    ) {
      const viewer = incoming.players.find(
        (player) => player.id === incoming.actorId,
      );
      const melds =
        incoming.sides.find((side) => side.id === viewer?.team)?.melds ?? [];
      const oldMeldIds = new Set([
        ...prior.snapshot.players.flatMap((player) =>
          player.redThrees.map((card) => card.id),
        ),
        ...prior.snapshot.sides.flatMap((side) =>
          side.melds.flatMap((meld) => meld.cards.map((card) => card.id)),
        ),
      ]);
      const own = incoming.actorId === incoming.viewerId;
      const fromCards = own
        ? [
            ...prior.snapshot.hand,
            ...(prior.snapshot.phase === "draw" && prior.snapshot.discard
              ? [prior.snapshot.discard]
              : []),
          ]
        : [
            ...melds.flatMap((meld) => meld.cards),
            ...(viewer?.redThrees ?? []),
          ];
      const header = board.current
        .querySelector(".game-header")
        ?.getBoundingClientRect();
      const targets = [
        ...board.current.querySelectorAll<HTMLElement>(
          ".meld-pile[data-meld-id]",
        ),
      ];
      const cards: MeldFlight["cards"] = [];
      for (const card of fromCards) {
        const red = viewer?.redThrees.some((item) => item.id === card.id);
        const meld = melds.find((item) =>
          item.cards.some((item) => item.id === card.id),
        );
        if ((!meld && !red) || oldMeldIds.has(card.id)) continue;
        const from = own
          ? prior.sources.get(card.id)
          : header
            ? {
                left: header.left + header.width / 2 - 31,
                top: header.bottom - 14,
                width: 62,
                height: 87,
              }
            : undefined;
        const pile = red
          ? board.current.querySelector<HTMLElement>(
              `.red-three-pile[data-red-three-team-id="${viewer!.team}"]`,
            )
          : targets.find((item) => item.dataset.meldId === meld!.id);
        const layer = [
          ...(pile?.querySelectorAll<HTMLElement>("[data-card-id]") ?? []),
        ].find((item) => item.dataset.cardId === card.id);
        const target =
          layer?.querySelector(".card") ??
          pile?.querySelector(".closed-card-stack .card");
        if (from && target)
          cards.push({
            card,
            from,
            to: landingPosition(target),
            meldId: red ? `reds:${viewer!.id}` : meld!.id,
          });
      }
      if (cards.length) {
        const next: MeldFlight = {
          key: ++serial.current,
          token: incoming.token,
          before: prior.snapshot,
          speed,
          boardHeight: prior.boardHeight,
          cards,
        };
        current.current = next;
        setFlight(next);
      }
    }
    const sources = new Map<string, CardPosition>();
    for (const slot of board.current.querySelectorAll<HTMLElement>(
      ".hand-card[data-card-id]",
    )) {
      const card = slot.querySelector(".card");
      if (card) sources.set(slot.dataset.cardId!, position(card));
    }
    const discard = board.current.querySelector(".discard-pickup .card");
    if (discard && incoming.discard)
      sources.set(incoming.discard.id, position(discard));
    previous.current = {
      snapshot: incoming,
      sources,
      boardHeight:
        board.current.querySelector(".board-carousel")?.getBoundingClientRect()
          .height ?? 0,
    };
  });
  useEffect(() => {
    if (!active || !flight) return;
    if (elapsed.current.key !== flight.key)
      elapsed.current = { key: flight.key, milliseconds: 0 };
    if (paused) return;
    const started = performance.now();
    const duration = MELD_FLIGHT_MS / flight.speed;
    const timer = window.setTimeout(
      cancel,
      Math.max(0, duration - elapsed.current.milliseconds),
    );
    return () => {
      clearTimeout(timer);
      elapsed.current.milliseconds += performance.now() - started;
    };
  }, [active, flight?.key, paused, cancel]);
  useEffect(() => {
    const visibility = () => {
      if (document.hidden) cancel();
    };
    const changed = () => {
      if (current.current) cancel();
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("resize", changed);
    window.addEventListener("scroll", changed, true);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("resize", changed);
      window.removeEventListener("scroll", changed, true);
      current.current = null;
    };
  }, [cancel]);
  return {
    snapshot,
    flight: active ? flight : null,
    active,
    hiddenIds,
    cancel,
  };
}
