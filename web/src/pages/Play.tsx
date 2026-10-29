import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { GameApiError, request } from "../lib/api";
import { readStorage, writeStorage } from "../lib/storage";
import type { Snapshot } from "../types";
import { useAuth } from "../context/AuthContext";
import { LoginWarning } from "../components/LoginWarning";
import { useActiveTable } from "../hooks/useActiveTable";
import { TableProgressDialog } from "../components/TableProgressDialog";

export function Play() {
  const navigate = useNavigate();
  const active = useActiveTable();
  const blocked =
    active.checking || Boolean(active.table) || Boolean(active.error);
  return (
    <div className="page play-page">
      <PageTitle>PLAY</PageTitle>
      <div className="page-body">
        <div className="play-choices">
          <Link
            className="play-choice"
            to="/game/create"
            aria-disabled={blocked || undefined}
            tabIndex={blocked ? -1 : undefined}
            onClick={(event) => {
              if (blocked) event.preventDefault();
            }}
          >
            <span>Create Game</span>
            <small>
              Play with bots
              <br />
              or invite friends
            </small>
          </Link>
          <Link
            className="play-choice"
            to="/game/join"
            aria-disabled={blocked || undefined}
            tabIndex={blocked ? -1 : undefined}
            onClick={(event) => {
              if (blocked) event.preventDefault();
            }}
          >
            <span>Join Game</span>
            <small>
              Enter a lobby code
              <br />
              to join a friend
            </small>
          </Link>
        </div>
        <SessionStatus active={active} />
        <div className="button-stack">
          <Link className="button" to="/">
            Home
          </Link>
        </div>
      </div>
      {active.table && (
        <TableProgressDialog
          key={active.table.code}
          table={active.table}
          busy={active.busy}
          error={active.error}
          online={active.online}
          onContinue={() => navigate(`/room/${active.table!.code}`)}
          onLeave={() => void active.leave()}
        />
      )}
    </div>
  );
}

function SessionStatus({
  active,
}: {
  active: ReturnType<typeof useActiveTable>;
}) {
  if (active.table || active.checking) return null;
  if (active.error)
    return (
      <div className="session-status">
        <p className="error" role="alert">
          {active.error}
        </p>
        <button className="text-button" onClick={active.retry}>
          Try again
        </button>
      </div>
    );
  return null;
}

export function CreateGame() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"practice" | "online">("practice");
  const [scoring, setScoring] = useState<"partnership" | "individual">(
    "individual",
  );
  const [capacity, setCapacity] = useState(6);
  const [name, setName] = useState(() =>
    readStorage("handandfoot.name.v1", ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useActiveTable();
  async function submit() {
    if (busy || active.checking || active.table || active.error) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<Snapshot>("/rooms", {
        name: user?.name || name.trim() || "You",
        playMode: mode,
        scoringMode: scoring,
        capacity,
        targetScore: 10000,
      });
      if (!user) writeStorage("handandfoot.name.v1", name.trim());
      writeStorage("handandfoot.room.v1", result.code);
      navigate(`/room/${result.code}`);
    } catch (error) {
      if (error instanceof GameApiError && error.code === "TABLE_IN_PROGRESS")
        navigate("/play", { replace: true });
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (active.table && !busy) return <Navigate to="/play" replace />;
  return (
    <div className="page setup-page">
      <PageTitle>CREATE GAME</PageTitle>
      <form
        className="setup-form create-setup page-body"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend>Game Type</legend>
          <div className="setup-radio-choices">
            <label>
              <input
                type="radio"
                name="gameType"
                value="practice"
                checked={mode === "practice"}
                onChange={() => setMode("practice")}
              />
              <span>Versus Bots</span>
            </label>
            <label>
              <input
                type="radio"
                name="gameType"
                value="online"
                checked={mode === "online"}
                onChange={() => setMode("online")}
              />
              <span>Online</span>
            </label>
          </div>
        </fieldset>
        {!user && (
          <label className="placeholder-field">
            <span className="sr-only">Your name</span>
            <input
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your Name"
              autoComplete="nickname"
            />
          </label>
        )}
        <fieldset>
          <legend>Scoring</legend>
          <div className="setup-radio-choices">
            <label>
              <input
                type="radio"
                name="scoring"
                value="partnership"
                checked={scoring === "partnership"}
                onChange={() => {
                  setScoring("partnership");
                  setCapacity((count) => Math.max(4, count + (count % 2)));
                }}
              />
              <span>Teams of 2</span>
            </label>
            <label>
              <input
                type="radio"
                name="scoring"
                value="individual"
                checked={scoring === "individual"}
                onChange={() => setScoring("individual")}
              />
              <span>Individuals</span>
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend>Players</legend>
          <div className="setup-player-choices">
            {(scoring === "partnership" ? [4, 6] : [2, 3, 4, 5, 6]).map(
              (count) => (
                <button
                  key={count}
                  type="button"
                  aria-pressed={capacity === count}
                  onClick={() => setCapacity(count)}
                >
                  {count} Players
                </button>
              ),
            )}
          </div>
        </fieldset>
        <LoginWarning />
        <SessionStatus active={active} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-stack">
          <button
            className="button"
            disabled={
              busy ||
              active.checking ||
              Boolean(active.table) ||
              Boolean(active.error)
            }
          >
            {busy ? "Creating…" : "Create Game"}
          </button>
          <Link className="button secondary" to="/play">
            Back
          </Link>
        </div>
      </form>
    </div>
  );
}

export function JoinGame() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(() =>
    readStorage("handandfoot.name.v1", ""),
  );
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useActiveTable();
  async function submit() {
    if (busy || active.checking || active.table || active.error) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<Snapshot>(
        `/rooms/${code.trim().toUpperCase()}/join`,
        { name: user?.name || name.trim() || "You", seat: null },
      );
      if (!user) writeStorage("handandfoot.name.v1", name.trim());
      writeStorage("handandfoot.room.v1", result.code);
      navigate(`/room/${result.code}`);
    } catch (error) {
      if (error instanceof GameApiError && error.code === "TABLE_IN_PROGRESS")
        navigate("/play", { replace: true });
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (active.table && !busy) return <Navigate to="/play" replace />;
  return (
    <div className="page setup-page">
      <PageTitle>JOIN GAME</PageTitle>
      <form
        className="setup-form join-setup page-body"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="join-intro">
          <h2>Enter the lobby code</h2>
          <p id="lobby-code-hint">
            The game host can provide you with a code, or simply visit the game
            lobby link.
          </p>
        </div>
        <label className="placeholder-field">
          <span className="sr-only">Lobby code</span>
          <input
            className="join-code"
            aria-label="Lobby code"
            aria-describedby="lobby-code-hint"
            value={code}
            onChange={(event) =>
              setCode(
                event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""),
              )
            }
            minLength={6}
            maxLength={6}
            placeholder="Lobby Code"
            required
            autoCapitalize="characters"
            autoComplete="off"
          />
        </label>
        {!user && (
          <label className="placeholder-field">
            <span className="sr-only">Your name</span>
            <input
              maxLength={24}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your Name"
              autoComplete="nickname"
            />
          </label>
        )}
        <LoginWarning />
        <SessionStatus active={active} />
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-stack">
          <button
            className="button"
            disabled={
              busy ||
              active.checking ||
              Boolean(active.table) ||
              Boolean(active.error) ||
              code.length !== 6
            }
          >
            {busy ? "Joining…" : "Join Game"}
          </button>
          <Link className="button secondary" to="/play">
            Back
          </Link>
        </div>
      </form>
    </div>
  );
}
