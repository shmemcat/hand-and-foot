import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";

export function Home() {
  return (
    <div className="home-page">
      <PageTitle>HAND &amp; FOOT</PageTitle>
      <nav className="home-menu" aria-label="Game menu">
        <Link className="button" to="/play">
          Play
        </Link>
        <Link className="button" to="/leaderboard">
          Leaderboard
        </Link>
        <Link className="button" to="/rules">
          Rules
        </Link>
        <Link className="button" to="/about">
          About
        </Link>
      </nav>
    </div>
  );
}
