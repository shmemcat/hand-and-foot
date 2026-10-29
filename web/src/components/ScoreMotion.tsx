import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";
import { Card } from "./Card";
import { ClosingBooks } from "./ClosingBooks";
import { BOOK_CLOSE_MS, type BookClosingFlight } from "../hooks/useBookClosing";
import {
  scoringHeldCards,
  type ScoreBeat,
  type ScoreTransfer,
} from "../lib/scoringSequence";

type Box = { left: number; top: number; width: number; height: number };
type Flight = {
  transfer: ScoreTransfer;
  from: Box;
  midX: number;
  midY: number;
  toX: number;
  toY: number;
  scaleX: number;
  scaleY: number;
  delay: number;
  duration: number;
  remainder?: number;
};
const rect = (node: Element): Box => {
  const { left, top, width, height } = node.getBoundingClientRect();
  return { left, top, width, height };
};
function findCard(
  root: HTMLElement,
  id: string,
  beat: ScoreBeat,
): Element | null {
  const held = root.querySelector(`[data-score-holding-id="${id}"] .card`);
  const face = held ?? root.querySelector(`[data-card-id="${id}"] .card`);
  if (face) return face;
  const meld = beat.melds.find((pile) =>
    pile.cards.some((card) => card.id === id),
  );
  return meld
    ? root.querySelector(`[data-meld-id="${meld.id}"] .closed-card-stack .card`)
    : null;
}

