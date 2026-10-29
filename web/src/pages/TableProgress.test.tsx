import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Play, CreateGame, JoinGame } from "./Play";
import { command, GameApiError, getRoom, request } from "../lib/api";
import type { ActiveTable } from "../hooks/useActiveTable";
import type { Snapshot } from "../types";

const auth = vi.hoisted(() => ({
  user: null as { id: string; name: string } | null,
  loading: false,
}));
vi.mock("../context/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  request: vi.fn(),
  getRoom: vi.fn(),
  command: vi.fn(),
}));
const solo: ActiveTable = {
  code: "SOLO22",
  playMode: "practice",
  scoringMode: "individual",
  capacity: 2,
  phase: "play",
  round: 3,
};
const lobby: ActiveTable = {
  ...solo,
  code: "ONLINE",
  playMode: "online",
  phase: "lobby",
};
let rooms: ActiveTable[];
beforeEach(() => {
  auth.user = null;
  auth.loading = false;
  rooms = [];
  vi.mocked(request)
    .mockReset()
    .mockImplementation(async (path) =>
      path === "/active" ? { rooms } : { code: "NEW123" },
    );
  vi.mocked(getRoom)
    .mockReset()
    .mockResolvedValue({
      code: solo.code,
      token: "latest",
      revision: 18,
    } as Snapshot);
  vi.mocked(command)
    .mockReset()
    .mockImplementation(async () => {
      rooms = [];
      return {} as Snapshot;
    });
});
function page(entry = "/play") {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/play" element={<Play />} />
        <Route path="/game/create" element={<CreateGame />} />
        <Route path="/game/join" element={<JoinGame />} />
        <Route path="/room/:code" element={<p>Original table</p>} />
      </Routes>
    </MemoryRouter>
  );
}
const createLink = () => screen.getByRole("link", { name: /^Create Game/ });

it("checks the current table before enabling create/join and never renders a table list", async () => {
  render(page());
  expect(createLink().getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(createLink());
  expect(screen.getByRole("heading", { name: "PLAY" })).toBeTruthy();
  await waitFor(() =>
    expect(createLink().getAttribute("aria-disabled")).toBeNull(),
  );
  expect(screen.queryByText("Your tables")).toBeNull();
  expect(screen.queryByRole("dialog")).toBeNull();
});

it.each([
  solo,
  lobby,
  { ...lobby, phase: "play" as const },
  { ...lobby, phase: "finished" as const },
])(
  "continues the existing $playMode $phase table without creating a game",
  async (table) => {
    rooms = [table];
    render(page());
    await screen.findByRole("dialog");
    expect(createLink().getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(
      screen.getByRole("button", {
        name: table.playMode === "practice" ? "Continue" : "Rejoin",
      }),
    );
    await screen.findByText("Original table");
    expect(command).not.toHaveBeenCalled();
  },
);

it("cancels concession, focuses No, and only leaves after confirmation using the current state", async () => {
  rooms = [solo];
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Concede" }));
  expect(
    screen.getByRole("dialog", { name: "Are you sure?" }).textContent,
  ).toContain("Only finished games count");
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "No" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "No" }));
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Concede" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(getRoom).toHaveBeenCalledWith("SOLO22");
  expect(command).toHaveBeenCalledWith(
    expect.objectContaining({ token: "latest", revision: 18 }),
    "leave",
  );
  expect(createLink().getAttribute("aria-disabled")).toBeNull();
});

it.each(["/game/create", "/game/join"])(
  "guards a direct %s visit with the in-progress flow",
  async (entry) => {
    rooms = [lobby];
    render(page(entry));
    await screen.findByRole("dialog", { name: "Lobby In Progress" });
    expect(screen.queryByRole("button", { name: "Create Game" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Join Game" })).toBeNull();
  },
);

it("retains the table on a failed leave and permits retry", async () => {
  rooms = [lobby];
  vi.mocked(command).mockRejectedValueOnce(new Error("Connection lost"));
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Leave" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Connection lost",
  );
  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("retries a stale leave against a fresh snapshot", async () => {
  rooms = [solo];
  vi.mocked(command).mockRejectedValueOnce(
    new GameApiError("The table moved", 409, "STALE_STATE"),
  );
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Concede" }));
  fireEvent.click(screen.getByRole("button", { name: "Yes" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(getRoom).toHaveBeenCalledTimes(2);
});

it("blocks mutations during lookup failures and recovers with Try again", async () => {
  vi.mocked(request).mockRejectedValueOnce(new Error("Offline"));
  render(page());
  await screen.findByRole("alert");
  expect(createLink().getAttribute("aria-disabled")).toBe("true");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(createLink().getAttribute("aria-disabled")).toBeNull(),
  );
});

it("clears the old account’s dialog immediately and ignores its delayed response", async () => {
  auth.user = { id: "1", name: "One" };
  rooms = [solo];
  let resolveOld!: (value: unknown) => void;
  const view = render(page());
  await screen.findByRole("dialog");
  vi.mocked(request).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  auth.user = { id: "2", name: "Two" };
  view.rerender(page());
  expect(screen.queryByRole("dialog")).toBeNull();
  rooms = [];
  auth.user = { id: "3", name: "Three" };
  view.rerender(page());
  await act(async () => {
    resolveOld({ rooms: [solo] });
  });
  expect(screen.queryByRole("dialog")).toBeNull();
});
