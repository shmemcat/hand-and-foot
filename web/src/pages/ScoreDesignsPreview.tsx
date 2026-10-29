import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Book } from "../components/Icons";
import { PageTitle } from "../components/PageTitle";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";
import type { Score, Snapshot } from "../types";
import "../round-score-sheet.css";
import "../score-designs-preview.css";

export const SCORE_DESIGNS = [
  {
    id: "round-first",
    title: "Round first",
    pitch:
      "Make the round score the first thing you see. Put the game total beneath it, with the calculation one click away.",
    tradeoff: "Best starting point for a calmer version of the current cards.",
    pick: true,
  },
  {
    id: "two-numbers",
    title: "Just the two numbers",
    pitch:
      "Give this round and the game total equal space. Everything else lives under Score details.",
    tradeoff: "Fastest to scan; less emphasis on why a score changed.",
  },
  {
    id: "earned-lost",
    title: "Earned / deducted",
    pitch:
      "Group the arithmetic into points earned and deductions, then show the round result. Open either group to see its ingredients.",
    tradeoff: "Keeps an explanation visible without six separate categories.",
  },
  {
    id: "equation",
    title: "One clear calculation",
    pitch:
      "Read the score as a single equation: earned points minus deductions equals this round.",
    tradeoff:
      "Makes negative rounds easier to understand; needs a little more attention to labels.",
  },
  {
    id: "balance",
    title: "Before → after",
    pitch:
      "Show the previous game total, what this round added or took away, and the new total.",
    tradeoff: "Best for understanding progress through the game.",
  },
  {
    id: "quiet-ledger",
    title: "A quieter ledger",
    pitch:
      "Keep the itemized explanation visible, but remove zero-value rows and use one subtle divider before the result.",
    tradeoff: "Smallest change; still more reading than the other options.",
  },
  {
    id: "takeaway",
    title: "Score + takeaway",
    pitch:
      "Pair the round result with one plain-language explanation of the biggest influence. Keep the exact figures in the details.",
    tradeoff:
      "Most approachable for new players; comparison relies on the totals.",
  },
  {
    id: "rows",
    title: "One row per player",
    pitch:
      "Replace the cards with a compact scoreboard: player, round, game total. Expand a row only when you want the math.",
    tradeoff:
      "Especially clear with six players; gives up the individual card layout.",
    pick: true,
  },
  {
    id: "focus",
    title: "One player at a time",
    pitch:
      "Keep everyone's round score visible in tabs. Select a player to see a spacious breakdown underneath.",
    tradeoff:
      "Plenty of room for detail; detailed comparison takes extra clicks.",
  },
  {
    id: "matrix",
    title: "One shared breakdown",
    pitch:
      "Write each category once, with an equal-width column for each player. Put round scores and game totals at the bottom.",
    tradeoff:
      "Best for comparing where points came from; still shows a fair amount of information.",
    pick: true,
  },
] as const;

type Line = { key: string; label: string; value: number };
type SideResult = {
  id: number;
  name: string;
  score: Score;
  game: number;
  previous: number;
  lines: Line[];
  earned: number;
  deductions: number;
};
const number = (value: number) => Math.abs(value).toLocaleString();
const signed = (value: number) =>
  `${value < 0 ? "−" : value > 0 ? "+" : ""}${number(value)}`;
const balance = (value: number) => `${value < 0 ? "−" : ""}${number(value)}`;

export function scoreDesignResults(snapshot: Snapshot): SideResult[] {
  return snapshot.sides.map((side) => {
    const score = snapshot.history
      .at(-1)!
      .scores.find((item) => item.team === side.id)!;
    const lines: Line[] = [
      { key: "cards", label: "Card points", value: score.cards },
      { key: "debt", label: "Leftover-card debt", value: -score.debt },
      { key: "books", label: "Books & straights", value: score.books },
      { key: "reds", label: "Red threes", value: score.redThrees },
      { key: "credit", label: "Red-three credit", value: score.redCredit },
      { key: "out", label: "Going out first", value: score.goingOut },
    ];
    return {
      id: side.id,
      name: side.name,
      score,
      game: side.score,
      previous: side.score - score.total,
      lines,
      earned: lines.reduce((sum, line) => sum + Math.max(0, line.value), 0),
      deductions: lines.reduce(
        (sum, line) => sum + Math.max(0, -line.value),
        0,
      ),
    };
  });
}

const samples = [
  ["round-deck", "Tough round · debt & red-three penalty"],
  ["round", "Positive round · two players"],
  ["round-partners", "Partnerships · two teams"],
  ["round-six", "Six individual players"],
] as const;

