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
import "./styles.css";
import "./sister-site.css";
import "./game-board.css";

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
      {import.meta.env.DEV && <Route path="/preview" element={<Preview />} />}
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
        <SoundProvider>
          <Shell>
            <AppRoutes />
          </Shell>
        </SoundProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
