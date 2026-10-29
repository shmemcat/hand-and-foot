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
import { Preview } from "./pages/Preview";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { User } from "./pages/User";
import { AchievementEvents } from "./components/AchievementEvents";
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

const OpeningPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/OpeningPreview").then((module) => ({
        default: module.OpeningPreview,
      })),
    )
  : () => null;
const DrawPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/DrawPreview").then((module) => ({
        default: module.DrawPreview,
      })),
    )
  : () => null;
const PickupPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/PickupPreview").then((module) => ({
        default: module.PickupPreview,
      })),
    )
  : () => null;
const FootPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/FootPreview").then((module) => ({
        default: module.FootPreview,
      })),
    )
  : () => null;
const RedThreePreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/RedThreePreview").then((module) => ({
        default: module.RedThreePreview,
      })),
    )
  : () => null;

const ScoringPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/ScoringPreview").then((module) => ({
        default: module.ScoringPreview,
      })),
    )
  : () => null;

const ScoringGlowPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/ScoringGlowPreview").then((module) => ({
        default: module.ScoringGlowPreview,
      })),
    )
  : () => null;

const EndingsPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/EndingsPreview").then((module) => ({
        default: module.EndingsPreview,
      })),
    )
  : () => null;

const ScoreDesignsPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/ScoreDesignsPreview").then((module) => ({
        default: module.ScoreDesignsPreview,
      })),
    )
  : () => null;

const BookPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/BookPreview").then((module) => ({
        default: module.BookPreview,
      })),
    )
  : () => null;

const MotionPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/MotionPreview").then((module) => ({
        default: module.MotionPreview,
      })),
    )
  : () => null;

const RoundRecordPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/RoundRecordPreview").then((module) => ({
        default: module.RoundRecordPreview,
      })),
    )
  : () => null;

const UserPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/UserPreview").then((module) => ({
        default: module.UserPreview,
      })),
    )
  : () => null;

const BoardPreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/BoardPreview").then((module) => ({
        default: module.BoardPreview,
      })),
    )
  : () => null;

const MobilePreview = import.meta.env.DEV
  ? React.lazy(() =>
      import("./pages/MobilePreview").then((module) => ({
        default: module.MobilePreview,
      })),
    )
  : () => null;

function AppRoutes() {
  const { user } = useAuth();
  return (
    <Routes key={user?.id ?? "guest"}>
      {import.meta.env.DEV && (
        <Route
          path="/preview/user"
          element={
            <React.Suspense fallback={null}>
              <UserPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/records"
          element={
            <React.Suspense fallback={null}>
              <RoundRecordPreview />
            </React.Suspense>
          }
        />
      )}
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
      {import.meta.env.DEV && <Route path="/preview" element={<Preview />} />}
      {import.meta.env.DEV && (
        <Route
          path="/preview/board"
          element={
            <React.Suspense fallback={null}>
              <BoardPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/mobile"
          element={
            <React.Suspense fallback={null}>
              <MobilePreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/endings/designs"
          element={
            <React.Suspense fallback={null}>
              <ScoreDesignsPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/endings"
          element={
            <React.Suspense fallback={null}>
              <EndingsPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/motions"
          element={
            <React.Suspense fallback={null}>
              <MotionPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/books"
          element={
            <React.Suspense fallback={null}>
              <BookPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/scoring/glows"
          element={
            <React.Suspense fallback={null}>
              <ScoringGlowPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/scoring"
          element={
            <React.Suspense fallback={null}>
              <ScoringPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/red-threes"
          element={
            <React.Suspense fallback={null}>
              <RedThreePreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/foot"
          element={
            <React.Suspense fallback={null}>
              <FootPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/pickup"
          element={
            <React.Suspense fallback={null}>
              <PickupPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/draw"
          element={
            <React.Suspense fallback={null}>
              <DrawPreview />
            </React.Suspense>
          }
        />
      )}
      {import.meta.env.DEV && (
        <Route
          path="/preview/opening"
          element={
            <React.Suspense fallback={null}>
              <OpeningPreview />
            </React.Suspense>
          }
        />
      )}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
    >
      <AuthProvider>
        <PreferencesProvider>
          <SoundProvider>
            <TurnSoundProvider>
              <AchievementEvents />
              <Shell>
                <AppRoutes />
              </Shell>
            </TurnSoundProvider>
          </SoundProvider>
        </PreferencesProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
