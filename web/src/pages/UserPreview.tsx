import { Link } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { AccountSummary } from "../components/AccountSummary";
import type { AccountSummary as Summary } from "../lib/achievements";
import "../account.css";

const practice = {
  games: 32,
  wins: 19,
  rounds: 183,
  best: 13450,
  total: 286400,
  cleanBooks: 146,
  dirtyBooks: 112,
  goingOut: 79,
};
const online = {
  games: 10,
  wins: 6,
  rounds: 58,
  best: 12700,
  total: 94200,
  cleanBooks: 48,
  dirtyBooks: 34,
  goingOut: 22,
};
const preview: Summary = {
  stats: {
    all: {
      games: 42,
      wins: 25,
      rounds: 241,
      best: 13450,
      total: 380600,
      cleanBooks: 194,
      dirtyBooks: 146,
      goingOut: 101,
    },
    practice,
    online,
  },
  counters: {
    games: 42,
    wins: 25,
    clean_books: 194,
    dirty_books: 146,
    going_out: 101,
    red_threes: 218,
  },
  unlocks: [
    "first_chapter",
    "first_victory",
    "straight_ahead",
    "matched_set",
    "big_hand",
    "team_spirit",
    "own_two_feet",
    "good_company",
    "sole_survivor",
    "a_leg_up",
    "caught_red_handed",
    "better_with_friends",
    "early_bird",
    "geezer",
    "triple_threat",
    "comeback",
    "hot_streak",
    "private_library",
  ],
};
export function UserPreview() {
  return (
    <div className="page account-page">
      <PageTitle>USER</PageTitle>
      <div className="account-body account-dashboard page-body">
        <p className="account-welcome">
          Welcome <strong>Player</strong>!
        </p>
        <AccountSummary preview={preview} />
      </div>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
