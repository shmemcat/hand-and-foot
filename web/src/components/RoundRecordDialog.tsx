import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Snapshot } from "../types";
import { completedRoundRecords, recordGameTotal } from "../lib/roundRecords";
import { ProfileIcon } from "./ProfileIcon";
import "../round-record.css";

const points = (value: number) =>
  value === 0
    ? "0"
    : value < 0
      ? `−${Math.abs(value).toLocaleString()}`
      : value.toLocaleString();
const signed = (value: number) =>
  value > 0 ? `+${points(value)}` : points(value);

// Like Golf's hole record, mount on opening and start at the latest completed round.
export function RoundRecordDialog({
  snapshot,
  onClose,
  profileIcon,
}: {
  snapshot: Snapshot;
  onClose: () => void;
  profileIcon?: string;
}) {
  const records = completedRoundRecords(snapshot);
  const [selected, setSelected] = useState(Math.max(0, records.length - 1));
  const index = Math.min(selected, Math.max(0, records.length - 1));
  const record = records[index];
  const dialog = useRef<HTMLDialogElement>(null);
  const backdropPress = useRef(false);
  const titleId = useId();
  const viewerTeam = snapshot.players.find(
    (player) => player.id === snapshot.viewerId,
  )?.team;
  const move = (direction: number) =>
    setSelected(Math.max(0, Math.min(records.length - 1, index + direction)));
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element.showModal();
    element.focus({ preventScroll: true });
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <dialog
      ref={dialog}
      className="round-record"
      aria-labelledby={titleId}
      tabIndex={-1}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onPointerDown={(event) => {
        backdropPress.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (backdropPress.current && event.target === event.currentTarget)
          onClose();
      }}
      onKeyDown={(event) => {
        if (
          !record ||
          !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
        )
          return;
        event.preventDefault();
        if (event.key === "Home") setSelected(0);
        else if (event.key === "End") setSelected(records.length - 1);
        else move(event.key === "ArrowRight" ? 1 : -1);
      }}
    >
      <div className="round-record-content">
        <header className="round-record-header">
          <p className="round-record-eyebrow">Round record</p>
          <h2 id={titleId} aria-live="polite" aria-atomic="true">
            {record ? `Round ${record.round}` : "Your round starts here"}
          </h2>
          <p className="round-record-reason">
            {record?.reason ?? "Completed rounds will appear here."}
          </p>
        </header>
        {record && (
          <>
            <div
              className="round-record-carousel"
              role="region"
              aria-roledescription="carousel"
              aria-label="Completed rounds"
            >
              <div className="round-record-viewport">
                <div
                  className="round-record-scores"
                  key={record.round}
                  data-sides={record.scores.length}
                  role="group"
                  aria-roledescription="slide"
                  aria-label={`Round ${record.round} scores`}
                >
                  {record.scores.map((score) => {
                    const side = snapshot.sides.find(
                      (side) => side.id === score.team,
                    );
                    const name = side?.name ?? `Side ${score.team + 1}`;
                    return (
                      <section
                        className="round-record-player"
                        key={score.team}
                        aria-label={`${name}’s round ${record.round} score`}
                      >
                        <div className="round-record-player-heading">
                          <span className="round-record-name">
                            <ProfileIcon
                              name={
                                score.team === viewerTeam
                                  ? profileIcon
                                  : undefined
                              }
                            />
                            <span>{name}</span>
                          </span>
                          <strong
                            className="round-record-score"
                            data-negative={score.total < 0}
                            aria-label={`${points(score.total)} points this round`}
                          >
                            {signed(score.total)}
                          </strong>
                        </div>
                        <dl className="round-record-breakdown">
                          {[
                            ["Books & straights", score.books],
                            ["Going out first", score.goingOut],
                            ["Leftover card debt", -score.debt],
                            ["Card points", score.cards + score.redCredit],
                            ["Red threes", score.redThrees],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{points(Number(value))}</dd>
                            </div>
                          ))}
                          <div className="round-record-total">
                            <dt>Game total</dt>
                            <dd>
                              {points(
                                recordGameTotal(
                                  snapshot,
                                  record.round,
                                  score.team,
                                ),
                              )}
                            </dd>
                          </div>
                        </dl>
                      </section>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                className="round-record-arrow round-record-previous"
                aria-label="Previous round"
                disabled={index === 0}
                onClick={() => move(-1)}
              >
                ‹
              </button>
              <button
                type="button"
                className="round-record-arrow round-record-next"
                aria-label="Next round"
                disabled={index === records.length - 1}
                onClick={() => move(1)}
              >
                ›
              </button>
            </div>
            <footer
              className="round-record-navigation"
              role="group"
              aria-label="Choose a completed round"
            >
              {records.map((round, page) => (
                <button
                  key={round.round}
                  type="button"
                  aria-label={`View round ${round.round}`}
                  aria-pressed={page === index}
                  onClick={() => setSelected(page)}
                >
                  <span />
                </button>
              ))}
            </footer>
          </>
        )}
        <button
          type="button"
          className="button round-record-close"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
