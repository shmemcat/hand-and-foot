import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Room } from "./Room";
import { roundRecordExample } from "../lib/roundRecordExamples";

export function RoundRecordPreview() {
  const snapshot = useMemo(roundRecordExample, []);
  return (
    <div className="draw-rehearsal">
      <div className="draw-review-bar">
        <div>
          <h1>Round record</h1>
          <small>
            Three completed rounds · click the round badge to reopen
          </small>
        </div>
        <Link className="text-link" to="/preview">
          ← All previews
        </Link>
      </div>
      <Room rehearsal={{ snapshot, onChoose: () => {}, recordOpen: true }} />
    </div>
  );
}