export function ScoreDesignsPreview() {
  const [sample, setSample] = useState("round-deck");
  const [idea, setIdea] = useState("all");
  const snapshot = endingSnapshot(
    ENDING_EXAMPLES.find((example) => example.id === sample)!,
  );
  const sides = scoreDesignResults(snapshot);
  return (
    <div className="page score-designs-preview">
      <PageTitle>SCORE PANEL IDEAS</PageTitle>
      <p className="page-intro">
        Ten ways to make the result easier to digest. Every option uses the same
        scores and the actual 760px desktop popup width.
      </p>
      <div className="score-design-controls">
        <label>
          Sample round
          <select
            value={sample}
            onChange={(event) => setSample(event.target.value)}
          >
            {samples.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Show
          <select
            value={idea}
            onChange={(event) => setIdea(event.target.value)}
          >
            <option value="all">All 10 ideas</option>
            {SCORE_DESIGNS.map((design, index) => (
              <option key={design.id} value={design.id}>
                {index + 1}. {design.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="score-design-shortlist">
        I'd start with{" "}
        <button onClick={() => setIdea("round-first")}>1 · Round first</button>,{" "}
        <button onClick={() => setIdea("rows")}>8 · One row per player</button>,
        or{" "}
        <button onClick={() => setIdea("matrix")}>
          10 · One shared breakdown
        </button>
        .
      </p>
      <div className="score-design-studies">
        {SCORE_DESIGNS.map(
          (design, index) =>
            (idea === "all" || idea === design.id) && (
              <article
                className="score-design-study"
                key={`${design.id}-${sample}`}
                aria-labelledby={`design-${design.id}`}
              >
                <header>
                  <div className="score-design-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div>
                    <h2 id={`design-${design.id}`}>
                      {design.title}
                      {"pick" in design && (
                        <span className="score-design-pick">
                          Worth trying first
                        </span>
                      )}
                    </h2>
                    <p>{design.pitch}</p>
                    <small>{design.tradeoff}</small>
                  </div>
                </header>
                <DesignPopup snapshot={snapshot}>
                  <DesignBody design={design.id} sides={sides} />
                </DesignPopup>
              </article>
            ),
        )}
      </div>
      <Link className="text-link score-design-back" to="/preview/endings">
        ← Current round & game screens
      </Link>
    </div>
  );
}

function DesignPopup({
  snapshot,
  children,
}: {
  snapshot: Snapshot;
  children: ReactNode;
}) {
  const [ready, setReady] = useState(false);
  return (
    <section
      className="score-sheet round-score-sheet score-design-popup"
      aria-label="Design preview"
    >
      <div className="modal-heading">
        <Book />
        <h2>Round {snapshot.round} Scores</h2>
      </div>
      <p className="muted">{snapshot.history.at(-1)!.reason}</p>
      <div className="score-design-body">{children}</div>
      <div className="score-actions">
        <button
          className="button full"
          disabled={ready}
          onClick={() => setReady(true)}
        >
          {ready ? "Waiting for players..." : "Next Round"}
        </button>
      </div>
    </section>
  );
}

function Breakdown({
  side,
  label = "Score details",
}: {
  side: SideResult;
  label?: string;
}) {
  return (
    <details className="design-details">
      <summary>{label}</summary>
      <Lines lines={side.lines.filter((line) => line.value !== 0)} />
    </details>
  );
}
function Lines({ lines }: { lines: Line[] }) {
  return (
    <dl className="design-lines">
      {lines.map((line) => (
        <div key={line.key}>
          <dt>{line.label}</dt>
          <dd>{signed(line.value)}</dd>
        </div>
      ))}
    </dl>
  );
}
function GameTotal({ side }: { side: SideResult }) {
  return (
    <div className="design-game-total">
      <span>Game total</span>
      <strong>{balance(side.game)}</strong>
    </div>
  );
}
function Metric({
  label,
  value,
  major = false,
}: {
  label: string;
  value: string;
  major?: boolean;
}) {
  return (
    <div className={`design-metric ${major ? "design-metric-major" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DesignBody({
  design,
  sides,
}: {
  design: string;
  sides: SideResult[];
}) {
  if (design === "rows") return <ScoreRows sides={sides} />;
  if (design === "focus") return <PlayerFocus sides={sides} />;
  if (design === "matrix") return <ScoreMatrix sides={sides} />;
  return (
    <div className={`design-player-grid design-${design}`}>
      {sides.map((side) => (
        <section
          className="design-player"
          key={side.id}
          aria-label={`${side.name} score`}
        >
          <h3>{side.name}</h3>
          {design === "round-first" && (
            <>
              <Metric
                label="This round"
                value={signed(side.score.total)}
                major
              />
              <GameTotal side={side} />
              <Breakdown side={side} label="How this adds up" />
            </>
          )}
          {design === "two-numbers" && (
            <>
              <div className="design-two-metrics">
                <Metric label="This round" value={signed(side.score.total)} />
                <Metric label="Game total" value={balance(side.game)} />
              </div>
              <Breakdown side={side} />
            </>
          )}
          {design === "earned-lost" && (
            <>
              <details className="design-group">
                <summary>
                  <span>Points earned</span>
                  <strong>+{number(side.earned)}</strong>
                </summary>
                <Lines lines={side.lines.filter((line) => line.value > 0)} />
              </details>
              <details className="design-group">
                <summary>
                  <span>Deductions</span>
                  <strong>−{number(side.deductions)}</strong>
                </summary>
                <Lines lines={side.lines.filter((line) => line.value < 0)} />
              </details>
              <Metric label="This round" value={signed(side.score.total)} />
              <GameTotal side={side} />
            </>
          )}
          {design === "equation" && (
            <>
              <div className="design-equation">
                <Metric label="Earned" value={number(side.earned)} />
                <span aria-hidden="true">−</span>
                <Metric label="Deductions" value={number(side.deductions)} />
              </div>
              <div className="design-equation-result">
                <span>Equals this round</span>
                <strong>{signed(side.score.total)}</strong>
              </div>
              <GameTotal side={side} />
              <Breakdown side={side} />
            </>
          )}
          {design === "balance" && (
            <>
              <div className="design-balance">
                <div>
                  <span>Before this round</span>
                  <strong>{balance(side.previous)}</strong>
                </div>
                <div>
                  <span>This round</span>
                  <strong>{signed(side.score.total)}</strong>
                </div>
              </div>
              <Metric label="New game total" value={balance(side.game)} major />
              <Breakdown side={side} />
            </>
          )}
          {design === "quiet-ledger" && (
            <>
              <Lines lines={side.lines.filter((line) => line.value !== 0)} />
              <div className="design-ledger-result">
                <span>This round</span>
                <strong>{signed(side.score.total)}</strong>
              </div>
              <GameTotal side={side} />
            </>
          )}
          {design === "takeaway" && (
            <>
              <Metric
                label="This round"
                value={signed(side.score.total)}
                major
              />
              <p className="design-takeaway">{takeaway(side)}</p>
              <GameTotal side={side} />
              <Breakdown side={side} />
            </>
          )}
        </section>
      ))}
    </div>
  );
}

function takeaway(side: SideResult) {
  if (side.score.total < 0)
    return "Deductions outweighed the points you earned.";
  const largest = [...side.lines].sort((a, b) => b.value - a.value)[0];
  if (largest.key === "books")
    return `Books & straights added ${number(largest.value)} points.`;
  if (largest.key === "reds")
    return `Red threes added ${number(largest.value)} points.`;
  return `Played cards added ${number(side.score.cards)} points.`;
}

function ScoreRows({ sides }: { sides: SideResult[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="design-score-rows">
      <div className="design-score-row design-score-row-head">
        <span>Player</span>
        <span>This round</span>
        <span>Game total</span>
        <span className="sr-only">Details</span>
      </div>
      {sides.map((side) => (
        <div key={side.id} className="design-score-row-group">
          <div className="design-score-row">
            <strong>{side.name}</strong>
            <strong>{signed(side.score.total)}</strong>
            <span>{balance(side.game)}</span>
            <button
              className="text-button"
              aria-expanded={expanded === side.id}
              aria-controls={`row-details-${side.id}`}
              onClick={() => setExpanded(expanded === side.id ? null : side.id)}
            >
              {expanded === side.id ? "Close" : "Details"}
            </button>
          </div>
          {expanded === side.id && (
            <div className="design-row-details" id={`row-details-${side.id}`}>
              <Lines lines={side.lines.filter((line) => line.value !== 0)} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function PlayerFocus({ sides }: { sides: SideResult[] }) {
  const [selected, setSelected] = useState(sides[0].id);
  const side = sides.find((item) => item.id === selected)!;
  return (
    <div className="design-player-focus">
      <nav aria-label="Choose a player">
        {sides.map((item) => (
          <button
            key={item.id}
            aria-pressed={item.id === selected}
            onClick={() => setSelected(item.id)}
          >
            <span>{item.name}</span>
            <strong>{signed(item.score.total)}</strong>
          </button>
        ))}
      </nav>
      <section aria-label={`${side.name} score`}>
        <div className="design-focus-heading">
          <h3>{side.name}</h3>
          <div>
            <Metric label="This round" value={signed(side.score.total)} />
            <Metric label="Game total" value={balance(side.game)} />
          </div>
        </div>
        <Lines lines={side.lines.filter((line) => line.value !== 0)} />
      </section>
    </div>
  );
}

function ScoreMatrix({ sides }: { sides: SideResult[] }) {
  const rows = sides[0].lines.filter((_, index) =>
    sides.some((side) => side.lines[index].value !== 0),
  );
  return (
    <div className="design-matrix">
      <table aria-label="Score comparison">
        <colgroup>
          <col className="design-matrix-label" />
          {sides.map((side) => (
            <col key={side.id} />
          ))}
        </colgroup>
        <thead>
          <tr>
            <th scope="col">Category</th>
            {sides.map((side) => (
              <th key={side.id} scope="col">
                {side.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((line) => (
            <tr key={line.key}>
              <th scope="row">{line.label}</th>
              {sides.map((side) => (
                <td key={side.id}>
                  {signed(
                    side.lines.find((item) => item.key === line.key)!.value,
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">This round</th>
            {sides.map((side) => (
              <td key={side.id}>{signed(side.score.total)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Game total</th>
            {sides.map((side) => (
              <td key={side.id}>{balance(side.game)}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
