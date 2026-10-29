import {
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Card } from "./Card";
import { Book } from "./Icons";
import { StartingPiles } from "./StartingPiles";
import type { Snapshot } from "../types";
import {
  DEAL_LAUNCH,
  DEAL_LAND,
  dealPilesLanded,
  ARRIVAL_FADE_MS,
  ARRIVAL_STAGGER_MS,
  arrivalMotionScale,
  type DealAnimation,
  type OpeningState,
} from "../lib/openingSequence";
import "../opening-sequence.css";

export type OpeningPresentation = {
  onChoose: (pile: number) => void;
  animationKey: number;
  tableau?: ReactNode;
  deckOverlay?: ReactNode;
  setup: boolean;
  previousDealerId?: string;
};

type Flight = {
  x: number;
  y: number;
  dx: number;
  dy: number;
  kind: "sweep" | "center" | "split";
  pile: number;
};
const vars = (values: Record<string, string | number>) =>
  values as CSSProperties;

/** The approved opening motion, shared by live rounds and the rehearsal. */
export function OpeningMotion({
  state,
  snapshot,
  duration,
  speed,
  reduced,
  onChoose,
  dealStyle,
  piles,
  previousDealerId,
  children,
}: {
  state: OpeningState;
  snapshot: Snapshot;
  duration: number;
  speed: number;
  reduced: boolean;
  onChoose: (pile: number) => void;
  dealStyle: DealAnimation;
  piles: Snapshot["footPreview"];
  previousDealerId?: string;
  children: (presentation: OpeningPresentation) => ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const exitAppearance = useRef<
    {
      borderOpacity: string;
      labelOpacity: string;
      color: string;
      background: string;
    }[]
  >([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [dealerFlight, setDealerFlight] = useState<{
    x: number;
    y: number;
    dx: number;
    dy: number;
  } | null>(null);
  const count = snapshot.players.length;
  useLayoutEffect(() => {
    const board = root.current;
    if (!board || state.step !== 1 || !previousDealerId || reduced) {
      setDealerFlight(null);
      return;
    }
    const measure = () => {
      const from = board
        .querySelector(".opening-dealer-origin")
        ?.getBoundingClientRect();
      const to = board
        .querySelector(
          ".player-board-nav .dealer-marker:not(.opening-dealer-origin)",
        )
        ?.getBoundingClientRect();
      const bounds = board.getBoundingClientRect();
      if (from && to)
        setDealerFlight({
          x: from.left - bounds.left,
          y: from.top - bounds.top,
          dx: to.left - from.left,
          dy: to.top - from.top,
        });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [state.step, state.replay, previousDealerId, reduced]);
  useLayoutEffect(() => {
    const board = root.current;
    if (!board) return;
    const measure = () => {
      if (state.step !== 3 || reduced || dealStyle === "drops") {
        setFlights((previous) => (previous.length ? [] : previous));
        return;
      }
      const bounds = board.getBoundingClientRect();
      const deck = board
        .querySelector(".draw-pile .card")
        ?.getBoundingClientRect();
      const piles = [
        ...board.querySelectorAll(".choose-pile .pile-preview"),
      ].map((el) => el.getBoundingClientRect());
      if (!deck || !piles.length) return;
      const center = (rect: DOMRect) => ({
        x: rect.left + rect.width / 2 - bounds.left,
        y: rect.top + rect.height / 2 - bounds.top,
      });
      const source = center(deck);
      const targets = piles.map(center);
      const middle = {
        x: (targets[0].x + targets[1].x) / 2,
        y: (targets[0].y + targets[1].y) / 2,
      };
      const flight = (
        from: { x: number; y: number },
        to: { x: number; y: number },
        kind: Flight["kind"],
        pile: number,
      ): Flight => ({
        ...from,
        dx: to.x - from.x,
        dy: to.y - from.y,
        kind,
        pile,
      });
      const next =
        dealStyle === "split"
          ? [
              flight(source, middle, "center", 0),
              ...targets.map((target, pile) =>
                flight(middle, target, "split", pile),
              ),
            ]
          : targets.map((target, pile) =>
              flight(source, target, "sweep", pile),
            );
      setFlights((previous) =>
        JSON.stringify(previous) === JSON.stringify(next) ? previous : next,
      );
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(board);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [
    state.step,
    state.replay,
    count,
    snapshot.scoringMode,
    reduced,
    dealStyle,
  ]);
  useLayoutEffect(() => {
    if (state.step !== 5 || !root.current) return;
    const board = root.current;
    const cards = [...board.querySelectorAll<HTMLElement>(".hand-card")].filter(
      (card) => {
        const bounds = card.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0;
      },
    );
    cards.forEach((card) => {
      card.style.animation = "none";
    });
    const targets = cards.map((card) => card.getBoundingClientRect());
    if (!targets.length) return;
    const source = board
      .querySelector(".opening-gather-source > .card")
      ?.getBoundingClientRect();
    const table = board.querySelector(".tableau")!.getBoundingClientRect();
    const origin = source
      ? { x: source.left + source.width / 2, y: source.top + source.height / 2 }
      : { x: table.left + table.width / 2, y: table.bottom - 100 };
    board
      .querySelectorAll<HTMLElement>(".opening-exit-piles .choose-pile")
      .forEach((pile, i) => {
        const appearance = exitAppearance.current[i];
        if (appearance) {
          pile.style.setProperty(
            "--exit-border-opacity",
            appearance.borderOpacity,
          );
          pile.style.setProperty(
            "--exit-label-opacity",
            appearance.labelOpacity,
          );
          pile.style.setProperty("--exit-border-color", appearance.color);
          pile.style.setProperty(
            "--exit-border-background",
            appearance.background,
          );
        }
      });
    cards.forEach((card, i) => {
      const target = targets[i];
      card.style.setProperty(
        "--gather-x",
        String(origin.x - target.left - target.width / 2) + "px",
      );
      card.style.setProperty(
        "--gather-y",
        String(origin.y - target.top - target.height / 2) + "px",
      );
      card.style.setProperty(
        "--gather-delay",
        String((duration * (0.075 + i * 0.0325)) / speed) + "ms",
      );
      card.style.animation = "";
    });
  }, [state.step, state.replay, duration, speed]);
  function choose(pile: number) {
    exitAppearance.current = [
      ...(root.current?.querySelectorAll(".choose-pile") ?? []),
    ].map((button) => {
      const border = getComputedStyle(button, "::before");
      return {
        borderOpacity: border.opacity,
        labelOpacity: getComputedStyle(button.querySelector("strong")!).opacity,
        color: border.borderColor,
        background: border.backgroundColor,
      };
    });
    onChoose(pile);
  }
  const landed = dealPilesLanded(state.elapsed / duration, dealStyle);
  const tableau =
    state.step < 3 ? (
      <div className="melds">
        <div className="empty-lane">
          <Book />
          <p>Your melds will appear here.</p>
        </div>
      </div>
    ) : state.step === 3 ? (
      <div className="choose-piles">
        <div>
          {[0, 1].map((pile) => (
            <button
              className="choose-pile"
              key={pile}
              disabled
              aria-label={`Dealing pile ${pile + 1}`}
              data-dealt={landed > pile}
            >
              <span className="pile-preview opening-deal-stack">
                <Card />
                <Card />
                <Card />
              </span>
            </button>
          ))}
        </div>
      </div>
    ) : state.step === 5 && state.elapsed < duration * 0.65 && !reduced ? (
      <StartingPiles
        piles={piles ?? []}
        opening
        exiting
        choice={state.choice}
      />
    ) : undefined;
  return (
    <div
      ref={root}
      className={`opening-board${reduced ? " opening-motion-reduced" : ""}`}
      data-opening-step={state.step}
      data-deal-style={dealStyle}
      data-opening-started={state.playing || state.elapsed > 0}
      data-gathering={state.step === 5 && state.elapsed < duration}
      data-dealer-moving={state.step === 1 && Boolean(previousDealerId)}
      style={vars({
        "--arrival-fade": `${(ARRIVAL_FADE_MS * arrivalMotionScale(count, duration)) / speed}ms`,
        "--arrival-stagger": `${(ARRIVAL_STAGGER_MS * arrivalMotionScale(count, duration)) / speed}ms`,
        "--beat-duration": `${(duration || 1000) / speed}ms`,
        "--opening-speed": speed,
        "--opening-play-state": state.playing ? "running" : "paused",
      })}
    >
      {children({
        onChoose: choose,
        animationKey: state.replay,
        tableau,
        setup: state.step <= 4,
        previousDealerId: state.step === 1 ? previousDealerId : undefined,
        deckOverlay:
          state.step === 2 ? (
            <>
              {[0, 1].map((i) => (
                <span key={i} className="opening-deck-card" aria-hidden="true">
                  <Card small />
                </span>
              ))}
            </>
          ) : undefined,
      })}
      {state.step === 1 && dealerFlight && !reduced && (
        <span
          className="dealer-marker opening-dealer-flight"
          aria-hidden="true"
          style={vars({
            left: dealerFlight.x,
            top: dealerFlight.y,
            "--dealer-x": `${dealerFlight.dx}px`,
            "--dealer-y": `${dealerFlight.dy}px`,
          })}
        >
          D
        </span>
      )}
      {state.step === 3 && !reduced && (
        <div
          className="opening-flight-layer"
          aria-hidden="true"
          key={`deal-${state.replay}`}
        >
          {flights.map((flight, i) => (
            <div
              key={i}
              className={`opening-flight opening-packet-${flight.kind}`}
              style={vars({
                left: flight.x,
                top: flight.y,
                "--flight-x": `${flight.dx}px`,
                "--flight-y": `${flight.dy}px`,
                "--flight-delay": `${(duration * (flight.kind === "split" ? DEAL_LAUNCH[1] : DEAL_LAUNCH[flight.pile])) / speed}ms`,
                "--flight-time": `${(duration * (DEAL_LAND[0] - DEAL_LAUNCH[0])) / speed}ms`,
              })}
            >
              <Card small />
              <Card small />
              <Card small />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
