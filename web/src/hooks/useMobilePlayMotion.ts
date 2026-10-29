import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card, Snapshot } from "../types";
import { afterCardAnimations } from "../lib/cardAnimations";
import { landingPosition, type CardPosition } from "./useMeldMotion";
import { BOOK_CLOSE_MS, type BookClosingFlight } from "./useBookClosing";
import { bookCover } from "../lib/bookCover";

export const MOBILE_PLAY_MS = 480;
export const MOBILE_PLAY_STAGGER_MS = 55;
type Move = { card: Card; from: CardPosition };
type Destination = {
  kind: "meld" | "red" | "discard";
  id: string;
  team: number;
  moves: Move[];
  completes: boolean;
  cards: Card[];
};
type Sequence = {
  key: number;
  before: Snapshot;
  groups: Destination[];
  index: number;
  stage: "playing" | "gathering" | "moving";
  sources?: BookClosingFlight["cards"];
};
export type MobilePlayFlight = {
  key: string;
  kind: Destination["kind"];
  faceDown: boolean;
  cover?: Card;
  stackCovers?: { meldId: string; card: Card }[];
  cards: { card: Card; from: CardPosition; to: CardPosition }[];
};
const scope = (snapshot: Snapshot) =>
  `${snapshot.code}:${snapshot.round}:${snapshot.viewerId}`;
const box = (node: Element) => {
  const { left, top, width, height } = node.getBoundingClientRect();
  return { left, top, width, height };
};

