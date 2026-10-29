import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card, Snapshot, TableEvent } from "../types";
import type { CardPosition } from "./useMeldMotion";
import {
  DRAW_FLIGHT_MS,
  DRAW_STAGGER_MS,
  RED_REPLACEMENT_MS,
} from "./useDrawMotion";

export type TableFlight = {
  speed?: number;
  event: TableEvent;
  scope: string;
  local: boolean;
  card: Card | null;
  from: CardPosition;
  to: CardPosition;
  divider: number;
  before: Snapshot;
};
export const tableFlightDuration = (flight: TableFlight) =>
  ((flight.event.kind === "replace"
    ? RED_REPLACEMENT_MS
    : flight.event.kind === "discard"
      ? DISCARD_FLIGHT_MS
      : DRAW_FLIGHT_MS) +
    (flight.event.count - 1) * DRAW_STAGGER_MS) /
  (flight.speed ?? 1);
export const GOING_OUT_PAUSE_MS = 1200;
export const DISCARD_FLIGHT_MS = 600;
export const DISCARD_FLIP_MS = 560;
const scopeOf = (snapshot: Snapshot) =>
  `${snapshot.code}:${snapshot.round}:${snapshot.viewerId}`;
const position = (element: Element): CardPosition => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return { left, top, width, height };
};
const isDiscard = (event: TableEvent) =>
  event.kind === "discard" || event.kind === "replace";

