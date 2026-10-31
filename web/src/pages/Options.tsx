import { useId } from "react";
import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { usePreferences } from "../context/PreferencesContext";
import { TurnSoundOption } from "../context/TurnSoundContext";
import "../account.css";

export function Options() {
  const { preferences, update } = usePreferences();
  const followTitle = useId();
  const followDescription = useId();
  return (
    <div className="page preferences-page">
      <PageTitle>OPTIONS</PageTitle>
      <div className="page-body preferences-body">
        <TurnSoundOption />
        <section aria-labelledby={followTitle}>
          <h2 id={followTitle}>Follow Turn</h2>
          <p id={followDescription} className="preference-hint">
            Follow turn shows the board of the player whose turn it is. Choose
            what happens when you browse another player’s board.
          </p>
          <div
            className="follow-turn-options"
            role="radiogroup"
            aria-labelledby={followTitle}
            aria-describedby={followDescription}
          >
            <label className="follow-turn-option">
              <input
                type="radio"
                name="follow-turn-behavior"
                value="keep"
                checked={preferences.followTurnBehavior === "keep"}
                onChange={() => update({ followTurnBehavior: "keep" })}
              />
              <span>
                <strong>Keep Follow turn checked (default)</strong>
                <span>
                  Starts checked and stays checked until you uncheck it.
                </span>
              </span>
            </label>
            <label className="follow-turn-option">
              <input
                type="radio"
                name="follow-turn-behavior"
                value="uncheck"
                checked={preferences.followTurnBehavior === "uncheck"}
                onChange={() => update({ followTurnBehavior: "uncheck" })}
              />
              <span>
                <strong>Uncheck Follow turn when browsing</strong>
                <span>
                  Automatically unchecks when you visit another player’s board
                  outside your turn.
                </span>
              </span>
            </label>
          </div>
        </section>
      </div>
      <div className="button-stack">
        <Link className="button" to="/user">
          Back
        </Link>
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
