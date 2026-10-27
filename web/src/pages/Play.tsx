import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { request } from "../lib/api";
import { readStorage, writeStorage } from "../lib/storage";
import type { Snapshot } from "../types";
import { useAuth } from "../context/AuthContext";

export function Play() {
  const last = readStorage<string | null>("handandfoot.room.v1", null);
  return (
    <div className="page play-page">
      <PageTitle>PLAY</PageTitle>
      <div className="page-body">
        <div className="play-choices">
          <Link className="play-choice" to="/game/create">
            <span>Create Game</span>
            <small>
              Play with bots
              <br />
              or invite friends
            </small>
          </Link>
          <Link className="play-choice" to="/game/join">
            <span>Join Game</span>
            <small>
              Enter a lobby code
              <br />
              to join a friend
            </small>
          </Link>
        </div>
        <div className="button-stack">
          {last && (
            <Link className="text-link" to={`/room/${last}`}>
              Rejoin your table
            </Link>
          )}
          <Link className="button" to="/">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CreateGame() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"practice" | "online">("practice");
  const [scoring, setScoring] = useState<"partnership" | "individual">(
    "individual",
  );
  const [capacity, setCapacity] = useState(4);
  const [targetScore, setTargetScore] = useState(10000);
  const [name, setName] = useState(() =>
    readStorage("handandfoot.name.v1", ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sizes = scoring === "partnership" ? [4, 6, 8] : [2, 3, 4, 5, 6];
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await request<Snapshot>("/rooms", {
        name: user?.name || name.trim() || "You",
        playMode: mode,
        scoringMode: scoring,
        capacity,
        targetScore,
      });
      if (!user) writeStorage("handandfoot.name.v1", name.trim());
      writeStorage("handandfoot.room.v1", result.code);
      navigate(`/room/${result.code}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page setup-page">
      <PageTitle>CREATE GAME</PageTitle>
      <form
        className="setup-form page-body"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <fieldset>
          <legend>Game Type</legend>
          <div className="segmented">
            <button
              type="button"
              aria-pressed={mode === "practice"}
              className={mode === "practice" ? "active" : ""}
              onClick={() => setMode("practice")}
            >
              Versus Bots
            </button>
            <button
              type="button"
              aria-pressed={mode === "online"}
              className={mode === "online" ? "active" : ""}
              onClick={() => setMode("online")}
            >
              Online
            </button>
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
          <div className="segmented">
            <button
              type="button"
              aria-pressed={scoring === "partnership"}
              className={scoring === "partnership" ? "active" : ""}
              onClick={() => {
                setScoring("partnership");
                if (![4, 6, 8].includes(capacity)) setCapacity(4);
              }}
            >
              Partners
            </button>
            <button
              type="button"
              aria-pressed={scoring === "individual"}
              className={scoring === "individual" ? "active" : ""}
              onClick={() => {
                setScoring("individual");
                if (capacity > 6) setCapacity(4);
              }}
            >
              Individual
            </button>
          </div>
        </fieldset>
        <fieldset>
          <legend>Players</legend>
          <div className="seat-choices">
            {sizes.map((size) => (
              <button
                type="button"
                key={size}
                aria-pressed={capacity === size}
                className={capacity === size ? "active" : ""}
                onClick={() => setCapacity(size)}
              >
                {size}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Play to</legend>
          <div className="segmented">
            {[10000, 15000, 20000].map((target) => (
              <button
                type="button"
                key={target}
                aria-pressed={targetScore === target}
                className={targetScore === target ? "active" : ""}
                onClick={() => setTargetScore(target)}
              >
                {target.toLocaleString()}
              </button>
            ))}
          </div>
        </fieldset>
        <p className="setup-detail">{capacity + 1} decks</p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-stack">
          <button className="button" disabled={busy}>
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
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const result = await request<Snapshot>(
        `/rooms/${code.trim().toUpperCase()}/join`,
        { name: user?.name || name.trim() || "You" },
      );
      if (!user) writeStorage("handandfoot.name.v1", name.trim());
      writeStorage("handandfoot.room.v1", result.code);
      navigate(`/room/${result.code}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
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
        <label className="placeholder-field">
          <span className="sr-only">Lobby code</span>
          <input
            className="join-code"
            aria-label="Lobby code"
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
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="button-stack">
          <button className="button" disabled={busy}>
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
