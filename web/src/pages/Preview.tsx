import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Snapshot } from "../types";
import { request } from "../lib/api";
import { PageTitle } from "../components/PageTitle";

export function Preview() {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function open(fixture: string) {
    setBusy(true);
    setError("");
    try {
      const view = await request<Snapshot>("/fixtures", { fixture });
      navigate(`/room/${view.code}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page narrow-page">
      <PageTitle>PREVIEW</PageTitle>
      <p className="page-intro">
        Saved, playable fixtures for reviewing the table and family rules.
        Available only on the local development server.
      </p>
      <div className="setup-form">
        <Link className="button secondary" to="/preview/opening">
          Opening rehearsal · animations, sounds & flow
        </Link>
        {[
          ["full-board", "Full individual board · 16 open & completed piles"],
          ["open-9", "Nine open piles · one row"],
          ["open-10", "Ten open piles · wrapped row"],
          ["six-card", "Six-card reminder · spacious board"],
          ["scoring", "Interactive scoring review"],
          ["dense", "Eight-player table & long hand"],
          ["catchup", "Catch-up draw"],
          ["hand-20", "20-card individual hand"],
          ["hand-32", "32-card individual hand"],
          ["hand-45", "45-card individual hand"],
        ].map(([key, label]) => (
          <button
            className="button"
            key={key}
            disabled={busy}
            onClick={() => void open(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </div>
  );
}
