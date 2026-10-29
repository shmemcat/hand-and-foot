import { Card } from "./Card";
import { AnimatedNumber } from "./ScoringReview";
import { scoringHeldCards, type ScoreBeat } from "../lib/scoringSequence";
import "../scoring-preview.css";

export function SettlementPiles({ beat }: { beat?: ScoreBeat }) {
  return (
    <div className="score-settlement-piles">
      <div className="score-join-point" data-score-meet aria-hidden="true" />
      {beat && (
        <div
          className="score-holding-area"
          role="group"
          aria-label="Cards awaiting reconciliation"
        >
          {scoringHeldCards(beat).map((card) => (
            <div
              className="score-holding-card"
              data-card-id={card.id}
              data-score-holding-id={card.id}
              key={card.id}
            >
              <Card card={card} small pointsLeft={beat.pointsLeft[card.id]} />
            </div>
          ))}
        </div>
      )}
      {(
        [
          [
            "reconciled",
            "Reconciled",
            beat?.reconciled ?? 0,
            beat?.reconciledCards ?? 0,
          ],
          [
            "debt",
            "Uncovered debt",
            beat?.uncovered ?? 0,
            beat?.debtCards ?? 0,
          ],
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
              <AnimatedNumber value={points} /> <small>pts</small>
            </strong>
          </span>
        </div>
      ))}
    </div>
  );
}

export function ScoreCount({
  beat,
  beatKey,
}: {
  beat: ScoreBeat;
  beatKey: string;
}) {
  return (
    <div
      className="score-running-count"
      data-score-target="count"
      role="group"
      aria-label="Running round score"
    >
      <span>ROUND COUNT</span>
      <strong>
        <AnimatedNumber value={beat.base + beat.cardValue} />
      </strong>
      <small>
        {[
          "ready",
          "gather",
          "pair",
          "break",
          "uncovered",
          "return",
          "wait",
        ].includes(beat.kind)
          ? `${beat.remaining} pts left to reconcile`
          : `${beat.base.toLocaleString()} base ${beat.cardValue < 0 ? "−" : "+"} ${Math.abs(beat.cardValue).toLocaleString()} cards`}
      </small>
      {beat.delta !== undefined && ["bonus", "count"].includes(beat.kind) && (
        <span className="score-tally-add" key={beatKey}>
          {beat.delta < 0 ? "−" : "+"}
          {Math.abs(beat.delta).toLocaleString()}
        </span>
      )}
    </div>
  );
}
