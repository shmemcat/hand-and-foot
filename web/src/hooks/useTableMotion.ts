import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card, Snapshot, TableEvent } from "../types";
import {
  afterCardAnimations,
  BOARD_TRANSITION_MS,
} from "../lib/cardAnimations";
import { footGatherDuration } from "../lib/footMotion";
import type { CardPosition } from "./useMeldMotion";
import { publicHandSlots, visiblePublicHandSlots } from "./useConcealedHand";
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
  concealed?: boolean;
  targets?: CardPosition[];
  card: Card | null;
  from: CardPosition;
  to: CardPosition;
  divider: number;
  before: Snapshot;
};
export const tableFlightDuration = (flight: TableFlight) =>
  flight.event.kind === "foot"
    ? footGatherDuration(flight.event.count) / (flight.speed ?? 1)
    : ((flight.event.kind === "replace"
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
  localDiscardHandled = false,
  suspended = false,
  navigationKey = 0,
  followTurn = false,
  meldActive = false,
) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 769px)").matches,
  );
  const [queue, setQueue] = useState<TableFlight[]>([]);
  const [landedId, setLandedId] = useState<string | null>(null);
  const [readyId, setReadyId] = useState<string | null>(null);
  const previous = useRef<{
    snapshot: Snapshot;
    positions: Map<string, CardPosition>;
    publicPlayer?: string;
    navigationKey: number;
    publicPositions: CardPosition[];
  } | null>(null);
  const clear = useCallback(() => setQueue([]), []);
  const canPresent = !rehearsal && !document.hidden;
  const enabled = canPresent && !reduced;
  const scope = incoming ? scopeOf(incoming) : "";
  const prior = previous.current;
  const boardChanged = Boolean(prior && prior.navigationKey !== navigationKey);
  const sameDeal = Boolean(
    prior && incoming && scopeOf(prior.snapshot) === scope,
  );
  const known = new Set(
    sameDeal ? prior!.snapshot.tableEvents?.map((event) => event.id) : [],
  );
  const newEvents = sameDeal
    ? (incoming?.tableEvents ?? []).filter((event) => !known.has(event.id))
    : [];
  const shouldShow = (event: TableEvent) =>
    event.playerId !== incoming?.viewerId
      ? event.kind !== "pickup" ||
        incoming?.players.find((player) => player.id === event.playerId)
          ?.team !== viewedTeam
      : event.kind === "foot"
        ? !suspended
        : desktop && event.kind === "discard" && !localDiscardHandled;
  const visibleMotion = (event: TableEvent) =>
    !reduced || event.faceDown || event.kind === "foot";
  const pendingEvents =
    canPresent && !boardChanged
      ? newEvents.filter((event) => shouldShow(event) && visibleMotion(event))
      : [];
  const waitingForMeld = Boolean(meldActive && queue[0]?.event.kind === "foot");
  const waitingFoot = waitingForMeld ? queue[0] : null;
  const flight =
    canPresent &&
    !boardChanged &&
    !suspended &&
    !waitingForMeld &&
    queue[0]?.scope === scope &&
    visibleMotion(queue[0].event)
      ? queue[0]
      : null;
  const holding = Boolean(
    flight?.event.faceDown && (reduced || landedId === flight.event.id),
  );
  const settled = Boolean(flight && landedId === flight.event.id);
  const waitingForBoard = Boolean(
    flight &&
      followTurn &&
      flight.event.kind === "draw" &&
      !flight.concealed &&
      readyId !== flight.event.id,
  );
  // Scrolling can settle a card, but cannot end its turn ahead of the flight clock.
  const cancel = useCallback(() => {
    if (flight?.event.kind === "discard") setLandedId(flight.event.id);
    else
      setQueue((old) =>
        old.filter(
          (item) => item.event.kind === "discard" || item.event.kind === "foot",
        ),
      );
  }, [flight?.event.id]);
  const blocking =
    Boolean(flight) ||
    waitingForMeld ||
    (!suspended && pendingEvents.length > 0);

  useLayoutEffect(() => {
    if (!incoming || !board.current) {
      previous.current = null;
      if (queue.length) clear();
      return;
    }
    // The server may already name the next actor. Measure the hand actually
    // presented for this event, including the second player in a partnership.
    const publicPlayer = board.current.querySelector<HTMLElement>(
      ".hand-dock[data-public-player]",
    )?.dataset.publicPlayer;
    if (
      queue.length &&
      (!canPresent ||
        queue[0].scope !== scope ||
        !visibleMotion(queue[0].event))
    )
      clear();
    if (boardChanged && queue.length) {
      // A new footer never inherits destinations or staged counts from the old one.
      setQueue((old) =>
        old
          .filter((item) => item.event.faceDown || item.event.kind === "foot")
          .map((item) => ({
            ...item,
            concealed: false,
            local: false,
            targets: undefined,
            card: item.event.faceDown ? null : item.card,
          })),
      );
      if (queue[0].event.faceDown) setLandedId(queue[0].event.id);
    }
    if (
      canPresent &&
      sameDeal &&
      !boardChanged &&
      incoming.phase !== "choose"
    ) {
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
        let playersBefore = prior!.snapshot.players;
        let previousDiscard = {
          card: prior!.snapshot.discard,
          count: prior!.snapshot.discardCount,
          faceDown: prior!.snapshot.discardFaceDown,
        };
        for (const [eventIndex, event] of newEvents.entries()) {
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
          const concealed =
            event.kind !== "pickup" &&
            !own &&
            event.playerId === publicPlayer &&
            Boolean(
              board.current.querySelector(
                `[data-public-player="${publicPlayer}"]`,
              ),
            );
          const slots = concealed
            ? publicHandSlots(board.current).map((slot) =>
                position(slot.querySelector(".card") ?? slot),
              )
            : [];
          const oldSlots =
            prior!.publicPlayer === publicPlayer ? prior!.publicPositions : [];
          const handSource =
            concealed && isDiscard(event)
              ? (oldSlots.at(-1) ?? slots.at(-1))
              : null;
          const handTargets =
            concealed && !isDiscard(event)
              ? Array.from({ length: event.count }, (_, index) => {
                  const first = slots[0] ?? oldSlots[0];
                  if (slots[index]) return slots[index];
                  const dock = board
                    .current!.querySelector(".hand-dock")!
                    .getBoundingClientRect();
                  return first
                    ? { ...first, left: first.left + index * (first.width + 6) }
                    : {
                        left: dock.left + 5 + index * 71,
                        top: dock.top + 60,
                        width: 65,
                        height: 91,
                      };
                })
              : undefined;
          const edge = { ...pile, top: header.bottom - pile.height * 0.15 };
          if (shouldShow(event) && visibleMotion(event))
            next.push({
              speed,
              event,
              scope,
              before: {
                ...prior!.snapshot,
                players: playersBefore,
                discard: previousDiscard.card,
                discardCount: previousDiscard.count,
                discardFaceDown: previousDiscard.faceDown,
              },
              local: Boolean(
                source || (concealed && (handSource || handTargets)),
              ),
              concealed,
              targets: handTargets,
              card: event.faceDown && !source ? null : card,
              from: isDiscard(event) ? (source ?? handSource ?? edge) : pile,
              to: isDiscard(event) ? pile : (handTargets?.[0] ?? edge),
              divider: header.bottom,
            });
          const delta =
            event.kind === "draw"
              ? event.count
              : isDiscard(event)
                ? -event.count
                : 0;
          playersBefore = playersBefore.map((player) =>
            player.id === event.playerId
              ? {
                  ...player,
                  handCount: Math.max(0, player.handCount + delta),
                }
              : player,
          );
          if (event.kind === "pickup") {
            const laterDelta = newEvents
              .slice(eventIndex + 1)
              .filter((next) => next.playerId === event.playerId)
              .reduce(
                (sum, next) =>
                  sum +
                  (next.kind === "draw"
                    ? next.count
                    : isDiscard(next)
                      ? -next.count
                      : 0),
                0,
              );
            playersBefore = playersBefore.map((player) =>
              player.id === event.playerId
                ? {
                    ...player,
                    handCount: Math.max(
                      0,
                      (incoming.players.find((seat) => seat.id === player.id)
                        ?.handCount ?? player.handCount) - laterDelta,
                    ),
                  }
                : player,
            );
            previousDiscard = {
              card: incoming.discard,
              count: Math.max(0, previousDiscard.count - event.count),
              faceDown: incoming.discardFaceDown,
            };
          }
          if (isDiscard(event))
            previousDiscard = {
              card: event.card,
              count: previousDiscard.count + event.count,
              faceDown: event.faceDown,
            };
        }
        if (next.length)
          setQueue((old) => {
            // Going out can skip fresh draws, but never an unfinished discard.
            const ending = next.find((item) => item.event.faceDown);
            return [
              ...old.filter((item) => item.scope === scope),
              ...next.filter(
                (item) =>
                  !ending ||
                  item.event.kind === "discard" ||
                  item.event.kind === "foot",
              ),
            ];
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
    previous.current = {
      snapshot: incoming,
      positions,
      publicPlayer,
      navigationKey,
      publicPositions: visiblePublicHandSlots(board.current).map((slot) =>
        position(slot.querySelector(".card") ?? slot),
      ),
    };
  });
  useLayoutEffect(() => {
    if (!flight || flight.local || !isDiscard(flight.event)) return;
    const hand = board.current?.querySelector<HTMLElement>(
      ".hand-dock[data-public-player]",
    );
    if (hand?.dataset.publicPlayer !== flight.event.playerId) return;
    const slot = visiblePublicHandSlots(hand).at(-1);
    if (!slot) return;
    const from = position(slot.querySelector(".card") ?? slot);
    // A queued action may have been recorded before its board was visible.
    // Once followed, let that player's real hand own the discard flight.
    setQueue((old) =>
      old.map((item) =>
        item.event.id === flight.event.id
          ? { ...item, from, local: true, concealed: true }
          : item,
      ),
    );
  });
  useEffect(() => {
    if (!flight || !waitingForBoard) return;
    let canceled = false;
    // Queued draws may arrive while a foot pickup still holds the previous footer.
    // Follow the queued actor, finish that board's sweep, then measure its hand.
    const timer = window.setTimeout(
      () =>
        afterCardAnimations(
          board.current,
          ".hand-dock, .tableau-content, .tableau",
          () => {
            if (canceled) return;
            const hand = board.current?.querySelector(
              `[data-public-player="${flight.event.playerId}"]`,
            );
            const targets = hand
              ? publicHandSlots(board.current)
                  .slice(0, flight.event.count)
                  .map((slot) => position(slot.querySelector(".card") ?? slot))
              : [];
            if (targets.length === flight.event.count)
              setQueue((old) =>
                old.map((item) =>
                  item.event.id === flight.event.id
                    ? {
                        ...item,
                        concealed: true,
                        local: true,
                        targets,
                        to: targets[0],
                      }
                    : item,
                ),
              );
            setReadyId(flight.event.id);
          },
          false,
        ),
      BOARD_TRANSITION_MS,
    );
    return () => {
      canceled = true;
      clearTimeout(timer);
    };
  }, [flight?.event.id, waitingForBoard]);
  useEffect(() => {
    if (!flight || waitingForBoard) return;
    let cancelled = false;
    const complete = () => {
      if (cancelled) return;
      if (flight.event.faceDown && !holding) setLandedId(flight.event.id);
      else
        setQueue((old) =>
          old.filter((item) => item.event.id !== flight.event.id),
        );
    };
    const timer = window.setTimeout(
      () =>
        afterCardAnimations(
          board.current,
          flight.event.kind === "foot"
            ? ".hand-card, .foot-status"
            : ".table-card-flight",
          complete,
        ),
      holding ? GOING_OUT_PAUSE_MS : tableFlightDuration(flight),
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [flight?.event.id, holding, waitingForBoard]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const change = () => setDesktop(media.matches);
    const hide = () => {
      if (document.hidden) clear();
    };
    const scroll = (event: Event) => {
      if (
        flight?.concealed &&
        flight.event.kind === "draw" &&
        event.target instanceof HTMLElement &&
        event.target.matches(".public-hand-cards") &&
        event.target.scrollLeft === 0
      )
        return;
      cancel();
    };
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("resize", cancel);
    window.addEventListener("scroll", scroll, true);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [cancel, clear]);

  // Use the queued action's player, even when a newer server update has arrived.
  const event =
    flight?.event ??
    waitingFoot?.event ??
    (!suspended ? pendingEvents[0] : undefined);
  const before = flight?.before ?? waitingFoot?.before ?? prior?.snapshot;
  const stagedEvents = [
    ...queue.filter((item) => item.scope === scope).map((item) => item.event),
    ...pendingEvents,
  ].filter(
    (item, index, items) =>
      items.findIndex((other) => other.id === item.id) === index,
  );
  const laterEvents = stagedEvents.slice(
    stagedEvents.findIndex((item) => item.id === event?.id) + 1,
  );
  const waitingFeet = [
    ...queue
      .filter((item) => item.scope === scope)
      .map((item) => ({ event: item.event, before: item.before })),
    ...pendingEvents.map((event) => ({ event, before: prior?.snapshot })),
  ].filter(
    ({ event: queued }) => queued.kind === "foot" && queued.id !== event?.id,
  );
  const pickupOwner =
    flight?.event.kind === "foot"
      ? flight.before.players.find(
          (player) => player.id === flight.event.playerId,
        )
      : undefined;
  const snapshot: Snapshot | null =
    presented && event && before
      ? {
          ...presented,
          actorId: event.playerId,
          players: presented.players.map((player) => {
            if (waitingFoot && player.id === event.playerId) {
              const old = waitingFoot.before.players.find(
                (seat) => seat.id === player.id,
              )!;
              return {
                ...player,
                handCount: 0,
                footCount: old.footCount,
                footTop: old.footTop,
                inFoot: false,
              };
            }
            if (event.kind === "foot" && player.id === event.playerId)
              return {
                ...player,
                handCount: event.count,
                inFoot: true,
                footCount: 0,
                footTop: null,
              };
            const pending = waitingFeet.find(
              (item) => item.event.playerId === player.id,
            );
            const old = pending?.before?.players.find(
              (seat) => seat.id === player.id,
            );
            return old
              ? {
                  ...player,
                  handCount: old.handCount,
                  footCount: old.footCount,
                  inFoot: old.inFoot,
                  footTop: old.footTop,
                }
              : player.id === event.playerId &&
                  ["draw", "discard", "replace"].includes(event.kind)
                ? {
                    ...player,
                    handCount: Math.max(
                      0,
                      player.id !== presented.viewerId
                        ? (incoming?.players.find(
                            (seat) => seat.id === player.id,
                          )?.handCount ?? player.handCount) -
                            laterEvents
                              .filter((next) => next.playerId === player.id)
                              .reduce(
                                (sum, next) =>
                                  sum +
                                  (next.kind === "draw"
                                    ? next.count
                                    : isDiscard(next)
                                      ? -next.count
                                      : 0),
                                0,
                              )
                        : (before.players.find((seat) => seat.id === player.id)
                            ?.handCount ?? player.handCount) +
                            (event.kind === "draw"
                              ? event.count
                              : -event.count),
                    ),
                  }
                : player;
          }),
          phase:
            event.kind === "draw" || event.kind === "pickup" ? "draw" : "play",
          message: holding
            ? presented.message
            : event.kind === "foot"
              ? `${presented.players.find((player) => player.id === event.playerId)?.name ?? "Player"} picked up their foot!`
              : event.kind === "discard"
                ? `${presented.players.find((player) => player.id === event.playerId)?.name ?? "Player"} is discarding…`
                : before.message,
          ...(!holding && !settled
            ? {
                discard: before.discard,
                discardFaceDown: before.discardFaceDown,
                discardCount: before.discardCount,
              }
            : {
                discard: event.card,
                discardFaceDown: event.faceDown,
                discardCount: before.discardCount + event.count,
              }),
          // Keep the actual face-down pile visible for a beat before scoring.
          ...(event.faceDown ? { scoring: null } : {}),
        }
      : presented;
  return {
    snapshot,
    flight:
      holding || settled || waitingForBoard || flight?.event.kind === "foot"
        ? null
        : flight,
    pickup: flight?.event.kind === "foot" ? flight.event : null,
    pickupSource: pickupOwner
      ? {
          count: pickupOwner.footCount,
          topCard:
            pickupOwner.footTop ??
            (pickupOwner.id === flight!.before.viewerId
              ? flight!.before.footTop
              : null),
        }
      : undefined,
    holding,
    blocking,
    cancel,
    handEvent: event,
  };
}
