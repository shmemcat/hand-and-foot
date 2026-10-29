import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { Card, Snapshot } from "../types";
import { landingPosition, type CardPosition } from "./useMeldMotion";

export const BOOK_CLOSE_MS = 900;
export const BOOK_RISE_DELAY_MS = Math.round(BOOK_CLOSE_MS * 0.55);
export const BOOK_DESCEND_MS = BOOK_CLOSE_MS - BOOK_RISE_DELAY_MS;
type Pile = { id: string; red: boolean; cards: Card[] };
type Source = { card: Card; pile: Pile; from: CardPosition; indexed: boolean };
export type BookClosingFlight = {
  key: number;
  cards: (Source & {
    gather: CardPosition;
    to: CardPosition;
    cover: boolean;
  })[];
};
type Closing = {
  key: number;
  scope: string;
  piles: Pile[];
  stage: "waiting" | "closing";
  boardHeight: number;
  sources: Source[];
};
const scopeOf = (view: Snapshot) =>
  `${view.code}:${view.round}:${view.viewerId}`;
const selector = (pile: Pile) =>
  pile.red
    ? `.red-three-pile[data-red-three-player-id="${pile.id}"]`
    : `.meld-pile[data-meld-id="${pile.id}"]`;

/** Finish the hand-card flight before gathering an open pile and moving it upstairs. */
export function useBookClosing(
  incoming: Snapshot | null,
  board: RefObject<HTMLDivElement | null>,
  reduced: boolean,
  meldActive: boolean,
  speed = 1,
  paused = false,
) {
  const [desktop, setDesktop] = useState(
    () => window.matchMedia("(min-width: 769px)").matches,
  );
  const [closing, setClosing] = useState<Closing | null>(null);
  const [flight, setFlight] = useState<BookClosingFlight | null>(null);
  const previous = useRef<{
    snapshot: Snapshot;
    visible: Set<string>;
    boardHeight: number;
  } | null>(null);
  const serial = useRef(0);
  const elapsed = useRef({ key: 0, milliseconds: 0 });
  const cancel = useCallback(() => {
    setClosing(null);
    setFlight(null);
  }, []);
  const enabled = Boolean(
    desktop &&
      !reduced &&
      !document.hidden &&
      incoming &&
      incoming.playMode === "practice" &&
      incoming.scoringMode === "individual" &&
      ["play", "draw"].includes(incoming.phase),
  );
  const prior = previous.current;
  const scope = incoming ? scopeOf(incoming) : "";
  const entering: Pile[] = [];
  if (enabled && incoming && prior && scopeOf(prior.snapshot) === scope) {
    for (const meld of incoming.sides.flatMap((side) => side.melds)) {
      const old = prior.snapshot.sides
        .flatMap((side) => side.melds)
        .find((item) => item.id === meld.id);
      if (
        meld.complete &&
        !meld.bonusLost &&
        (old
          ? !old.complete && prior.visible.has(meld.id)
          : prior.snapshot.actorId === incoming.actorId &&
            meld.creator === incoming.actorId &&
            prior.visible.has(`lane:${meld.creator}`))
      )
        entering.push({ id: meld.id, red: false, cards: meld.cards });
    }
    for (const player of incoming.players) {
      const old = prior.snapshot.players.find((item) => item.id === player.id);
      if (
        old &&
        old.redThrees.length < 3 &&
        player.redThrees.length >= 3 &&
        prior.visible.has(`reds:${player.id}`)
      )
        entering.push({ id: player.id, red: true, cards: player.redThrees });
    }
  }
  const valid = Boolean(
    enabled &&
      closing &&
      closing.scope === scope &&
      closing.piles.every((pile) =>
        pile.red
          ? (incoming?.players.find((player) => player.id === pile.id)
              ?.redThrees.length ?? 0) >= 3
          : incoming?.sides.some((side) =>
              side.melds.some(
                (meld) =>
                  meld.id === pile.id && meld.complete && !meld.bonusLost,
              ),
            ),
      ),
  );
  const current = valid ? closing : null;
  const piles = current?.piles ?? entering;
  const waiting = piles.length > 0 && current?.stage !== "closing";
  const openRedPlayers = new Set(
    waiting ? piles.filter((pile) => pile.red).map((pile) => pile.id) : [],
  );
  const active = piles.length > 0;
  const snapshot =
    waiting && incoming
      ? {
          ...incoming,
          sides: incoming.sides.map((side) => ({
            ...side,
            melds: side.melds.map((meld) =>
              piles.some((pile) => !pile.red && pile.id === meld.id)
                ? { ...meld, complete: false }
                : meld,
            ),
          })),
        }
      : incoming;

  useLayoutEffect(() => {
    if (closing && !valid) cancel();
    if (!current && entering.length && prior)
      setClosing({
        key: ++serial.current,
        scope,
        piles: entering,
        stage: "waiting",
        boardHeight: prior.boardHeight,
        sources: [],
      });
    if (!incoming || !board.current) {
      previous.current = null;
      return;
    }
    const visible = new Set<string>();
    for (const pile of board.current.querySelectorAll<HTMLElement>(
      ".meld-pile[data-meld-id]",
    ))
      visible.add(pile.dataset.meldId!);
    // A visible lane also allows three reds played together to form a new book.
    for (const player of incoming.players)
      if (board.current.querySelector(`[data-player-lane-id="${player.id}"]`)) {
        visible.add(`reds:${player.id}`);
        visible.add(`lane:${player.id}`);
      }
    previous.current = {
      snapshot: incoming,
      visible,
      boardHeight:
        board.current.querySelector(".board-carousel")?.getBoundingClientRect()
          .height ?? 0,
    };
  });
  useEffect(() => {
    if (!current || !waiting || meldActive || paused) return;
    const sources: Source[] = [];
    for (const pile of current.piles)
      for (const card of pile.cards) {
        const face = board.current?.querySelector(
          `${selector(pile)} [data-card-id="${card.id}"] .card`,
        );
        if (face)
          sources.push({
            card,
            pile,
            from: landingPosition(face),
            indexed: face.classList.contains("indexed-card"),
          });
      }
    if (!sources.length) {
      cancel();
      return;
    }
    sources.sort((a, b) => a.from.top - b.from.top);
    setClosing({ ...current, stage: "closing", sources });
  }, [current?.key, waiting, meldActive, paused, cancel]);
  useLayoutEffect(() => {
    if (!current || current.stage !== "closing" || flight?.key === current.key)
      return;
    const cards: BookClosingFlight["cards"] = [];
    for (const source of current.sources) {
      const pile = board.current?.querySelector<HTMLElement>(
        selector(source.pile),
      );
      const target = source.pile.red
        ? pile?.querySelector(`[data-card-id="${source.card.id}"] .card`)
        : pile?.querySelector(".closed-card-stack .card");
      if (!target) continue;
      const first = current.sources.find(
        (item) => item.pile.id === source.pile.id,
      )!;
      const coverId =
        pile?.querySelector<HTMLElement>(".closed-card-stack")?.dataset
          .bookCoverId;
      cards.push({
        ...source,
        gather: { ...first.from, rotation: 0 },
        to: landingPosition(target),
        cover: source.card.id === coverId,
      });
    }
    if (!cards.length) {
      cancel();
      return;
    }
    setFlight({ key: current.key, cards });
  }, [current?.key, current?.stage, flight?.key, cancel]);
  useEffect(() => {
    if (!current || !flight || flight.key !== current.key) return;
    if (elapsed.current.key !== flight.key)
      elapsed.current = { key: flight.key, milliseconds: 0 };
    if (paused) return;
    const started = performance.now();
    const timer = window.setTimeout(
      cancel,
      Math.max(0, BOOK_CLOSE_MS / speed - elapsed.current.milliseconds),
    );
    return () => {
      clearTimeout(timer);
      elapsed.current.milliseconds += performance.now() - started;
    };
  }, [current?.key, flight?.key, speed, paused, cancel]);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 769px)");
    const resize = () => {
      setDesktop(media.matches);
      cancel();
    };
    const hide = () => {
      if (document.hidden) cancel();
    };
    media.addEventListener("change", resize);
    window.addEventListener("resize", cancel);
    window.addEventListener("scroll", cancel, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      media.removeEventListener("change", resize);
      window.removeEventListener("resize", cancel);
      window.removeEventListener("scroll", cancel, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [cancel]);
  return {
    cancel,
    snapshot,
    active,
    openRedPlayers,
    flight: current?.stage === "closing" ? flight : null,
    hiddenPiles: current?.stage === "closing" ? current.piles : [],
    boardHeight: active
      ? (current?.boardHeight ?? prior?.boardHeight)
      : undefined,
  };
}
