import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { Snapshot } from "../types";
import { PageTitle } from "./PageTitle";
import { Icon } from "./Icons";
import { ProfileIcon } from "./ProfileIcon";
import { LoginWarning } from "./LoginWarning";
import { TableDialog } from "./TableProgressDialog";
import "../lobby.css";

export function Lobby({
  snapshot,
  busy,
  error,
  act,
}: {
  snapshot: Snapshot;
  busy: boolean;
  error: string;
  act: (type: string, values?: Record<string, unknown>) => Promise<void>;
}) {
  const { user } = useAuth();
  const [copied, setCopied] = useState("");
  const [copyError, setCopyError] = useState("");
  const fillBots = snapshot.lobbyFillBots ?? true;
  const [closing, setClosing] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  async function run(type: string, values?: Record<string, unknown>) {
    setPendingAction(type);
    try {
      await act(type, values);
    } finally {
      setPendingAction(null);
    }
  }
  const isHost = snapshot.hostId === snapshot.viewerId;
  const seats =
    snapshot.lobbySeats ??
    Array.from(
      { length: snapshot.capacity },
      (_, i) => snapshot.players[i] ?? null,
    );
  const waiting = snapshot.waitingPlayers ?? [];
  const viewerSeat = seats.findIndex(
    (player) => player?.id === snapshot.viewerId,
  );
  const missing = seats.filter((player) => !player).length;
  const humanCount = seats.length - missing;
  const teams = Array.from(
    { length: snapshot.capacity / 2 },
    (_, team) =>
      seats.filter(
        (player, seat) => player && seat % (snapshot.capacity / 2) === team,
      ).length,
  );
  const canStartWithoutBots =
    snapshot.scoringMode === "individual"
      ? humanCount >= 2
      : humanCount >= 4 && teams.every((count) => count === 0 || count === 2);
  const url = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/room/${snapshot.code}`;
  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setCopyError("");
    } catch {
      setCopyError("Copy didn’t work. Select and copy the field instead.");
    }
  }
  if (snapshot.status === "closed")
    return (
      <div className="page game-lobby-page">
        <PageTitle>LOBBY CLOSED</PageTitle>
        <div className="game-lobby-body">
          <p role="status">The host closed this lobby.</p>
          <Link className="button" to="/play">
            Back to Play
          </Link>
          <Link className="button secondary" to="/">
            Home
          </Link>
        </div>
      </div>
    );
  return (
    <div className="page game-lobby-page">
      <PageTitle>GAME LOBBY</PageTitle>
      <div className="game-lobby-body">
        <div className="game-lobby">
          <div className="lobby-sharing">
            {[
              ["Code", snapshot.code],
              ["URL", url],
            ].map(([label, value]) => (
              <div className="lobby-copy-row" key={label}>
                <label htmlFor={`lobby-${label}`}>{label}</label>
                <input
                  id={`lobby-${label}`}
                  readOnly
                  value={value}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <button
                  type="button"
                  className="lobby-copy-button"
                  aria-label={`Copy ${label}`}
                  onClick={() => void copy(value, label)}
                >
                  <Icon name={copied === label ? "check" : "copy"} />
                </button>
              </div>
            ))}
            <span role="status" className="sr-only">
              {copied && `${copied} copied.`}
            </span>
            {copyError && (
              <p className="lobby-message" role="alert">
                {copyError}
              </p>
            )}
          </div>
          <ol
            className="lobby-player-seats"
            data-seats={snapshot.capacity}
            aria-label="Players in lobby"
          >
            {Array.from({ length: snapshot.capacity }, (_, index) => {
              const player = seats[index];
              const mine = player?.id === snapshot.viewerId;
              const team =
                snapshot.scoringMode === "partnership"
                  ? index % (snapshot.capacity / 2)
                  : index;
              return (
                <li
                  key={index}
                  className="lobby-player-seat"
                  data-empty={!player}
                  data-mine={mine}
                  aria-label={`Seat ${index + 1}: ${player?.name || "Open seat"}${mine ? " (you)" : ""}`}
                >
                  <span className="lobby-profile">
                    <ProfileIcon
                      name={mine ? user?.profile_icon : player?.profileIcon}
                    />
                  </span>
                  <span className="lobby-player-name" title={player?.name}>
                    {player?.name || "Open seat"}
                  </span>
                  <small className="lobby-player-status">
                    {player
                      ? `${player.id === snapshot.hostId ? "Host" : "Here"}${mine ? " · You" : ""}`
                      : "Waiting…"}
                  </small>
                  {snapshot.scoringMode === "partnership" && (
                    <small className={`lobby-team-label team-${team}`}>
                      Team {team + 1}
                    </small>
                  )}
                  {(mine || !player) && (
                    <button
                      type="button"
                      className="button lobby-select-seat"
                      aria-label={
                        mine ? "Leave Seat" : `Select seat ${index + 1}`
                      }
                      disabled={busy}
                      onClick={() =>
                        void run(
                          mine ? "unseat" : "seat",
                          mine ? undefined : { seat: index },
                        )
                      }
                    >
                      {mine ? "Leave Seat" : "Select Seat"}
                    </button>
                  )}
                  {isHost && player && !mine && (
                    <button
                      type="button"
                      className="button lobby-select-seat"
                      aria-label={`Remove ${player.name} from lobby`}
                      disabled={busy}
                      onClick={() =>
                        void run("remove_player", { playerId: player.id })
                      }
                    >
                      Remove
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {waiting.length > 0 && (
            <section
              className="lobby-waiting-room"
              aria-label="Players choosing seats"
            >
              <h2>Waiting room</h2>
              <ul>
                {waiting.map((player) => (
                  <li key={player.id}>
                    <ProfileIcon name={player.profileIcon} />
                    <span>
                      {player.name}
                      {player.id === snapshot.viewerId ? " (you)" : ""}
                      {player.id === snapshot.hostId ? " · Host" : ""}
                      <small>Choosing a seat</small>
                    </span>
                    {isHost && player.id !== snapshot.viewerId && (
                      <button
                        type="button"
                        className="button lobby-remove-player"
                        aria-label={`Remove ${player.name} from lobby`}
                        disabled={busy}
                        onClick={() =>
                          void run("remove_player", { playerId: player.id })
                        }
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <div className="lobby-start">
            {missing > 0 && (
              <fieldset className="lobby-empty-seats">
                <legend>Empty seats</legend>
                <div>
                  <label
                    title={
                      !canStartWithoutBots
                        ? snapshot.scoringMode === "partnership"
                          ? "Teams need at least four players with both partners seated."
                          : "At least two players must be seated."
                        : undefined
                    }
                  >
                    <input
                      type="radio"
                      name="empty-seats"
                      checked={!fillBots}
                      onChange={() =>
                        void run("lobby_options", { fillBots: false })
                      }
                      disabled={busy || !isHost || !canStartWithoutBots}
                    />
                    Start with {humanCount}{" "}
                    {humanCount === 1 ? "player" : "players"}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="empty-seats"
                      checked={fillBots}
                      onChange={() =>
                        void run("lobby_options", { fillBots: true })
                      }
                      disabled={busy || !isHost}
                    />
                    Fill with bots
                  </label>
                </div>
              </fieldset>
            )}
            {isHost ? (
              <>
                <button
                  className="button"
                  disabled={
                    busy ||
                    viewerSeat < 0 ||
                    waiting.length > 0 ||
                    (!fillBots && !canStartWithoutBots)
                  }
                  onClick={() => void run("start", { fillBots })}
                >
                  {pendingAction === "start" ? "Starting…" : "Start Game"}
                </button>
                {waiting.length > 0 ? (
                  <p className="lobby-message" role="status">
                    Waiting for everyone to select a seat.
                  </p>
                ) : (
                  missing > 0 &&
                  !fillBots && (
                    <p className="lobby-message">
                      Start with {humanCount} players.
                    </p>
                  )
                )}
              </>
            ) : (
              <p className="lobby-message" role="status">
                Waiting for the host to start…
              </p>
            )}
          </div>
          <LoginWarning />
          {error && (
            <p className="error lobby-message" role="alert">
              {error}
            </p>
          )}
          <div className="lobby-actions" data-host={isHost}>
            <button
              className="button"
              disabled={busy}
              onClick={() => void run("leave")}
            >
              Leave Lobby
            </button>
            {isHost && (
              <button
                className="button"
                disabled={busy}
                onClick={() => setClosing(true)}
              >
                Close Lobby
              </button>
            )}
            <Link className="button secondary" to="/">
              Home
            </Link>
          </div>
        </div>
      </div>
      {closing && (
        <TableDialog
          title="Close this lobby?"
          message="Everyone will leave the lobby. You can create a new table afterward."
          onEscape={() => {
            if (!busy) setClosing(false);
          }}
        >
          <div className="button-stack">
            <button
              className="button"
              disabled={busy}
              onClick={() => void run("close")}
            >
              {pendingAction === "close" ? "Closing…" : "Close Lobby"}
            </button>
            <button
              className="button secondary"
              data-cancel
              disabled={busy}
              onClick={() => setClosing(false)}
            >
              Keep Lobby
            </button>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </TableDialog>
      )}
    </div>
  );
}
