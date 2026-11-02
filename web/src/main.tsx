import { syncMotionPreference } from "./lib/motionPreference";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { SoundProvider } from "./context/SoundContext";
import { Shell } from "./components/Shell";
import { Home } from "./pages/Home";
import { Play, CreateGame, JoinGame } from "./pages/Play";
import { Room } from "./pages/Room";
import { About, Rules, NotFound } from "./pages/Info";
import { Leaderboard } from "./pages/Leaderboard";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CardBackProvider } from "./context/CardBackContext";
import { User } from "./pages/User";
import { AchievementEvents } from "./components/AchievementEvents";
import { AchievementNotifications } from "./components/AchievementNotifications";
import { PreferencesProvider } from "./context/PreferencesContext";
import { TurnSoundProvider } from "./context/TurnSoundContext";
import "./styles.css";
import "./sister-site.css";
import "./game-board.css";
import "./mobile-game.css";

const Profile = React.lazy(() =>
  import("./pages/Profile").then((module) => ({ default: module.Profile })),
);
const Options = React.lazy(() =>
  import("./pages/Options").then((module) => ({ default: module.Options })),
);
function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes key={user?.id ?? "guest"}>
      <Route path="/" element={<Home />} />
      <Route path="/play" element={<Play />} />
      <Route path="/game/create" element={<CreateGame />} />
      <Route path="/game/join" element={<JoinGame />} />
      <Route path="/room/:code" element={<Room />} />
      <Route path="/rules" element={<Rules />} />
      <Route path="/about" element={<About />} />
      <Route path="/leaderboard" element={<Leaderboard />} />
      <Route path="/scores" element={<Navigate to="/leaderboard" replace />} />
      <Route path="/user" element={<User />} />
      <Route
        path="/profile"
        element={
          <React.Suspense fallback={<p role="status">Loading profile…</p>}>
            <Profile />
          </React.Suspense>
        }
      />
      <Route
        path="/options"
        element={
          <React.Suspense fallback={<p role="status">Loading options…</p>}>
            <Options />
          </React.Suspense>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
syncMotionPreference();
window.addEventListener("storage", syncMotionPreference);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
    >
      <AuthProvider>
        <CardBackProvider>
          <PreferencesProvider>
            <SoundProvider>
              <TurnSoundProvider>
                <AchievementNotifications />
                <AchievementEvents />
                <Shell>
                  <AppRoutes />
                </Shell>
              </TurnSoundProvider>
            </SoundProvider>
          </PreferencesProvider>
        </CardBackProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
