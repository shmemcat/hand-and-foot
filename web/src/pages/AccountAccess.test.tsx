import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { useAuth } from "../context/AuthContext";
import { PreferencesProvider } from "../context/PreferencesContext";
import { Profile } from "./Profile";
import { Options } from "./Options";

vi.mock("../context/AuthContext", () => ({ useAuth: vi.fn() }));
let auth: ReturnType<typeof useAuth>;
beforeEach(() => {
  auth = { user: null, loading: false } as ReturnType<typeof useAuth>;
  vi.mocked(useAuth).mockImplementation(() => auth);
});
function SignIn() {
  const navigate = useNavigate();
  return (
    <>
      <h1>Sign in</h1>
      <button onClick={() => navigate(-1)}>Back</button>
    </>
  );
}
function page(path: string) {
  return (
    <MemoryRouter
      basename="/hand-and-foot"
      initialEntries={["/hand-and-foot/", `/hand-and-foot${path}`]}
    >
      <PreferencesProvider>
        <Routes>
          <Route path="/" element={<h1>Home</h1>} />
          <Route path="/user" element={<SignIn />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/options" element={<Options />} />
        </Routes>
      </PreferencesProvider>
    </MemoryRouter>
  );
}
it.each(["/profile", "/options"])(
  "redirects a signed-out %s link to this site's sign-in page and replaces the history entry",
  (path) => {
    render(page(path));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Profile Icon" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Follow Turn" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Home" })).toBeTruthy();
  },
);
it.each([
  ["/profile", "Profile Icon"],
  ["/options", "Follow Turn"],
])(
  "waits for the session on %s, allows an account, and redirects when it signs out",
  (path, heading) => {
    auth.loading = true;
    const view = render(page(path));
    expect(screen.queryByRole("heading", { name: "Sign in" })).toBeNull();
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
    auth.loading = false;
    auth.user = { id: "player", name: "Player", email: "player@example.test" };
    view.rerender(page(path));
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    auth.user = null;
    view.rerender(page(path));
    expect(screen.getByRole("heading", { name: "Sign in" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: heading })).toBeNull();
  },
);
