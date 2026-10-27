import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageTitle } from "../components/PageTitle";
import { cardsAccount } from "../lib/links";

export function User() {
  const { user, login, logout, loading, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  return (
    <div className="page account-page">
      <PageTitle>{user ? "USER" : "SIGN IN"}</PageTitle>
      <div className="account-body page-body">
        {user ? (
          <>
            <p className="account-name">{user.name}</p>
            <div className="button-stack">
              <a className="button" href={cardsAccount}>
                Manage Account
              </a>
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void logout().catch(() => {})}
              >
                {loading ? "Signing Out…" : "Sign Out"}
              </button>
            </div>
          </>
        ) : (
          <>
            <form
              className="signin-form"
              aria-label="Sign in"
              aria-busy={loading}
              onSubmit={(event) => {
                event.preventDefault();
                void login(username.trim(), password)
                  .then(() => setPassword(""))
                  .catch(() => {});
              }}
            >
              <label>
                <span className="sr-only">Username or Email</span>
                <input
                  name="username"
                  placeholder="Username or Email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={255}
                  required
                  value={username}
                  disabled={loading}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </label>
              <label>
                <span className="sr-only">Password</span>
                <input
                  name="password"
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  disabled={loading}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="button" disabled={loading}>
                {loading ? "Loading…" : "Sign In"}
              </button>
            </form>
            <div className="account-links">
              <a href={`${cardsAccount}?view=register`}>Create an Account</a>
              <a href={`${cardsAccount}?view=recover`}>Forgot Password?</a>
              <a href={`${cardsAccount}?view=resend`}>Resend Verification</a>
            </div>
          </>
        )}
        {user && error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="button-stack">
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
