import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { StrictMode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { Room } from "./Room";
import { GameApiError, getRoom, request } from "../lib/api";
import { ENDING_EXAMPLES, endingSnapshot } from "../lib/endingExamples";
import { writeStorage } from "../lib/storage";

const auth = vi.hoisted(() => ({
  user: null as { id: string; name: string } | null,
  loading: false,
}));

const socket = vi.hoisted(() => ({
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("../context/AuthContext", () => ({
  useAuth: () => auth,
}));
vi.mock("../context/SoundContext", () => ({
  useSound: () => ({ play: vi.fn() }),
}));
vi.mock("../lib/api", async (original) => ({
  ...(await original<typeof import("../lib/api")>()),
  getRoom: vi.fn(),
  request: vi.fn(),
  socketCredentials: vi.fn().mockResolvedValue({ csrf: "test" }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  auth.user = null;
  auth.loading = false;
});

const lobby = {
  ...endingSnapshot(ENDING_EXAMPLES[1]),
  code: "INVITE",
  phase: "lobby" as const,
  status: "lobby" as const,
  playMode: "online" as const,
};

function invite() {
  return (
    <StrictMode>
      <MemoryRouter initialEntries={["/room/INVITE"]}>
        <Routes>
          <Route path="/room/:code" element={<Room />} />
        </Routes>
      </MemoryRouter>
    </StrictMode>
  );
}

it.each(["Guest", "Friend"])(
  "automatically joins an invite as %s and subscribes when seated",
  async (name) => {
    if (name === "Friend") writeStorage("handandfoot.name.v1", "Friend");
    vi.mocked(getRoom).mockRejectedValue(
      new GameApiError("Join this table before viewing it.", 403),
    );
    let completeJoin!: (state: typeof lobby) => void;
    vi.mocked(request).mockImplementation(
      () =>
        new Promise((resolve) => {
          completeJoin = resolve;
        }),
    );
    render(invite());
    await waitFor(() => expect(completeJoin).toBeDefined());
    const connected = socket.on.mock.calls.find(
      ([event]) => event === "connect",
    )?.[1];
    act(() => connected?.());
    const before = socket.emit.mock.calls.length;
    expect(screen.queryByRole("button", { name: "Join Game" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Your name" })).toBeNull();
    await act(async () => completeJoin(lobby));
    await screen.findByLabelText("Copy URL");
    await waitFor(() =>
      expect(socket.emit.mock.calls.length).toBeGreaterThan(before),
    );
    expect(socket.emit).toHaveBeenLastCalledWith("handandfoot:subscribe", {
      code: "INVITE",
    });
    expect(request).toHaveBeenCalledWith("/rooms/INVITE/join", {
      name,
      seat: null,
    });
    expect(request).toHaveBeenCalledTimes(1);
  },
);

it("waits for the account before automatically joining", async () => {
  auth.loading = true;
  vi.mocked(getRoom).mockRejectedValue(
    new GameApiError("Join this table before viewing it.", 403),
  );
  vi.mocked(request).mockResolvedValue(lobby);
  const view = render(invite());
  expect(getRoom).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  auth.user = { id: "friend", name: "Signed In Friend" };
  auth.loading = false;
  view.rerender(invite());
  await screen.findByLabelText("Copy URL");
  expect(request).toHaveBeenCalledExactlyOnceWith("/rooms/INVITE/join", {
    name: "Signed In Friend",
    seat: null,
  });
});

it("restores an existing lobby member without joining again", async () => {
  vi.mocked(getRoom).mockResolvedValue(lobby);
  render(invite());
  await screen.findByLabelText("Copy URL");
  expect(request).not.toHaveBeenCalled();
});

it("shows a full or started lobby error and retries without a join form", async () => {
  vi.mocked(getRoom).mockRejectedValue(
    new GameApiError("Join this table before viewing it.", 403),
  );
  vi.mocked(request)
    .mockRejectedValueOnce(
      new GameApiError("This table has already started or is full.", 400),
    )
    .mockResolvedValue(lobby);
  render(invite());
  expect((await screen.findByRole("alert")).textContent).toContain(
    "already started or is full",
  );
  expect(request).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("button", { name: "Join Game" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await screen.findByLabelText("Copy URL");
  expect(request).toHaveBeenCalledTimes(2);
});

it("does not display an inactivity deadline from an older server snapshot", async () => {
  const state = {
    ...endingSnapshot(ENDING_EXAMPLES[1]),
    code: "INVITE",
    playMode: "online" as const,
    idleWarning: true,
  };
  vi.mocked(getRoom).mockResolvedValue(state);
  render(
    <MemoryRouter initialEntries={["/room/INVITE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByLabelText("Game information and scores");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByText(/inactive for 9 minutes/)).toBeNull();
});

it("explains a conceded seat without offering to rejoin the running game", async () => {
  vi.mocked(getRoom).mockRejectedValue(
    new GameApiError(
      "You conceded this game. You can start or join a new lobby.",
      403,
      "SEAT_REMOVED",
    ),
  );
  render(
    <MemoryRouter initialEntries={["/room/INVITE"]}>
      <Routes>
        <Route path="/room/:code" element={<Room />} />
      </Routes>
    </MemoryRouter>,
  );
  await screen.findByRole("heading", { name: "TABLE LEFT" });
  expect(
    screen.getByRole("link", { name: "Back to Play" }).getAttribute("href"),
  ).toBe("/play");
  expect(screen.queryByRole("button", { name: "Join Game" })).toBeNull();
  expect(request).not.toHaveBeenCalled();
});
