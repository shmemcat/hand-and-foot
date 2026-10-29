import { useEffect, useState } from "react";
import { MeldPile } from "../components/MeldPile";
import { SCORING_SCENARIOS } from "../lib/scoringSequence";
import "../scoring-glow-preview.css";

const books = SCORING_SCENARIOS.find(
  (scenario) => scenario.id === "no-debt",
)!.melds.filter((meld) => meld.complete);
const treatments = [
  {
    id: "halo",
    name: "Soft halo",
    description:
      "A close, feathered glow around the book. Gentle but easy to follow.",
    note: "My pick",
  },
  {
    id: "wash",
    name: "Blush wash",
    description: "A soft pink backdrop behind the label, book, and card count.",
  },
  {
    id: "underlight",
    name: "Underlight",
    description: "A pool of pink beneath the book, like a light on the table.",
  },
  {
    id: "petals",
    name: "Petal bloom",
    description: "Two rosy blooms peek out from the sides of the book.",
  },
  {
    id: "spotlight",
    name: "Rose spotlight",
    description:
      "A wider, brighter glow that makes the counted book stand out.",
  },
];

export function ScoringGlowPreview() {
  const [active, setActive] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % books.length),
      1400,
    );
    return () => clearInterval(timer);
  }, [playing]);
  return (
    <div className="glow-study" data-reduced={reduced}>
      <header className="glow-study-heading">
        <div>
          <p className="glow-study-kicker">SCORING ANIMATION · FIVE OPTIONS</p>
          <h1>A little pink behind the books.</h1>
          <p>
            Same cards. Same table. Five ways to show which book is counting.
          </p>
        </div>
        <div className="glow-study-controls">
          <button
            className="button small"
            onClick={() => setPlaying((current) => !current)}
          >
            {playing ? "Pause sample" : "Play sample"}
          </button>
          <button
            className="button small secondary"
            onClick={() => {
              setPlaying(false);
              setActive((current) => (current + 1) % books.length);
            }}
          >
            Next book
          </button>
        </div>
      </header>
      <div className="glow-study-status" aria-live="polite">
        <span>NOW COUNTING</span>
        <strong>
          {books[active].rank}’s {books[active].dirty ? "dirty" : "clean"} book
          <span>+{books[active].bonus}</span>
        </strong>
        <small>160ms fade in &amp; out</small>
      </div>
      <div className="glow-study-options">
        {treatments.map((treatment, index) => (
          <section
            className={`glow-study-option glow-treatment-${treatment.id}`}
            key={treatment.id}
            aria-label={`${index + 1}. ${treatment.name}`}
          >
            <div className="glow-option-caption">
              <span className="glow-option-number">0{index + 1}</span>
              <div>
                <h2>
                  {treatment.name}
                  {treatment.note && <small>{treatment.note}</small>}
                </h2>
                <p>{treatment.description}</p>
              </div>
            </div>
            <div className="glow-option-board" aria-label="Completed books">
              {books.map((meld, bookIndex) => (
                <div
                  className="glow-sample-book"
                  data-counting={bookIndex === active}
                  key={meld.id}
                >
                  <MeldPile
                    meld={meld}
                    canTarget={false}
                    onTarget={() => {}}
                    staged={0}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
      <p className="glow-study-footnote">
        Use the theme button above to compare on a dark table, too.
      </p>
    </div>
  );
}
