import { useId, useState, type ReactNode } from "react";
import type { Snapshot } from "../types";
import { Book, Icon } from "./Icons";
import { ProfileIcon } from "./ProfileIcon";
import { AnimatedNumber } from "./ScoringReview";
import "../round-score-sheet.css";

const number = (value: number) => value.toLocaleString();

function WaitingText({ children }: { children: string }) {
  return (
    <>
      {children}
      <span className="waiting-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
      <span className="sr-only">...</span>
    </>
  );
}

export function RoundScoreSheet({
  snapshot,
  review,
  leavingScores = false,
  totalsLanded = true,
  busy = false,
  onClose,
  onContinue,
  onLeave,
  inline = false,
  visibilityToggle,
  id,
  profileIcon,
  resultNotice,
}: {
  snapshot: Snapshot;
  review: boolean;
  leavingScores?: boolean;
  totalsLanded?: boolean;
  busy?: boolean;
  onClose: () => void;
  onContinue: () => void;
  onLeave: () => void;
  inline?: boolean;
  visibilityToggle?: ReactNode;
  id?: string;
  profileIcon?: string;
  resultNotice?: ReactNode;
}) {
  const viewer = snapshot.players.find(
    (player) => player.id === snapshot.viewerId,
  );
  const finished = snapshot.phase === "finished";
  const waitingForHost = finished && snapshot.hostId !== snapshot.viewerId;
  const waiting = Boolean(viewer?.ready || leavingScores || busy);
  const [hostHint, setHostHint] = useState(false);
  const hostHintId = useId();
  const continueButton = (
    <button
      autoFocus={!inline && !waitingForHost}
      className="button full"
      aria-label={
        waitingForHost
          ? "Waiting for host..."
          : waiting
            ? `${finished ? "Starting game" : "Waiting for players"}...`
            : undefined
      }
      disabled={
        waitingForHost ||
        busy ||
        viewer?.ready ||
        leavingScores ||
        !totalsLanded
      }
      aria-describedby={waitingForHost && hostHint ? hostHintId : undefined}
      onClick={onContinue}
    >
      {waitingForHost ? (
        <WaitingText>Waiting for host</WaitingText>
      ) : waiting ? (
        <WaitingText>
          {finished ? "Starting game" : "Waiting for players"}
        </WaitingText>
      ) : finished ? (
        "Play Again"
      ) : (
        "Next Round"
      )}
    </button>
  );
  const sheet = (
    <section
      id={inline ? id : undefined}
      className={`score-sheet round-score-sheet ${leavingScores ? "score-sheet-leaving" : ""}`}
      role={inline ? "region" : undefined}
      aria-label={inline ? "Score sheet" : undefined}
    >
      {!review && (
        <div className="sheet-topline">
          <button
            autoFocus={!inline}
            className="icon-button"
            aria-label="Close score sheet"
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      <div className="modal-heading">
        <Book />
        <h2>
          {finished
            ? "FINAL SCORES"
            : review
              ? `Round ${snapshot.round} Scores`
              : "SCORES"}
        </h2>
      </div>
      <p className="muted">
        {finished ? (
          totalsLanded ? (
            snapshot.winners.length === 1 &&
            snapshot.winners[0] === viewer?.team ? (
              <span className="score-win-message">You win!</span>
            ) : (
              `${snapshot.winners.map((id) => snapshot.sides[id].name).join(" & ")} ${snapshot.winners.length > 1 ? "share the win" : "wins"}!`
            )
          ) : (
            "Adding the final round…"
          )
        ) : (
          snapshot.history.at(-1)?.reason ||
          "Your round totals will appear here."
        )}
      </p>
      <div className="score-details">
        {snapshot.sides.map((item) => {
          const result = snapshot.history
            .at(-1)
            ?.scores.find((score) => score.team === item.id);
          return (
            <div className="side-result" key={item.id}>
              <h3 className="score-player-name">
                <ProfileIcon
                  name={item.id === viewer?.team ? profileIcon : undefined}
                />
                <span>{item.name}</span>
              </h3>
              {result && (
                <dl>
                  <div>
                    <dt>Books &amp; straights</dt>
                    <dd>{number(result.books)}</dd>
                  </div>
                  <div>
                    <dt>Going out first</dt>
                    <dd>{number(result.goingOut)}</dd>
                  </div>
                  <div>
                    <dt>Leftover card debt</dt>
                    <dd>−{number(result.debt)}</dd>
                  </div>
                  <div>
                    <dt>Card points</dt>
                    <dd>{number(result.cards + result.redCredit)}</dd>
                  </div>
                  <div>
                    <dt>Red threes</dt>
                    <dd>{number(result.redThrees)}</dd>
                  </div>
                  <div className="round-total">
                    <dt>Round {snapshot.round}</dt>
                    <dd>{number(result.total)}</dd>
                  </div>
                </dl>
              )}
              <div className="match-total">
                <span>Game total</span>
                <strong>
                  <AnimatedNumber
                    value={item.score}
                    from={
                      review && result ? item.score - result.total : item.score
                    }
                  />
                </strong>
              </div>
            </div>
          );
        })}
      </div>
      {finished && snapshot.history.length > 0 && (
        <details className="round-breakdown">
          <summary>
            Round breakdown
            <span className="breakdown-chevron" aria-hidden="true" />
          </summary>
          <div className="round-breakdown-scroll">
            <table aria-label="Round breakdown">
              <thead>
                <tr>
                  <th scope="col">Round</th>
                  {snapshot.sides.map((side) => (
                    <th scope="col" key={side.id}>
                      <span className="score-player-name">
                        <ProfileIcon
                          name={
                            side.id === viewer?.team ? profileIcon : undefined
                          }
                        />
                        <span>{side.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {snapshot.history.map((round) => (
                  <tr key={round.round}>
                    <th scope="row">{round.round}</th>
                    {snapshot.sides.map((side) => (
                      <td key={side.id}>
                        {number(
                          round.scores.find((score) => score.team === side.id)
                            ?.total ?? 0,
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Game total</th>
                  {snapshot.sides.map((side) => (
                    <td key={side.id}>{number(side.score)}</td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        </details>
      )}
      {review && (
        <div className="score-actions">
          {waitingForHost ? (
            <span
              className="score-host-waiting"
              tabIndex={0}
              role="group"
              aria-label="Waiting for host"
              aria-describedby={hostHint ? hostHintId : undefined}
              onMouseEnter={() => setHostHint(true)}
              onMouseLeave={() => setHostHint(false)}
              onFocus={() => setHostHint(true)}
              onBlur={() => setHostHint(false)}
              onClick={() => setHostHint(true)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && hostHint) {
                  event.stopPropagation();
                  setHostHint(false);
                }
              }}
            >
              {continueButton}
              {hostHint && (
                <span
                  id={hostHintId}
                  role="tooltip"
                  className="score-host-tooltip"
                >
                  Only the host can start a new game.
                </span>
              )}
            </span>
          ) : (
            continueButton
          )}
          {finished && (
            <button
              className="button full secondary"
              disabled={busy || leavingScores}
              onClick={onLeave}
            >
              {snapshot.playMode === "practice" ? "Home" : "Leave Lobby"}
            </button>
          )}
        </div>
      )}
      {finished && resultNotice}
    </section>
  );
  return inline ? (
    <>
      {sheet}
      {visibilityToggle}
    </>
  ) : (
    <div
      id={id}
      className="round-score-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="Score sheet"
    >
      {sheet}
      {/* Keep the fixed control outside the animated, scrolling panel. */}
      {visibilityToggle}
    </div>
  );
}
