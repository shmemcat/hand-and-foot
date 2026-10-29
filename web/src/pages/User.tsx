import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageTitle } from "../components/PageTitle";
import { cardsAccount } from "../lib/links";
import { AccountSummary } from "../components/AccountSummary";
import { DeleteAccountModal } from "../components/DeleteAccountModal";
import "../account.css";

export function User() {
  const { user, login, logout, deleteAccount, loading, error } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<{
    field: "username" | "password";
    message: string;
  } | null>(null);
  const usernameInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);
  const busy = loading || submitting;
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const returnTo = search.get("returnTo");
  const location = useLocation();
  const notice = location.state?.notice as string | undefined;
  useEffect(() => {
    if (user) {
      setUsername("");
      setPassword("");
      setFieldError(null);
    }
    setDeleting(false);
  }, [user?.id]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!username.trim()) {
      setFieldError({
        field: "username",
        message: "Please enter your username or email.",
      });
      usernameInput.current?.focus();
      return;
    }
    if (!password) {
      setFieldError({
        field: "password",
        message: "Please enter your password.",
      });
      passwordInput.current?.focus();
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await login(username.trim(), password);
      setUsername("");
      setPassword("");
      if (
        returnTo &&
        /^\/(?:play|room\/[A-Z0-9]{6}|game\/(?:create|join))$/.test(returnTo)
      )
        navigate(returnTo, { replace: true });
    } catch {
      // The shared account provider displays the server's sign-in error.
    } finally {
      setSubmitting(false);
    }
  };
  return (
    <div className="page account-page">
      <PageTitle>{user ? "USER" : "SIGN IN"}</PageTitle>
      <div
        className={`account-body page-body ${user ? "account-dashboard" : ""}`}
      >
        {notice && (
          <p role="status" className="account-status">
            {notice}
          </p>
        )}
        {user ? (
          <>
            <p className="account-welcome">
              Welcome <strong>{user.name}</strong>!
            </p>
            <AccountSummary key={user.id} />
            <div className="button-stack">
              <button
                className="button secondary"
                disabled={loading}
                onClick={() => void logout().catch(() => {})}
              >
                {loading ? "Signing Out…" : "Sign Out"}
              </button>
              <Link className="button" to="/">
                Home
              </Link>
            </div>
            <button
              className="button danger account-delete"
              type="button"
              disabled={loading}
              onClick={() => setDeleting(true)}
            >
              Delete Account
            </button>
            {deleting && (
              <DeleteAccountModal
                key={user.id}
                onClose={() => setDeleting(false)}
                onDelete={async (password) => {
                  const notice = await deleteAccount(password);
                  setDeleting(false);
                  navigate("/user", { state: { notice }, replace: true });
                }}
              />
            )}
          </>
        ) : (
          <>
            <form
              className="signin-form"
              aria-label="Sign in"
              aria-busy={busy}
              noValidate
              onSubmit={submit}
            >
              <label>
                <span className="sr-only">Username or Email</span>
                <input
                  ref={usernameInput}
                  name="username"
                  placeholder="Username or Email"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={255}
                  required
                  value={username}
                  readOnly={busy}
                  aria-invalid={fieldError?.field === "username"}
                  aria-describedby={
                    fieldError?.field === "username"
                      ? "sign-in-field-error"
                      : undefined
                  }
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (fieldError?.field === "username") setFieldError(null);
                  }}
                />
              </label>
              <label>
                <span className="sr-only">Password</span>
                <input
                  ref={passwordInput}
                  name="password"
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={1024}
                  value={password}
                  readOnly={busy}
                  aria-invalid={fieldError?.field === "password"}
                  aria-describedby={
                    fieldError?.field === "password"
                      ? "sign-in-field-error"
                      : undefined
                  }
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (fieldError?.field === "password") setFieldError(null);
                  }}
                />
              </label>
              {(fieldError || error) && (
                <p className="error" role="alert" id="sign-in-field-error">
                  {fieldError?.message || error}
                </p>
              )}
              <button type="submit" className="button" disabled={busy}>
                {submitting ? "Signing In…" : loading ? "Loading…" : "Sign In"}
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
      {!user && (
        <div className="button-stack">
          <Link className="button" to="/">
            Home
          </Link>
        </div>
      )}
    </div>
  );
}
