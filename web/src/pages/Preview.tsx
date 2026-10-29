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
        <Link className="button secondary" to="/preview/endings">
          End of round & game · all result screens
        </Link>
        <Link className="button secondary" to="/preview/opening">
          Opening rehearsal · animations, sounds & flow
        </Link>
        <Link className="button secondary" to="/preview/draw">
          Draw rehearsal · replay & slow motion
        </Link>
        <Link
          className="button secondary"
          to="/preview/motions?scene=replacement"
        >
          Red 3 replacement · replay & slow motion
        </Link>
        <Link className="button secondary" to="/preview/motions?scene=hand">
          Hand spacing · play & discard
        </Link>
        <Link className="button secondary" to="/preview/motions?scene=bot">
          Bot melds · new piles, additions & closing
        </Link>
        <Link className="button secondary" to="/preview/pickup">
          Discard pickup · replay & step through
        </Link>
        <Link className="button secondary" to="/preview/foot">
          Into your foot · play or discard your last card
        </Link>
        <Link className="button secondary" to="/preview/red-threes">
          Red 3 celebration · sound & confetti
        </Link>
        <Link className="button secondary" to="/preview/books">
          Closing books · gather the cards & move up
        </Link>
        <Link className="button secondary" to="/preview/scoring">
          Score count · debt, books & card values
        </Link>
        <Link className="button secondary" to="/preview/records">
          Round record · completed rounds & scores
        </Link>
        {[
          ["opening", "Live game opening"],
          ["next-round-opening", "Next-round opening · dealer passes"],
          ["foot-play", "Live foot transition · play the last card"],
          ["foot-discard", "Live foot transition · discard the last card"],
          ["going-out", "Going out · clean & dirty books ready"],
          ["red-three-target", "Red 3 · select, click the pile & play"],
          ["going-out-blocked", "Going out · keep a card after discard"],
          [
            "going-out-complete-book",
            "Going out · complete the dirty book in your draft",
          ],
          ["full-board", "Full individual board · 16 open & completed piles"],
          ["open-9", "Nine open melds"],
          ["open-10", "Ten open melds"],
          ["open-13", "Thirteen open melds · full-width row"],
          ["open-14", "Fourteen open melds · overflow row"],
          ["six-card", "Six-card reminder · spacious board"],
          ["scoring", "Interactive scoring review"],
          ["score-choreography", "Live scoring · foot, debt & broken book"],
          ["score-reds", "Live scoring · ace vs three red 3s"],
          ["score-exhausted", "Live scoring · deck exhausted"],
          ["score-finish", "Live scoring · finish the match"],
          ["dense", "Six-player table & long hand"],
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
