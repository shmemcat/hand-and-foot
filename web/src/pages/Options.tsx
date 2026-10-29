import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { TurnSoundOption } from "../context/TurnSoundContext";
import "../account.css";

export function Options() {
  return (
    <div className="page preferences-page">
      <PageTitle>OPTIONS</PageTitle>
      <div className="page-body preferences-body">
        <TurnSoundOption />
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
