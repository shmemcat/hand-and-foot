import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RoundScoreSheet } from "../components/RoundScoreSheet";
import { PageTitle } from "../components/PageTitle";
import { ResultsToggle } from "../components/ResultsToggle";
import { useModalFocus } from "../hooks/useModalFocus";
import {
  ENDING_EXAMPLES,
  endingSnapshot,
  type EndingExample,
} from "../lib/endingExamples";
import "../endings-preview.css";

export function EndingsPreview() {
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState("all");
  const [replay, setReplay] = useState(0);
  const [hidden, setHidden] = useState(false);
  const selected = ENDING_EXAMPLES.find(
    (example) => example.id === params.get("screen"),
  );
  const close = () => setParams({});
  useModalFocus(
    Boolean(selected) && !hidden,
    `${selected?.id ?? ""}:${hidden}`,
    close,
  );
  const visibilityToggle = (
    <ResultsToggle
      hidden={hidden}
      controls={selected ? "ending-selected" : "ending-previews"}
      onToggle={() => setHidden((value) => !value)}
    />
  );
  useEffect(() => {
    if (!selected) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [selected]);
  const examples = ENDING_EXAMPLES.filter(
    (example) => filter === "all" || example.phase === filter,
  );
  return (
    <div className="page endings-preview">
      <PageTitle>ROUND & GAME ENDINGS</PageTitle>
      <p className="page-intro">
        Each popup uses the same desktop width as the game, inside the wider app
        container. Buttons here only change the sample.
      </p>
      <div className="endings-controls">
        <Link className="text-link" to="/preview/endings/designs">
          10 score-panel redesign ideas →
        </Link>
        <nav aria-label="Ending screens">
          {[
            ["all", "All 14 screens"],
            ["round_over", "End of round"],
            ["finished", "End of game"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`button small ${filter === value ? "" : "secondary"}`}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button
          className="text-button"
          onClick={() => setReplay((value) => value + 1)}
        >
          Reset samples
        </button>
      </div>
      <div className="endings-grid" id="ending-previews">
        {examples.map((example) => (
          <article
            className="ending-example"
            key={`${example.id}-${replay}`}
            aria-labelledby={`ending-${example.id}`}
          >
            <header>
              <div>
                <p className="eyebrow">
                  {example.phase === "finished"
                    ? "END OF GAME"
                    : "END OF ROUND"}
                </p>
                <h2 id={`ending-${example.id}`}>{example.label}</h2>
                <p>{example.description}</p>
              </div>
              <button
                className="text-button"
                onClick={() => {
                  setHidden(false);
                  setParams({ screen: example.id });
                }}
                aria-label={`Open ${example.label} at full size`}
              >
                Open full size ↗
              </button>
            </header>
            <EndingSample
              example={example}
              inline
              hidden={!selected && hidden}
            />
          </article>
        ))}
      </div>
      <p className="endings-other">
        <Link className="text-link" to="/preview/scoring">
          Review the scoring sequence →
        </Link>
        <Link className="text-link" to="/preview">
          All previews
        </Link>
      </p>
      {selected && (
        <div
          className={`modal-backdrop endings-fullscreen ${hidden ? "endings-overlay-hidden" : ""}`}
        >
          <div
            className="ending-fullscreen-content"
            id="ending-selected"
            role="dialog"
            aria-modal={!hidden}
            aria-label="Score sheet"
          >
            <button
              autoFocus
              className="button small secondary ending-close"
              onClick={close}
            >
              ← All ending screens
            </button>
            <EndingSample
              key={`${selected.id}-${replay}`}
              example={selected}
              inline
              animate
              hidden={hidden}
            />
            {visibilityToggle}
          </div>
        </div>
      )}
      {!selected && visibilityToggle}
    </div>
  );
}

function EndingSample({
  example,
  inline = false,
  animate = false,
  hidden = false,
}: {
  example: EndingExample;
  inline?: boolean;
  animate?: boolean;
  hidden?: boolean;
}) {
  const initial = useMemo(() => endingSnapshot(example), [example]);
  const [snapshot, setSnapshot] = useState(initial);
  const [landed, setLanded] = useState(!animate);
  const [left, setLeft] = useState(false);
  useEffect(() => {
    if (!animate) return;
    const timer = window.setTimeout(
      () => setLanded(true),
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 560,
    );
    return () => clearTimeout(timer);
  }, [animate]);
  return (
    <div className={animate ? "ending-dialog-sample" : "ending-sample-stage"}>
      {left ? (
        <div className="ending-sample-placeholder">
          <p>You left the lobby.</p>
          <button
            className="text-button"
            onClick={() => {
              setLeft(false);
              setSnapshot(initial);
            }}
          >
            Restore sample
          </button>
        </div>
      ) : hidden ? (
        <div className="ending-sample-placeholder">
          Results hidden. Use the eye to show them again.
        </div>
      ) : (
        <RoundScoreSheet
          snapshot={snapshot}
          review
          inline={inline}
          totalsLanded={landed}
          onClose={() => {}}
          onLeave={() => setLeft(true)}
          onContinue={() =>
            setSnapshot((current) => ({
              ...current,
              players: current.players.map((player) =>
                player.id === current.viewerId
                  ? { ...player, ready: true }
                  : player,
              ),
            }))
          }
        />
      )}
    </div>
  );
}
