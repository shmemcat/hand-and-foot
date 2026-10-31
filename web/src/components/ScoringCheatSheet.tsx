import { useId } from "react";
import type { Card as Face } from "../types";
import { useGameMenuPopover } from "../hooks/useGameMenuPopover";
import { Card } from "./Card";
import "../scoring-cheat-sheet.css";

const cardValues: { label: string; card: Face }[] = [
  {
    label: "4–8",
    card: {
      id: "scoring-four",
      rank: "4",
      suit: "spades",
      value: 5,
      wild: false,
      redThree: false,
    },
  },
  {
    label: "9–K",
    card: {
      id: "scoring-king",
      rank: "K",
      suit: "clubs",
      value: 10,
      wild: false,
      redThree: false,
    },
  },
  {
    label: "Aces & twos",
    card: {
      id: "scoring-ace",
      rank: "A",
      suit: "hearts",
      value: 20,
      wild: false,
      redThree: false,
    },
  },
  {
    label: "Jokers",
    card: {
      id: "scoring-joker",
      rank: "Joker",
      suit: "joker",
      value: 50,
      wild: true,
      redThree: false,
    },
  },
];

export function ScoringCheatSheet() {
  const { menu, panel, close, open } = useGameMenuPopover();
  const id = useId();
  return (
    <details className="game-menu scoring-cheat-sheet" ref={menu}>
      <summary
        role="button"
        aria-label="Scoring cheat sheet"
        title="Scoring cheat sheet"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={`${id}-panel`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 3v18l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V3l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1Z" />
          <path d="M8 8h8M8 12h8M8 16h4" />
        </svg>
      </summary>
      <div
        className="game-menu-panel scoring-cheat-sheet-panel"
        ref={panel}
        id={`${id}-panel`}
        role="dialog"
        aria-hidden={!open}
        aria-labelledby={`${id}-title`}
      >
        <div className="scoring-cheat-sheet-heading">
          <h2 id={`${id}-title`}>Scoring cheat sheet</h2>
          <button
            type="button"
            className="scoring-cheat-sheet-close"
            aria-label="Close scoring cheat sheet"
            onClick={() => close(true)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="m6 6 12 12M6 18 18 6" />
            </svg>
          </button>
        </div>
        <section
          className="scoring-cheat-sheet-gallery"
          aria-label="Card values"
        >
          {cardValues.map(({ label, card }) => (
            <div key={card.id}>
              <Card card={card} small />
              <span>{label}</span>
              <span className="scoring-cheat-sheet-points">{card.value}</span>
            </div>
          ))}
        </section>
        <hr />
        <section aria-labelledby={`${id}-bonuses`}>
          <h3 id={`${id}-bonuses`}>Bonuses</h3>
          <dl className="scoring-cheat-sheet-values">
            <div>
              <dt>Clean book</dt>
              <dd>+500</dd>
            </div>
            <div>
              <dt>Dirty book</dt>
              <dd>+300</dd>
            </div>
            <div>
              <dt>Straight flush</dt>
              <dd>+1,300</dd>
            </div>
          </dl>
          <p className="scoring-cheat-sheet-flush-note">
            7 cards; +50 per extra flush card.
          </p>
          <dl className="scoring-cheat-sheet-values">
            <div>
              <dt>Going out</dt>
              <dd>+100</dd>
            </div>
          </dl>
        </section>
        <hr />
        <section aria-labelledby={`${id}-threes`}>
          <h3 id={`${id}-threes`}>Threes</h3>
          <dl className="scoring-cheat-sheet-values">
            <div>
              <dt>3+ played red threes</dt>
              <dd>+300 each</dd>
            </div>
            <div>
              <dt>Only 1–2 played reds</dt>
              <dd>−300 each</dd>
            </div>
            <div>
              <dt>Red 3 left in hand / foot</dt>
              <dd>−300 each</dd>
            </div>
            <div>
              <dt>Black 3 left in hand / foot</dt>
              <dd>−100 each</dd>
            </div>
          </dl>
        </section>
      </div>
    </details>
  );
}
