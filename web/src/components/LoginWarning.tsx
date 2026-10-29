import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "../login-warning.css";

// Shared Cards LoginWarning, adapted from Golf's component to this site's palette.
export function LoginWarning() {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading || user) return null;
  return (
    <div className="login-warning">
      <h2>
        <svg viewBox="0 0 512 512" aria-hidden="true">
          <circle cx="256" cy="256" r="224" fill="currentColor" />
          <path
            d="M256 132v150m0 62v12"
            fill="none"
            stroke="var(--panel)"
            strokeWidth="40"
            strokeLinecap="round"
          />
        </svg>
        Pssst
      </h2>
      <span>We noticed you&apos;re not signed in!</span>
      <span>
        If you wish to save your game data,
        <br />
        don&apos;t forget to{" "}
        <Link
          className="cards-link"
          to={`/user?returnTo=${encodeURIComponent(location.pathname)}`}
        >
          sign in.
        </Link>
      </span>
    </div>
  );
}
