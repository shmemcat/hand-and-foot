import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useSound } from "../context/SoundContext";
import { readStorage, writeStorage } from "../lib/storage";
import { Book, Icon } from "./Icons";
import { cardsHome } from "../lib/links";
import { useAuth } from "../context/AuthContext";
import { ProfileIcon } from "./ProfileIcon";

export function Shell({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const isTable =
    location.pathname.startsWith("/room/") ||
    location.pathname === "/preview/opening" ||
    location.pathname === "/preview/draw" ||
    location.pathname === "/preview/pickup";
  const sound = useSound();
  const { user } = useAuth();
  const [dark, setDark] = useState(() =>
    readStorage("handandfoot.dark.v1", false),
  );
  const [settings, setSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? "#2D2027" : "#DFD3C3");
    writeStorage("handandfoot.dark.v1", dark);
  }, [dark]);
  useEffect(() => {
    setSettings(false);
    const titles: Record<string, string> = {
      "/play": "Play",
      "/game/create": "Create Game",
      "/game/join": "Join Game",
      "/rules": "Rules",
      "/scores": "Leaderboard",
      "/leaderboard": "Leaderboard",
      "/about": "About",
      "/preview": "Preview",
      "/preview/opening": "Opening Rehearsal",
      "/preview/draw": "Draw Rehearsal",
      "/preview/pickup": "Discard Pickup",
      "/user": user ? "User" : "Sign In",
    };
    document.title = titles[location.pathname]
      ? `${titles[location.pathname]} | Hand & Foot`
      : "Hand & Foot";
    if (!location.pathname.startsWith("/room/")) {
      document.getElementById("main")?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [location.pathname, user?.id]);
  useEffect(() => {
    if (!settings) return;
    const close = (event: PointerEvent) => {
      if (!settingsRef.current?.contains(event.target as Node))
        setSettings(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettings(false);
        settingsRef.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [settings]);
  const toggleEffects = () => {
    if (sound.muted && sound.volume === 0) sound.setVolume(0.15);
    sound.setMuted(!sound.muted);
  };
  const toggleMusic = () => {
    if (!sound.music && sound.musicVolume === 0) sound.setMusicVolume(0.15);
    sound.setMusic(!sound.music);
  };
  return (
    <div
      className={`site-frame ${isHome ? "site-home" : isTable ? "table-frame" : "site-page"}`}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <nav className="site-nav" aria-label="Main navigation">
        {isHome ? (
          <span />
        ) : (
          <Link to="/" className="brand" aria-label="Hand and Foot home">
            <Book />
            <span>HAND &amp; FOOT</span>
          </Link>
        )}
        <div className="nav-actions">
          <div className="sound-wrap" ref={settingsRef}>
            <button
              type="button"
              className="icon-button"
              aria-label="Sound and music settings"
              aria-expanded={settings}
              aria-controls="sound-settings"
              onClick={() => setSettings(!settings)}
            >
              <Icon
                name={sound.muted && !sound.music ? "music-off" : "sound"}
              />
            </button>
            {settings && (
              <div
                className="sound-settings"
                id="sound-settings"
                role="group"
                aria-label="Sound and music"
              >
                <div className="sound-settings-inner">
                  <div className="volume-row">
                    <button
                      type="button"
                      className="volume-toggle"
                      aria-label="Toggle sound effects"
                      aria-pressed={!sound.muted}
                      onClick={toggleEffects}
                    >
                      <Icon name={sound.muted ? "volume-off" : "volume"} />
                    </button>
                    <input
                      aria-label="Sound effects volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={sound.volume}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        sound.setVolume(value);
                        sound.setMuted(value === 0);
                      }}
                    />
                  </div>
                  <div className="volume-row">
                    <button
                      type="button"
                      className="volume-toggle"
                      aria-label="Toggle music"
                      aria-pressed={sound.music}
                      onClick={toggleMusic}
                    >
                      <Icon name={sound.music ? "sound" : "music-off"} />
                    </button>
                    <input
                      aria-label="Music volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={sound.musicVolume}
                      onChange={(e) => {
                        const value = Number(e.target.value);
                        sound.setMusicVolume(value);
                        sound.setMusic(value > 0);
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            type="button"
            className="icon-button"
            aria-label={dark ? "Use light theme" : "Use dark theme"}
            onClick={() => setDark(!dark)}
          >
            <Icon name={dark ? "moon" : "sun"} />
          </button>
          <Link className="nav-user" to="/user" aria-label="Cards account">
            <ProfileIcon name={user?.profile_icon} />
            <span>{user?.name || "Guest"}</span>
          </Link>
        </div>
      </nav>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      {isHome && (
        <a className="cards-hub-link" href={cardsHome} aria-label="Cards home">
          <Icon name="cards" />
        </a>
      )}
    </div>
  );
}
