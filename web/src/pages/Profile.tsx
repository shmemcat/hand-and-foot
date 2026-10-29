import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PageTitle } from "../components/PageTitle";
import { ProfileIcon } from "../components/ProfileIcon";
import { Icon } from "../components/Icons";
import { useAuth } from "../context/AuthContext";
import { PROFILE_ICONS, PROFILE_ICON_CATEGORIES } from "../lib/profileIcons";
import type { ProfileUpdate } from "../lib/account";
import "../account.css";

export function Profile() {
  const { user, loading, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const navigate = useNavigate();
  useEffect(() => {
    setEmail(user?.email ?? "");
  }, [user?.email]);
  const save = async (data: ProfileUpdate) => {
    if (busy || loading) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const notice = await updateProfile(data);
      if (data.email) navigate("/user", { state: { notice }, replace: true });
      else setMessage(notice);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Unable to save your profile.",
      );
    } finally {
      setBusy(false);
    }
  };
  const selected = PROFILE_ICONS.find(
    (icon) => icon.key === (user?.profile_icon ?? "user"),
  );
  const choices = PROFILE_ICONS.filter((icon) =>
    `${icon.label} ${icon.category}`
      .toLowerCase()
      .includes(filter.trim().toLowerCase()),
  );
  return (
    <div className="page profile-page">
      <PageTitle>PROFILE</PageTitle>
      <div className="page-body profile-body">
        {user ? (
          <>
            <h2>Profile Icon</h2>
            <div className="profile-preview">
              <button
                type="button"
                className="profile-preview-circle"
                aria-label="Toggle icon picker"
                aria-expanded={open}
                aria-controls="profile-icon-picker"
                onClick={() => setOpen(!open)}
              >
                <ProfileIcon name={user.profile_icon} />
              </button>
              <strong>{selected?.label ?? "Default"}</strong>
              <span className="preference-hint">
                {open ? "tap to close" : "tap to change"}
              </span>
            </div>
            {open && (
              <div className="profile-picker" id="profile-icon-picker">
                <label className="sr-only" htmlFor="icon-search">
                  Find an icon
                </label>
                <input
                  id="icon-search"
                  type="search"
                  placeholder="Find an icon…"
                  value={filter}
                  onChange={(event) => setFilter(event.target.value)}
                />
                <div className="profile-picker-scroll">
                  {PROFILE_ICON_CATEGORIES.map((category) => {
                    const icons = choices.filter(
                      (icon) => icon.category === category,
                    );
                    return (
                      icons.length > 0 && (
                        <section key={category}>
                          <h3>{category}</h3>
                          <div className="profile-icon-grid">
                            {icons.map((icon) => (
                              <button
                                type="button"
                                key={icon.key}
                                title={icon.label}
                                aria-label={icon.label}
                                aria-pressed={
                                  (user.profile_icon ?? "user") === icon.key
                                }
                                disabled={busy || loading}
                                onClick={() =>
                                  void save({ profile_icon: icon.key })
                                }
                              >
                                <ProfileIcon name={icon.key} />
                              </button>
                            ))}
                          </div>
                        </section>
                      )
                    );
                  })}
                  {!choices.length && (
                    <p className="account-status">
                      No icons found. Try another name.
                    </p>
                  )}
                </div>
              </div>
            )}
            <section className="profile-email">
              <h2>Email</h2>
              <form
                className="profile-email-row"
                onSubmit={(event) => {
                  event.preventDefault();
                  void save({ email: email.trim() });
                }}
              >
                <label className="sr-only" htmlFor="profile-email">
                  Email address
                </label>
                <input
                  id="profile-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={255}
                  value={email}
                  readOnly={busy || loading}
                  onChange={(event) => setEmail(event.target.value)}
                />
                <button
                  className="button"
                  type="submit"
                  disabled={
                    busy ||
                    loading ||
                    email.trim().toLowerCase() ===
                      (user.email ?? "").toLowerCase()
                  }
                >
                  {busy ? "Saving…" : "Save"}
                </button>
              </form>
              {user.email_verified !== undefined && (
                <p
                  className={`profile-verification ${user.email_verified ? "verified" : "not-verified"}`}
                >
                  <Icon
                    name={
                      user.email_verified
                        ? "circle-check"
                        : "triangle-exclamation"
                    }
                  />
                  <span>
                    {user.email_verified ? "Verified" : "Not verified"}
                  </span>
                </p>
              )}
            </section>
          </>
        ) : (
          <p>
            {loading
              ? "Loading your profile…"
              : "Sign in to customize your profile."}
          </p>
        )}
        {message && (
          <p className="account-status" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="button-stack">
        <Link className="button" to="/user">
          {user ? "Back" : "Sign In"}
        </Link>
        <Link className="button" to="/">
          Home
        </Link>
      </div>
    </div>
  );
}
