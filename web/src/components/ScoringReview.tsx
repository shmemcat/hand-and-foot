import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "../types";
import { Book, Icon } from "./Icons";
import { Card } from "./Card";

export function AnimatedNumber({
  value,
  from = value,
}: {
  value: number;
  from?: number;
}) {
  const [shown, setShown] = useState(from);
  const current = useRef(from);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      current.current = value;
      setShown(value);
      return;
    }
    const start = performance.now();
    const from = current.current;
    let frame = 0;
    function count(time: number) {
      const progress = Math.min(1, (time - start) / 460);
      const next = Math.round(
        from + (value - from) * (1 - (1 - progress) ** 3),
      );
      current.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(count);
    }
    frame = requestAnimationFrame(count);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <>
      <span aria-hidden="true">{shown.toLocaleString()}</span>
      <span className="sr-only">{value.toLocaleString()}</span>
    </>
  );
}

export function ScoringReview({
  snapshot,
  error,
}: {
  snapshot: Snapshot;
  error: string;
}) {
  const review = snapshot.scoring!;
  const side = snapshot.sides[review.team];
  const score = review.score;
  const redCount = snapshot.players
    .filter((player) => player.team === review.team)
    .reduce((sum, player) => sum + player.redThrees.length, 0);
  const redsQualified = review.redThreeQualified ?? redCount >= 3;
  const redsBroken = review.usedPiles.includes(`reds:${review.team}`);
  const lookup = new Map(
    side.melds.flatMap((meld) => meld.cards).map((card) => [card.id, card]),
  );
  for (const player of snapshot.players.filter(
    (player) => player.team === review.team,
  ))
    for (const card of player.redThrees) lookup.set(card.id, card);
  const [log, setLog] = useState<string[]>([]);
  const lastCount = useRef(review.canceled.length);
  useEffect(() => {
    const added = review.canceled.length - lastCount.current;
    if (added > 0)
      setLog((old) => [
        ...old,
        `${added} table card${added === 1 ? "" : "s"} applied. ${review.remaining.toLocaleString()} points left to cover; ${review.broken.length} book bonus${review.broken.length === 1 ? "" : "es"} lost.`,
      ]);
    lastCount.current = review.canceled.length;
  }, [review.revision]);
  const canConfirm = review.remaining === 0 || review.options.length === 0;
  return (
    <div className="modal-backdrop">
      <section
        className="scoring-review"
        role="dialog"
        aria-modal="true"
        aria-label="Settle your side’s score"
      >
        <p className="eyebrow">ROUND {snapshot.round}</p>
        <div className="modal-heading">
          <Book />
          <h2>REVIEW SCORE</h2>
        </div>
        <p className="muted scoring-reason">{review.reason}</p>
        <h3>{side.name}</h3>
        <ol className="scoring-steps">
          <li className="active">
            <span>1</span>Cover leftover cards
          </li>
          <li className={canConfirm ? "active" : ""}>
            <span>2</span>Count surviving books
          </li>
          <li className={review.confirmed ? "active" : ""}>
            <span>3</span>Round complete
          </li>
        </ol>
        <div className="debt-meter" aria-live="polite">
          <div>
            <span>Hand & foot debt</span>
            <strong>{review.debt.toLocaleString()}</strong>
          </div>
          <Icon name="arrow" />
          <div>
            <span>Still to cover</span>
            <strong className={review.remaining === 0 ? "debt-cleared" : ""}>
              <AnimatedNumber value={review.remaining} />
            </strong>
          </div>
          <div className="debt-progress">
            <span
              style={{
                width: `${review.debt ? ((review.debt - review.remaining) / review.debt) * 100 : 100}%`,
              }}
            />
          </div>
        </div>
        <details className="debt-explanation">
          <summary>Where does the debt come from?</summary>
          {review.debtBreakdown?.map((player) => (
            <div key={player.name}>
              <strong>{player.name}</strong>
              <span>
                Hand: {player.handCount} cards · {player.handPoints} pts
              </span>
              <span>
                Foot: {player.footCount} cards · {player.footPoints} pts
              </span>
            </div>
          ))}
          <p>
            Unplayed black threes cost 100 each; red threes cost 300 each. Both
            hand and foot count. Private card faces stay hidden.
          </p>
        </details>
        {!review.confirmed && review.options.length > 0 ? (
          <p className="score-instruction" role="status">
            Covering leftover cards automatically while preserving the most
            points.
          </p>
        ) : (
          <div className="debt-resolved">
            <Icon name="check" />
            <p>
              {review.remaining === 0
                ? "Your debt is covered."
                : `${review.remaining.toLocaleString()} points cannot be covered and stay as a deduction.`}
            </p>
            <span>
              {review.confirmed
                ? "Your side’s score is confirmed. Waiting for the other sides."
                : "Now count the books and red threes that remain."}
            </span>
          </div>
        )}
        {log.length > 0 && (
          <div className="scoring-log" role="log" aria-label="Scoring payments">
            {log.map((line, index) => (
              <p key={index}>{line}</p>
            ))}
          </div>
        )}
        {review.canceled.length > 0 && (
          <details className="canceled-details">
            <summary>
              {review.canceled.length} table cards used · {review.broken.length}{" "}
              book {review.broken.length === 1 ? "bonus" : "bonuses"} lost
            </summary>
            <div>
              {review.canceled.map((id) => (
                <span className="canceled-card" key={id}>
                  <Card small card={lookup.get(id)} />
                </span>
              ))}
            </div>
          </details>
        )}
        <div className="score-calculation">
          <div>
            <span>Played card values</span>
            <strong>{score.cards.toLocaleString()}</strong>
          </div>
          <div>
            <span>Hand & foot debt</span>
            <strong>−{score.debt.toLocaleString()}</strong>
          </div>
          {score.redCredit > 0 && (
            <div>
              <span>Red threes used at 5 points each</span>
              <strong>+{score.redCredit}</strong>
            </div>
          )}
          <div>
            <span>Surviving book & flush bonuses</span>
            <strong>
              +<AnimatedNumber value={score.books} />
            </strong>
          </div>
          <div>
            <span>
              {redsQualified && redsBroken
                ? "Red-three bonus forfeited"
                : "Red-three bonus / penalty"}
            </span>
            <strong>
              <AnimatedNumber value={score.redThrees} />
            </strong>
          </div>
          <div>
            <span>Going out first</span>
            <strong>+{score.goingOut}</strong>
          </div>
          <div className="calculation-total">
            <span>{canConfirm ? "Round score" : "Score so far"}</span>
            <strong>
              <AnimatedNumber value={score.total} />
            </strong>
          </div>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="fine-print">
          {review.confirmedSides.length} of {snapshot.sides.length} sides
          confirmed · Match target {snapshot.targetScore.toLocaleString()}
        </p>
      </section>
    </div>
  );
}