/** Confirmed private cards travel to a visible destination, one pile page at a time. */
export function useMobilePlayMotion(
  incoming: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  enabled: boolean,
  reduced: boolean,
) {
  const previous = useRef<{
    snapshot: Snapshot;
    sources: Map<string, CardPosition>;
    fallback?: CardPosition;
  } | null>(null);
  const serial = useRef(0);
  const [sequence, setSequence] = useState<Sequence | null>(null);
  const [flight, setFlight] = useState<MobilePlayFlight | null>(null);
  const [bookFlight, setBookFlight] = useState<BookClosingFlight | null>(null);
  const bookSerial = useRef(0);
  const cancel = useCallback(() => {
    setSequence(null);
    setFlight(null);
    setBookFlight(null);
  }, []);
  const active = Boolean(
    enabled &&
      !reduced &&
      sequence &&
      incoming &&
      scope(sequence.before) === scope(incoming),
  );
  const prior = previous.current?.snapshot;
  const replacing = Boolean(
    incoming?.tableEvents?.some(
      (event) =>
        event.kind === "replace" &&
        event.playerId === incoming.viewerId &&
        !prior?.tableEvents?.some((old) => old.id === event.id),
    ),
  );
  // Follow turn must wait on the confirming render, before the flight is measured.
  const pendingDiscard = Boolean(
    enabled &&
      !reduced &&
      !replacing &&
      !document.hidden &&
      !sequence &&
      incoming &&
      prior &&
      scope(prior) === scope(incoming) &&
      prior.actorId === incoming.viewerId &&
      prior.hand.some(
        (card) =>
          !incoming.hand.some((item) => item.id === card.id) &&
          (incoming.discard?.id === card.id ||
            incoming.tableEvents?.some(
              (event) =>
                event.kind === "discard" &&
                event.playerId === incoming.viewerId &&
                !prior.tableEvents?.some((old) => old.id === event.id) &&
                (event.card?.id === card.id ||
                  (event.faceDown && prior.hand.length === 1)),
            )),
      ),
  );
  const target = active ? sequence!.groups[sequence!.index] : undefined;
  const hiddenIds = new Set(
    active
      ? sequence!.groups
          .slice(sequence!.index + Number(sequence!.stage !== "playing"))
          .flatMap((group) => group.moves.map((move) => move.card.id))
      : [],
  );
  if (active && sequence!.stage === "moving")
    target?.cards.forEach((card) => hiddenIds.add(card.id));
  const allMoved = new Set(
    active
      ? sequence!.groups.flatMap((group) =>
          group.moves.map((move) => move.card.id),
        )
      : [],
  );
  const snapshot =
    active && incoming
      ? {
          ...incoming,
          phase: sequence!.before.phase,
          actorId: sequence!.before.actorId,
          hand: sequence!.before.hand,
          sides: incoming.sides.map((side) => ({
            ...side,
            melds: side.melds.map((meld) => {
              const pending = sequence!.groups
                .slice(sequence!.index)
                .findIndex((group) => group.id === meld.id);
              if (pending < 0) return meld;
              const old = sequence!.before.sides
                .flatMap((side) => side.melds)
                .find((item) => item.id === meld.id);
              if (old?.complete && meld.complete)
                return {
                  ...meld,
                  cards: old.cards,
                  dirty: old.dirty,
                  bonus: old.bonus,
                };
              return sequence!.groups[sequence!.index + pending].completes &&
                (pending > 0 || sequence!.stage !== "moving")
                ? { ...meld, complete: false }
                : meld;
            }),
          })),
          discard:
            target?.kind === "discard"
              ? sequence!.before.discard
              : incoming.discard,
          discardCount:
            target?.kind === "discard"
              ? sequence!.before.discardCount
              : incoming.discardCount,
          discardFaceDown:
            target?.kind === "discard"
              ? sequence!.before.discardFaceDown
              : incoming.discardFaceDown,
          players: incoming.players.map((player) =>
            player.id === incoming.viewerId
              ? {
                  ...player,
                  handCount: sequence!.before.hand.length,
                }
              : player,
          ),
        }
      : incoming;

  useLayoutEffect(() => {
    if (!active && sequence) cancel();
    const root = board.current;
    if (!incoming || !root || !enabled || reduced) {
      previous.current = null;
      return;
    }
    const old = previous.current;
    if (
      !sequence &&
      old &&
      scope(old.snapshot) === scope(incoming) &&
      !document.hidden &&
      old.snapshot.actorId === incoming.viewerId
    ) {
      const owner = incoming.players.find(
        (player) => player.id === incoming.viewerId,
      );
      const side = incoming.sides.find((item) => item.id === owner?.team);
      const priorTable = new Set(
        old.snapshot.sides.flatMap((item) =>
          item.melds.flatMap((meld) => meld.cards.map((card) => card.id)),
        ),
      );
      const groups: Destination[] = [];
      const freshDiscard = incoming.tableEvents?.find(
        (event) =>
          event.kind === "discard" &&
          event.playerId === incoming.viewerId &&
          !old.snapshot.tableEvents?.some((prior) => prior.id === event.id),
      );
      const removedHand = old.snapshot.hand.filter(
        (card) => !incoming.hand.some((item) => item.id === card.id),
      );
      const fromCards = [
        ...old.snapshot.hand,
        ...(old.snapshot.phase === "draw" && old.snapshot.discard
          ? [old.snapshot.discard]
          : []),
      ];
      for (const card of fromCards) {
        if (incoming.hand.some((item) => item.id === card.id)) continue;
        const meld = side?.melds.find(
          (item) =>
            !priorTable.has(card.id) &&
            item.cards.some((face) => face.id === card.id),
        );
        const red =
          owner?.redThrees.some((item) => item.id === card.id) &&
          !old.snapshot.players
            .find((player) => player.id === incoming.viewerId)
            ?.redThrees.some((item) => item.id === card.id);
        const discard =
          !replacing &&
          removedHand.some((item) => item.id === card.id) &&
          (incoming.discard?.id === card.id ||
            (freshDiscard?.faceDown &&
              removedHand.length === 1 &&
              removedHand[0].id === card.id) ||
            incoming.tableEvents?.some(
              (event) =>
                event.kind === "discard" &&
                event.playerId === incoming.viewerId &&
                event.card?.id === card.id &&
                !old.snapshot.tableEvents?.some(
                  (prior) => prior.id === event.id,
                ),
            ));
        const from = old.sources.get(card.id) ?? old.fallback;
        if (!from || (!meld && !red && !discard) || !owner) continue;
        const kind = meld ? "meld" : red ? "red" : "discard";
        const id = meld?.id ?? (red ? `reds:${owner.team}` : "discard");
        let group = groups.find((item) => item.id === id);
        if (!group)
          groups.push(
            (group = {
              kind,
              id,
              team: owner.team,
              moves: [],
              completes: red
                ? owner.redThrees.length >= 3 &&
                  (old.snapshot.players.find((player) => player.id === owner.id)
                    ?.redThrees.length ?? 0) < 3
                : Boolean(
                    meld?.complete &&
                      !old.snapshot.sides
                        .flatMap((side) => side.melds)
                        .find((item) => item.id === id)?.complete,
                  ),
              cards: meld?.cards ?? (red ? owner.redThrees : []),
            }),
          );
        group.moves.push({ card, from });
      }
      if (groups.length)
        setSequence({
          key: ++serial.current,
          before: old.snapshot,
          groups,
          index: 0,
          stage: "playing",
        });
    }
    const sources = new Map<string, CardPosition>();
    for (const node of root.querySelectorAll<HTMLElement>(
      ".hand-card[data-card-id]",
    )) {
      const card = node.querySelector(".card");
      if (card) {
        const rect = box(card);
        if (rect.width && rect.height) sources.set(node.dataset.cardId!, rect);
      }
    }
    const drawer = root.querySelector(".hand-drawer-toggle");
    const discard = root.querySelector(".discard-pickup .card");
    if (discard && incoming.discard)
      sources.set(incoming.discard.id, box(discard));
    const rect = drawer ? box(drawer) : undefined;
    previous.current = {
      snapshot: incoming,
      sources,
      fallback: rect
        ? {
            left: rect.left + rect.width / 2 - 31,
            top: rect.top + rect.height,
            width: 62,
            height: 87,
          }
        : undefined,
    };
  });

  useLayoutEffect(() => {
    if (!active || !sequence || !target || flight || bookFlight) return;
    const root = board.current;
    if (!root) return;
    const pile =
      target.kind === "discard"
        ? root.querySelector(".discard-pickup")
        : target.kind === "red"
          ? root.querySelector(`[data-red-three-team-id="${target.team}"]`)
          : [...root.querySelectorAll<HTMLElement>("[data-meld-id]")].find(
              (node) =>
                node.dataset.meldId === target.id &&
                node.classList.contains("meld-pile"),
            );
    if (!pile) return; // Room first reveals the owner's board and the destination page.
    if (sequence.stage === "gathering") {
      const sources: BookClosingFlight["cards"] = target.cards.flatMap(
        (card) => {
          const layer = [
            ...pile.querySelectorAll<HTMLElement>("[data-card-id]"),
          ].find((node) => node.dataset.cardId === card.id);
          const node = layer?.querySelector(".card");
          if (!node) return [];
          const from = landingPosition(node);
          return [
            {
              card,
              pile: {
                id: target.id,
                red: target.kind === "red",
                cards: target.cards,
              },
              from,
              gather: from,
              to: from,
              cover: false,
              indexed: node.classList.contains("indexed-card"),
            },
          ];
        },
      );
      if (!sources.length) {
        cancel();
        return;
      }
      sources.sort((a, b) => a.from.top - b.from.top);
      setSequence({ ...sequence, stage: "moving", sources });
      return;
    }
    const main = root.closest("main");
    if (main) {
      const view = main.getBoundingClientRect();
      const destination = pile.getBoundingClientRect();
      const shift =
        destination.height > view.height - 24
          ? destination.top - view.top - 12
          : destination.top < view.top + 12
            ? destination.top - view.top - 12
            : destination.bottom > view.bottom - 12
              ? destination.bottom - view.bottom + 12
              : 0;
      if (shift) main.scrollTop += shift;
    }
    if (sequence.stage === "moving") {
      const node = pile.querySelector(
        ".closed-card-stack .card, .red-three-stack .card",
      );
      if (!node || !sequence.sources?.length) {
        cancel();
        return;
      }
      const to = landingPosition(node),
        gather = { ...sequence.sources[0].from, rotation: 0 };
      const cover =
        pile.querySelector<HTMLElement>(".closed-card-stack")?.dataset
          .bookCoverId;
      setBookFlight({
        key: ++bookSerial.current,
        cards: sequence.sources.map((source) => ({
          ...source,
          gather,
          to:
            target.kind === "red"
              ? landingPosition(
                  [...pile.querySelectorAll<HTMLElement>("[data-card-id]")]
                    .find((item) => item.dataset.cardId === source.card.id)
                    ?.querySelector(".card") ?? node,
                )
              : to,
          cover:
            source.card.id ===
            (target.kind === "red" ? target.cards.at(-1)?.id : cover),
        })),
      });
      return;
    }
    const cards = target.moves.flatMap((move) => {
      const layer = [
        ...pile.querySelectorAll<HTMLElement>("[data-card-id]"),
      ].find((node) => node.dataset.cardId === move.card.id);
      const node =
        layer?.querySelector(".card") ??
        pile.querySelector(
          ".closed-card-stack .card, .red-three-stack .card, .card",
        );
      return node ? [{ ...move, to: landingPosition(node) }] : [];
    });
    if (cards.length) {
      const old = sequence.before.sides
        .flatMap((side) => side.melds)
        .find((meld) => target.kind === "meld" && meld.id === target.id);
      const natural =
        old && !old.complete && old.kind !== "run"
          ? old.cards
              .slice()
              .reverse()
              .find((card) => card.rank === old.rank)
          : undefined;
      setFlight({
        key: `${sequence.key}:${sequence.index}`,
        kind: target.kind,
        faceDown:
          target.kind === "discard" && Boolean(incoming?.discardFaceDown),
        cover: old?.complete ? bookCover(old) : undefined,
        stackCovers:
          natural && target.moves.some(({ card }) => card.rank !== old!.rank)
            ? [{ meldId: target.id, card: natural }]
            : [],
        cards,
      });
    } else cancel();
  });

  useEffect(() => {
    if (!active || !sequence || flight || bookFlight) return;
    // A missing destination must never leave a live table locked.
    const duration = sequence.groups.reduce(
      (sum, group) =>
        sum +
        MOBILE_PLAY_MS +
        (group.moves.length - 1) * MOBILE_PLAY_STAGGER_MS +
        (group.completes ? BOOK_CLOSE_MS : 0),
      3000,
    );
    const timer = window.setTimeout(cancel, duration);
    return () => clearTimeout(timer);
  }, [active, sequence?.key, flight, bookFlight, cancel]);
  useEffect(() => {
    if (!flight) return;
    let cancelled = false;
    const timer = window.setTimeout(
      () =>
        afterCardAnimations(board.current, ".mobile-play-card", () => {
          if (cancelled) return;
          setFlight(null);
          setSequence((old) =>
            old?.groups[old.index].completes
              ? { ...old, stage: "gathering" }
              : old && old.index + 1 < old.groups.length
                ? {
                    ...old,
                    index: old.index + 1,
                    stage: "playing",
                    sources: undefined,
                  }
                : null,
          );
        }),
      MOBILE_PLAY_MS + (flight.cards.length - 1) * MOBILE_PLAY_STAGGER_MS,
    );
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [flight]);
  useEffect(() => {
    if (!bookFlight) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      afterCardAnimations(board.current, ".book-closing-card", () => {
        if (cancelled) return;
        setBookFlight(null);
        setSequence((old) =>
          old && old.index + 1 < old.groups.length
            ? {
                ...old,
                index: old.index + 1,
                stage: "playing",
                sources: undefined,
              }
            : null,
        );
      });
    }, BOOK_CLOSE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bookFlight]);
  useEffect(() => {
    if (!active) return;
    const hide = () => {
      if (document.hidden) cancel();
    };
    window.addEventListener("resize", cancel);
    window.addEventListener("wheel", cancel, { passive: true });
    window.addEventListener("touchstart", cancel, { passive: true });
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("resize", cancel);
      window.removeEventListener("wheel", cancel);
      window.removeEventListener("touchstart", cancel);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [active, cancel]);
  return {
    snapshot,
    active,
    blocking: active || pendingDiscard,
    target,
    flight: active ? flight : null,
    bookFlight: active ? bookFlight : null,
    closingBookId:
      active && sequence!.stage === "moving" ? target?.id : undefined,
    closingRedTeam:
      active && sequence!.stage === "moving" && target?.kind === "red"
        ? target.team
        : undefined,
    openRedTeams: new Set(
      active
        ? sequence!.groups
            .slice(sequence!.index)
            .filter(
              (group, index) =>
                group.kind === "red" &&
                group.completes &&
                (index > 0 || sequence!.stage !== "moving"),
            )
            .map((group) => group.team)
        : [],
    ),
    hiddenIds,
    handHiddenIds: allMoved,
    cancel,
  };
}
