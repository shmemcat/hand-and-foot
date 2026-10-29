import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { Card } from "../components/Card";
import { ClosingBooks } from "../components/ClosingBooks";
import {
  BOOK_CLOSE_MS,
  BOOK_DESCEND_MS,
  type BookClosingFlight,
} from "../hooks/useBookClosing";
import { AnimatedNumber } from "../components/ScoringReview";
import { useModalFocus } from "../hooks/useModalFocus";
import {
  SCORING_SCENARIOS,
  scoringSequence,
  scoringSnapshot,
  scoringHeldCards,
  type ScoreBeat,
  type ScoreTransfer,
} from "../lib/scoringSequence";
import "../scoring-preview.css";

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
const signed = (value: number) =>
  `${value < 0 ? "−" : "+"}${Math.abs(value).toLocaleString()}`;
function findCard(
  root: HTMLElement | null,
  id: string,
  beat: ScoreBeat,
): Element | null {
  const face = root?.querySelector(`.game-page [data-card-id="${id}"] .card`);
  if (face) return face;
  const meld = beat.melds.find((pile) =>
    pile.cards.some((card) => card.id === id),
  );
  return meld
    ? (root?.querySelector(
        `[data-meld-id="${meld.id}"] .closed-card-stack .card`,
      ) ?? null)
    : null;
}
export function ScoringPreview() {
  const [scenarioId, setScenarioId] = useState("break-book");
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [replay, setReplay] = useState(0);
  const [numberKey, setNumberKey] = useState(0);
  const [scorecard, setScorecard] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const scenario = SCORING_SCENARIOS.find((item) => item.id === scenarioId)!;
  const beats = useMemo(() => scoringSequence(scenario), [scenario]);
  const beat = beats[Math.min(step, beats.length - 1)];
  const final = beats.at(-1)!;
  const heldCards = useMemo(() => scoringHeldCards(beat), [beat]);
  const snapshot = useMemo(
    () => scoringSnapshot(scenario, beat, replay),
    [scenario, beat, replay],
  );
  const root = useRef<HTMLDivElement>(null);
  const sources = useRef(new Map<string, Box>());
  const sourcePoints = useRef(new Map<string, number>());
  const sourceCovers = useRef(new Set<string>());
  const previousHeld = useRef(new Set<string>());
  const animate = useRef(false);
  const [flights, setFlights] = useState<Flight[]>([]);
  const [openingFlight, setOpeningFlight] = useState<BookClosingFlight | null>(
    null,
  );
  const advance = useRef(() => {});
  const finalStep = beat.kind === "total";
  useModalFocus(scorecard, `${scenarioId}-${replay}`, () =>
    setScorecard(false),
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => {
      setReduced(media.matches);
      setFlights([]);
      setOpeningFlight(null);
    };
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);

  function go(next: number, motion = true) {
    const captured = new Map<string, Box>();
    sourcePoints.current = new Map();
    sourceCovers.current = new Set();
    previousHeld.current = new Set(heldCards.map((face) => face.id));
    if (motion && !reduced)
      for (const move of beats[next].transfers) {
        const source =
          move.source === "foot"
            ? root.current?.querySelector(".foot-stack")
            : findCard(root.current, move.card.id, beat);
        if (source) {
          captured.set(move.card.id, rect(source));
          const coverId =
            source.closest<HTMLElement>(".closed-card-stack")?.dataset
              .bookCoverId;
          if (coverId) sourceCovers.current.add(coverId);
          else if (move.card.redThree && move.card.id === beat.reds.at(-1)?.id)
            sourceCovers.current.add(move.card.id);
        }
        if (beat.pointsLeft[move.card.id] > 0)
          sourcePoints.current.set(move.card.id, beat.pointsLeft[move.card.id]);
      }
    sources.current = captured;
    animate.current = motion && !reduced;
    if (!motion) setNumberKey((value) => value + 1);
    setFlights([]);
    setOpeningFlight(null);
    setStep(next);
    setScorecard(false);
  }
  advance.current = () => go(step + 1);
  useEffect(() => {
    if (!playing || finalStep || scorecard) return;
    const timer = window.setTimeout(
      () => advance.current(),
      beat.duration / speed,
    );
    return () => clearTimeout(timer);
  }, [playing, step, speed, replay, beat.duration, finalStep, scorecard]);

  useLayoutEffect(() => {
    const requested = animate.current;
    animate.current = false;
    if (!requested || reduced || !root.current) return;
    if (beat.kind === "break") {
      const pile = root.current.querySelector(
        beat.activePile === "reds"
          ? ".game-page .open-piles .red-three-pile"
          : `.game-page .open-piles [data-meld-id="${beat.activePile}"]`,
      );
      const stack = pile?.querySelector(".meld-card-layers");
      if (!stack) return;
      const landing = rect(stack);
      const cards: BookClosingFlight["cards"] = [];
      for (const transfer of beat.transfers) {
        const from = sources.current.get(transfer.card.id);
        const destination = findCard(root.current, transfer.card.id, beat);
        if (!from || !destination) continue;
        cards.push({
          card: transfer.card,
          pile: {
            id: beat.activePile ?? "",
            red: transfer.card.redThree,
            cards: [],
          },
          from,
          gather: { ...from, left: landing.left, top: landing.top },
          to: rect(destination),
          cover: sourceCovers.current.has(transfer.card.id),
          indexed: destination.classList.contains("indexed-card"),
        });
      }
      cards.sort((a, b) => a.to.top - b.to.top);
      if (cards.length) setOpeningFlight({ key: step, cards });
      return;
    }
    const meeting = root.current.querySelector("[data-score-meet]");
    const meet = meeting ? rect(meeting) : null;
    const heldTransfer = beat.transfers.find(
      (move) =>
        move.paired &&
        (heldCards.some((face) => face.id === move.card.id) ||
          previousHeld.current.has(move.card.id)),
    );
    const heldNode =
      heldTransfer &&
      root.current.querySelector(
        `[data-score-holding-id="${heldTransfer.card.id}"] .card`,
      );
    const heldMeet = heldNode
      ? rect(heldNode)
      : heldTransfer
        ? sources.current.get(heldTransfer.card.id)
        : undefined;
    const next: Flight[] = [];
    beat.transfers.forEach((transfer, index) => {
      // A parked remainder stays still; only the incoming matching card travels.
      if (
        transfer.paired &&
        previousHeld.current.has(transfer.card.id) &&
        heldCards.some((face) => face.id === transfer.card.id)
      )
        return;
      const from = sources.current.get(transfer.card.id);
      if (!from) return;
      const destination = ["hand", "table"].includes(transfer.target)
        ? findCard(root.current, transfer.card.id, beat)
        : root.current?.querySelector(
            transfer.target === "count"
              ? '[data-score-target="count"] strong'
              : `[data-score-target="${transfer.target}"] .score-settlement-stack`,
          );
      if (!destination) return;
      const target = rect(destination);
      const width =
        transfer.source === "foot" ? target.width : Math.max(32, from.width);
      const height = (width * 87) / 62;
      const start = {
        left: from.left + from.width / 2 - width / 2,
        top: from.top + from.height / 2 - height / 2,
        width,
        height,
      };
      const toX = target.left + target.width / 2 - width / 2 - start.left;
      const toY = target.top + target.height / 2 - height / 2 - start.top;
      next.push({
        transfer,
        from: start,
        midX:
          transfer.paired && heldMeet
            ? heldMeet.left +
              heldMeet.width / 2 +
              (transfer.card.id === heldTransfer?.card.id
                ? 0
                : heldMeet.width + 8) -
              width / 2 -
              start.left
            : transfer.paired && meet
              ? meet.left +
                meet.width / 2 +
                (transfer.source === "hand" ? -35 : 35) -
                width / 2 -
                start.left
              : toX * 0.6,
        midY:
          transfer.paired && heldMeet
            ? heldMeet.top + heldMeet.height / 2 - height / 2 - start.top
            : transfer.paired && meet
              ? meet.top + meet.height / 2 - height / 2 - start.top
              : toY * 0.6,
        toX,
        toY,
        scaleX: transfer.target === "count" ? 0.35 : target.width / width,
        scaleY: transfer.target === "count" ? 0.35 : target.height / height,
        delay: transfer.paired ? 0 : index * (beat.kind === "gather" ? 60 : 35),
        duration: transfer.paired ? 650 : 600,
        remainder: ["hand", "table"].includes(transfer.target)
          ? beat.pointsLeft[transfer.card.id]
          : sourcePoints.current.get(transfer.card.id),
      });
    });
    setFlights(next);
  }, [step, replay, reduced]);
  useEffect(() => {
    if (!flights.length) return;
    const clear = () => setFlights([]);
    const timer = window.setTimeout(
      clear,
      (Math.max(...flights.map((flight) => flight.duration + flight.delay)) +
        40) /
        speed,
    );
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
    };
  }, [flights, speed]);
  useEffect(() => {
    if (!openingFlight) return;
    const clear = () => setOpeningFlight(null);
    const hide = () => {
      if (document.hidden) clear();
    };
    const timer = window.setTimeout(clear, (BOOK_CLOSE_MS + 40) / speed);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    document.addEventListener("visibilitychange", hide);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
      document.removeEventListener("visibilitychange", hide);
    };
  }, [openingFlight, speed]);
  function reset() {
    setPlaying(false);
    go(0, false);
    setReplay((value) => value + 1);
  }
  function play() {
    if (playing) {
      setFlights([]);
      setOpeningFlight(null);
    }
    if (finalStep) {
      go(0, false);
      setReplay((value) => value + 1);
    }
    setPlaying((value) => finalStep || !value);
  }
  const remainderPoints = Object.fromEntries(
    Object.entries(beat.pointsLeft).filter(([, value]) => value > 0),
  );
  const debtStarted = beat.reconciled > 0 || beat.uncovered > 0;
  const piles = (
    <div className="score-settlement-piles">
      <div className="score-join-point" data-score-meet aria-hidden="true" />
      {heldCards.length > 0 && (
        <div
          className="score-holding-area"
          role="group"
          aria-label="Cards awaiting reconciliation"
        >
          {heldCards.map((face) => (
            <div
              className="score-holding-card"
              data-card-id={face.id}
              data-score-holding-id={face.id}
              key={face.id}
            >
              <Card card={face} small pointsLeft={beat.pointsLeft[face.id]} />
            </div>
          ))}
        </div>
      )}
      {(
        [
          ["reconciled", "Reconciled", beat.reconciled, beat.reconciledCards],
          ["debt", "Uncovered debt", beat.uncovered, beat.debtCards],
        ] as const
      ).map(([id, label, points, count]) => (
        <div
          className="score-settlement-pile"
          data-score-target={id}
          key={id}
          role="group"
          aria-label={`${label}: ${points} points`}
        >
          <div className={`score-settlement-stack ${count ? "has-cards" : ""}`}>
            {count ? <Card small /> : <span className="score-empty-pile" />}
          </div>
          <span>
            {label}
            <strong>
              <AnimatedNumber key={numberKey} value={points} />{" "}
              <small>pts</small>
            </strong>
          </span>
        </div>
      ))}
    </div>
  );
  const tally = (
    <div
      className="score-running-count"
      data-score-target="count"
      role="group"
      aria-label="Running round score"
    >
      <span>ROUND COUNT</span>
      <strong>
        <AnimatedNumber key={numberKey} value={beat.base + beat.cardValue} />
      </strong>
      <small>
        {["ready", "gather", "pair", "break", "uncovered", "return"].includes(
          beat.kind,
        )
          ? `${beat.remaining} pts left to reconcile`
          : `${beat.base.toLocaleString()} base ${beat.cardValue < 0 ? "−" : "+"} ${Math.abs(beat.cardValue).toLocaleString()} cards`}
      </small>
      {beat.delta !== undefined && ["bonus", "count"].includes(beat.kind) && (
        <span className="score-tally-add" key={`${replay}-${step}`}>
          {signed(beat.delta)}
        </span>
      )}
    </div>
  );

  return (
    <div
      className="score-rehearsal score-board-study"
      ref={root}
      data-kind={beat.kind}
      data-reduced={reduced}
    >
      <div className="score-review-bar">
        <div>
          <h1>End-of-round count</h1>
          <small>Single player · Desktop · Original board</small>
        </div>
        <label>
          Scenario{" "}
          <select
            aria-label="Scoring scenario"
            value={scenarioId}
            onChange={(event) => {
              setScenarioId(event.target.value);
              reset();
            }}
          >
            {SCORING_SCENARIOS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Speed{" "}
          <select
            aria-label="Scoring playback speed"
            value={speed}
            onChange={(event) => setSpeed(Number(event.target.value))}
          >
            <option value={0.5}>0.5×</option>
            <option value={1}>1×</option>
            <option value={2}>2×</option>
          </select>
        </label>
        <button className="button small secondary" onClick={reset}>
          Reset
        </button>
      </div>
      <div className="score-transport">
        <button className="button small" onClick={play}>
          {finalStep
            ? "Replay count"
            : playing
              ? "Pause"
              : step
                ? "Resume count"
                : "Play count"}
        </button>
        <button
          className="score-step-button"
          aria-label="Previous scoring step"
          disabled={!step}
          onClick={() => {
            setPlaying(false);
            go(step - 1, false);
          }}
        >
          ←
        </button>
        <input
          type="range"
          aria-label="Scoring step"
          min={0}
          max={beats.length - 1}
          value={step}
          onChange={(event) => {
            setPlaying(false);
            go(Number(event.target.value), false);
          }}
        />
        <button
          className="score-step-button"
          aria-label="Next scoring step"
          disabled={finalStep}
          onClick={() => {
            setPlaying(false);
            go(step + 1);
          }}
        >
          →
        </button>
        <span>
          {step + 1} / {beats.length}
        </span>
        <button
          className="text-button"
          onClick={() => {
            setPlaying(false);
            go(beats.length - 1, false);
          }}
        >
          Skip to total
        </button>
        {finalStep && (
          <button className="text-button" onClick={() => setScorecard(true)}>
            Round scorecard
          </button>
        )}
      </div>
      <div className="score-native-stage">
        <Room
          rehearsal={{
            snapshot,
            onChoose: () => {},
            meldAnimate: false,
            meldSpeed: speed,
            pileAnimate: !reduced,
            pileShiftDuration:
              beat.kind === "break" ? BOOK_DESCEND_MS : undefined,
            pileMotionKey: `${scenarioId}-${replay}-${numberKey}`,
            headerSummary: tally,
            footerSummary: piles,
            footerSummaryVisible: beat.kind !== "ready",
            handCaption:
              beat.gathered && scenario.foot.length
                ? "HAND + FOOT"
                : "YOUR HAND",
            emptyHandMessage:
              beat.kind === "ready" && !scenario.hand.length
                ? "You went out."
                : heldCards.some((face) =>
                      beat.hand.some((handCard) => handCard.id === face.id),
                    )
                  ? "Your remaining card is above the settlement piles."
                  : "All hand cards settled.",
            emptyTableMessage: finalStep
              ? "All card values counted."
              : "All table cards used.",
            cardPoints: remainderPoints,
            redThreeBonusLost: beat.redsBroken,
          }}
        />
      </div>
      <p className="score-review-note">
        {finalStep
          ? "Round counted. Open the scorecard for the full breakdown."
          : debtStarted
            ? "Partly used cards wait above the settlement piles. Unused points return before the final count."
            : "Foot into hand → reconcile debt → count books → count cards at 50, 20, 10, and 5."}
        {reduced ? " Reduced motion: card travel is turned off." : ""}
      </p>
      <Link className="text-link score-preview-back" to="/preview">
        ← All previews
      </Link>
      {(flights.length > 0 || openingFlight) && (
        <style>
          {[
            ...flights.map(({ transfer }) => transfer.card),
            ...(openingFlight?.cards.map(({ card }) => card) ?? []),
          ]
            .map(
              (card) =>
                `.score-native-stage .game-page [data-card-id="${card.id}"] .card { visibility:hidden !important; }`,
            )
            .join("\n")}
        </style>
      )}
      {openingFlight && (
        <ClosingBooks
          key={`${scenarioId}-${replay}-${step}`}
          flight={openingFlight}
          speed={speed}
          paused={false}
          direction="open"
        />
      )}
      {!openingFlight &&
        beat.activePile &&
        ["bonus", "break"].includes(beat.kind) && (
          <style>
            {beat.activePile === "reds"
              ? ".score-native-stage .red-three-stack {--score-pile-active:1;}"
              : `.score-native-stage [data-meld-id="${beat.activePile}"] > :is(.closed-card-stack, .meld-card-stack) {--score-pile-active:1;}`}
          </style>
        )}
      {flights.map((flight) => (
        <div
          className={`score-card-flight ${flight.transfer.paired ? "is-paired" : ""}`}
          data-score-flight-id={flight.transfer.card.id}
          aria-hidden="true"
          key={`${scenarioId}-${replay}-${step}-${flight.transfer.card.id}`}
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
              animationDuration: `${flight.duration / speed}ms`,
              animationDelay: `${flight.delay / speed}ms`,
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
      {scorecard && (
        <div className="modal-backdrop">
          <section
            className="score-sheet score-preview-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="End-of-round scorecard"
            tabIndex={-1}
          >
            <div className="sheet-topline">
              <p className="eyebrow">ROUND 4 · YOUR SCORE</p>
              <button
                className="text-button"
                onClick={() => setScorecard(false)}
              >
                Close scorecard
              </button>
            </div>
            <h2>{(final.base + final.cardValue).toLocaleString()} points</h2>
            <p>
              {final.base.toLocaleString()} base{" "}
              {final.cardValue < 0 ? "−" : "+"}{" "}
              {Math.abs(final.cardValue).toLocaleString()} card values
            </p>
            <dl>
              {final.lines.map((line, index) => (
                <div key={index}>
                  <dt>{line.label}</dt>
                  <dd>{signed(line.points)}</dd>
                </div>
              ))}
            </dl>
            {final.redsBroken && (
              <p>
                The red-three bonus was forfeited. Qualified reds counted at 5
                points each, with no penalty.
              </p>
            )}
            <button
              className="button"
              onClick={() => {
                setScorecard(false);
                go(0, false);
                setReplay((value) => value + 1);
                setPlaying(true);
              }}
            >
              Replay count
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