/** Public, server-recorded actions stay visible while browsing any player's board. */
export function useTableMotion(
  incoming: Snapshot | null,
  presented: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  reduced: boolean,
  rehearsal: boolean,
  viewedTeam?: number,
  speed = 1,
) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 769px)").matches,
  );
  const [queue, setQueue] = useState<TableFlight[]>([]);
  const [landedId, setLandedId] = useState<string | null>(null);
  const previous = useRef<{
    snapshot: Snapshot;
    positions: Map<string, CardPosition>;
  } | null>(null);
  const clear = useCallback(() => setQueue([]), []);
  const canPresent = desktop && !rehearsal && !document.hidden;
  const enabled = canPresent && !reduced;
  const scope = incoming ? scopeOf(incoming) : "";
  const prior = previous.current;
  const sameDeal = Boolean(
    prior && incoming && scopeOf(prior.snapshot) === scope,
  );
  const known = new Set(
    sameDeal ? prior!.snapshot.tableEvents?.map((event) => event.id) : [],
  );
  const newEvents = sameDeal
    ? (incoming?.tableEvents ?? []).filter((event) => !known.has(event.id))
    : [];
  const enteredFoot = Boolean(
    incoming &&
      prior &&
      !prior.snapshot.players.find((player) => player.id === incoming.viewerId)
        ?.inFoot &&
      incoming.players.find((player) => player.id === incoming.viewerId)
        ?.inFoot,
  );
  const shouldShow = (event: TableEvent) =>
    event.playerId !== incoming?.viewerId ||
    (event.kind === "discard" && !enteredFoot);
  const flight =
    canPresent &&
    queue[0]?.scope === scope &&
    (!reduced || queue[0].event.faceDown)
      ? queue[0]
      : null;
  const holding = Boolean(
    flight?.event.faceDown && (reduced || landedId === flight.event.id),
  );
  // A scroll or board change settles the card but preserves the going-out pause.
  const cancel = useCallback(() => {
    if (flight?.event.faceDown) setLandedId(flight.event.id);
    else clear();
  }, [flight?.event.id, clear]);
  const blocking =
    Boolean(
      flight &&
        (flight.event.playerId === incoming?.viewerId || flight.event.faceDown),
    ) ||
    Boolean(
      canPresent &&
        newEvents.some(
          (event) =>
            shouldShow(event) &&
            (!reduced || event.faceDown) &&
            (event.faceDown || event.playerId === incoming?.viewerId),
        ),
    );

  useLayoutEffect(() => {
    if (!incoming || !board.current) {
      previous.current = null;
      if (queue.length) clear();
      return;
    }
    if (
      queue.length &&
      (!canPresent ||
        queue[0].scope !== scope ||
        (reduced && !queue[0].event.faceDown))
    )
      clear();
    if (canPresent && sameDeal && incoming.phase !== "choose") {
      const header = board.current
        .querySelector(".game-header")
        ?.getBoundingClientRect();
      const deck = board.current.querySelector(
        ".draw-pile .draw-deck-cards .card",
      );
      const discard = board.current.querySelector(
        ".discard-pickup .card, .discard-pickup .empty-card",
      );
      if (header && deck && discard) {
        const next: TableFlight[] = [];
        let previousDiscard = {
          card: prior!.snapshot.discard,
          count: prior!.snapshot.discardCount,
          faceDown: prior!.snapshot.discardFaceDown,
        };
        for (const event of newEvents
          .filter((event) => shouldShow(event) && (!reduced || event.faceDown))
          .slice(-8)) {
          const pile = position(event.kind === "draw" ? deck : discard);
          const own = event.playerId === incoming.viewerId;
          const card =
            own && isDiscard(event)
              ? (prior!.snapshot.hand.find(
                  (card) => card.id === event.card?.id,
                ) ??
                (event.faceDown && prior!.snapshot.hand.length === 1
                  ? prior!.snapshot.hand[0]
                  : null))
              : event.card;
          const ownBoard =
            viewedTeam === undefined ||
            viewedTeam ===
              incoming.players.find((player) => player.id === incoming.viewerId)
                ?.team;
          const source =
            own && ownBoard && card ? prior!.positions.get(card.id) : null;
          const edge = { ...pile, top: header.bottom - pile.height * 0.15 };
          next.push({
            speed,
            event,
            scope,
            before: {
              ...prior!.snapshot,
              discard: previousDiscard.card,
              discardCount: previousDiscard.count,
              discardFaceDown: previousDiscard.faceDown,
            },
            local: Boolean(source),
            card: event.faceDown && !source ? null : card,
            from: isDiscard(event) ? (source ?? edge) : pile,
            to: isDiscard(event) ? pile : edge,
            divider: header.bottom,
          });
          if (isDiscard(event))
            previousDiscard = {
              card: event.card,
              count: previousDiscard.count + event.count,
              faceDown: event.faceDown,
            };
        }
        if (next.length)
          setQueue((old) => {
            // Going out should land promptly, even if updates arrived in a batch.
            const ending = next.find((item) => item.event.faceDown);
            return ending
              ? [ending]
              : [...old.filter((item) => item.scope === scope), ...next];
          });
      }
    }
    const positions = new Map<string, CardPosition>();
    if (enabled)
      for (const slot of board.current.querySelectorAll<HTMLElement>(
        ".hand-card[data-card-id]",
      )) {
        const card = slot.querySelector(".card");
        if (card) positions.set(slot.dataset.cardId!, position(card));
      }
    previous.current = { snapshot: incoming, positions };
  });
  useEffect(() => {
    if (!flight) return;
    const timer = window.setTimeout(
      () => {
        if (flight.event.faceDown && !holding) setLandedId(flight.event.id);
        else
          setQueue((old) =>
            old.filter((item) => item.event.id !== flight.event.id),
          );
      },
      holding ? GOING_OUT_PAUSE_MS : tableFlightDuration(flight),
    );
    return () => clearTimeout(timer);
  }, [flight?.event.id, holding]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const change = () => setDesktop(media.matches);
    const hide = () => {
      if (document.hidden) clear();
    };
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", cancel);
    window.addEventListener("scroll", cancel, true);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("scroll", cancel, true);
    };
  }, [cancel, clear]);

  const showingLatestDiscard = Boolean(
    flight &&
      isDiscard(flight.event) &&
      incoming &&
      (flight.event.kind === "replace" ||
        (flight.event.faceDown
          ? incoming.discardFaceDown
          : flight.event.card?.id === incoming.discard?.id)),
  );
  const snapshot =
    presented && flight && showingLatestDiscard
      ? {
          ...presented,
          ...(!holding
            ? {
                discard: flight.before.discard,
                discardFaceDown: flight.before.discardFaceDown,
                discardCount: flight.before.discardCount,
              }
            : {}),
          // Keep the actual face-down pile visible for a beat before scoring.
          ...(flight.event.faceDown
            ? { phase: flight.before.phase, scoring: null }
            : {}),
        }
      : presented;
  return {
    snapshot,
    flight: holding ? null : flight,
    holding,
    blocking,
    cancel,
  };
}