/** Measures the same real cards before/after each accepted scoring beat. */
export function ScoreMotion({
  board,
  beat,
  beatKey,
  reduced,
  paused,
  enabled = true,
}: {
  board: RefObject<HTMLDivElement | null>;
  beat: ScoreBeat;
  beatKey: string;
  reduced: boolean;
  paused: boolean;
  enabled?: boolean;
}) {
  const prior = useRef<{
    key: string;
    positions: Map<string, Box>;
    points: Record<string, number>;
    covers: Set<string>;
    held: Set<string>;
    foot?: Box;
  } | null>(null);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [opening, setOpening] = useState<BookClosingFlight | null>(null);
  const serial = useRef(0);
  useLayoutEffect(() => {
    const root = board.current;
    if (!root) return;
    const old = prior.current;
    if (old?.key !== beatKey) {
      setFlights([]);
      setOpening(null);
      if (old && enabled && !reduced && !document.hidden) {
        if (beat.kind === "break") {
          const pile = root.querySelector(
            beat.activePile === "reds"
              ? ".open-piles .red-three-pile"
              : `.open-piles [data-meld-id="${beat.activePile}"]`,
          );
          const stack = pile?.querySelector(".meld-card-layers");
          const cards: BookClosingFlight["cards"] = [];
          if (stack) {
            const landing = rect(stack);
            for (const move of beat.transfers) {
              const from = old.positions.get(move.card.id),
                target = findCard(root, move.card.id, beat);
              if (from && target)
                cards.push({
                  card: move.card,
                  pile: {
                    id: beat.activePile ?? "",
                    red: move.card.redThree,
                    cards: [],
                  },
                  from,
                  gather: { ...from, left: landing.left, top: landing.top },
                  to: rect(target),
                  cover: old.covers.has(move.card.id),
                  indexed: target.classList.contains("indexed-card"),
                });
            }
          }
          cards.sort((a, b) => a.to.top - b.to.top);
          if (cards.length) setOpening({ key: ++serial.current, cards });
        } else {
          const held = new Set(scoringHeldCards(beat).map((card) => card.id));
          const parked = beat.transfers.find(
            (move) =>
              move.paired &&
              (old.held.has(move.card.id) || held.has(move.card.id)),
          );
          const parkedNode =
            parked &&
            root.querySelector(
              `[data-score-holding-id="${parked.card.id}"] .card`,
            );
          const meeting = parkedNode
            ? rect(parkedNode)
            : parked
              ? old.positions.get(parked.card.id)
              : undefined;
          const join = root.querySelector("[data-score-meet]");
          const meet = meeting ?? (join ? rect(join) : undefined);
          const next: Flight[] = [];
          beat.transfers.forEach((transfer, index) => {
            if (
              transfer.paired &&
              old.held.has(transfer.card.id) &&
              held.has(transfer.card.id)
            )
              return;
            const source =
              transfer.source === "foot"
                ? old.foot
                : old.positions.get(transfer.card.id);
            const destination = ["hand", "table"].includes(transfer.target)
              ? findCard(root, transfer.card.id, beat)
              : root.querySelector(
                  transfer.target === "count"
                    ? '[data-score-target="count"] strong'
                    : `[data-score-target="${transfer.target}"] .score-settlement-stack`,
                );
            if (!source || !destination) return;
            const target = rect(destination),
              width =
                transfer.source === "foot"
                  ? target.width
                  : Math.max(32, source.width),
              height = (width * 87) / 62;
            const from = {
              left: source.left + source.width / 2 - width / 2,
              top: source.top + source.height / 2 - height / 2,
              width,
              height,
            };
            const toX = target.left + target.width / 2 - width / 2 - from.left,
              toY = target.top + target.height / 2 - height / 2 - from.top;
            const offset = meeting
              ? transfer.card.id === parked?.card.id
                ? 0
                : meeting.width + 8
              : transfer.source === "hand"
                ? -35
                : 35;
            next.push({
              transfer,
              from,
              toX,
              toY,
              midX:
                transfer.paired && meet
                  ? meet.left + meet.width / 2 + offset - width / 2 - from.left
                  : toX * 0.6,
              midY:
                transfer.paired && meet
                  ? meet.top + meet.height / 2 - height / 2 - from.top
                  : toY * 0.6,
              scaleX: transfer.target === "count" ? 0.35 : target.width / width,
              scaleY:
                transfer.target === "count" ? 0.35 : target.height / height,
              delay: transfer.paired
                ? 0
                : index * (beat.kind === "gather" ? 60 : 35),
              duration: transfer.paired ? 650 : 600,
              remainder: ["hand", "table"].includes(transfer.target)
                ? beat.pointsLeft[transfer.card.id]
                : old.points[transfer.card.id],
            });
          });
          setFlights(next);
        }
      }
    }
    const positions = new Map<string, Box>(),
      covers = new Set<string>();
    for (const card of [
      ...beat.hand,
      ...beat.melds.flatMap((meld) => meld.cards),
      ...beat.reds,
    ]) {
      const node = findCard(root, card.id, beat);
      if (node) {
        positions.set(card.id, rect(node));
        const cover =
          node.closest<HTMLElement>(".closed-card-stack")?.dataset.bookCoverId;
        if (cover) covers.add(cover);
        else if (card.redThree && card.id === beat.reds.at(-1)?.id)
          covers.add(card.id);
      }
    }
    const foot = root.querySelector(".foot-stack");
    prior.current = {
      key: beatKey,
      positions,
      points: beat.pointsLeft,
      covers,
      held: new Set(scoringHeldCards(beat).map((card) => card.id)),
      foot: foot ? rect(foot) : undefined,
    };
  });
  useEffect(() => {
    if (!flights.length && !opening) return;
    const clear = () => {
      setFlights([]);
      setOpening(null);
    };
    const visibility = () => {
      if (document.hidden) clear();
    };
    const timer = window.setTimeout(
      clear,
      opening
        ? BOOK_CLOSE_MS + 40
        : Math.max(...flights.map((flight) => flight.duration + flight.delay)) +
            40,
    );
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [flights, opening]);
  useEffect(() => {
    if (reduced || !enabled || paused) {
      setFlights([]);
      setOpening(null);
    }
  }, [reduced, enabled, paused]);
  const moving = [
    ...flights.map(({ transfer }) => transfer.card),
    ...(opening?.cards.map(({ card }) => card) ?? []),
  ];
  return (
    <>
      {moving.length > 0 && (
        <style>
          {moving
            .map(
              (card) =>
                `.game-page [data-card-id="${card.id}"] .card {visibility:hidden !important;}`,
            )
            .join("\n")}
        </style>
      )}
      {opening && (
        <ClosingBooks
          flight={opening}
          speed={1}
          paused={false}
          direction="open"
        />
      )}
      {!opening && beat.activePile && beat.kind === "bonus" && (
        <style>
          {beat.activePile === "reds"
            ? ".game-page .red-three-stack {outline:2px solid var(--secondary);outline-offset:7px;}"
            : `.game-page [data-meld-id="${beat.activePile}"] > button {outline:2px solid var(--secondary);outline-offset:7px;}`}
        </style>
      )}
      {flights.map((flight) => (
        <div
          className={`score-card-flight ${flight.transfer.paired ? "is-paired" : ""}`}
          data-score-flight-id={flight.transfer.card.id}
          aria-hidden="true"
          key={`${beatKey}-${flight.transfer.card.id}`}
          style={
            {
              left: flight.from.left,
              top: flight.from.top,
              width: flight.from.width,
              height: flight.from.height,
              "--score-mid-x": `${flight.midX}px`,
              "--score-mid-y": `${flight.midY}px`,
              "--score-end-x": `${flight.toX}px`,
              "--score-end-y": `${flight.toY}px`,
              "--score-end-scale-x": flight.scaleX,
              "--score-end-scale-y": flight.scaleY,
              animationDuration: `${flight.duration}ms`,
              animationDelay: `${flight.delay}ms`,
            } as CSSProperties
          }
        >
          <Card
            card={flight.transfer.card}
            small
            pointsLeft={flight.remainder}
          />
        </div>
      ))}
    </>
  );
}
