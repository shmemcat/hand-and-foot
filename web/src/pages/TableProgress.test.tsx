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
      path === "/active" ? { rooms } : { code: "NEW123" }
    );
  vi.mocked(getRoom)
    .mockReset()
    .mockResolvedValue({
      code: solo.code,
      token: "latest",
      revision: 18,
      phase: "play",
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
it("lists all started games as cards, with no automatic rejoin dialog", async () => {
  rooms = [solo, { ...solo, code: "FRIEND", playMode: "online" }, lobby];
  render(page());
  await waitFor(() => expect(screen.getAllByRole("article")).toHaveLength(2));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(createLink().getAttribute("aria-disabled")).toBeNull();
  expect(vi.mocked(command)).not.toHaveBeenCalled();
});

it("resumes the selected game without leaving another one", async () => {
  rooms = [solo, { ...solo, code: "FRIEND", playMode: "online" }];
  render(page());
  await waitFor(() =>
    expect(screen.getAllByRole("button", { name: "Resume" })).toHaveLength(2)
  );
  fireEvent.click(screen.getAllByRole("button", { name: "Resume" })[1]);
  await screen.findByText("Original table");
  expect(command).not.toHaveBeenCalled();
});

it("requires inline confirmation and sends a fresh selected-table concession", async () => {
  rooms = [solo];
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Concede" }));
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keep game" }));
  expect(command).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Concede" }));
  fireEvent.click(screen.getByRole("button", { name: "Concede" }));
  await waitFor(() =>
    expect(command).toHaveBeenCalledWith(
      expect.objectContaining({ code: solo.code, revision: 18 }),
      "concede"
    )
  );
  await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
});

it("keeps a failed concession available to retry", async () => {
  rooms = [solo];
  vi.mocked(command).mockRejectedValueOnce(new Error("Please reconnect."));
  render(page());
  fireEvent.click(await screen.findByRole("button", { name: "Concede" }));
  fireEvent.click(screen.getByRole("button", { name: "Concede" }));
  await screen.findByText("Please reconnect.");
  expect(screen.getAllByRole("article")).toHaveLength(1);
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Concede" }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  fireEvent.click(screen.getByRole("button", { name: "Concede" }));
  await waitFor(() => expect(screen.queryByRole("article")).toBeNull());
});

it("omits waiting lobbies and completed games from the saved cards", async () => {
  rooms = [lobby, { ...solo, code: "DONE22", phase: "finished" }];
  render(page());
  await waitFor(() => expect(request).toHaveBeenCalled());
  await waitFor(() =>
    expect(createLink().getAttribute("aria-disabled")).toBeNull()
  );
  expect(screen.queryByRole("article")).toBeNull();
});

it("allows creation alongside an unfinished game without conceding it", async () => {
  rooms = [solo];
  render(page("/game/create"));
  await waitFor(() =>
    expect(
      (screen.getByRole("button", { name: "Create Game" }) as HTMLButtonElement)
        .disabled
    ).toBe(false)
  );
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Create Game" }));
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith("/rooms", expect.anything())
  );
  expect(command).not.toHaveBeenCalled();
});
